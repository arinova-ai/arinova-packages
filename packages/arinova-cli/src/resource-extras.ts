import type { Command } from "commander";
import { buildQuery, encodePathSegment, resolveClient } from "./client.js";
import { parseJsonArray } from "./json-options.js";
import { printResult } from "./output.js";

interface ResourceExtraOptions {
  resourceArgument?: string;
  basePath(resourceId: string): string;
}

export function registerAgentPermissions(
  parent: Command,
  options: ResourceExtraOptions,
): void {
  const resourceArgument = options.resourceArgument ?? "<id>";
  const permissions = parent.command("agent-permissions");
  permissions.command("get").argument(resourceArgument).action(async (id: string) => {
    printResult(await resolveClient(parent).get(
      `${options.basePath(id)}/agent-permissions`,
    ));
  });
  permissions.command("set").argument(resourceArgument).requiredOption("--agents <json>")
    .action(async (id: string, commandOptions: { agents: string }) => {
      printResult(await resolveClient(parent).put(
        `${options.basePath(id)}/agent-permissions`,
        { agents: parseJsonArray(commandOptions.agents, "--agents") },
      ));
    });
}

interface ExportCommandsOptions extends ResourceExtraOptions {
  start: {
    configure?(command: Command): void;
    body(options: Record<string, any>): unknown;
  };
  direct?: {
    configure?(command: Command): void;
    query(options: Record<string, any>): Record<
      string,
      string | number | boolean | null | undefined
    >;
  };
}

export function registerExportCommands(
  parent: Command,
  options: ExportCommandsOptions,
): void {
  const resourceArgument = options.resourceArgument ?? "<id>";
  const exportCommand = parent.command("export");

  if (options.direct) {
    const direct = exportCommand.command("direct").argument(resourceArgument)
      .requiredOption("--output <path>").option("--force");
    options.direct.configure?.(direct);
    direct.action(async (id: string, commandOptions) => {
      await resolveClient(parent).download(
        `${options.basePath(id)}/export${buildQuery(options.direct?.query(commandOptions) ?? {})}`,
        commandOptions.output,
        commandOptions.force,
      );
    });
  }

  const start = exportCommand.command("start").argument(resourceArgument);
  options.start.configure?.(start);
  start.action(async (id: string, commandOptions) => {
    printResult(await resolveClient(parent).post(
      `${options.basePath(id)}/export`,
      options.start.body(commandOptions),
    ));
  });

  exportCommand.command("status").argument(resourceArgument).argument("<job-id>")
    .action(async (id: string, jobId: string) => {
      printResult(await resolveClient(parent).get(
        `${options.basePath(id)}/export/${encodePathSegment(jobId)}`,
      ));
    });
  exportCommand.command("download").argument(resourceArgument).argument("<job-id>")
    .requiredOption("--output <path>").option("--force")
    .action(async (id: string, jobId: string, commandOptions) => {
      await resolveClient(parent).download(
        `${options.basePath(id)}/export/${encodePathSegment(jobId)}/download`,
        commandOptions.output,
        commandOptions.force,
      );
    });
}
