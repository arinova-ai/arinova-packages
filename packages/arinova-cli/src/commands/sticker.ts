import { Command } from "commander";
import { get, post, patch, del, upload } from "../client.js";
import { printResult, printError, printSuccess, table } from "../output.js";

export function registerSticker(program: Command): void {
  const sticker = program.command("sticker").description("Sticker pack management");

  sticker
    .command("list")
    .description("List your sticker packs")
    .action(async () => {
      try {
        const data = await get("/api/v1/creator/stickers");
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
      } catch (err) {
        printError(err);
      }
    });

  sticker
    .command("create")
    .description("Create a new sticker pack")
    .requiredOption("--name <name>", "Pack name")
    .option("--description <desc>", "Pack description")
    .option("--price <price>", "Price in coins", "0")
    .action(async (opts: { name: string; description?: string; price: string }) => {
      try {
        const data = await post("/api/v1/creator/stickers", {
          name: opts.name,
          description: opts.description ?? "",
          price: parseInt(opts.price, 10),
        });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  sticker
    .command("update <id>")
    .description("Update a sticker pack")
    .option("--name <name>", "New name")
    .option("--description <desc>", "New description")
    .option("--price <price>", "New price")
    .action(async (id: string, opts: { name?: string; description?: string; price?: string }) => {
      try {
        const body: Record<string, unknown> = {};
        if (opts.name) body.name = opts.name;
        if (opts.description) body.description = opts.description;
        if (opts.price) body.price = parseInt(opts.price, 10);
        const data = await patch(`/api/creator/stickers/${id}`, body);
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  sticker
    .command("delete <id>")
    .description("Delete a sticker pack")
    .action(async (id: string) => {
      try {
        await del(`/api/creator/stickers/${id}`);
        printSuccess(`Sticker pack ${id} deleted.`);
      } catch (err) {
        printError(err);
      }
    });

  sticker
    .command("upload-image <packId> <file>")
    .description("Upload an image to a sticker pack")
    .action(async (packId: string, file: string) => {
      try {
        const data = await upload(`/api/creator/stickers/${packId}/stickers`, file, "sticker");
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  sticker
    .command("remove-image <packId> <stickerId>")
    .description("Remove a sticker from a pack")
    .action(async (packId: string, stickerId: string) => {
      try {
        await del(`/api/creator/stickers/${packId}/stickers/${stickerId}`);
        printSuccess(`Sticker ${stickerId} removed from pack ${packId}.`);
      } catch (err) {
        printError(err);
      }
    });

  sticker
    .command("submit-review <id>")
    .description("Submit a sticker pack for review")
    .action(async (id: string) => {
      try {
        const data = await post(`/api/creator/stickers/${id}/submit-review`);
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  sticker
    .command("publish <id>")
    .description("Publish a sticker pack")
    .action(async (id: string) => {
      try {
        const data = await patch(`/api/creator/stickers/${id}`, { status: "published" });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  sticker
    .command("unpublish <id>")
    .description("Unpublish a sticker pack")
    .action(async (id: string) => {
      try {
        const data = await patch(`/api/creator/stickers/${id}`, { status: "draft" });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });
}
