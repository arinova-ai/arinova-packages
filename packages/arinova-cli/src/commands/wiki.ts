import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";
import { encodePathSegment } from "../client.js";
import { parseCount } from "../pagination.js";
import { printWarning } from "../output.js";

interface MemoRegistration {
  name: "memo" | "wiki";
  deprecated: boolean;
}

function registerMemoSurface(program: Command, registration: MemoRegistration): void {
  const root = program
    .command(registration.name)
    .description(
      registration.deprecated
        ? "Deprecated alias for memo page commands"
        : "Memo page commands",
    );
  const warn = () => {
    if (registration.deprecated) {
      printWarning("'arinova wiki' is deprecated; use 'arinova memo'.");
    }
  };

  root
    .command("list")
    .option("--conversation-id <id>", "Conversation ID")
    .option("--search <query>", "Search memo pages")
    .option("--limit <n>", "Max pages", parseCount)
    .option("--offset <n>", "Skip pages", parseCount)
    .action(async (opts) => {
      warn();
      const { token, apiUrl } = getOpts(root);
      const params = new URLSearchParams();
      if (opts.conversationId) params.set("conversationId", opts.conversationId);
      if (opts.search) params.set("search", opts.search);
      if (opts.limit !== undefined) params.set("limit", String(opts.limit));
      if (opts.offset !== undefined) params.set("offset", String(opts.offset));
      const query = params.toString();
      output(
        await apiCall({
          method: "GET",
          url: `${apiUrl}/api/v1/memo${query ? `?${query}` : ""}`,
          token,
        }),
      );
    });

  root
    .command("get")
    .requiredOption("--page-id <id>", "Memo page ID")
    .action(async (opts: { pageId: string }) => {
      warn();
      const { token, apiUrl } = getOpts(root);
      const id = encodePathSegment(opts.pageId);
      const [page, commentsResponse] = await Promise.all([
        apiCall({ method: "GET", url: `${apiUrl}/api/v1/memo/${id}`, token }),
        apiCall({
          method: "GET",
          url: `${apiUrl}/api/v1/memo/${id}/comments`,
          token,
        }),
      ]);
      const comments =
        (commentsResponse as { comments?: unknown })?.comments ?? commentsResponse;
      output({ ...(page as Record<string, unknown>), comments });
    });

  root
    .command("create")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--title <title>", "Page title")
    .option("--content <text>", "Page content")
    .option("--tags <tags...>", "Tags")
    .action(async (opts) => {
      warn();
      const { token, apiUrl } = getOpts(root);
      output(
        await apiCall({
          method: "POST",
          url: `${apiUrl}/api/v1/memo`,
          token,
          body: {
            conversationId: opts.conversationId,
            title: opts.title,
            content: opts.content ?? "",
            tags: opts.tags ?? [],
          },
        }),
      );
    });

  root
    .command("update")
    .requiredOption("--page-id <id>", "Memo page ID")
    .option("--title <text>", "New title")
    .option("--content <text>", "New content")
    .action(async (opts) => {
      warn();
      const { token, apiUrl } = getOpts(root);
      output(
        await apiCall({
          method: "PATCH",
          url: `${apiUrl}/api/v1/memo/${encodePathSegment(opts.pageId)}`,
          token,
          body: { title: opts.title, content: opts.content },
        }),
      );
    });

  root
    .command("delete")
    .requiredOption("--page-id <id>", "Memo page ID")
    .action(async (opts) => {
      warn();
      const { token, apiUrl } = getOpts(root);
      output(
        await apiCall({
          method: "DELETE",
          url: `${apiUrl}/api/v1/memo/${encodePathSegment(opts.pageId)}`,
          token,
        }),
      );
    });

  const comment = root.command("comment").description("Memo comment commands");
  comment
    .command("list")
    .requiredOption("--page-id <id>", "Memo page ID")
    .action(async (opts) => {
      warn();
      const { token, apiUrl } = getOpts(root);
      output(
        await apiCall({
          method: "GET",
          url: `${apiUrl}/api/v1/memo/${encodePathSegment(opts.pageId)}/comments`,
          token,
        }),
      );
    });
  comment
    .command("add")
    .requiredOption("--page-id <id>", "Memo page ID")
    .requiredOption("--content <text>", "Comment content")
    .action(async (opts) => {
      warn();
      const { token, apiUrl } = getOpts(root);
      output(
        await apiCall({
          method: "POST",
          url: `${apiUrl}/api/v1/memo/${encodePathSegment(opts.pageId)}/comments`,
          token,
          body: { content: opts.content },
        }),
      );
    });
  comment
    .command("delete")
    .requiredOption("--id <id>", "Comment ID")
    .action(async (opts) => {
      warn();
      const { token, apiUrl } = getOpts(root);
      output(
        await apiCall({
          method: "DELETE",
          url: `${apiUrl}/api/v1/memo/comments/${encodePathSegment(opts.id)}`,
          token,
        }),
      );
    });
}

export function registerMemoCommands(program: Command): void {
  registerMemoSurface(program, { name: "memo", deprecated: false });
}

export function registerWikiCommands(program: Command): void {
  registerMemoSurface(program, { name: "wiki", deprecated: true });
}
