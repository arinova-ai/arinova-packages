import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { Command } from "commander";
import { printNote, printSuccess } from "../output.js";
import { createZip, type ZipEntry } from "../zip.js";
import { resolveThemeRootFile } from "./theme-build.js";
import { readValidatedThemeManifest } from "./theme-manifest.js";

const ALLOWED_EXTENSIONS = [
  "png", "jpg", "jpeg", "webp", "gif", "svg", "glb", "gltf",
  "mp3", "ogg", "wav", "json", "js", "css", "html",
];
const RESERVED_THEME_PROJECT_FILES = new Set([
  "theme.json",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "tsconfig.json",
]);

export function registerThemeBuildCommand(theme: Command): void {
  theme
    .command("build")
    .description("Package the theme as a flat ZIP bundle for upload")
    .action(async () => {
      const cwd = process.cwd();
      const manifestPath = join(cwd, "theme.json");
      if (!existsSync(manifestPath)) {
        throw new Error("theme.json not found. Run this inside a theme directory.");
      }
      const { manifest } = readValidatedThemeManifest(manifestPath);
      const id = manifest.id as string;
      const entry = manifest.entry as string;
      const previewName = (manifest.preview as string | undefined) ?? "preview.png";
      const outFile = `${id}.zip`;

      const entryPath = resolveThemeRootFile(cwd, entry, ["js", "mjs"]);
      const previewPath = resolveThemeRootFile(
        cwd,
        previewName,
        ["png", "jpg", "jpeg", "webp", "gif"],
      );
      if (entry !== "theme.js") {
        printNote(`  note: entry '${entry}' will be packaged as 'theme.js' (the runtime always loads theme.js).`);
      }

      const entries = new Map<string, Buffer>();
      entries.set("theme.js", readFileSync(entryPath));
      entries.set(previewName, readFileSync(previewPath));

      let skippedDirs = false;
      for (const name of readdirSync(cwd)) {
        if (name.startsWith(".") || RESERVED_THEME_PROJECT_FILES.has(name)) continue;
        const full = join(cwd, name);
        const stat = lstatSync(full);
        if (stat.isSymbolicLink()) throw new Error(`Symlink assets are not allowed: ${name}`);
        if (stat.isDirectory()) {
          if (readdirSync(full).some((file) => !file.startsWith("."))) skippedDirs = true;
          continue;
        }
        if (name === outFile || name === entry) continue;
        const extension = extname(name).slice(1).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(extension) || entries.has(name)) continue;
        entries.set(name, readFileSync(full));
      }

      if (skippedDirs) {
        printNote("  warning: subdirectories were skipped — production serves assets flat.");
        printNote("           Move any asset files to the theme root (no subfolders).");
      }

      const zipEntries: ZipEntry[] = Array.from(entries, ([name, data]) => ({ name, data }));
      const zip = createZip(zipEntries);
      writeFileSync(join(cwd, outFile), zip);

      printSuccess(`Built ${outFile} (${(zip.length / 1024).toFixed(1)} KB, ${zipEntries.length} files)`);
      printNote("\nUpload with:");
      printNote(`  arinova theme upload theme.json ${outFile}`);
      printNote("Then publish once your safety review is approved:");
      printNote(`  arinova theme publish ${id}`);
    });
}
