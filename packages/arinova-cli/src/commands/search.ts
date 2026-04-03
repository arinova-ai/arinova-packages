import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";

export function registerSearchCommands(program: Command): void {
  program
    .command("search")
    .description("Search across messages, notes, conversations, and memories")
    .requiredOption("-q, --query <keyword>", "Search keyword")
    .option("--limit <n>", "Max results per category (default: 10, max: 20)")
    .action(async (opts: { query: string; limit?: string }) => {
      const { token, apiUrl } = getOpts(program);
      const qs = new URLSearchParams({ q: opts.query });
      if (opts.limit) qs.set("limit", opts.limit);
      const result = await apiCall({
        method: "GET",
        url: `${apiUrl}/api/v1/search?${qs.toString()}`,
        token,
      });
      output(result);
    });
}
