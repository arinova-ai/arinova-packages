import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";
import { encodePathSegment } from "../client.js";

export function registerMessageCommands(program: Command): void {
  const msg = program.command("message").description("Message commands");

  msg.command("send")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--content <text>", "Message content")
    .option("--reply-to <id>", "Reply to message ID")
    .action(async (opts: { conversationId: string; content: string; replyTo?: string }) => {
      const { token, apiUrl } = getOpts(msg);
      const body: Record<string, string> = { conversationId: opts.conversationId, content: opts.content };
      if (opts.replyTo) body.replyTo = opts.replyTo;
      const result = await apiCall({ method: "POST", url: `${apiUrl}/api/v1/messages/send`, token, body });
      output(result);
    });

  msg.command("list")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .option("--limit <n>", "Number of messages")
    .option("--cursor <id>", "Cursor for pagination")
    .action(async (opts: { conversationId: string; limit?: string; cursor?: string }) => {
      const { token, apiUrl } = getOpts(msg);
      const qs = new URLSearchParams();
      if (opts.limit) qs.set("limit", opts.limit);
      if (opts.cursor) qs.set("before", opts.cursor);
      const q = qs.toString();
      const result = await apiCall({ method: "GET", url: `${apiUrl}/api/v1/messages/${encodePathSegment(opts.conversationId)}${q ? "?" + q : ""}`, token });
      output(result);
    });

  msg.command("search")
    .requiredOption("-q, --query <text>", "Message search query")
    .option("--conversation-id <id>", "Limit search to a conversation")
    .option("--limit <n>", "Max results", Number.parseInt)
    .option("--offset <n>", "Skip results", Number.parseInt)
    .action(async (opts) => {
      const { token, apiUrl } = getOpts(msg);
      const query = new URLSearchParams({ q: opts.query });
      if (opts.conversationId) query.set("conversationId", opts.conversationId);
      if (opts.limit !== undefined) query.set("limit", String(opts.limit));
      if (opts.offset !== undefined) query.set("offset", String(opts.offset));
      output(await apiCall({
        method: "GET",
        url: `${apiUrl}/api/v1/messages/search?${query}`,
        token,
      }));
    });

  const feedback = msg.command("feedback").description("Message feedback");
  feedback.command("get")
    .requiredOption("--message-id <id>", "Agent message ID")
    .action(async (opts) => {
      const { token, apiUrl } = getOpts(msg);
      output(await apiCall({
        method: "GET",
        url: `${apiUrl}/api/v1/messages/${encodePathSegment(opts.messageId)}/feedback`,
        token,
      }));
    });
  feedback.command("set")
    .requiredOption("--message-id <id>", "Agent message ID")
    .requiredOption("--rating <rating>", "up or down")
    .action(async (opts) => {
      if (opts.rating !== "up" && opts.rating !== "down") {
        throw new Error("--rating must be 'up' or 'down'");
      }
      const { token, apiUrl } = getOpts(msg);
      output(await apiCall({
        method: "POST",
        url: `${apiUrl}/api/v1/messages/${encodePathSegment(opts.messageId)}/feedback`,
        token,
        body: { helpful: opts.rating === "up" },
      }));
    });
}
