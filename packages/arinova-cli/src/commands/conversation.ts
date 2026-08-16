import { Command } from "commander";
import { encodePathSegment, resolveClient } from "../client.js";
import { parseCount } from "../pagination.js";
import { printResult } from "../output.js";

export function registerConversation(program: Command): void {
  const conv = program.command("conversation").description("Conversation commands");

  conv
    .command("create")
    .description("Create a conversation with an agent")
    .requiredOption("--agent-id <id>", "Agent ID")
    .option(
      "--type <type>",
      "Conversation type: onboarding, task_report, or alert",
      "onboarding",
    )
    .action(async function (this: Command) {
      const opts = this.opts();
      const data = await resolveClient(this).post(
        `/api/v1/agents/${encodePathSegment(opts.agentId)}/conversations`,
        { type: opts.type },
      );
      printResult(data);
    });

  conv
    .command("list")
    .description("List conversations")
    .option("--type <type>", "Filter by type (h2a, h2h, group, community, official, lounge)")
    .option("--search <query>", "Search by name")
    .option("--limit <n>", "Max results", parseCount, 50)
    .action(async function (this: Command) {
      const opts = this.opts();
      const params = new URLSearchParams();
      if (opts.type) params.set("type", opts.type);
      if (opts.search) params.set("search", opts.search);
      if (opts.limit) params.set("limit", opts.limit);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const data = await resolveClient(this).get(`/api/v1/conversations${qs}`);
      printResult(data);
    });
}
