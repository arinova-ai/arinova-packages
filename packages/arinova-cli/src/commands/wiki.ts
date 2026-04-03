import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";

export function registerWikiCommands(program: Command): void {
  const wiki = program.command("wiki").description("Wiki page commands");

  wiki.command("list")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .option("--search <query>", "Search wiki pages")
    .description("List wiki pages in a conversation")
    .action(async (opts: { conversationId: string; search?: string }) => {
      const { token, apiUrl } = getOpts(wiki);
      const params = new URLSearchParams({ conversationId: opts.conversationId });
      if (opts.search) params.set("search", opts.search);
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/wiki?${params.toString()}`, token }));
    });

  wiki.command("get")
    .requiredOption("--page-id <id>", "Wiki page ID")
    .description("Get a wiki page")
    .action(async (opts: { pageId: string }) => {
      const { token, apiUrl } = getOpts(wiki);
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/wiki/${opts.pageId}`, token }));
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
}
