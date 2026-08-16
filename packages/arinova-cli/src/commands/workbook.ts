import type { Command } from "commander";
import { buildQuery, del, encodePathSegment, get, patch, post, put, resolveClient } from "../client.js";
import { appendFileToForm } from "../file-upload.js";
import { printResult } from "../output.js";
import { parseJsonArray, parseJsonOption } from "../json-options.js";
import { registerVersionCommands } from "../version-commands.js";

const e = encodePathSegment;

export function registerWorkbookCommands(program: Command): void {
  const workbook = program.command("workbook").description("Workbook commands");
  workbook.command("list").option("--include-archived").action(async (opts) => {
    printResult(await get(`/api/v1/workbooks${buildQuery({ includeArchived: opts.includeArchived })}`));
  });
  workbook.command("create").option("--name <name>").option("--space-id <id>")
    .action(async (opts) => printResult(await post("/api/v1/workbooks", {
      name: opts.name, spaceId: opts.spaceId,
    })));
  workbook.command("show").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/workbooks/${e(id)}`));
  });
  workbook.command("replace").argument("<id>")
    .requiredOption("--workbook <json>").requiredOption("--base-version <n>")
    .action(async (id: string, opts) => printResult(await put(`/api/v1/workbooks/${e(id)}`, {
      workbook: parseJsonOption(opts.workbook, "--workbook"), baseVersion: Number(opts.baseVersion),
    })));
  workbook.command("update").argument("<id>").requiredOption("--name <name>")
    .action(async (id: string, opts) => printResult(await patch(`/api/v1/workbooks/${e(id)}`, {
      name: opts.name,
    })));
  workbook.command("delete").argument("<id>").action(async (id: string) => {
    printResult(await del(`/api/v1/workbooks/${e(id)}`));
  });
  for (const name of ["archive", "unarchive"] as const) {
    workbook.command(name).argument("<id>").action(async (id: string) => {
      printResult(await post(`/api/v1/workbooks/${e(id)}/${name}`));
    });
  }

  const importCmd = workbook.command("import");
  importCmd.command("create")
    .requiredOption("--file-id <id>").option("--space-id <id>")
    .action(async (opts) => printResult(await post("/api/v1/workbooks/import", {
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

  const exportCmd = workbook.command("export");
  exportCmd.command("direct").argument("<id>")
    .requiredOption("--format <format>").option("--sheet-id <id>")
    .requiredOption("--output <path>").option("--force")
    .action(async (id: string, opts) => resolveClient(workbook).download(
      `/api/v1/workbooks/${e(id)}/export${buildQuery({
        format: opts.format, sheetId: opts.sheetId,
      })}`,
      opts.output, opts.force,
    ));
  exportCmd.command("start").argument("<id>")
    .requiredOption("--format <format>").option("--sheet-id <id>")
    .option("--save-to-space-id <id>").option("--save-to-folder-id <id>")
    .action(async (id: string, opts) => printResult(await post(
      `/api/v1/workbooks/${e(id)}/export`, {
        format: opts.format,
        sheetId: opts.sheetId,
        saveToSpaceId: opts.saveToSpaceId,
        saveToFolderId: opts.saveToFolderId,
      },
    )));
  exportCmd.command("status").argument("<id>").argument("<job-id>")
    .action(async (id: string, jobId: string) => printResult(await get(
      `/api/v1/workbooks/${e(id)}/export/${e(jobId)}`,
    )));
  exportCmd.command("download").argument("<id>").argument("<job-id>")
    .requiredOption("--output <path>").option("--force")
    .action(async (id: string, jobId: string, opts) => resolveClient(workbook).download(
      `/api/v1/workbooks/${e(id)}/export/${e(jobId)}/download`, opts.output, opts.force,
    ));

  const permissions = workbook.command("agent-permissions");
  permissions.command("get").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/workbooks/${e(id)}/agent-permissions`));
  });
  permissions.command("set").argument("<id>").requiredOption("--agents <json>")
    .action(async (id: string, opts) => {
      const agents = parseJsonArray(opts.agents, "--agents");
      printResult(await put(`/api/v1/workbooks/${e(id)}/agent-permissions`, { agents }));
    });

  registerVersionCommands(workbook, {
    basePath: (id) => `/api/v1/workbooks/${e(id)}`,
  });
}
