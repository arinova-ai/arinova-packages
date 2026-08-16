import type { Command } from "commander";
import { buildQuery, encodePathSegment, resolveClient } from "../../client.js";
import { parseJsonObject } from "../../json-options.js";
import { printResult } from "../../output.js";
import { addPaginationOptions, paginationValues } from "../../pagination.js";

const e = encodePathSegment;

export function registerTriggerCommands(program: Command): void {
  const trigger = program.command("trigger").description("Platform triggers");
  addPaginationOptions(trigger.command("list"), { mode: "offset" })
    .action(async (options) => {
      printResult(await resolveClient(trigger).get(
        `/api/v1/platform-triggers/triggers${buildQuery(paginationValues(options))}`,
      ));
    });
  trigger.command("create").requiredOption("--body <json>").action(async (options) => {
    printResult(await resolveClient(trigger).post(
      "/api/v1/platform-triggers/triggers",
      parseJsonObject(options.body, "--body"),
    ));
  });
  trigger.command("show").argument("<id>").action(async (id: string) => {
    printResult(await resolveClient(trigger).get(`/api/v1/platform-triggers/triggers/${e(id)}`));
  });
  trigger.command("update").argument("<id>").requiredOption("--body <json>")
    .action(async (id: string, options) => printResult(await resolveClient(trigger).patch(
      `/api/v1/platform-triggers/triggers/${e(id)}`,
      parseJsonObject(options.body, "--body"),
    )));
  trigger.command("delete").argument("<id>").action(async (id: string) => {
    printResult(await resolveClient(trigger).delete(`/api/v1/platform-triggers/triggers/${e(id)}`));
  });
  for (const [name, enabled] of [["enable", true], ["disable", false]] as const) {
    trigger.command(name).argument("<id>").action(async (id: string) => printResult(
      await resolveClient(trigger).patch(
        `/api/v1/platform-triggers/triggers/${e(id)}/enabled`,
        { enabled },
      ),
    ));
  }
  trigger.command("test").argument("<id>").option("--body <json>", "Test event", "{}")
    .action(async (id: string, options) => printResult(await resolveClient(trigger).post(
      `/api/v1/platform-triggers/triggers/${e(id)}/test`,
      parseJsonObject(options.body, "--body"),
    )));
  trigger.command("cancel").argument("<id>").option("--reason <reason>")
    .action(async (id: string, options) => printResult(await resolveClient(trigger).post(
      `/api/v1/platform-triggers/triggers/${e(id)}/cancel`,
      { reason: options.reason },
    )));
  trigger.command("fire-events").argument("<id>").action(async (id: string) => {
    printResult(await resolveClient(trigger).get(
      `/api/v1/platform-triggers/triggers/${e(id)}/fire-events`,
    ));
  });
  trigger.command("merged-dispatch").argument("<id>").action(async (id: string) => {
    printResult(await resolveClient(trigger).get(
      `/api/v1/platform-triggers/merged-dispatches/${e(id)}`,
    ));
  });
}
