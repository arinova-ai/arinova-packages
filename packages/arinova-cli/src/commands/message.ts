import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";

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
      const result = await apiCall({ method: "GET", url: `${apiUrl}/api/v1/messages/${opts.conversationId}${q ? "?" + q : ""}`, token });
      output(result);
    });
}
