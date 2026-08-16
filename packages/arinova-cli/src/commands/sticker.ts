import { Command } from "commander";
import {
  encodePathSegment,
  resolveClient,
  UnsupportedCommandError,
} from "../client.js";
import { appendFileToForm } from "../file-upload.js";
import { printResult, printSuccess, table } from "../output.js";
import { addPaginationOptions, paginationQuery } from "../pagination.js";

async function imageForm(path: string, fieldName: string): Promise<FormData> {
  const form = new FormData();
  await appendFileToForm(form, fieldName, path);
  return form;
}

export function registerSticker(program: Command): void {
  const sticker = program.command("sticker").description("Sticker pack management");

  addPaginationOptions(sticker
    .command("list")
    .description("List your sticker packs"), { mode: "offset" })
    .action(async (options) => {
      const data = await resolveClient(sticker).get(
        `/api/v1/creator/stickers${paginationQuery(options)}`,
      );
      const packs = (data as Record<string, unknown>).packs ?? data;
      if (Array.isArray(packs)) {
        table(packs as Record<string, unknown>[], [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "status", label: "Status" },
          { key: "sticker_count", label: "Stickers" },
        ]);
      } else {
        printResult(data);
      }
    });

  sticker
    .command("create")
    .description("Create a new sticker pack")
    .requiredOption("--name <name>", "Pack name")
    .option("--description <desc>", "Pack description")
    .option("--price <price>", "Price in coins", "0")
    .action(async (opts: { name: string; description?: string; price: string }) => {
      const data = await resolveClient(sticker).post("/api/v1/creator/stickers", {
        name: opts.name,
        description: opts.description ?? "",
        price: parseInt(opts.price, 10),
      });
      printResult(data);
    });

  sticker
    .command("update <id>")
    .description("Update a sticker pack")
    .option("--name <name>", "New name")
    .option("--description <desc>", "New description")
    .option("--price <price>", "New price")
    .action(async (id: string, opts: { name?: string; description?: string; price?: string }) => {
      const body: Record<string, unknown> = {};
      if (opts.name) body.name = opts.name;
      if (opts.description) body.description = opts.description;
      if (opts.price) body.price = parseInt(opts.price, 10);
      const data = await resolveClient(sticker).patch(`/api/v1/creator/stickers/${encodePathSegment(id)}`, body);
      printResult(data);
    });

  sticker
    .command("delete <id>")
    .description("Delete a sticker pack")
    .action(async (id: string) => {
      await resolveClient(sticker).delete(`/api/v1/creator/stickers/${encodePathSegment(id)}`);
      printSuccess(`Sticker pack ${id} deleted.`);
    });

  sticker
    .command("upload-image <packId> <file>")
    .description("Upload an image to a sticker pack")
    .action(async (packId: string, file: string) => {
      const data = await resolveClient(sticker).upload(
        `/api/v1/creator/stickers/${encodePathSegment(packId)}/stickers`,
        await imageForm(file, "sticker"),
      );
      printResult(data);
    });

  sticker
    .command("remove-image <packId> <stickerId>")
    .description("Remove a sticker from a pack")
    .action(async (packId: string, stickerId: string) => {
      await resolveClient(sticker).delete(`/api/v1/creator/stickers/${encodePathSegment(packId)}/stickers/${encodePathSegment(stickerId)}`);
      printSuccess(`Sticker ${stickerId} removed from pack ${packId}.`);
    });

  sticker
    .command("submit-review <id>")
    .description("Submit a sticker pack for review")
    .action(async (id: string) => {
      const data = await resolveClient(sticker).post(`/api/v1/creator/stickers/${encodePathSegment(id)}/submit-review`);
      printResult(data);
    });

  sticker
    .command("publish <id>")
    .description("Publish a sticker pack")
    .action(async (id: string) => {
      throw new UnsupportedCommandError(
        `Sticker pack ${id} must use submit-review; direct publish is not supported.`,
      );
    });

  sticker
    .command("unpublish <id>")
    .description("Unpublish a sticker pack")
    .action(async (id: string) => {
      throw new UnsupportedCommandError(
        `Sticker pack ${id} has no supported direct unpublish contract.`,
      );
    });

  sticker
    .command("cover <id>")
    .description("Upload a sticker pack cover")
    .requiredOption("--file <path>", "Cover image path")
    .action(async (id: string, opts: { file: string }) => {
      printResult(
        await resolveClient(sticker).upload(
          `/api/v1/creator/stickers/${encodePathSegment(id)}/cover`,
          await imageForm(opts.file, "cover"),
        ),
      );
    });
}
