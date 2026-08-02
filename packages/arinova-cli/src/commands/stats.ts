import { Command } from "commander";
import { get, buildQuery } from "../client.js";
import { printResult } from "../output.js";

export function registerStats(program: Command): void {
  const stats = program.command("stats").description("Dashboard statistics");

  stats
    .command("overview")
    .description("Show dashboard overview")
    .action(async () => {
      const data = await get("/api/v1/creator/dashboard");
      printResult(data);
    });

  stats
    .command("revenue")
    .description("Show revenue breakdown")
    .option("--period <period>", "Period (7d, 30d, 90d)", "30d")
    .action(async (opts: { period: string }) => {
      const data = await get(`/api/v1/creator/revenue${buildQuery({ period: opts.period })}`);
      printResult(data);
    });
}
