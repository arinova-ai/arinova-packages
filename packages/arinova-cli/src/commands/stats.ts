import { Command } from "commander";
import { get } from "../client.js";
import { printResult, printError } from "../output.js";

export function registerStats(program: Command): void {
  const stats = program.command("stats").description("Dashboard statistics");

  stats
    .command("overview")
    .description("Show dashboard overview")
    .action(async () => {
      try {
        const data = await get("/api/v1/creator/dashboard");
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  stats
    .command("revenue")
    .description("Show revenue breakdown")
    .option("--period <period>", "Period (7d, 30d, 90d)", "30d")
    .action(async (opts: { period: string }) => {
      try {
        const data = await get(`/api/v1/creator/revenue?period=${opts.period}`);
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });
}
