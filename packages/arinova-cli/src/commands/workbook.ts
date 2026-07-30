import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Command } from "commander";
import { getOpts } from "../api.js";
import { ApiClient, buildQuery, del, encodePathSegment, get, patch, post, put } from "../client.js";
import { printResult } from "../output.js";

const e = encodePathSegment;

function parse(value: string, label: string): unknown {
  try { return JSON.parse(value); } catch { throw new Error(`${label} must be valid JSON`); }
}

function apiClient(command: Command) {
  const { apiUrl, token } = getOpts(command);
  return new ApiClient({ endpoint: apiUrl, token });
}

export function registerWorkbookCommands(program: Command): void {
  const workbook = program.command("workbook").description("Workbook commands");
  workbook.command("list").option("--include-archived").action(async (opts) => {
    printResult(await get(`/api/v1/workbooks${buildQuery({ includeArchived: opts.includeArchived })}`));
  });
  workbook.command("create").option("--name <name>").option("--space-id <id>")
    .action(async (opts) => printResult(await post("/api/v1/workbooks", opts)));
  workbook.command("show").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/workbooks/${e(id)}`));
  });
  workbook.command("replace").argument("<id>")
    .requiredOption("--workbook <json>").requiredOption("--base-version <n>")
    .action(async (id: string, opts) => printResult(await put(`/api/v1/workbooks/${e(id)}`, {
      workbook: parse(opts.workbook, "--workbook"), baseVersion: Number(opts.baseVersion),
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
      const data = readFileSync(opts.file);
      const form = new FormData();
      form.append("file", new Blob([data]), basename(opts.file));
      form.append("baseVersion", opts.baseVersion);
      printResult(await apiClient(workbook).upload(`/api/v1/workbooks/${e(id)}/import`, form));
    });

  const exportCmd = workbook.command("export");
  exportCmd.command("direct").argument("<id>")
    .requiredOption("--format <format>").option("--sheet-id <id>")
    .requiredOption("--output <path>").option("--force")
    .action(async (id: string, opts) => apiClient(workbook).download(
      `/api/v1/workbooks/${e(id)}/export${buildQuery({
        format: opts.format, sheetId: opts.sheetId,
      })}`,
      opts.output, opts.force,
    ));
  exportCmd.command("start").argument("<id>")
    .requiredOption("--format <format>").option("--sheet-id <id>")
    .option("--save-to-space-id <id>").option("--save-to-folder-id <id>")
    .action(async (id: string, opts) => printResult(await post(
      `/api/v1/workbooks/${e(id)}/export`, opts,
    )));
  exportCmd.command("status").argument("<id>").argument("<job-id>")
    .action(async (id: string, jobId: string) => printResult(await get(
      `/api/v1/workbooks/${e(id)}/export/${e(jobId)}`,
    )));
  exportCmd.command("download").argument("<id>").argument("<job-id>")
    .requiredOption("--output <path>").option("--force")
    .action(async (id: string, jobId: string, opts) => apiClient(workbook).download(
      `/api/v1/workbooks/${e(id)}/export/${e(jobId)}/download`, opts.output, opts.force,
    ));

  const permissions = workbook.command("agent-permissions");
  permissions.command("get").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/workbooks/${e(id)}/agent-permissions`));
  });
  permissions.command("set").argument("<id>").requiredOption("--agents <json>")
    .action(async (id: string, opts) => {
      const agents = parse(opts.agents, "--agents");
      if (!Array.isArray(agents)) throw new Error("--agents must be a JSON array");
      printResult(await put(`/api/v1/workbooks/${e(id)}/agent-permissions`, { agents }));
    });

  const version = workbook.command("version");
  version.command("list").argument("<id>").option("--cursor <cursor>").option("--limit <n>")
    .action(async (id: string, opts) => printResult(await get(
      `/api/v1/workbooks/${e(id)}/versions${buildQuery(opts)}`,
    )));
  version.command("create").argument("<id>")
    .option("--label <label>").option("--idempotency-key <key>").option("--expected-head-version-id <id>")
    .action(async (id: string, opts) => printResult(await post(`/api/v1/workbooks/${e(id)}/versions`, opts)));
  version.command("show").argument("<id>").argument("<version-id>")
    .action(async (id: string, versionId: string) => printResult(await get(
      `/api/v1/workbooks/${e(id)}/versions/${e(versionId)}`,
    )));
  for (const name of ["copy", "restore"] as const) {
    const cmd = version.command(name).argument("<id>").argument("<version-id>")
      .requiredOption("--idempotency-key <key>").option("--correlation-id <id>");
    if (name === "restore") cmd.requiredOption("--expected-head-version-id <id>");
    cmd.action(async (id: string, versionId: string, opts) => printResult(await post(
      `/api/v1/workbooks/${e(id)}/versions/${e(versionId)}/${name}`, opts,
    )));
  }
}
