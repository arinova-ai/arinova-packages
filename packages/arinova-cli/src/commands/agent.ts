import type { Command } from "commander";
import { encodePathSegment, resolveClient } from "../client.js";
import { parseJsonOption } from "../json-options.js";
import { printResult } from "../output.js";

export function registerAgentCommands(program: Command): void {
  const agent = program.command("agent").description("Agent management");

  agent.command("list")
    .description("List agents (JWT: all owned, bot token: self only)")
    .action(async () => {
      printResult(await resolveClient(agent).get("/api/agents"));
    });

  agent.command("status")
    .description("Check agent connection status")
    .requiredOption("--id <id>", "Agent ID")
    .action(async (opts: { id: string }) => {
      printResult(await resolveClient(agent).get(
        `/api/agents/${encodePathSegment(opts.id)}/profile`,
      ));
    });

  agent.command("onboarding-knowledge")
    .description("Get an agent's onboarding knowledge")
    .requiredOption("--id <id>", "Agent ID")
    .action(async (opts: { id: string }) => {
      printResult(await resolveClient(agent).get(
        `/api/v1/agents/${encodePathSegment(opts.id)}/onboarding-knowledge`,
      ));
    });

  agent.command("skill-tools")
    .requiredOption("--id <id>", "Agent ID")
    .action(async (opts: { id: string }) => {
      printResult(await resolveClient(agent).get(
        `/api/v1/agents/${encodePathSegment(opts.id)}/skill-package-tools`,
      ));
    });

  agent.command("skill-resource-query")
    .requiredOption("--id <id>", "Agent ID")
    .requiredOption("--tool-name <name>", "Package resource tool name")
    .requiredOption("--request-id <id>", "Idempotent request ID")
    .option("--arguments <json>", "Tool arguments JSON", "{}")
    .option("--conversation-id <id>")
    .action(async (opts: {
      id: string; toolName: string; requestId: string; arguments: string; conversationId?: string;
    }) => {
      const args = parseJsonOption(opts.arguments, "--arguments");
      printResult(await resolveClient(agent).post(
        `/api/v1/agents/${encodePathSegment(opts.id)}/skill-package-resources/query`,
        {
          toolName: opts.toolName,
          requestId: opts.requestId,
          arguments: args,
          conversationId: opts.conversationId,
        },
      ));
    });
}
