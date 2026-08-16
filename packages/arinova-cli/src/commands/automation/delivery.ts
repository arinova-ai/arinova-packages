import type { Command } from "commander";
import { buildQuery, encodePathSegment, resolveClient } from "../../client.js";
import { printResult } from "../../output.js";
import { addPaginationOptions, paginationValues } from "../../pagination.js";

const e = encodePathSegment;

export function registerDeliveryCommands(program: Command): void {
  const delivery = program.command("delivery").description("Pull deliveries");
  addPaginationOptions(delivery.command("list")
    .option("--endpoint-id <id>").option("--status <status>"), { mode: "cursor" })
    .action(async (options) => printResult(await resolveClient(delivery).get(
      `/api/v1/deliveries${buildQuery({
        endpointId: options.endpointId,
        status: options.status,
        ...paginationValues(options),
      })}`,
    )));
  delivery.command("show").argument("<id>").action(async (id: string) => {
    printResult(await resolveClient(delivery).get(`/api/v1/deliveries/${e(id)}`));
  });
  delivery.command("ack").argument("<id>").requiredOption("--idempotency-key <key>")
    .action(async (id: string, options) => printResult(await resolveClient(delivery).post(
      `/api/v1/deliveries/${e(id)}/ack`,
      undefined,
      { "Idempotency-Key": options.idempotencyKey },
    )));
}
