import type { Command } from "commander";
import { printResult as output } from "../output.js";
import { buildQuery, encodePathSegment, resolveClient } from "../client.js";
import { appendFileToForm } from "../file-upload.js";

const e = encodePathSegment;

const clientFor = resolveClient;

function csv(value: string): string[] {
  const values = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (values.length === 0) throw new Error("At least one ID is required");
  return values;
}

export function registerFileCommands(program: Command): void {
  const file = program.command("file").description("File center commands");

  file.command("upload")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--file <path>", "Path to file")
    .action(async (opts: { conversationId: string; file: string }) => {
      const form = new FormData();
      await appendFileToForm(form, "file", opts.file);
      form.append("conversationId", opts.conversationId);
      output(await clientFor(file).upload("/api/v1/files/upload", form));
    });

  file.command("list")
    .option("--source-type <type>")
    .option("--source-type-prefix <prefix>")
    .option("--content-type-prefix <prefix>")
    .option("--search <query>")
    .option("--conversation-id <id>")
    .option("--folder-id <id>")
    .option("--sort <sort>", "created_at_desc, created_at_asc, name_asc, or size_desc")
    .action(async (opts: {
      sourceType?: string; sourceTypePrefix?: string; contentTypePrefix?: string;
      search?: string; conversationId?: string; folderId?: string; sort?: string;
    }) => {
      output(await clientFor(file).get(`/api/v1/files${buildQuery({
        source_type: opts.sourceType,
        source_type_prefix: opts.sourceTypePrefix,
        content_type_prefix: opts.contentTypePrefix,
        search: opts.search,
        conversation_id: opts.conversationId,
        folder_id: opts.folderId,
        sort: opts.sort,
      })}`));
    });

  file.command("show").argument("<id>", "File ID").action(async (id: string) => {
    output(await clientFor(file).get(`/api/v1/files/${e(id)}`));
  });
  file.command("update")
    .argument("<id>", "File ID")
    .requiredOption("--name <name>", "New file name")
    .action(async (id: string, opts: { name: string }) => {
      output(await clientFor(file).patch(`/api/v1/files/${e(id)}`, { fileName: opts.name }));
    });
  file.command("delete").argument("<id>", "File ID").action(async (id: string) => {
    output(await clientFor(file).delete(`/api/v1/files/${e(id)}`));
  });
  file.command("download")
    .argument("<id>", "File ID")
    .requiredOption("--output <path>", "Output file")
    .option("--force", "Overwrite an existing output file")
    .action(async (id: string, opts: { output: string; force?: boolean }) => {
      await clientFor(file).download(`/api/v1/files/${e(id)}/content`, opts.output, opts.force);
    });
  file.command("url").argument("<id>", "File ID").action(async (id: string) => {
    output(await clientFor(file).post(`/api/v1/files/${e(id)}/url`));
  });
  file.command("copy")
    .argument("<id>", "File ID")
    .requiredOption("--space-id <id>", "Destination space ID")
    .option("--folder-id <id>", "Destination folder ID")
    .action(async (id: string, opts: { spaceId: string; folderId?: string }) => {
      output(await clientFor(file).post(`/api/v1/files/${e(id)}/copy`, {
        spaceId: opts.spaceId, folderId: opts.folderId,
      }));
    });
  file.command("move")
    .argument("<id>", "File ID")
    .option("--space-id <id>", "Destination space ID")
    .option("--folder-id <id>", "Destination folder ID")
    .action(async (id: string, opts: { spaceId?: string; folderId?: string }) => {
      output(await clientFor(file).post(`/api/v1/files/${e(id)}/move`, {
        spaceId: opts.spaceId, folderId: opts.folderId,
      }));
    });
  file.command("set-folder")
    .argument("<id>", "File ID")
    .option("--folder-id <id>", "Folder ID; omit to clear")
    .action(async (id: string, opts: { folderId?: string }) => {
      output(await clientFor(file).patch(`/api/v1/files/${e(id)}/folder`, {
        folderId: opts.folderId ?? null,
      }));
    });
  file.command("batch")
    .requiredOption("--op <op>", "delete or move")
    .requiredOption("--ids <ids>", "Comma-separated file IDs")
    .option("--folder-id <id>", "Destination folder for move")
    .action(async (opts: { op: string; ids: string; folderId?: string }) => {
      if (!["delete", "move"].includes(opts.op)) throw new Error("--op must be delete or move");
      output(await clientFor(file).post("/api/v1/files/batch", {
        op: opts.op, ids: csv(opts.ids), folderId: opts.folderId,
      }));
    });
  file.command("usage").action(async () => {
    output(await clientFor(file).get("/api/v1/files/usage"));
  });

  const folder = file.command("folder").description("File folder commands");
  folder.command("list").option("--space-id <id>").action(async (opts: { spaceId?: string }) => {
    output(await clientFor(folder).get(`/api/v1/file-folders${buildQuery({ space_id: opts.spaceId })}`));
  });
  folder.command("create")
    .requiredOption("--name <name>")
    .option("--color <color>")
    .option("--space-id <id>")
    .action(async (opts: { name: string; color?: string; spaceId?: string }) => {
      output(await clientFor(folder).post("/api/v1/file-folders", {
        name: opts.name, color: opts.color, spaceId: opts.spaceId,
      }));
    });
  folder.command("show").argument("<id>", "Folder ID").action(async (id: string) => {
    output(await clientFor(folder).get(`/api/v1/file-folders/${e(id)}`));
  });
  folder.command("update")
    .argument("<id>", "Folder ID")
    .option("--name <name>")
    .option("--color <color>")
    .option("--clear-color", "Clear the color")
    .option("--sort-order <n>")
    .action(async (id: string, opts: {
      name?: string; color?: string; clearColor?: boolean; sortOrder?: string;
    }) => {
      output(await clientFor(folder).put(`/api/v1/file-folders/${e(id)}`, {
        name: opts.name,
        color: opts.clearColor ? null : opts.color,
        sortOrder: opts.sortOrder == null ? undefined : Number(opts.sortOrder),
      }));
    });
  folder.command("delete").argument("<id>", "Folder ID").action(async (id: string) => {
    output(await clientFor(folder).delete(`/api/v1/file-folders/${e(id)}`));
  });
}
