import type { Command } from "commander";
import { buildQuery, encodePathSegment, resolveClient } from "../client.js";
import { printResult } from "../output.js";
import { parseJsonObject } from "../json-options.js";
import { addPaginationOptions, paginationValues } from "../pagination.js";
import { registerVersionCommands } from "../version-commands.js";

const e = encodePathSegment;

export function registerMindmapCommands(program: Command): void {
  const mindmap = program.command("mindmap").description("Mindmap commands");
  const api = () => resolveClient(mindmap);
  addPaginationOptions(mindmap.command("list").option("--include-archived"), {
    mode: "offset",
  }).action(async (opts) => {
    printResult(await api().get(`/api/v1/mindmaps${buildQuery({
      includeArchived: opts.includeArchived,
      ...paginationValues(opts),
    })}`));
  });
  mindmap.command("create")
    .requiredOption("--title <title>")
    .option("--description <text>")
    .option("--space-id <id>")
    .action(async (opts) => printResult(await api().post("/api/v1/mindmaps", {
      title: opts.title, description: opts.description, spaceId: opts.spaceId,
    })));
  mindmap.command("show").argument("<id>").action(async (id: string) => {
    printResult(await api().get(`/api/v1/mindmaps/${e(id)}`));
  });
  mindmap.command("delete").argument("<id>").action(async (id: string) => {
    printResult(await api().delete(`/api/v1/mindmaps/${e(id)}`));
  });
  for (const name of ["archive", "unarchive"] as const) {
    mindmap.command(name).argument("<id>").action(async (id: string) => {
      printResult(await api().post(`/api/v1/mindmaps/${e(id)}/${name}`));
    });
  }

  const outline = mindmap.command("outline");
  outline.command("get").argument("<id>").action(async (id: string) => {
    printResult(await api().get(`/api/v1/mindmaps/${e(id)}/outline`));
  });
  outline.command("put").argument("<id>").requiredOption("--outline <text>")
    .action(async (id: string, opts: { outline: string }) => {
      printResult(await api().put(`/api/v1/mindmaps/${e(id)}/outline`, { outline: opts.outline }));
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
      printResult(await api().post(`/api/v1/mindmaps/${e(mindmapId)}/nodes`, {
        label: opts.label,
        parentId: opts.parentId,
        nodeId: opts.nodeId,
        clientMutationId: opts.clientMutationId,
        color: opts.color,
        icon: opts.icon,
        collapsed: opts.collapsed,
        linkedNoteId: opts.linkedNoteId,
        imageAssetId: opts.imageAssetId,
        externalImageUrl: opts.externalImageUrl,
      }));
    });
  node.command("update").argument("<node-id>").requiredOption("--body <json>")
    .action(async (nodeId: string, opts: { body: string }) => {
      printResult(await api().patch(`/api/v1/mindmaps/nodes/${e(nodeId)}`, parseJsonObject(opts.body, "--body")));
    });
  node.command("delete").argument("<node-id>").option("--client-mutation-id <id>")
    .action(async (nodeId: string, opts) => {
      printResult(await api().delete(`/api/v1/mindmaps/nodes/${e(nodeId)}${buildQuery({
        clientMutationId: opts.clientMutationId,
      })}`));
    });
  node.command("move").argument("<node-id>").requiredOption("--body <json>")
    .action(async (nodeId: string, opts: { body: string }) => {
      printResult(await api().post(`/api/v1/mindmaps/nodes/${e(nodeId)}/move`, parseJsonObject(opts.body, "--body")));
    });
  node.command("promote-children").argument("<node-id>").option("--client-mutation-id <id>")
    .action(async (nodeId: string, opts) => {
      printResult(await api().post(`/api/v1/mindmaps/nodes/${e(nodeId)}/promote-children${buildQuery({
        clientMutationId: opts.clientMutationId,
      })}`));
    });
  node.command("restore-batch")
    .argument("<mindmap-id>").argument("<batch-id>")
    .option("--client-mutation-id <id>")
    .action(async (mindmapId: string, batchId: string, opts) => {
      printResult(await api().post(
        `/api/v1/mindmaps/${e(mindmapId)}/node-delete-batches/${e(batchId)}/restore`,
        { clientMutationId: opts.clientMutationId },
      ));
    });
  mindmap.command("subtree")
    .argument("<id>")
    .requiredOption("--parent-id <id>")
    .requiredOption("--outline <text>")
    .action(async (id: string, opts) => {
      printResult(await api().post(`/api/v1/mindmaps/${e(id)}/subtree`, {
        parentId: opts.parentId, outline: opts.outline,
      }));
    });

  registerVersionCommands(mindmap, {
    description: "Mindmap versions",
    basePath: (id) => `/api/v1/mindmaps/${e(id)}`,
  });
}
