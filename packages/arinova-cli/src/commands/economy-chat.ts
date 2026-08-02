import type { Command } from "commander";
import { buildQuery, get, post, resolveClient } from "../client.js";
import { printResult } from "../output.js";
import { renderSseStream } from "../sse.js";
import { addPaginationOptions, collectAllPages, paginationQuery } from "../pagination.js";
import { parseJsonArray, parseJsonOption } from "../json-options.js";

function chatBody(opts: {
  agentId: string; prompt?: string; systemPrompt?: string;
  messages?: string; context?: string;
}) {
  if (!opts.prompt && !opts.messages) {
    throw new Error("Specify --prompt or --messages");
  }
  const messages = opts.messages ? parseJsonArray(opts.messages, "--messages") : undefined;
  return {
    agentId: opts.agentId,
    prompt: opts.prompt,
    systemPrompt: opts.systemPrompt,
    messages,
    context: parseJsonOption(opts.context, "--context"),
  };
}

export function registerEconomyChatCommands(program: Command): void {
  const economy = program.command("economy")
    .description("User-authorized economy commands (requires OAuth economy scope)");
  economy.command("balance").action(async () => {
    printResult(await get("/api/v1/economy/balance"));
  });
  addPaginationOptions(economy.command("transactions"))
    .action(async (opts) => {
      if (!opts.all) {
        printResult(await get(`/api/v1/economy/transactions${paginationQuery(opts)}`));
        return;
      }
      const pageSize = opts.limit ?? 100;
      const transactions = await collectAllPages(opts.offset ?? 0, async (offset) => {
        const response = await get(`/api/v1/economy/transactions${paginationQuery({ limit: pageSize, offset })}`);
        const items = Array.isArray(response)
          ? response
          : ((response as { transactions?: unknown[] }).transactions ?? []);
        return { items, next: items.length < pageSize ? undefined : offset + items.length };
      });
      printResult(transactions);
    });
  economy.command("purchase")
    .requiredOption("--space-id <id>")
    .requiredOption("--amount <n>")
    .requiredOption("--idempotency-key <key>")
    .option("--product-id <id>")
    .option("--description <text>")
    .action(async (opts) => {
      const amount = Number(opts.amount);
      if (!Number.isInteger(amount) || amount <= 0 || amount > 100_000) {
        throw new Error("--amount must be an integer from 1 to 100000");
      }
      printResult(await post("/api/v1/economy/purchase", {
        spaceId: opts.spaceId,
        productId: opts.productId,
        amount,
        description: opts.description,
        idempotencyKey: opts.idempotencyKey,
      }));
    });

  const chat = program.command("chat")
    .description("Agent chat proxy (requires a Space OAuth token with agents scope)");
  chat.command("complete")
    .requiredOption("--agent-id <id>")
    .option("--prompt <text>")
    .option("--system-prompt <text>")
    .option("--messages <json>")
    .option("--context <json>")
    .action(async (opts) => {
      printResult(await post("/api/v1/agent/chat", chatBody(opts)));
    });
  chat.command("stream")
    .requiredOption("--agent-id <id>")
    .option("--prompt <text>")
    .option("--system-prompt <text>")
    .option("--messages <json>")
    .option("--context <json>")
    .action(async (opts) => {
      await renderSseStream(await resolveClient(chat).stream("/api/v1/agent/chat/stream", chatBody(opts)));
    });
}
