import type { Command } from "commander";
import { encodePathSegment, resolveClient } from "../client.js";
import { printResult } from "../output.js";
import { parseCount } from "../pagination.js";

export function registerMemoCommands(program: Command): void {
  const memo = program.command("memo").description("Memo page commands");

  memo
    .command("list")
    .option("--conversation-id <id>", "Conversation ID")
    .option("--search <query>", "Search memo pages")
    .option("--limit <n>", "Max pages", parseCount)
    .option("--offset <n>", "Skip pages", parseCount)
    .action(async (opts) => {
      const params = new URLSearchParams();
      if (opts.conversationId) params.set("conversationId", opts.conversationId);
      if (opts.search) params.set("search", opts.search);
      if (opts.limit !== undefined) params.set("limit", String(opts.limit));
      if (opts.offset !== undefined) params.set("offset", String(opts.offset));
      const query = params.toString();
      printResult(await resolveClient(memo).get(
        `/api/v1/memo${query ? `?${query}` : ""}`,
      ));
    });

  memo
    .command("get")
    .requiredOption("--page-id <id>", "Memo page ID")
    .action(async (opts: { pageId: string }) => {
      const id = encodePathSegment(opts.pageId);
      const client = resolveClient(memo);
      const [page, commentsResponse] = await Promise.all([
        client.get(`/api/v1/memo/${id}`),
        client.get(`/api/v1/memo/${id}/comments`),
      ]);
      const comments =
        (commentsResponse as { comments?: unknown })?.comments ?? commentsResponse;
      printResult({ ...(page as Record<string, unknown>), comments });
    });

  memo
    .command("create")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--title <title>", "Page title")
    .option("--content <text>", "Page content")
    .option("--tags <tags...>", "Tags")
    .action(async (opts) => {
      printResult(await resolveClient(memo).post("/api/v1/memo", {
        conversationId: opts.conversationId,
        title: opts.title,
        content: opts.content ?? "",
        tags: opts.tags ?? [],
      }));
    });

  memo
    .command("update")
    .requiredOption("--page-id <id>", "Memo page ID")
    .option("--title <text>", "New title")
    .option("--content <text>", "New content")
    .action(async (opts) => {
      printResult(await resolveClient(memo).patch(
        `/api/v1/memo/${encodePathSegment(opts.pageId)}`,
        { title: opts.title, content: opts.content },
      ));
    });

  memo
    .command("delete")
    .requiredOption("--page-id <id>", "Memo page ID")
    .action(async (opts) => {
      printResult(await resolveClient(memo).delete(
        `/api/v1/memo/${encodePathSegment(opts.pageId)}`,
      ));
    });

  const comment = memo.command("comment").description("Memo comment commands");
  comment
    .command("list")
    .requiredOption("--page-id <id>", "Memo page ID")
    .action(async (opts) => {
      printResult(await resolveClient(memo).get(
        `/api/v1/memo/${encodePathSegment(opts.pageId)}/comments`,
      ));
    });
  comment
    .command("add")
    .requiredOption("--page-id <id>", "Memo page ID")
    .requiredOption("--content <text>", "Comment content")
    .action(async (opts) => {
      printResult(await resolveClient(memo).post(
        `/api/v1/memo/${encodePathSegment(opts.pageId)}/comments`,
        { content: opts.content },
      ));
    });
  comment
    .command("delete")
    .requiredOption("--id <id>", "Comment ID")
    .action(async (opts) => {
      printResult(await resolveClient(memo).delete(
        `/api/v1/memo/comments/${encodePathSegment(opts.id)}`,
      ));
    });
}
