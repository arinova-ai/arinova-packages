import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";

export function registerWikiCommands(program: Command): void {
  const wiki = program.command("wiki").description("Wiki page commands");

  wiki.command("list")
    .option("--conversation-id <id>", "Conversation ID (omit to list all)")
    .option("--search <query>", "Search wiki pages")
    .option("--limit <n>", "Max pages to return (default 20)", parseInt)
    .option("--offset <n>", "Skip first N pages (pagination)", parseInt)
    .description("List wiki pages (all or by conversation)")
    .action(async (opts: { conversationId?: string; search?: string; limit?: number; offset?: number }) => {
      const { token, apiUrl } = getOpts(wiki);
      const params = new URLSearchParams();
      if (opts.conversationId) params.set("conversationId", opts.conversationId);
      if (opts.search) params.set("search", opts.search);
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.offset) params.set("offset", String(opts.offset));
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/wiki?${params.toString()}`, token }));
    });

  wiki.command("get")
    .requiredOption("--page-id <id>", "Wiki page ID")
    .description("Get a wiki page (includes comments)")
    .action(async (opts: { pageId: string }) => {
      const { token, apiUrl } = getOpts(wiki);
      const [page, commentsRes] = await Promise.all([
        apiCall({ method: "GET", url: `${apiUrl}/api/v1/wiki/${opts.pageId}`, token }),
        apiCall({ method: "GET", url: `${apiUrl}/api/v1/wiki/${opts.pageId}/comments`, token }),
      ]);
      const pageObj = page as Record<string, unknown>;
      const commentsObj = commentsRes as Record<string, unknown>;
      output({ ...pageObj, comments: commentsObj?.comments ?? [] });
    });

  wiki.command("create")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--title <title>", "Page title")
    .option("--content <text>", "Page content")
    .option("--tags <tags...>", "Tags")
    .description("Create a wiki page")
    .action(async (opts: { conversationId: string; title: string; content?: string; tags?: string[] }) => {
      const { token, apiUrl } = getOpts(wiki);
      output(await apiCall({
        method: "POST",
        url: `${apiUrl}/api/v1/wiki`,
        token,
        body: { conversationId: opts.conversationId, title: opts.title, content: opts.content || "", tags: opts.tags || [] },
      }));
    });

  wiki.command("update")
    .requiredOption("--page-id <id>", "Wiki page ID")
    .option("--title <text>", "New title")
    .option("--content <text>", "New content")
    .description("Update a wiki page")
    .action(async (opts: { pageId: string; title?: string; content?: string }) => {
      const { token, apiUrl } = getOpts(wiki);
      output(await apiCall({
        method: "PATCH",
        url: `${apiUrl}/api/v1/wiki/${opts.pageId}`,
        token,
        body: { title: opts.title, content: opts.content },
      }));
    });

  wiki.command("delete")
    .requiredOption("--page-id <id>", "Wiki page ID")
    .description("Delete a wiki page")
    .action(async (opts: { pageId: string }) => {
      const { token, apiUrl } = getOpts(wiki);
      output(await apiCall({ method: "DELETE", url: `${apiUrl}/api/v1/wiki/${opts.pageId}`, token }));
    });

  // ── Comment subcommands ──
  const comment = wiki.command("comment").description("Wiki comment commands");

  comment.command("list")
    .requiredOption("--page-id <id>", "Wiki page ID")
    .description("List comments on a wiki page")
    .action(async (opts: { pageId: string }) => {
      const { token, apiUrl } = getOpts(wiki);
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/wiki/${opts.pageId}/comments`, token }));
    });

  comment.command("add")
    .requiredOption("--page-id <id>", "Wiki page ID")
    .requiredOption("--content <text>", "Comment content")
    .description("Add a comment to a wiki page")
    .action(async (opts: { pageId: string; content: string }) => {
      const { token, apiUrl } = getOpts(wiki);
      output(await apiCall({
        method: "POST",
        url: `${apiUrl}/api/v1/wiki/${opts.pageId}/comments`,
        token,
        body: { content: opts.content },
      }));
    });

  comment.command("delete")
    .requiredOption("--id <id>", "Comment ID")
    .description("Delete a wiki comment")
    .action(async (opts: { id: string }) => {
      const { token, apiUrl } = getOpts(wiki);
      output(await apiCall({ method: "DELETE", url: `${apiUrl}/api/v1/wiki/comments/${opts.id}`, token }));
    });
}
