import type { Command } from "commander";
import { buildQuery, encodePathSegment, resolveClient } from "../client.js";
import { appendFileToForm } from "../file-upload.js";
import { printResult } from "../output.js";
import { parseJsonOption } from "../json-options.js";
import { registerAgentPermissions, registerExportCommands } from "../resource-extras.js";
import { addPaginationOptions, paginationValues } from "../pagination.js";
import { registerVersionCommands } from "../version-commands.js";

const e = encodePathSegment;

export function registerWorkbookCommands(program: Command): void {
  const workbook = program.command("workbook").description("Workbook commands");
  const api = () => resolveClient(workbook);
  addPaginationOptions(workbook.command("list").option("--include-archived"), {
    mode: "offset",
  }).action(async (opts) => {
    printResult(await api().get(`/api/v1/workbooks${buildQuery({
      includeArchived: opts.includeArchived,
      ...paginationValues(opts),
    })}`));
  });
  workbook.command("create").option("--name <name>").option("--space-id <id>")
    .action(async (opts) => printResult(await api().post("/api/v1/workbooks", {
      name: opts.name, spaceId: opts.spaceId,
    })));
  workbook.command("show").argument("<id>").action(async (id: string) => {
    printResult(await api().get(`/api/v1/workbooks/${e(id)}`));
  });
  workbook.command("replace").argument("<id>")
    .requiredOption("--workbook <json>").requiredOption("--base-version <n>")
    .action(async (id: string, opts) => printResult(await api().put(`/api/v1/workbooks/${e(id)}`, {
      workbook: parseJsonOption(opts.workbook, "--workbook"), baseVersion: Number(opts.baseVersion),
    })));
  workbook.command("update").argument("<id>").requiredOption("--name <name>")
    .action(async (id: string, opts) => printResult(await api().patch(`/api/v1/workbooks/${e(id)}`, {
      name: opts.name,
    })));
  workbook.command("delete").argument("<id>").action(async (id: string) => {
    printResult(await api().delete(`/api/v1/workbooks/${e(id)}`));
  });
  for (const name of ["archive", "unarchive"] as const) {
    workbook.command(name).argument("<id>").action(async (id: string) => {
      printResult(await api().post(`/api/v1/workbooks/${e(id)}/${name}`));
    });
  }

  const importCmd = workbook.command("import");
  importCmd.command("create")
    .requiredOption("--file-id <id>").option("--space-id <id>")
    .action(async (opts) => printResult(await api().post("/api/v1/workbooks/import", {
      fileId: opts.fileId, spaceId: opts.spaceId,
    })));
  importCmd.command("into").argument("<id>")
    .requiredOption("--file <path>").requiredOption("--base-version <n>")
    .action(async (id: string, opts) => {
      const form = new FormData();
      await appendFileToForm(form, "file", opts.file);
      form.append("baseVersion", opts.baseVersion);
      printResult(await resolveClient(workbook).upload(`/api/v1/workbooks/${e(id)}/import`, form));
    });

  registerExportCommands(workbook, {
    basePath: (id) => `/api/v1/workbooks/${e(id)}`,
    direct: {
      configure(command) {
        command.requiredOption("--format <format>").option("--sheet-id <id>");
      },
      query: (options) => ({ format: options.format, sheetId: options.sheetId }),
    },
    start: {
      configure(command) {
        command
          .requiredOption("--format <format>")
          .option("--sheet-id <id>")
          .option("--save-to-space-id <id>")
          .option("--save-to-folder-id <id>");
      },
      body: (options) => ({
        format: options.format,
        sheetId: options.sheetId,
        saveToSpaceId: options.saveToSpaceId,
        saveToFolderId: options.saveToFolderId,
      }),
    },
  });
  registerAgentPermissions(workbook, {
    basePath: (id) => `/api/v1/workbooks/${e(id)}`,
  });

  registerVersionCommands(workbook, {
    basePath: (id) => `/api/v1/workbooks/${e(id)}`,
  });
}
