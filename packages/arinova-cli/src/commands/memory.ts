import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";

export function registerMemoryCommands(program: Command): void {
  const memory = program.command("memory").description("Agent memory commands");

  memory.command("list")
    .description("List agent memories")
    .option("--agent <id>", "Agent ID (required for bot token)")
    .option("--category <cat>", "Filter by category")
    .option("--limit <n>", "Max results", "20")
    .action(async (opts: { agent?: string; category?: string; limit?: string }) => {
      const { token, apiUrl } = getOpts(memory);
      const qs = new URLSearchParams();
      if (opts.agent) qs.set("agentId", opts.agent);
      if (opts.category) qs.set("category", opts.category);
      if (opts.limit) qs.set("limit", opts.limit);
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/memories?${qs}`, token }));
    });

  memory.command("create")
    .description("Create a memory")
    .requiredOption("--agent <id>", "Agent ID")
    .requiredOption("--category <cat>", "Category (preference/knowledge/correction/error)")
    .requiredOption("--summary <text>", "Memory summary")
    .option("--detail <text>", "Additional detail")
    .action(async (opts: { agent: string; category: string; summary: string; detail?: string }) => {
      const { token, apiUrl } = getOpts(memory);
      output(await apiCall({
        method: "POST", url: `${apiUrl}/api/v1/memories`, token,
        body: { agentId: opts.agent, category: opts.category, summary: opts.summary, detail: opts.detail },
      }));
    });

  memory.command("delete")
    .description("Delete a memory")
    .requiredOption("--id <id>", "Memory ID")
    .action(async (opts: { id: string }) => {
      const { token, apiUrl } = getOpts(memory);
      output(await apiCall({ method: "DELETE", url: `${apiUrl}/api/v1/memories/${opts.id}`, token }));
    });

  memory.command("query")
    .description("Search memories by query (capsules)")
    .requiredOption("--query <text>", "Search query")
    .option("--limit <n>", "Max results")
    .action(async (opts: { query: string; limit?: string }) => {
      const { token, apiUrl } = getOpts(memory);
      const qs = new URLSearchParams({ q: opts.query });
      if (opts.limit) qs.set("limit", opts.limit);
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/capsules?${qs}`, token }));
    });
}
