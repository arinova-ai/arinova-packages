import type { Command } from "commander";
import { buildQuery, encodePathSegment, resolveClient } from "../../client.js";
import { parseJsonObject } from "../../json-options.js";
import { printResult } from "../../output.js";
import { addPaginationOptions, paginationValues } from "../../pagination.js";

const e = encodePathSegment;

export function registerCronCommands(program: Command): void {
  const cron = program.command("cron").description("Platform cron");
  const job = cron.command("job");
  addPaginationOptions(job.command("list")
    .option("--status <status>").option("--enabled <boolean>")
    .option("--conversation-id <id>").option("--agent-id <id>")
    .option("--created-by-agent-id <id>").option("--schedule-kind <kind>")
    .option("--target-type <type>"), { mode: "offset" })
    .action(async (options) => printResult(await resolveClient(cron).get(
      `/api/v1/platform-cron/jobs${buildQuery({
        status: options.status,
        enabled: options.enabled,
        conversationId: options.conversationId,
        agentId: options.agentId,
        createdByAgentId: options.createdByAgentId,
        scheduleKind: options.scheduleKind,
        targetType: options.targetType,
        ...paginationValues(options),
      })}`,
    )));
  job.command("create").requiredOption("--body <json>").option("--dry-run")
    .action(async (options) => printResult(await resolveClient(cron).post(
      `/api/v1/platform-cron/jobs${buildQuery({ dryRun: options.dryRun })}`,
      parseJsonObject(options.body, "--body"),
    )));
  job.command("show").argument("<id>").action(async (id: string) => {
    printResult(await resolveClient(cron).get(`/api/v1/platform-cron/jobs/${e(id)}`));
  });
  job.command("update").argument("<id>").requiredOption("--body <json>").option("--dry-run")
    .action(async (id: string, options) => printResult(await resolveClient(cron).patch(
      `/api/v1/platform-cron/jobs/${e(id)}${buildQuery({ dryRun: options.dryRun })}`,
      parseJsonObject(options.body, "--body"),
    )));
  job.command("cancel").argument("<id>").option("--reason <reason>")
    .action(async (id: string, options) => printResult(await resolveClient(cron).post(
      `/api/v1/platform-cron/jobs/${e(id)}/cancel`,
      { reason: options.reason },
    )));
  for (const [name, enabled] of [["enable", true], ["disable", false]] as const) {
    job.command(name).argument("<id>").action(async (id: string) => printResult(
      await resolveClient(cron).patch(
        `/api/v1/platform-cron/jobs/${e(id)}/enabled`,
        { enabled },
      ),
    ));
  }
  const confirmation = cron.command("confirmation");
  for (const name of ["approve", "reject"] as const) {
    confirmation.command(name).argument("<id>").action(async (id: string) => {
      printResult(await resolveClient(cron).post(
        `/api/v1/platform-cron/confirmations/${e(id)}/${name}`,
      ));
    });
  }
}
