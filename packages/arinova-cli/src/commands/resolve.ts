import type { Command } from "commander";
import { getOpts, output } from "../api.js";
import { ApiClient, encodePathSegment } from "../client.js";

function clientFor(command: Command): ApiClient {
  const { token, apiUrl } = getOpts(command);
  return new ApiClient({ endpoint: apiUrl, token });
}

export function registerResolveCommands(program: Command): void {
  const resolve = program.command("resolve").description("Resolve resource identifiers");
  resolve.argument("<short-id>", "7/8-hex ID, UUID, or commit SHA").action(async (shortId: string) => {
    output(await clientFor(resolve).get(`/api/v1/resolve/${encodePathSegment(shortId)}`));
  });
  resolve.command("batch")
    .description("Resolve identifiers referenced in content")
    .requiredOption("--conversation-id <id>")
    .requiredOption("--content <text>")
    .option("--agent-id <id>")
    .option("--message-id <id>")
    .option("--max-tokens <n>")
    .action(async (opts: {
      conversationId: string; content: string; agentId?: string;
      messageId?: string; maxTokens?: string;
    }) => {
      output(await clientFor(resolve).post("/api/v1/resolve-identifiers", {
        conversationId: opts.conversationId,
        content: opts.content,
        agentId: opts.agentId,
        messageId: opts.messageId,
        maxTokens: opts.maxTokens == null ? undefined : Number(opts.maxTokens),
      }));
    });
}
