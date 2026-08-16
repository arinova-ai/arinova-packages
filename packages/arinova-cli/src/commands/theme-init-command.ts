import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import { PLACEHOLDER_PREVIEW_PNG_BASE64 } from "../placeholder-preview.js";
import { printNote, printSuccess } from "../output.js";
import { scaffoldThemeJs, slugifyThemeId } from "./theme-scaffold.js";

export function registerThemeInitCommand(theme: Command): void {
  theme
    .command("init <name>")
    .description("Scaffold a new Arinova Office theme project")
    .action(async (name: string) => {
      const dir = resolve(name);
      if (existsSync(dir)) throw new Error(`Directory already exists: ${name}`);

      const id = slugifyThemeId(name);
      mkdirSync(dir, { recursive: true });
      const themeJson = {
        id,
        name,
        version: "1.0.0",
        author: { name: "Your Name", id: "your-creator-id" },
        description: "A short description of your theme (max 500 characters).",
        tags: [] as string[],
        preview: "preview.png",
        license: "standard",
        entry: "theme.js",
      };
      writeFileSync(join(dir, "theme.json"), `${JSON.stringify(themeJson, null, 2)}\n`);
      writeFileSync(join(dir, "theme.js"), scaffoldThemeJs(name));
      writeFileSync(
        join(dir, "preview.png"),
        Buffer.from(PLACEHOLDER_PREVIEW_PNG_BASE64, "base64"),
      );

      printSuccess(`Theme scaffolded in ./${name}/`);
      printNote(`  theme.json   — manifest (id: ${id})`);
      printNote("  theme.js     — entry point");
      printNote("  preview.png  — placeholder preview (replace with a real 16:9 screenshot)");
      printNote("");
      printNote("Asset files (png, jpg, svg, mp3, glb, …) go flat next to theme.js — no subfolders.");
      printNote("");
      printNote("Next steps:");
      printNote(`  cd ${name}`);
      printNote("  arinova theme dev      # preview locally");
      printNote("  arinova theme build    # package as <id>.zip");
      printNote("  arinova theme upload   # upload (then publish once approved)");
    });
}
