import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";

export function registerCapsuleCommands(program: Command): void {
  const capsule = program.command("capsule").description("Memory capsule management");

  capsule.command("list")
    .description("List memory capsules")
    .action(async () => {
      const { token, apiUrl } = getOpts(capsule);
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/memory/capsules`, token }));
    });

  capsule.command("grant")
    .description("Grant capsule access to an agent")
    .requiredOption("--capsule-id <id>", "Capsule ID")
    .requiredOption("--agent-id <id>", "Agent ID")
    .action(async (opts: { capsuleId: string; agentId: string }) => {
      const { token, apiUrl } = getOpts(capsule);
      output(await apiCall({
        method: "POST",
        url: `${apiUrl}/api/memory/capsules/${opts.capsuleId}/grants`,
        token,
        body: { agentId: opts.agentId },
      }));
    });

  capsule.command("revoke")
    .description("Revoke capsule access from an agent")
    .requiredOption("--capsule-id <id>", "Capsule ID")
    .requiredOption("--agent-id <id>", "Agent ID")
    .action(async (opts: { capsuleId: string; agentId: string }) => {
      const { token, apiUrl } = getOpts(capsule);
      output(await apiCall({
        method: "DELETE",
        url: `${apiUrl}/api/memory/capsules/${opts.capsuleId}/grants/${opts.agentId}`,
        token,
      }));
    });

  capsule.command("query")
    .description("Search capsule entries")
    .requiredOption("--query <text>", "Search query")
    .option("--limit <n>", "Max results")
    .action(async (opts: { query: string; limit?: string }) => {
      const { token, apiUrl } = getOpts(capsule);
      const qs = new URLSearchParams({ query: opts.query });
      if (opts.limit) qs.set("limit", opts.limit);
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/capsules?${qs}`, token }));
    });
}
