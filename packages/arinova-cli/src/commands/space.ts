import { Command } from "commander";
import { get, post, put, del, upload } from "../client.js";
import { printResult, printError, printSuccess, table } from "../output.js";

export function registerSpace(program: Command): void {
  const space = program.command("space").description("Space management");

  space
    .command("list")
    .description("List your spaces")
    .action(async () => {
      try {
        const data = await get("/api/v1/creator/spaces");
        const spaces = (data as Record<string, unknown>).spaces ?? data;
        if (Array.isArray(spaces)) {
          table(spaces as Record<string, unknown>[], [
            { key: "id", label: "ID" },
            { key: "name", label: "Name" },
            { key: "status", label: "Status" },
          ]);
        } else {
          printResult(data);
        }
      } catch (err) {
        printError(err);
      }
    });

  space
    .command("create")
    .description("Create a new space")
    .requiredOption("--name <name>", "Space name")
    .option("--description <desc>", "Description")
    .option("--url <iframe-url>", "Iframe URL (required for 'Play Now' button)")
    .action(async (opts: { name: string; description?: string; url?: string }) => {
      try {
        const body: Record<string, unknown> = {
          name: opts.name,
          description: opts.description ?? "",
        };
        if (opts.url) {
          body.definition = { iframeUrl: opts.url };
        }
        const data = await post("/api/v1/spaces", body);
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  space
    .command("update <id>")
    .description("Update a space")
    .option("--name <name>", "New name")
    .option("--description <desc>", "New description")
    .option("--url <iframe-url>", "Iframe URL (required for 'Play Now' button)")
    .action(async (id: string, opts: { name?: string; description?: string; url?: string }) => {
      try {
        const body: Record<string, unknown> = {};
        if (opts.name) body.name = opts.name;
        if (opts.description) body.description = opts.description;
        if (opts.url) body.definition = { iframeUrl: opts.url };
        const data = await put(`/api/v1/spaces/${id}`, body);
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  space
    .command("show <id>")
    .description("Show space details")
    .action(async (id: string) => {
      try {
        const data = await get(`/api/v1/spaces/${id}`);
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  space
    .command("delete <id>")
    .description("Delete a space")
    .action(async (id: string) => {
      try {
        await del(`/api/v1/spaces/${id}`);
        printSuccess(`Space ${id} deleted.`);
      } catch (err) {
        printError(err);
      }
    });

  space
    .command("publish <id>")
    .description("Publish a space")
    .action(async (id: string) => {
      try {
        const data = await put(`/api/v1/spaces/${id}`, { isPublic: true });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  space
    .command("unpublish <id>")
    .description("Unpublish a space")
    .action(async (id: string) => {
      try {
        const data = await put(`/api/v1/spaces/${id}`, { isPublic: false });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  space
    .command("cover <id>")
    .description("Upload cover image for a space")
    .requiredOption("--file <path>", "Path to image file")
    .action(async (id: string, opts: { file: string }) => {
      try {
        const data = await upload(`/api/v1/spaces/${id}/cover`, opts.file);
        printSuccess("Cover image uploaded");
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });
}
