import type { Command } from "commander";
import { encodePathSegment, resolveClient } from "./client.js";
import { printResult } from "./output.js";
import { addPaginationOptions, paginationQuery } from "./pagination.js";

interface VersionOptions {
  description?: string;
  resourceArgument?: string;
  basePath(resourceId: string): string;
}

function createBody(options: Record<string, unknown>) {
  return {
    label: options.label,
    idempotencyKey: options.idempotencyKey,
    expectedHeadVersionId: options.expectedHeadVersionId,
  };
}

function mutationBody(options: Record<string, unknown>) {
  return {
    idempotencyKey: options.idempotencyKey,
    correlationId: options.correlationId,
    expectedHeadVersionId: options.expectedHeadVersionId,
  };
}

export function registerVersionCommands(parent: Command, options: VersionOptions): void {
  const resourceArgument = options.resourceArgument ?? "<id>";
  const version = parent.command("version").description(options.description ?? "Version commands");
  addPaginationOptions(version.command("list").argument(resourceArgument), {
    mode: "cursor",
  }).action(async (id: string, commandOptions) => printResult(
    await resolveClient(parent).get(
      `${options.basePath(id)}/versions${paginationQuery(commandOptions)}`,
    ),
  ));
  version.command("create").argument(resourceArgument)
    .option("--label <label>").option("--idempotency-key <key>").option("--expected-head-version-id <id>")
    .action(async (id: string, commandOptions) => printResult(
      await resolveClient(parent).post(
        `${options.basePath(id)}/versions`,
        createBody(commandOptions),
      ),
    ));
  version.command("show").argument(resourceArgument).argument("<version-id>")
    .action(async (id: string, versionId: string) => printResult(
      await resolveClient(parent).get(
        `${options.basePath(id)}/versions/${encodePathSegment(versionId)}`,
      ),
    ));
  for (const name of ["copy", "restore"] as const) {
    const command = version.command(name).argument(resourceArgument).argument("<version-id>")
      .requiredOption("--idempotency-key <key>").option("--correlation-id <id>");
    if (name === "restore") command.requiredOption("--expected-head-version-id <id>");
    command.action(async (id: string, versionId: string, commandOptions) => printResult(
      await resolveClient(parent).post(
        `${options.basePath(id)}/versions/${encodePathSegment(versionId)}/${name}`,
        mutationBody(commandOptions),
      ),
    ));
  }
}
