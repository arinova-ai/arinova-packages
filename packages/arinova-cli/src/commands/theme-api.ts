import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Command } from "commander";
import { encodePathSegment, resolveClient } from "../client.js";
import { createFileBlob } from "../file-upload.js";
import { printResult, printSuccess, table } from "../output.js";
import { addPaginationOptions, paginationQuery } from "../pagination.js";
import { resolveThemeRootFile } from "./theme-build.js";
import { readValidatedThemeManifest } from "./theme-manifest.js";

function blobPartFromBuffer(data: Buffer): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

function manifestForm(data: Buffer): FormData {
  const form = new FormData();
  form.append(
    "manifest",
    new Blob([blobPartFromBuffer(data)], { type: "application/json" }),
  );
  return form;
}

export function registerThemeApiCommands(theme: Command): void {
  addPaginationOptions(theme
    .command("list")
    .description("List your themes"), { mode: "offset" })
    .action(async (options: { limit?: number; offset?: number }) => {
      const data = await resolveClient(theme).get(
        `/api/v1/creator/themes${paginationQuery(options)}`,
      );
      const themes = (data as Record<string, unknown>).themes ?? data;
      if (Array.isArray(themes)) {
        table(themes as Record<string, unknown>[], [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "price", label: "Price" },
          { key: "status", label: "Status" },
        ]);
      } else {
        printResult(data);
      }
    });

  theme
    .command("upload [manifestFile] [bundleFile]")
    .description("Upload a theme (manifest JSON + zip bundle). Defaults to ./theme.json and ./<id>.zip.")
    .action(async (manifestFile?: string, bundleFile?: string) => {
      const resolvedManifest = manifestFile ?? "theme.json";
      if (!existsSync(resolvedManifest)) {
        throw new Error(`File not found: ${resolvedManifest}`);
      }
      const { data: manifestData, manifest } = readValidatedThemeManifest(resolvedManifest);

      let resolvedBundle = bundleFile;
      if (!resolvedBundle) {
        const manifestDir = dirname(resolve(resolvedManifest));
        const guessName = `${manifest.id as string}.zip`;
        if (existsSync(join(manifestDir, guessName))) {
          resolvedBundle = resolveThemeRootFile(manifestDir, guessName, ["zip"]);
        }
      }
      if (resolvedBundle && !existsSync(resolvedBundle)) {
        throw new Error(`File not found: ${resolvedBundle}`);
      }

      const form = manifestForm(manifestData);
      if (resolvedBundle) {
        form.append(
          "bundle",
          await createFileBlob(resolvedBundle, { type: "application/zip" }),
        );
      }
      printResult(await resolveClient(theme).upload("/api/v1/themes/upload", form, "POST"));
    });

  theme
    .command("update <id> <manifestFile> [bundleFile]")
    .description("Update a theme")
    .action(async (id: string, manifestFile: string, bundleFile?: string) => {
      if (!existsSync(manifestFile)) throw new Error(`File not found: ${manifestFile}`);
      if (bundleFile && !existsSync(bundleFile)) throw new Error(`File not found: ${bundleFile}`);
      const { data: manifestData } = readValidatedThemeManifest(manifestFile);
      const form = manifestForm(manifestData);
      if (bundleFile) {
        form.append(
          "bundle",
          await createFileBlob(bundleFile, { type: "application/zip" }),
        );
      }
      printResult(await resolveClient(theme).upload(
        `/api/v1/themes/${encodePathSegment(id)}`,
        form,
        "PUT",
      ));
    });

  theme.command("delete <id>").description("Delete a theme").action(async (id: string) => {
    await resolveClient(theme).delete(`/api/v1/themes/${encodePathSegment(id)}`);
    printSuccess(`Theme ${id} deleted.`);
  });

  theme
    .command("publish <id>")
    .description("Publish a theme (requires an approved safety review)")
    .action(async (id: string) => {
      printResult(await resolveClient(theme).patch(
        `/api/v1/themes/${encodePathSegment(id)}/status`,
        { status: "published" },
      ));
    });

  theme.command("unpublish <id>").description("Unpublish a theme").action(async (id: string) => {
    printResult(await resolveClient(theme).patch(
      `/api/v1/themes/${encodePathSegment(id)}/status`,
      { status: "draft" },
    ));
  });

  theme.command("info <id>").description("Show detailed info about a theme").action(async (id: string) => {
    printResult(await resolveClient(theme).get(`/api/v1/themes/${encodePathSegment(id)}`));
  });
}
