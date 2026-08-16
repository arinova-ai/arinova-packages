import type { Command } from "commander";
import { encodePathSegment, resolveClient } from "../client.js";
import { addPaginationOptions, paginationQuery } from "../pagination.js";
import { printResult } from "../output.js";

export function registerMessageCommands(program: Command): void {
  const msg = program.command("message").description("Message commands");

  msg.command("send")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--content <text>", "Message content")
    .option("--reply-to <id>", "Reply to message ID")
    .action(async (opts: { conversationId: string; content: string; replyTo?: string }) => {
      const body: Record<string, string> = { conversationId: opts.conversationId, content: opts.content };
      if (opts.replyTo) body.replyTo = opts.replyTo;
      const result = await resolveClient(msg).post("/api/v1/messages/send", body);
      printResult(result);
    });

  addPaginationOptions(msg.command("list")
    .requiredOption("--conversation-id <id>", "Conversation ID"), { mode: "cursor" })
    .action(async (opts: { conversationId: string; limit?: number; cursor?: string }) => {
      const result = await resolveClient(msg).get(
        `/api/v1/messages/${encodePathSegment(opts.conversationId)}${paginationQuery(opts, "before")}`,
      );
      printResult(result);
    });

  addPaginationOptions(msg.command("search")
    .requiredOption("-q, --query <text>", "Message search query")
    .option("--conversation-id <id>", "Limit search to a conversation"), { mode: "offset" })
    .action(async (opts) => {
      const query = new URLSearchParams({ q: opts.query });
      if (opts.conversationId) query.set("conversationId", opts.conversationId);
      query.set("limit", String(opts.limit));
      if (opts.offset !== undefined) query.set("offset", String(opts.offset));
      printResult(await resolveClient(msg).get(`/api/v1/messages/search?${query}`));
    });

  const feedback = msg.command("feedback").description("Message feedback");
  feedback.command("get")
    .requiredOption("--message-id <id>", "Agent message ID")
    .action(async (opts) => {
      printResult(await resolveClient(msg).get(
        `/api/v1/messages/${encodePathSegment(opts.messageId)}/feedback`,
      ));
    });
  feedback.command("set")
    .requiredOption("--message-id <id>", "Agent message ID")
    .requiredOption("--rating <rating>", "up or down")
    .action(async (opts) => {
      if (opts.rating !== "up" && opts.rating !== "down") {
        throw new Error("--rating must be 'up' or 'down'");
      }
      printResult(await resolveClient(msg).post(
        `/api/v1/messages/${encodePathSegment(opts.messageId)}/feedback`,
        { helpful: opts.rating === "up" },
      ));
    });
}
