import type { Command } from "commander";
import { buildQuery, del, encodePathSegment, get, patch, post } from "../client.js";
import { printResult } from "../output.js";

const e = encodePathSegment;

function parse(value?: string): unknown {
  if (value === undefined) return undefined;
  try { return JSON.parse(value); } catch { throw new Error("JSON option is invalid"); }
}

export function registerDocCommands(program: Command): void {
  const doc = program.command("doc").description("Document commands");
  doc.command("list")
    .option("--include-archived")
    .option("--search <query>")
    .option("--limit <n>")
    .action(async (opts) => printResult(await get(`/api/v1/docs${buildQuery({
      includeArchived: opts.includeArchived, search: opts.search, limit: opts.limit,
    })}`)));
  doc.command("create")
    .requiredOption("--title <title>")
    .option("--content <json>", "Content JSON")
    .option("--page-settings <json>")
    .option("--space-id <id>")
    .action(async (opts) => printResult(await post("/api/v1/docs", {
      title: opts.title,
      contentJson: parse(opts.content),
      pageSettings: parse(opts.pageSettings),
      spaceId: opts.spaceId,
    })));
  doc.command("show").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/docs/${e(id)}`));
  });
  doc.command("update")
    .argument("<id>")
    .option("--title <title>")
    .option("--content <json>")
    .option("--page-settings <json>")
    .option("--expected-version <n>")
    .action(async (id: string, opts) => printResult(await patch(`/api/v1/docs/${e(id)}`, {
      title: opts.title,
      contentJson: parse(opts.content),
      pageSettings: parse(opts.pageSettings),
      expectedVersion: opts.expectedVersion == null ? undefined : Number(opts.expectedVersion),
    })));
  doc.command("delete").argument("<id>").action(async (id: string) => {
    printResult(await del(`/api/v1/docs/${e(id)}`));
  });
  for (const name of ["archive", "unarchive"] as const) {
    doc.command(name).argument("<id>").action(async (id: string) => {
      printResult(await post(`/api/v1/docs/${e(id)}/${name}`));
    });
  }
}
