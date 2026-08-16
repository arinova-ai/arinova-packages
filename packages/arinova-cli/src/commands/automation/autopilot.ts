import type { Command } from "commander";
import { buildQuery, resolveClient } from "../../client.js";
import { parseJsonObject } from "../../json-options.js";
import { printResult } from "../../output.js";
import { addPaginationOptions, paginationValues } from "../../pagination.js";

export function registerAutopilotCommands(program: Command): void {
  const autopilot = program.command("autopilot").description("Autopilot controls");
  const settings = autopilot.command("settings");
  settings.command("get").requiredOption("--agent-id <id>").option("--conversation-id <id>")
    .action(async (options) => printResult(await resolveClient(autopilot).get(
      `/api/v1/autopilot/settings${buildQuery(options)}`,
    )));
  settings.command("update").requiredOption("--body <json>").action(async (options) => {
    printResult(await resolveClient(autopilot).patch(
      "/api/v1/autopilot/settings",
      parseJsonObject(options.body, "--body"),
    ));
  });
  autopilot.command("evaluate")
    .requiredOption("--agent-id <id>").requiredOption("--conversation-id <id>")
    .option("--dry-run")
    .action(async (options) => printResult(await resolveClient(autopilot).post(
      "/api/v1/autopilot/evaluate",
      {
        agentId: options.agentId,
        conversationId: options.conversationId,
        dryRun: options.dryRun,
      },
    )));
  addPaginationOptions(autopilot.command("runs")
    .option("--agent-id <id>").option("--conversation-id <id>"), { mode: "offset" })
    .action(async (options) => printResult(await resolveClient(autopilot).get(
      `/api/v1/autopilot/runs${buildQuery({
        agentId: options.agentId,
        conversationId: options.conversationId,
        ...paginationValues(options),
      })}`,
    )));
  autopilot.command("credit").option("--agent-id <id>").option("--conversation-id <id>")
    .action(async (options) => printResult(await resolveClient(autopilot).get(
      `/api/v1/autopilot/credit${buildQuery(options)}`,
    )));
}
