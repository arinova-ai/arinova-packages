import type { Command } from "commander";
import { buildQuery, encodePathSegment, resolveClient } from "../../client.js";
import { parseJsonObject } from "../../json-options.js";
import { printResult } from "../../output.js";
import { addPaginationOptions, paginationValues } from "../../pagination.js";

const e = encodePathSegment;

export function registerActionCommands(program: Command): void {
  const action = program.command("action").description("Action calls and confirmations");
  action.command("manifest").action(async () => {
    printResult(await resolveClient(action).get("/api/v1/actions/manifest"));
  });
  action.command("agent-manifest").action(async () => {
    printResult(await resolveClient(action).get("/api/v1/actions/agent-manifest"));
  });
  action.command("call").requiredOption("--body <json>", "Inbound action call")
    .action(async (options) => printResult(await resolveClient(action).post(
      "/api/v1/actions/call",
      parseJsonObject(options.body, "--body"),
    )));
  addPaginationOptions(action.command("pending").requiredOption("--since <datetime>"), {
    mode: "cursor",
  }).action(async (options) => printResult(await resolveClient(action).get(
    `/api/v1/actions/pending${buildQuery({
      since: options.since,
      ...paginationValues(options),
    })}`,
  )));
  action.command("history").requiredOption("--conversation-id <id>")
    .action(async (options) => printResult(await resolveClient(action).get(
      `/api/v1/actions/history/${e(options.conversationId)}`,
    )));

  const confirmation = action.command("confirmation");
  confirmation.command("approve").argument("<id>").action(async (id: string) => {
    printResult(await resolveClient(action).post(`/api/v1/actions/confirm/${e(id)}`));
  });
  confirmation.command("reject").argument("<id>").action(async (id: string) => {
    printResult(await resolveClient(action).post(`/api/v1/actions/confirm/${e(id)}/reject`));
  });
  action.command("cancel")
    .option("--call-id <id>", "Public call ID")
    .option("--row-id <id>", "Action audit row ID")
    .action(async (options) => {
      if ((options.callId ? 1 : 0) + (options.rowId ? 1 : 0) !== 1) {
        throw new Error("Specify exactly one of --call-id or --row-id");
      }
      printResult(await resolveClient(action).post(options.callId
        ? `/api/v1/actions/${e(options.callId)}/cancel`
        : `/api/v1/actions/by-id/${e(options.rowId)}/cancel`));
    });
}
