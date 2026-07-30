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
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/agents/${opts.id}/profile`, token }));
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
}
