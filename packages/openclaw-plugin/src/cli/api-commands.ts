import { ArinovaAgent } from "@arinova-ai/agent-sdk";
import type { ResolvedArinovaChatAccount } from "../accounts.js";
import { normalizeTrustedApiUrl } from "../api-endpoint.js";
import { openUploadFile } from "../file-upload.js";
import { apiCall, resolveAccount } from "../tools.js";

const DEFAULT_API_URL = "https://api.chat-staging.arinova.ai";

export interface CliCommand {
  command(spec: string): CliCommand;
  description(text: string): CliCommand;
  option(flags: string, description?: string): CliCommand;
  requiredOption(flags: string, description?: string): CliCommand;
  action(handler: (options: any) => void | Promise<void>): CliCommand;
  opts(): Record<string, unknown>;
}

interface RootOptions {
  agent?: string;
  token?: string;
}

/** Resolve account with --token / --agent overrides. Priority: --token > --agent > default. */
export function resolveAccountWithOverrides(
  parentOpts: RootOptions,
): ResolvedArinovaChatAccount {
  if (parentOpts.token) {
    const base = (() => {
      try {
        return resolveAccount();
      } catch {
        return null;
      }
    })();
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
  if (parentOpts.agent) return resolveAccount(parentOpts.agent);
  return resolveAccount();
}

/** Resolve credentials once and expose the typed agent-sdk REST client. */
export function defineApiCommand(parentOpts: RootOptions) {
  const account = resolveAccountWithOverrides(parentOpts);
  if (!account.botToken) {
    throw new Error(
      "Not connected. Use --token or run: arinova setup-openclaw --token <bot-token>",
    );
  }
  const client = new ArinovaAgent({
    serverUrl: normalizeTrustedApiUrl(account.apiUrl),
    botToken: account.botToken,
  });
  return {
    account,
    client,
    execute: async <T>(operation: Promise<T>): Promise<T> => {
      const result = await operation;
      console.log(JSON.stringify(result ?? { ok: true }, null, 2));
      return result;
    },
  };
}

function rootOptions(command: CliCommand): RootOptions {
  return command.opts() as RootOptions;
}

function parsePositiveCount(
  raw: string | undefined,
  fallback: number,
  max: number,
  flag: string,
): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return Math.min(value, max);
}

function parseNonNegativeCount(raw: string | undefined, flag: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return value;
}

function commaSeparated(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function registerApiCommands(arinova: CliCommand): void {
  const message = arinova.command("message").description("Message commands");

  message
    .command("send")
    .description("Send a message to a conversation")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--content <text>", "Message content")
    .option("--reply-to <id>", "Reply to message ID")
    .action(async (opts: { conversationId: string; content: string; replyTo?: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(
        opts.replyTo
          ? client.replyToMessage(opts.conversationId, opts.content, opts.replyTo)
          : client.sendMessage(opts.conversationId, opts.content),
      );
    });

  message
    .command("list")
    .description("List messages in a conversation")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .option("--limit <n>", "Number of messages (default 50, max 100)")
    .option("--cursor <id>", "Message ID cursor (fetch older messages)")
    .action(async (opts: { conversationId: string; limit?: string; cursor?: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.fetchHistory(opts.conversationId, {
        limit: parsePositiveCount(opts.limit, 50, 100, "--limit"),
        ...(opts.cursor ? { before: opts.cursor } : {}),
      }));
    });

  const file = arinova.command("file").description("File commands");

  file
    .command("upload")
    .description("Upload a file to a conversation")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--file-path <path>", "Absolute path to the file")
    .action(async (opts: { conversationId: string; filePath: string }) => {
      const { account } = defineApiCommand(rootOptions(arinova));
      const { blob, fileName } = await openUploadFile(opts.filePath);
      const formData = new FormData();
      formData.append("conversationId", opts.conversationId);
      formData.append("file", blob, fileName);
      const data = await apiCall({
        method: "POST",
        url: `${account.apiUrl}/api/v1/files/upload`,
        token: account.botToken,
        form: formData,
      });
      console.log(JSON.stringify(data, null, 2));
    });

  const note = arinova.command("note").description("Note commands");

  note
    .command("list")
    .description("List notes in a conversation")
    .requiredOption("--notebook-id <id>", "Conversation ID (notebook)")
    .option("--limit <n>", "Max notes to return (default 50, max 50)")
    .option("--cursor <id>", "Note ID cursor for pagination")
    .option("--tags <tags>", "Filter by tags (comma-separated)")
    .option("--archived", "List archived notes instead of active")
    .action(async (opts: {
      notebookId: string;
      limit?: string;
      cursor?: string;
      tags?: string;
      archived?: boolean;
    }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.listNotes({
        notebookId: opts.notebookId,
        limit: parsePositiveCount(opts.limit, 50, 50, "--limit"),
        ...(opts.cursor ? { before: opts.cursor } : {}),
        ...(opts.tags ? { tags: commaSeparated(opts.tags) } : {}),
        ...(opts.archived ? { archived: true } : {}),
      }));
    });

  note
    .command("create")
    .description("Create a note in a conversation")
    .requiredOption("--notebook-id <id>", "Conversation ID (notebook)")
    .requiredOption("--title <title>", "Note title")
    .option("--content <text>", "Note content (markdown)")
    .option("--tags <tags>", "Tags (comma-separated)")
    .action(async (opts: { notebookId: string; title: string; content?: string; tags?: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.createNote({
        notebookId: opts.notebookId,
        title: opts.title,
        content: opts.content ?? "",
        tags: commaSeparated(opts.tags) ?? [],
      }));
    });

  note
    .command("update")
    .description("Update a note")
    .requiredOption("--note-id <id>", "Note ID")
    .option("--notebook-id <id>", "Deprecated: ignored (note IDs are global)")
    .option("--title <text>", "New title")
    .option("--content <text>", "New content (markdown)")
    .option("--tags <tags>", "Replace tags (comma-separated)")
    .action(async (opts: { noteId: string; title?: string; content?: string; tags?: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      const body: { title?: string; content?: string; tags?: string[] } = {};
      if (opts.title !== undefined) body.title = opts.title;
      if (opts.content !== undefined) body.content = opts.content;
      if (opts.tags !== undefined) body.tags = commaSeparated(opts.tags);
      await execute(client.updateNote(opts.noteId, body));
    });

  note
    .command("delete")
    .description("Delete a note")
    .requiredOption("--note-id <id>", "Note ID")
    .option("--notebook-id <id>", "Deprecated: ignored (note IDs are global)")
    .action(async (opts: { noteId: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.deleteNote(opts.noteId));
    });

  const memory = arinova.command("memory").description("Memory commands");

  memory
    .command("query")
    .description("Search agent memories using hybrid search")
    .requiredOption("--query <text>", "Search keywords or semantic query")
    .option("--limit <n>", "Number of results (default 10, max 20)")
    .action(async (opts: { query: string; limit?: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.queryMemory({
        query: opts.query,
        limit: parsePositiveCount(opts.limit, 10, 20, "--limit"),
      }));
    });

  const kanban = arinova.command("kanban").description("Kanban board commands");
  const board = kanban.command("board").description("Board commands");

  board
    .command("list")
    .description("List available Kanban boards")
    .option("--limit <n>", "Max boards to return (default 50, max 100)")
    .option("--offset <n>", "Skip boards")
    .action(async (opts: { limit?: string; offset?: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.listBoardsWithOptions({
        limit: parsePositiveCount(opts.limit, 50, 100, "--limit"),
        ...(opts.offset === undefined
          ? {}
          : { offset: parseNonNegativeCount(opts.offset, "--offset") }),
      }));
    });

  board
    .command("create")
    .description("Create a new Kanban board")
    .requiredOption("--name <name>", "Board name")
    .action(async (opts: { name: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.createBoard({ name: opts.name }));
    });

  board
    .command("update")
    .description("Rename a Kanban board")
    .requiredOption("--board-id <id>", "Board ID")
    .requiredOption("--name <name>", "New board name")
    .action(async (opts: { boardId: string; name: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.updateBoard(opts.boardId, { name: opts.name }));
    });

  board
    .command("archive")
    .description("Archive a Kanban board")
    .requiredOption("--board-id <id>", "Board ID")
    .action(async (opts: { boardId: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.archiveBoard(opts.boardId));
    });

  board
    .command("unarchive")
    .description("Unarchive a Kanban board")
    .requiredOption("--board-id <id>", "Board ID")
    .action(async (opts: { boardId: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.unarchiveBoard(opts.boardId));
    });

  const column = kanban.command("column").description("Column commands");

  column
    .command("list")
    .description("List columns in a board")
    .requiredOption("--board-id <id>", "Board ID")
    .action(async (opts: { boardId: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.listColumns(opts.boardId));
    });

  column
    .command("create")
    .description("Add a column to a board")
    .requiredOption("--board-id <id>", "Board ID")
    .requiredOption("--name <name>", "Column name")
    .option("--sort-order <n>", "Position (0-based)")
    .action(async (opts: { boardId: string; name: string; sortOrder?: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      const sortOrder = parseNonNegativeCount(opts.sortOrder, "--sort-order");
      await execute(client.createColumn(opts.boardId, {
        name: opts.name,
        ...(sortOrder === undefined ? {} : { sortOrder }),
      }));
    });

  column
    .command("update")
    .description("Update a column")
    .requiredOption("--column-id <id>", "Column ID")
    .option("--name <name>", "New column name")
    .option("--sort-order <n>", "New sort order")
    .action(async (opts: { columnId: string; name?: string; sortOrder?: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      const sortOrder = parseNonNegativeCount(opts.sortOrder, "--sort-order");
      await execute(client.updateColumn(opts.columnId, {
        ...(opts.name === undefined ? {} : { name: opts.name }),
        ...(sortOrder === undefined ? {} : { sortOrder }),
      }));
    });

  column
    .command("delete")
    .description("Delete an empty column")
    .requiredOption("--column-id <id>", "Column ID")
    .action(async (opts: { columnId: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.deleteColumn(opts.columnId));
    });

  column
    .command("reorder")
    .description("Reorder columns in a board")
    .requiredOption("--board-id <id>", "Board ID")
    .requiredOption("--column-ids <ids...>", "Column IDs in desired order")
    .action(async (opts: { boardId: string; columnIds: string[] }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.reorderColumns(opts.boardId, opts.columnIds));
    });

  const card = kanban.command("card").description("Card commands");

  card
    .command("list")
    .description("List Kanban cards")
    .option("--search <query>", "Search card titles and descriptions")
    .option("--limit <n>", "Max cards to return (default 50, max 100)")
    .option("--offset <n>", "Skip cards")
    .action(async (opts: { search?: string; limit?: string; offset?: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.listCards({
        ...(opts.search ? { search: opts.search } : {}),
        limit: parsePositiveCount(opts.limit, 50, 100, "--limit"),
        ...(opts.offset === undefined
          ? {}
          : { offset: parseNonNegativeCount(opts.offset, "--offset") }),
      }));
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
    .action(async (opts: {
      title: string;
      boardId?: string;
      columnName?: string;
      columnId?: string;
      description?: string;
      priority?: string;
    }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.createCard({
        title: opts.title,
        ...(opts.boardId ? { boardId: opts.boardId } : {}),
        ...(opts.columnId ? { columnId: opts.columnId } : {}),
        ...(opts.columnName ? { columnName: opts.columnName } : {}),
        ...(opts.description ? { description: opts.description } : {}),
        ...(opts.priority ? { priority: opts.priority } : {}),
      }));
    });

  card
    .command("update")
    .description("Update a Kanban card")
    .requiredOption("--card-id <id>", "Card ID")
    .option("--title <text>", "New title")
    .option("--description <text>", "New description")
    .option("--column-id <id>", "Move card to this column ID")
    .option("--priority <level>", "New priority: low, medium, high, or urgent")
    .action(async (opts: {
      cardId: string;
      title?: string;
      description?: string;
      columnId?: string;
      priority?: string;
    }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.updateCard(opts.cardId, {
        ...(opts.title === undefined ? {} : { title: opts.title }),
        ...(opts.description === undefined ? {} : { description: opts.description }),
        ...(opts.columnId === undefined ? {} : { columnId: opts.columnId }),
        ...(opts.priority === undefined ? {} : { priority: opts.priority }),
      }));
    });

  card
    .command("complete")
    .description("Mark a card as complete (move to Done)")
    .requiredOption("--card-id <id>", "Card ID")
    .action(async (opts: { cardId: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.completeCard(opts.cardId));
    });

  card
    .command("add-commit")
    .description("Link a git commit to a card")
    .requiredOption("--card-id <id>", "Card ID")
    .requiredOption("--sha <sha>", "Git commit hash")
    .requiredOption("--message <msg>", "Commit message")
    .option("--url <url>", "Commit URL")
    .action(async (opts: { cardId: string; sha: string; message: string; url?: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.addCardCommit(opts.cardId, {
        commitHash: opts.sha,
        message: opts.message,
        ...(opts.url ? { url: opts.url } : {}),
      }));
    });

  card
    .command("commits")
    .description("List commits linked to a card")
    .requiredOption("--card-id <id>", "Card ID")
    .action(async (opts: { cardId: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.listCardCommits(opts.cardId));
    });

  card
    .command("link-note")
    .description("Link a note to a card")
    .requiredOption("--card-id <id>", "Card ID")
    .requiredOption("--note-id <id>", "Note ID")
    .action(async (opts: { cardId: string; noteId: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.linkCardNote(opts.cardId, opts.noteId));
    });

  card
    .command("unlink-note")
    .description("Unlink a note from a card")
    .requiredOption("--card-id <id>", "Card ID")
    .requiredOption("--note-id <id>", "Note ID")
    .action(async (opts: { cardId: string; noteId: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.unlinkCardNote(opts.cardId, opts.noteId));
    });

  card
    .command("notes")
    .description("List notes linked to a card")
    .requiredOption("--card-id <id>", "Card ID")
    .action(async (opts: { cardId: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.listCardNotes(opts.cardId));
    });

  const label = kanban.command("label").description("Label commands");

  label
    .command("list")
    .description("List labels on a board")
    .requiredOption("--board-id <id>", "Board ID")
    .action(async (opts: { boardId: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.listLabels(opts.boardId));
    });

  label
    .command("create")
    .description("Create a label on a board")
    .requiredOption("--board-id <id>", "Board ID")
    .requiredOption("--name <name>", "Label name")
    .requiredOption("--color <color>", "Label color (hex, e.g. '#ff0000')")
    .action(async (opts: { boardId: string; name: string; color: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.createLabel(opts.boardId, { name: opts.name, color: opts.color }));
    });

  label
    .command("update")
    .description("Update a label")
    .requiredOption("--label-id <id>", "Label ID")
    .option("--name <name>", "New label name")
    .option("--color <color>", "New label color (hex)")
    .action(async (opts: { labelId: string; name?: string; color?: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.updateLabel(opts.labelId, {
        ...(opts.name === undefined ? {} : { name: opts.name }),
        ...(opts.color === undefined ? {} : { color: opts.color }),
      }));
    });

  label
    .command("delete")
    .description("Delete a label")
    .requiredOption("--label-id <id>", "Label ID")
    .action(async (opts: { labelId: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.deleteLabel(opts.labelId));
    });

  card
    .command("add-label")
    .description("Add a label to a card")
    .requiredOption("--card-id <id>", "Card ID")
    .requiredOption("--label-id <id>", "Label ID")
    .action(async (opts: { cardId: string; labelId: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.addCardLabel(opts.cardId, opts.labelId));
    });

  card
    .command("remove-label")
    .description("Remove a label from a card")
    .requiredOption("--card-id <id>", "Card ID")
    .requiredOption("--label-id <id>", "Label ID")
    .action(async (opts: { cardId: string; labelId: string }) => {
      const { client, execute } = defineApiCommand(rootOptions(arinova));
      await execute(client.removeCardLabel(opts.cardId, opts.labelId));
    });
}
