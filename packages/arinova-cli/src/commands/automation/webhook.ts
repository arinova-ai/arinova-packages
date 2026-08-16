import type { Command } from "commander";
import { buildQuery, encodePathSegment, resolveClient } from "../../client.js";
import { parseJsonObject } from "../../json-options.js";
import { printResult, printWarning } from "../../output.js";
import { addPaginationOptions, paginationValues } from "../../pagination.js";

const e = encodePathSegment;

export function registerWebhookCommands(program: Command): void {
  const webhook = program.command("webhook").description("Webhook management");
  addPaginationOptions(webhook.command("list").option("--status <status>"), {
    mode: "offset",
  }).action(async (options) => printResult(await resolveClient(webhook).get(
    `/api/v1/webhooks${buildQuery({
      status: options.status,
      ...paginationValues(options),
    })}`,
  )));
  webhook.command("create").requiredOption("--body <json>").action(async (options) => {
    if (process.stderr.isTTY) {
      printWarning("Webhook secret is shown only in this response; store it securely.");
    }
    printResult(await resolveClient(webhook).post(
      "/api/v1/webhooks",
      parseJsonObject(options.body, "--body"),
    ));
  });
  webhook.command("show").argument("<id>").action(async (id: string) => {
    printResult(await resolveClient(webhook).get(`/api/v1/webhooks/${e(id)}`));
  });
  webhook.command("update").argument("<id>").requiredOption("--body <json>")
    .action(async (id: string, options) => printResult(await resolveClient(webhook).patch(
      `/api/v1/webhooks/${e(id)}`,
      parseJsonObject(options.body, "--body"),
    )));
  webhook.command("cancel").argument("<id>").action(async (id: string) => {
    printResult(await resolveClient(webhook).post(`/api/v1/webhooks/${e(id)}/cancel`));
  });
  webhook.command("rotate-secret").argument("<id>").action(async (id: string) => {
    if (process.stderr.isTTY) {
      printWarning("New webhook secret is shown only in this response; store it securely.");
    }
    printResult(await resolveClient(webhook).post(`/api/v1/webhooks/${e(id)}/rotate-secret`));
  });
  addPaginationOptions(webhook.command("fire-events").argument("<id>"), {
    mode: "offset",
  }).action(async (id: string, options) => printResult(await resolveClient(webhook).get(
    `/api/v1/webhooks/${e(id)}/fire-events${buildQuery(paginationValues(options))}`,
  )));

  const fireEvent = webhook.command("fire-event");
  fireEvent.command("show").argument("<webhook-id>").argument("<event-id>")
    .action(async (id: string, eventId: string) => printResult(await resolveClient(webhook).get(
      `/api/v1/webhooks/${e(id)}/fire-events/${e(eventId)}`,
    )));
  fireEvent.command("payload").argument("<webhook-id>").argument("<event-id>")
    .action(async (id: string, eventId: string) => printResult(await resolveClient(webhook).get(
      `/api/v1/webhooks/${e(id)}/fire-events/${e(eventId)}/payload`,
    )));
  webhook.command("function-executions").argument("<id>")
    .action(async (id: string) => printResult(await resolveClient(webhook).get(
      `/api/v1/webhooks/${e(id)}/function-executions`,
    )));
}
