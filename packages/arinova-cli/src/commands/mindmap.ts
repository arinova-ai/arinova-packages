import type { Command } from "commander";
import { buildQuery, del, encodePathSegment, get, patch, post, put } from "../client.js";
import { printResult } from "../output.js";

const e = encodePathSegment;

function parseObject(value: string, label: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch { /* stable error below */ }
  throw new Error(`${label} must be a JSON object`);
}

export function registerMindmapCommands(program: Command): void {
  const mindmap = program.command("mindmap").description("Mindmap commands");
  mindmap.command("list").option("--include-archived").action(async (opts) => {
    printResult(await get(`/api/v1/mindmaps${buildQuery({ includeArchived: opts.includeArchived })}`));
  });
  mindmap.command("create")
    .requiredOption("--title <title>")
    .option("--description <text>")
    .option("--space-id <id>")
    .action(async (opts) => printResult(await post("/api/v1/mindmaps", opts)));
  mindmap.command("show").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/mindmaps/${e(id)}`));
  });
  mindmap.command("delete").argument("<id>").action(async (id: string) => {
    printResult(await del(`/api/v1/mindmaps/${e(id)}`));
  });
  for (const name of ["archive", "unarchive"] as const) {
    mindmap.command(name).argument("<id>").action(async (id: string) => {
      printResult(await post(`/api/v1/mindmaps/${e(id)}/${name}`));
    });
  }

  const outline = mindmap.command("outline");
  outline.command("get").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/mindmaps/${e(id)}/outline`));
  });
  outline.command("put").argument("<id>").requiredOption("--outline <text>")
    .action(async (id: string, opts: { outline: string }) => {
      printResult(await put(`/api/v1/mindmaps/${e(id)}/outline`, { outline: opts.outline }));
    });

  const node = mindmap.command("node").description("Mindmap nodes");
  node.command("create")
    .argument("<mindmap-id>")
    .requiredOption("--label <label>")
    .option("--parent-id <id>")
    .option("--node-id <id>")
    .option("--client-mutation-id <id>")
    .option("--color <color>")
    .option("--icon <icon>")
    .option("--collapsed")
    .option("--linked-note-id <id>")
    .option("--image-asset-id <id>")
    .option("--external-image-url <url>")
    .action(async (mindmapId: string, opts) => {
      printResult(await post(`/api/v1/mindmaps/${e(mindmapId)}/nodes`, opts));
    });
  node.command("update").argument("<node-id>").requiredOption("--body <json>")
    .action(async (nodeId: string, opts: { body: string }) => {
      printResult(await patch(`/api/v1/mindmaps/nodes/${e(nodeId)}`, parseObject(opts.body, "--body")));
    });
  node.command("delete").argument("<node-id>").option("--client-mutation-id <id>")
    .action(async (nodeId: string, opts) => {
      printResult(await del(`/api/v1/mindmaps/nodes/${e(nodeId)}${buildQuery({
        clientMutationId: opts.clientMutationId,
      })}`));
    });
  node.command("move").argument("<node-id>").requiredOption("--body <json>")
    .action(async (nodeId: string, opts: { body: string }) => {
      printResult(await post(`/api/v1/mindmaps/nodes/${e(nodeId)}/move`, parseObject(opts.body, "--body")));
    });
  node.command("promote-children").argument("<node-id>").option("--client-mutation-id <id>")
    .action(async (nodeId: string, opts) => {
      printResult(await post(`/api/v1/mindmaps/nodes/${e(nodeId)}/promote-children${buildQuery({
        clientMutationId: opts.clientMutationId,
      })}`));
    });
  node.command("restore-batch")
    .argument("<mindmap-id>").argument("<batch-id>")
    .option("--client-mutation-id <id>")
    .action(async (mindmapId: string, batchId: string, opts) => {
      printResult(await post(
        `/api/v1/mindmaps/${e(mindmapId)}/node-delete-batches/${e(batchId)}/restore`,
        { clientMutationId: opts.clientMutationId },
      ));
    });
  mindmap.command("subtree")
    .argument("<id>")
    .requiredOption("--parent-id <id>")
    .requiredOption("--outline <text>")
    .action(async (id: string, opts) => {
      printResult(await post(`/api/v1/mindmaps/${e(id)}/subtree`, {
        parentId: opts.parentId, outline: opts.outline,
      }));
    });

  const version = mindmap.command("version").description("Mindmap versions");
  version.command("list").argument("<id>").option("--cursor <cursor>").option("--limit <n>")
    .action(async (id: string, opts) => printResult(await get(
      `/api/v1/mindmaps/${e(id)}/versions${buildQuery(opts)}`,
    )));
  version.command("create").argument("<id>")
    .option("--label <label>").option("--idempotency-key <key>").option("--expected-head-version-id <id>")
    .action(async (id: string, opts) => printResult(await post(
      `/api/v1/mindmaps/${e(id)}/versions`, opts,
    )));
  version.command("show").argument("<id>").argument("<version-id>")
    .action(async (id: string, versionId: string) => printResult(await get(
      `/api/v1/mindmaps/${e(id)}/versions/${e(versionId)}`,
    )));
  version.command("copy").argument("<id>").argument("<version-id>")
    .requiredOption("--idempotency-key <key>").option("--correlation-id <id>")
    .action(async (id: string, versionId: string, opts) => printResult(await post(
      `/api/v1/mindmaps/${e(id)}/versions/${e(versionId)}/copy`, opts,
    )));
  version.command("restore").argument("<id>").argument("<version-id>")
    .requiredOption("--expected-head-version-id <id>")
    .requiredOption("--idempotency-key <key>")
    .option("--correlation-id <id>")
    .action(async (id: string, versionId: string, opts) => printResult(await post(
      `/api/v1/mindmaps/${e(id)}/versions/${e(versionId)}/restore`, opts,
    )));
}
