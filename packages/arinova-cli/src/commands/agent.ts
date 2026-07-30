import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";
import { encodePathSegment } from "../client.js";

export function registerAgentCommands(program: Command): void {
  const agent = program.command("agent").description("Agent management");

  agent.command("list")
    .description("List agents (JWT: all owned, bot token: self only)")
    .action(async () => {
      const { token, apiUrl } = getOpts(agent);
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/agents`, token }));
    });

  agent.command("status")
    .description("Check agent connection status")
    .requiredOption("--id <id>", "Agent ID")
    .action(async (opts: { id: string }) => {
      const { token, apiUrl } = getOpts(agent);
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/agents/${encodePathSegment(opts.id)}/profile`, token }));
    });

  agent.command("onboarding-knowledge")
    .description("Get an agent's onboarding knowledge")
    .requiredOption("--id <id>", "Agent ID")
    .action(async (opts: { id: string }) => {
      const { token, apiUrl } = getOpts(agent);
      output(await apiCall({
        method: "GET",
        url: `${apiUrl}/api/v1/agents/${encodePathSegment(opts.id)}/onboarding-knowledge`,
        token,
      }));
    });

  agent.command("skill-tools")
    .requiredOption("--id <id>", "Agent ID")
    .action(async (opts: { id: string }) => {
      const { token, apiUrl } = getOpts(agent);
      output(await apiCall({
        method: "GET",
        url: `${apiUrl}/api/v1/agents/${encodePathSegment(opts.id)}/skill-package-tools`,
        token,
      }));
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
      let args: unknown;
      try {
        args = JSON.parse(opts.arguments);
      } catch {
        throw new Error("--arguments must be valid JSON");
      }
      const { token, apiUrl } = getOpts(agent);
      output(await apiCall({
        method: "POST",
        url: `${apiUrl}/api/v1/agents/${encodePathSegment(opts.id)}/skill-package-resources/query`,
        token,
        body: {
          toolName: opts.toolName,
          requestId: opts.requestId,
          arguments: args,
          conversationId: opts.conversationId,
        },
      }));
    });
}
