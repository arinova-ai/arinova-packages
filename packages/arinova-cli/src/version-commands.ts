import type { Command } from "commander";
import { buildQuery, get, post } from "./client.js";
import { printResult } from "./output.js";

interface VersionOptions {
  description?: string;
  resourceArgument?: string;
  basePath(resourceId: string): string;
}

function createBody(opts: Record<string, unknown>) {
  return {
    label: opts.label,
    idempotencyKey: opts.idempotencyKey,
    expectedHeadVersionId: opts.expectedHeadVersionId,
  };
}

function mutationBody(opts: Record<string, unknown>) {
  return {
    idempotencyKey: opts.idempotencyKey,
    correlationId: opts.correlationId,
    expectedHeadVersionId: opts.expectedHeadVersionId,
  };
}

export function registerVersionCommands(parent: Command, options: VersionOptions): void {
  const resourceArgument = options.resourceArgument ?? "<id>";
  const version = parent.command("version").description(options.description ?? "Version commands");
  version.command("list").argument(resourceArgument).option("--cursor <cursor>").option("--limit <n>")
    .action(async (id: string, opts) => printResult(await get(
      `${options.basePath(id)}/versions${buildQuery({ cursor: opts.cursor, limit: opts.limit })}`,
    )));
  version.command("create").argument(resourceArgument)
    .option("--label <label>").option("--idempotency-key <key>").option("--expected-head-version-id <id>")
    .action(async (id: string, opts) => printResult(await post(
      `${options.basePath(id)}/versions`, createBody(opts),
    )));
  version.command("show").argument(resourceArgument).argument("<version-id>")
    .action(async (id: string, versionId: string) => printResult(await get(
      `${options.basePath(id)}/versions/${encodeURIComponent(versionId)}`,
    )));
  for (const name of ["copy", "restore"] as const) {
    const command = version.command(name).argument(resourceArgument).argument("<version-id>")
      .requiredOption("--idempotency-key <key>").option("--correlation-id <id>");
    if (name === "restore") command.requiredOption("--expected-head-version-id <id>");
    command.action(async (id: string, versionId: string, opts) => printResult(await post(
      `${options.basePath(id)}/versions/${encodeURIComponent(versionId)}/${name}`,
      mutationBody(opts),
    )));
  }
}
