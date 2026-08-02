import type { OpenClawConfig, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { ResolvedArinovaChatAccount } from "./accounts.js";
import { resolveAccount, apiCall } from "./tools.js";
import { exchangeBotToken } from "./auth.js";

const DEFAULT_API_URL = "https://api.chat-staging.arinova.ai";

/** Resolve account with --token / --agent overrides. Priority: --token > --agent > default */
export function resolveAccountWithOverrides(parentOpts: { agent?: string; token?: string }): ResolvedArinovaChatAccount {
  if (parentOpts.token) {
    // Direct token override — construct a minimal account
    const base = (() => { try { return resolveAccount(); } catch { return null; } })();
    return {
      accountId: "cli-override",
      enabled: true,
      name: "CLI Override",
      apiUrl: base?.apiUrl ?? DEFAULT_API_URL,
      botToken: parentOpts.token,
      agentId: base?.agentId ?? "",
      config: base?.config ?? ({} as ResolvedArinovaChatAccount["config"]),
    };
  }
  if (parentOpts.agent) {
    return resolveAccount(parentOpts.agent);
  }
  return resolveAccount();
}

type ApiRequest = Parameters<typeof apiCall>[0];

/** Shared API-command contract: resolve auth once and execute a declarative request. */
export function defineApiCommand(parentOpts: { agent?: string; token?: string }) {
  const account = resolveAccountWithOverrides(parentOpts);
  if (!account.botToken) {
    throw new Error(
      "Not connected. Use --token or run: arinova setup-openclaw --token <bot-token>",
    );
  }
  return {
    account,
    execute: async (request: Omit<ApiRequest, "token">) => {
      const result = await apiCall({ ...request, token: account.botToken });
      console.log(JSON.stringify(result ?? { ok: true }, null, 2));
      return result;
    },
  };
}

export function registerCli(api: OpenClawPluginApi): void {
  api.registerCli(
    async (ctx) => {
      const arinova = ctx.program
        .command("arinova")
        .description("Arinova Chat commands")
        .option("--agent <name>", "Account name from openclaw config")
        .option("--token <botToken>", "Bot token (overrides --agent and default)");

      arinova
        .command("setup-openclaw")
        .description("Connect to an Arinova Chat bot using a bot token")
        .requiredOption("--token <bot-token>", "Bot token from Arinova Chat bot settings (ari_...)")
        .option("--api-url <url>", "Arinova Chat backend URL")
        .action(async (opts: { token: string; apiUrl?: string }) => {
          const channelCfg = (ctx.config as Record<string, unknown>).channels as
            | Record<string, unknown>
            | undefined;
          const current = (channelCfg?.["openclaw-arinova-ai"] ?? {}) as Record<string, unknown>;
          const apiUrl = opts.apiUrl ?? (current.apiUrl as string | undefined)
            ?? "https://api.chat.arinova.ai";
          const result = await exchangeBotToken({ apiUrl, botToken: opts.token });
          const nextConfig = {
            ...ctx.config,
            channels: {
              ...channelCfg,
              "openclaw-arinova-ai": {
                ...current,
                enabled: true,
                apiUrl,
                agentId: result.agentId,
                botToken: opts.token,
              },
            },
          };
          await api.runtime.config.replaceConfigFile({
            nextConfig: nextConfig as OpenClawConfig,
            afterWrite: { mode: "auto" },
          });
          console.log(`Connected to ${apiUrl} as "${result.name}" (${result.agentId}).`);
        });

      // ── Message commands ──

      const message = arinova.command("message").description("Message commands");

      message
        .command("send")
        .description("Send a message to a conversation")
        .requiredOption("--conversation-id <id>", "Conversation ID")
        .requiredOption("--content <text>", "Message content")
        .option("--reply-to <id>", "Reply to message ID")
        .action(async (opts: { conversationId: string; content: string; replyTo?: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          const body: Record<string, string> = { conversationId: opts.conversationId, content: opts.content };
          if (opts.replyTo) body.replyTo = opts.replyTo;
          await execute({ method: "POST", url: `${account.apiUrl}/api/v1/messages/send`, body });
        });

      message
        .command("list")
        .description("List messages in a conversation")
        .requiredOption("--conversation-id <id>", "Conversation ID")
        .option("--limit <n>", "Number of messages (default 50, max 100)")
        .option("--cursor <id>", "Message ID cursor (fetch older messages)")
        .action(async (opts: { conversationId: string; limit?: string; cursor?: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          const qs = new URLSearchParams();
          if (opts.limit) qs.set("limit", opts.limit);
          if (opts.cursor) qs.set("before", opts.cursor);
          const qStr = qs.toString();
          const url = `${account.apiUrl}/api/v1/messages/${encodeURIComponent(opts.conversationId)}${qStr ? "?" + qStr : ""}`;
          await execute({ method: "GET", url, });
        });

      // ── File commands ──

      const file = arinova.command("file").description("File commands");

      file
        .command("upload")
        .description("Upload a file to a conversation")
        .requiredOption("--conversation-id <id>", "Conversation ID")
        .requiredOption("--file-path <path>", "Absolute path to the file")
        .action(async (opts: { conversationId: string; filePath: string }) => {
          const { account } = defineApiCommand(arinova.opts());
          const fs = await import("node:fs");
          const path = await import("node:path");

          if (!fs.existsSync(opts.filePath)) {
            console.error(`File not found: ${opts.filePath}`);
            process.exit(1);
          }

          const fileBuffer = fs.readFileSync(opts.filePath);
          const fileName = path.basename(opts.filePath);
          const ext = path.extname(opts.filePath).toLowerCase();
          const mimeMap: Record<string, string> = {
            ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
            ".pdf": "application/pdf", ".txt": "text/plain", ".md": "text/markdown",
            ".json": "application/json", ".csv": "text/csv",
          };
          const mimeType = mimeMap[ext] ?? "application/octet-stream";

          const blob = new Blob([fileBuffer], { type: mimeType });
          const formData = new FormData();
          formData.append("conversationId", opts.conversationId);
          formData.append("file", blob, fileName);

          const res = await fetch(`${account.apiUrl}/api/v1/files/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${account.botToken}` },
            body: formData,
          });
          if (!res.ok) {
            const text = await res.text();
            console.error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
            process.exit(1);
          }
          const data = await res.json();
          console.log(JSON.stringify(data, null, 2));
        });

      // ── Note commands ──

      const note = arinova.command("note").description("Note commands");

      note
        .command("list")
        .description("List notes in a conversation")
        .option("--notebook-id <id>", "Conversation ID (notebook)")
        .option("--limit <n>", "Max notes to return (default 20, max 50)")
        .option("--cursor <id>", "Note ID cursor for pagination")
        .option("--tags <tags>", "Filter by tags (comma-separated)")
        .option("--archived", "List archived notes instead of active")
        .action(async (opts: { notebookId?: string; limit?: string; cursor?: string; tags?: string; archived?: boolean }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          const conversationId = opts.notebookId;
          if (!conversationId) { console.error("--notebook-id is required"); process.exit(1); }
          const qs = new URLSearchParams();
          if (opts.limit) qs.set("limit", opts.limit);
          if (opts.cursor) qs.set("before", opts.cursor);
          if (opts.tags) qs.set("tags", opts.tags);
          if (opts.archived) qs.set("archived", "true");
          qs.set("notebookId", conversationId);
          const qStr = qs.toString();
          const url = `${account.apiUrl}/api/v1/notes${qStr ? "?" + qStr : ""}`;
          await execute({ method: "GET", url, });
        });

      note
        .command("create")
        .description("Create a note in a conversation")
        .requiredOption("--notebook-id <id>", "Conversation ID (notebook)")
        .requiredOption("--title <title>", "Note title")
        .option("--content <text>", "Note content (markdown)")
        .option("--tags <tags>", "Tags (comma-separated)")
        .action(async (opts: { notebookId: string; title: string; content?: string; tags?: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          const body: Record<string, unknown> = { notebookId: opts.notebookId, title: opts.title, content: opts.content ?? "", tags: opts.tags ? opts.tags.split(",").map((t) => t.trim()) : [] };
          await execute({
            method: "POST",
            url: `${account.apiUrl}/api/v1/notes`,

            body,
          });
        });

      note
        .command("update")
        .description("Update a note")
        .requiredOption("--note-id <id>", "Note ID")
        .option("--title <text>", "New title")
        .option("--content <text>", "New content (markdown)")
        .option("--tags <tags>", "Replace tags (comma-separated)")
        .action(async (opts: { noteId: string; title?: string; content?: string; tags?: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          const body: Record<string, unknown> = {};
          if (opts.title !== undefined) body.title = opts.title;
          if (opts.content !== undefined) body.content = opts.content;
          if (opts.tags !== undefined) body.tags = opts.tags.split(",").map((t) => t.trim());
          await execute({
            method: "PATCH",
            url: `${account.apiUrl}/api/v1/notes/${encodeURIComponent(opts.noteId)}`,

            body,
          });
        });

      note
        .command("delete")
        .description("Delete a note")
        .requiredOption("--note-id <id>", "Note ID")
        .action(async (opts: { noteId: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({
            method: "DELETE",
            url: `${account.apiUrl}/api/v1/notes/${encodeURIComponent(opts.noteId)}`,

          });
        });

      // ── Memory commands ──

      const memory = arinova.command("memory").description("Memory commands");

      memory
        .command("query")
        .description("Search agent memories using hybrid search")
        .requiredOption("--query <text>", "Search keywords or semantic query")
        .option("--limit <n>", "Number of results (default 10, max 20)")
        .action(async (opts: { query: string; limit?: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          const qs = new URLSearchParams();
          qs.set("q", opts.query);
          if (opts.limit) qs.set("limit", String(Math.min(Number(opts.limit), 20)));
          await execute({
            method: "GET",
            url: `${account.apiUrl}/api/v1/memories/search?${qs.toString()}`,

          });
        });

      // ── Kanban commands ──

      const kanban = arinova.command("kanban").description("Kanban board commands");

      // ── Kanban Board ──

      const board = kanban.command("board").description("Board commands");

      board
        .command("list")
        .description("List available Kanban boards")
        .action(async () => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "GET", url: `${account.apiUrl}/api/v1/kanban/boards`, });
        });

      board
        .command("create")
        .description("Create a new Kanban board")
        .requiredOption("--name <name>", "Board name")
        .action(async (opts: { name: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "POST", url: `${account.apiUrl}/api/v1/kanban/boards`, body: { name: opts.name } });
        });

      board
        .command("update")
        .description("Rename a Kanban board")
        .requiredOption("--board-id <id>", "Board ID")
        .requiredOption("--name <name>", "New board name")
        .action(async (opts: { boardId: string; name: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "PATCH", url: `${account.apiUrl}/api/v1/kanban/boards/${encodeURIComponent(opts.boardId)}`, body: { name: opts.name } });
        });

      board
        .command("archive")
        .description("Archive a Kanban board")
        .requiredOption("--board-id <id>", "Board ID")
        .action(async (opts: { boardId: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "POST", url: `${account.apiUrl}/api/v1/kanban/boards/${encodeURIComponent(opts.boardId)}/archive`, });
        });

      board
        .command("unarchive")
        .description("Unarchive a Kanban board")
        .requiredOption("--board-id <id>", "Board ID")
        .action(async (opts: { boardId: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "POST", url: `${account.apiUrl}/api/v1/kanban/boards/${encodeURIComponent(opts.boardId)}/unarchive`, });
        });

      // ── Kanban Column ──

      const column = kanban.command("column").description("Column commands");

      column
        .command("list")
        .description("List columns in a board")
        .requiredOption("--board-id <id>", "Board ID")
        .action(async (opts: { boardId: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "GET", url: `${account.apiUrl}/api/v1/kanban/boards/${encodeURIComponent(opts.boardId)}/columns`, });
        });

      column
        .command("create")
        .description("Add a column to a board")
        .requiredOption("--board-id <id>", "Board ID")
        .requiredOption("--name <name>", "Column name")
        .option("--sort-order <n>", "Position (0-based)")
        .action(async (opts: { boardId: string; name: string; sortOrder?: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          const body: Record<string, unknown> = { name: opts.name };
          if (opts.sortOrder !== undefined) body.sortOrder = Number(opts.sortOrder);
          await execute({ method: "POST", url: `${account.apiUrl}/api/v1/kanban/boards/${encodeURIComponent(opts.boardId)}/columns`, body });
        });

      column
        .command("update")
        .description("Update a column")
        .requiredOption("--column-id <id>", "Column ID")
        .option("--name <name>", "New column name")
        .option("--sort-order <n>", "New sort order")
        .action(async (opts: { columnId: string; name?: string; sortOrder?: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          const body: Record<string, unknown> = {};
          if (opts.name !== undefined) body.name = opts.name;
          if (opts.sortOrder !== undefined) body.sortOrder = Number(opts.sortOrder);
          await execute({ method: "PATCH", url: `${account.apiUrl}/api/v1/kanban/columns/${encodeURIComponent(opts.columnId)}`, body });
        });

      column
        .command("delete")
        .description("Delete an empty column")
        .requiredOption("--column-id <id>", "Column ID")
        .action(async (opts: { columnId: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "DELETE", url: `${account.apiUrl}/api/v1/kanban/columns/${encodeURIComponent(opts.columnId)}`, });
        });

      column
        .command("reorder")
        .description("Reorder columns in a board")
        .requiredOption("--board-id <id>", "Board ID")
        .requiredOption("--column-ids <ids...>", "Column IDs in desired order")
        .action(async (opts: { boardId: string; columnIds: string[] }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "POST", url: `${account.apiUrl}/api/v1/kanban/boards/${encodeURIComponent(opts.boardId)}/columns/reorder`, body: { columnIds: opts.columnIds } });
        });

      // ── Kanban Card ──

      const card = kanban.command("card").description("Card commands");

      card
        .command("list")
        .description("List all Kanban cards")
        .action(async () => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "GET", url: `${account.apiUrl}/api/v1/kanban/cards`, });
        });

      card
        .command("create")
        .description("Create a new Kanban card")
        .requiredOption("--title <title>", "Card title")
        .option("--board-id <id>", "Board ID")
        .option("--column-name <name>", "Column name to place card in")
        .option("--column-id <id>", "Column ID to place card in")
        .option("--description <desc>", "Card description (markdown)")
        .option("--priority <level>", "Priority: low, medium, high, or urgent")
        .action(async (opts: { title: string; boardId?: string; columnName?: string; columnId?: string; description?: string; priority?: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          const body: Record<string, unknown> = { title: opts.title };
          if (opts.boardId) body.boardId = opts.boardId;
          if (opts.columnId) body.columnId = opts.columnId;
          if (opts.columnName) body.columnName = opts.columnName;
          if (opts.description) body.description = opts.description;
          if (opts.priority) body.priority = opts.priority;
          await execute({ method: "POST", url: `${account.apiUrl}/api/v1/kanban/cards`, body });
        });

      card
        .command("update")
        .description("Update a Kanban card")
        .requiredOption("--card-id <id>", "Card ID")
        .option("--title <text>", "New title")
        .option("--description <text>", "New description")
        .option("--column-id <id>", "Move card to this column ID")
        .option("--priority <level>", "New priority: low, medium, high, or urgent")
        .action(async (opts: { cardId: string; title?: string; description?: string; columnId?: string; priority?: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          const body: Record<string, unknown> = {};
          if (opts.title !== undefined) body.title = opts.title;
          if (opts.description !== undefined) body.description = opts.description;
          if (opts.columnId !== undefined) body.columnId = opts.columnId;
          if (opts.priority !== undefined) body.priority = opts.priority;
          await execute({ method: "PATCH", url: `${account.apiUrl}/api/v1/kanban/cards/${encodeURIComponent(opts.cardId)}`, body });
        });

      card
        .command("complete")
        .description("Mark a card as complete (move to Done)")
        .requiredOption("--card-id <id>", "Card ID")
        .action(async (opts: { cardId: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "POST", url: `${account.apiUrl}/api/v1/kanban/cards/${encodeURIComponent(opts.cardId)}/complete`, });
        });

      card
        .command("archive")
        .description("Archive a Kanban card")
        .requiredOption("--card-id <id>", "Card ID")
        .action(async (opts: { cardId: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          // Update card with archived flag
          await execute({ method: "PATCH", url: `${account.apiUrl}/api/v1/kanban/cards/${encodeURIComponent(opts.cardId)}`, body: { archived: true } });
        });

      card
        .command("add-commit")
        .description("Link a git commit to a card")
        .requiredOption("--card-id <id>", "Card ID")
        .requiredOption("--sha <sha>", "Git commit hash")
        .requiredOption("--message <msg>", "Commit message")
        .option("--url <url>", "Commit URL")
        .action(async (opts: { cardId: string; sha: string; message: string; url?: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          const body: Record<string, string> = { commitHash: opts.sha, message: opts.message };
          if (opts.url) body.url = opts.url;
          await execute({ method: "POST", url: `${account.apiUrl}/api/v1/kanban/cards/${encodeURIComponent(opts.cardId)}/commits`, body });
        });

      card
        .command("commits")
        .description("List commits linked to a card")
        .requiredOption("--card-id <id>", "Card ID")
        .action(async (opts: { cardId: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "GET", url: `${account.apiUrl}/api/v1/kanban/cards/${encodeURIComponent(opts.cardId)}/commits`, });
        });

      card
        .command("link-note")
        .description("Link a note to a card")
        .requiredOption("--card-id <id>", "Card ID")
        .requiredOption("--note-id <id>", "Note ID")
        .action(async (opts: { cardId: string; noteId: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "POST", url: `${account.apiUrl}/api/v1/kanban/cards/${encodeURIComponent(opts.cardId)}/notes`, body: { noteId: opts.noteId } });
        });

      card
        .command("unlink-note")
        .description("Unlink a note from a card")
        .requiredOption("--card-id <id>", "Card ID")
        .requiredOption("--note-id <id>", "Note ID")
        .action(async (opts: { cardId: string; noteId: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "DELETE", url: `${account.apiUrl}/api/v1/kanban/cards/${encodeURIComponent(opts.cardId)}/notes/${encodeURIComponent(opts.noteId)}`, });
        });

      card
        .command("notes")
        .description("List notes linked to a card")
        .requiredOption("--card-id <id>", "Card ID")
        .action(async (opts: { cardId: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "GET", url: `${account.apiUrl}/api/v1/kanban/cards/${encodeURIComponent(opts.cardId)}/notes`, });
        });

      // ── Kanban Label ──

      const label = kanban.command("label").description("Label commands");

      label
        .command("list")
        .description("List labels on a board")
        .requiredOption("--board-id <id>", "Board ID")
        .action(async (opts: { boardId: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "GET", url: `${account.apiUrl}/api/v1/kanban/boards/${encodeURIComponent(opts.boardId)}/labels`, });
        });

      label
        .command("create")
        .description("Create a label on a board")
        .requiredOption("--board-id <id>", "Board ID")
        .requiredOption("--name <name>", "Label name")
        .requiredOption("--color <color>", "Label color (hex, e.g. '#ff0000')")
        .action(async (opts: { boardId: string; name: string; color: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "POST", url: `${account.apiUrl}/api/v1/kanban/boards/${encodeURIComponent(opts.boardId)}/labels`, body: { name: opts.name, color: opts.color } });
        });

      label
        .command("update")
        .description("Update a label")
        .requiredOption("--label-id <id>", "Label ID")
        .option("--name <name>", "New label name")
        .option("--color <color>", "New label color (hex)")
        .action(async (opts: { labelId: string; name?: string; color?: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          const body: Record<string, string> = {};
          if (opts.name) body.name = opts.name;
          if (opts.color) body.color = opts.color;
          await execute({ method: "PATCH", url: `${account.apiUrl}/api/v1/kanban/labels/${encodeURIComponent(opts.labelId)}`, body });
        });

      label
        .command("delete")
        .description("Delete a label")
        .requiredOption("--label-id <id>", "Label ID")
        .action(async (opts: { labelId: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "DELETE", url: `${account.apiUrl}/api/v1/kanban/labels/${encodeURIComponent(opts.labelId)}`, });
        });

      // ── Card label operations (nested under card) ──

      card
        .command("add-label")
        .description("Add a label to a card")
        .requiredOption("--card-id <id>", "Card ID")
        .requiredOption("--label-id <id>", "Label ID")
        .action(async (opts: { cardId: string; labelId: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "POST", url: `${account.apiUrl}/api/v1/kanban/cards/${encodeURIComponent(opts.cardId)}/labels`, body: { labelId: opts.labelId } });
        });

      card
        .command("remove-label")
        .description("Remove a label from a card")
        .requiredOption("--card-id <id>", "Card ID")
        .requiredOption("--label-id <id>", "Label ID")
        .action(async (opts: { cardId: string; labelId: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "DELETE", url: `${account.apiUrl}/api/v1/kanban/cards/${encodeURIComponent(opts.cardId)}/labels/${encodeURIComponent(opts.labelId)}`, });
        });
      // ── Wiki commands ──

      const wiki = arinova.command("wiki").description("Wiki page commands");

      wiki
        .command("list")
        .description("List wiki pages in a conversation")
        .requiredOption("--conversation-id <id>", "Conversation ID")
        .option("--search <query>", "Search wiki pages")
        .action(async (opts: { conversationId: string; search?: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          const params = new URLSearchParams({ conversationId: opts.conversationId });
          if (opts.search) params.set("search", opts.search);
          await execute({ method: "GET", url: `${account.apiUrl}/api/v1/wiki?${params.toString()}`, });
        });

      wiki
        .command("get")
        .description("Get a wiki page")
        .requiredOption("--page-id <id>", "Wiki page ID")
        .action(async (opts: { pageId: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "GET", url: `${account.apiUrl}/api/v1/wiki/${encodeURIComponent(opts.pageId)}`, });
        });

      wiki
        .command("create")
        .description("Create a wiki page")
        .requiredOption("--conversation-id <id>", "Conversation ID")
        .requiredOption("--title <title>", "Page title")
        .option("--content <text>", "Page content")
        .option("--tags <tags...>", "Tags")
        .action(async (opts: { conversationId: string; title: string; content?: string; tags?: string[] }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "POST", url: `${account.apiUrl}/api/v1/wiki`, body: { conversationId: opts.conversationId, title: opts.title, content: opts.content || "", tags: opts.tags || [] } });
        });

      wiki
        .command("update")
        .description("Update a wiki page")
        .requiredOption("--page-id <id>", "Wiki page ID")
        .option("--title <text>", "New title")
        .option("--content <text>", "New content")
        .action(async (opts: { pageId: string; title?: string; content?: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "PATCH", url: `${account.apiUrl}/api/v1/wiki/${encodeURIComponent(opts.pageId)}`, body: { title: opts.title, content: opts.content } });
        });

      wiki
        .command("delete")
        .description("Delete a wiki page")
        .requiredOption("--page-id <id>", "Wiki page ID")
        .action(async (opts: { pageId: string }) => {
          const { account, execute } = defineApiCommand(arinova.opts());
          await execute({ method: "DELETE", url: `${account.apiUrl}/api/v1/wiki/${encodeURIComponent(opts.pageId)}`, });
        });
    },
    { commands: ["arinova"] },
  );
}
