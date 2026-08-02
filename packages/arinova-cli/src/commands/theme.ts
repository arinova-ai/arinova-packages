import { Command } from "commander";
import { get, del, patch, uploadMultipart, encodePathSegment } from "../client.js";
import { printResult, printSuccess, printNote, table } from "../output.js";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  lstatSync,
  watch,
} from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { THEME_BRIDGE } from "../generated/theme-bridge.js";
import { createZip, type ZipEntry } from "../zip.js";
import { PLACEHOLDER_PREVIEW_PNG_BASE64 } from "../placeholder-preview.js";
import {
  resolveThemeRootFile,
  validateManifestForBuild,
} from "./theme-build.js";
import { scaffoldThemeJs, slugifyThemeId } from "./theme-scaffold.js";
import { generateDevHtml } from "./theme-dev.js";

export { isSafeBundleFileName, resolveThemeRootFile, validateManifestForBuild } from "./theme-build.js";
export { scaffoldThemeJs, slugifyThemeId } from "./theme-scaffold.js";
export { generateDevHtml } from "./theme-dev.js";

/** Asset extensions the server accepts in a theme bundle (mirrors manifest.rs). */
const ALLOWED_EXTENSIONS = [
  "png", "jpg", "jpeg", "webp", "gif", "svg", "glb", "gltf",
  "mp3", "ogg", "wav", "json", "js", "css", "html",
];

const ID_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const MAX_RELOAD_CLIENTS = 32;
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

function readThemeManifest(filePath: string): Buffer {
  const manifestData = readFileSync(filePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestData.toString("utf-8"));
  } catch {
    throw new Error(`Invalid theme manifest JSON: ${filePath}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid theme manifest: expected JSON object in ${filePath}`);
  }
  return manifestData;
}

function blobPartFromBuffer(data: Buffer): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

export function registerTheme(program: Command): void {
  const theme = program.command("theme").description("Theme management");

  // ── Existing commands ─────────────────────────────────────

  theme
    .command("list")
    .description("List your themes")
    .action(async () => {
      const data = await get("/api/v1/creator/themes");
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
    .command("upload <manifestFile> [bundleFile]")
    .description("Upload a theme (manifest JSON + zip bundle). Defaults to ./theme.json and ./<id>.zip.")
    .action(async (manifestFile?: string, bundleFile?: string) => {
      const resolvedManifest = manifestFile ?? "theme.json";
      if (!existsSync(resolvedManifest)) {
        throw new Error(`File not found: ${resolvedManifest}`);
      }
      // Default the bundle to <id>.zip next to the manifest, if present.
      let resolvedBundle = bundleFile;
      if (!resolvedBundle) {
        try {
          const parsed = JSON.parse(readFileSync(resolvedManifest, "utf-8"));
          const manifestDir = dirname(resolve(resolvedManifest));
          const guessName = typeof parsed?.id === "string" && ID_RE.test(parsed.id)
            ? `${parsed.id}.zip`
            : undefined;
          if (guessName && existsSync(join(manifestDir, guessName))) {
            resolvedBundle = resolveThemeRootFile(manifestDir, guessName, ["zip"]);
          }
        } catch {
          // fall through — bundle stays undefined
        }
      }
      if (resolvedBundle && !existsSync(resolvedBundle)) {
        throw new Error(`File not found: ${resolvedBundle}`);
      }
      const manifestData = readThemeManifest(resolvedManifest);
      const fields: Record<string, string | Blob> = {
        manifest: new Blob([blobPartFromBuffer(manifestData)], { type: "application/json" }),
      };
      if (resolvedBundle) {
        const bundleData = readFileSync(resolvedBundle);
        fields.bundle = new Blob([blobPartFromBuffer(bundleData)], { type: "application/zip" });
      }
      const data = await uploadMultipart("/api/v1/themes/upload", fields, "POST");
      printResult(data);
    });

  theme
    .command("update <id> <manifestFile> [bundleFile]")
    .description("Update a theme")
    .action(async (id: string, manifestFile: string, bundleFile?: string) => {
      if (!existsSync(manifestFile)) throw new Error(`File not found: ${manifestFile}`);
      if (bundleFile && !existsSync(bundleFile)) throw new Error(`File not found: ${bundleFile}`);
      const manifestData = readThemeManifest(manifestFile);
      const fields: Record<string, string | Blob> = {
        manifest: new Blob([blobPartFromBuffer(manifestData)], { type: "application/json" }),
      };
      if (bundleFile) {
        const bundleData = readFileSync(bundleFile);
        fields.bundle = new Blob([blobPartFromBuffer(bundleData)], { type: "application/zip" });
      }
      const data = await uploadMultipart(`/api/v1/themes/${encodePathSegment(id)}`, fields, "PUT");
      printResult(data);
    });

  theme
    .command("delete <id>")
    .description("Delete a theme")
    .action(async (id: string) => {
      await del(`/api/v1/themes/${encodePathSegment(id)}`);
      printSuccess(`Theme ${id} deleted.`);
    });

  theme
    .command("publish <id>")
    .description("Publish a theme (requires an approved safety review)")
    .action(async (id: string) => {
      const data = await patch(`/api/v1/themes/${encodePathSegment(id)}/status`, { status: "published" });
      printResult(data);
    });

  theme
    .command("unpublish <id>")
    .description("Unpublish a theme")
    .action(async (id: string) => {
      const data = await patch(`/api/v1/themes/${encodePathSegment(id)}/status`, { status: "draft" });
      printResult(data);
    });

  theme
    .command("info <id>")
    .description("Show detailed info about a theme")
    .action(async (id: string) => {
      const data = await get(`/api/v1/themes/${encodePathSegment(id)}`);
      printResult(data);
    });

  // ── SDK theme authoring commands ──────────────────────────

  theme
    .command("init <name>")
    .description("Scaffold a new Arinova Office theme project")
    .action(async (name: string) => {
      const dir = resolve(name);
      if (existsSync(dir)) {
        throw new Error(`Directory already exists: ${name}`);
      }

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
      writeFileSync(join(dir, "theme.json"), JSON.stringify(themeJson, null, 2) + "\n");
      writeFileSync(join(dir, "theme.js"), scaffoldThemeJs(name));
      // Required by upload: a preview image at the bundle root.
      writeFileSync(join(dir, "preview.png"), Buffer.from(PLACEHOLDER_PREVIEW_PNG_BASE64, "base64"));

      printSuccess(`Theme scaffolded in ./${name}/`);
      printNote("  theme.json   — manifest (id: " + id + ")");
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

  theme
    .command("dev")
    .description("Start a local dev server that mirrors the production runtime")
    .option("-p, --port <port>", "Port number", "3100")
    .action(async (opts: { port: string }) => {
      const cwd = process.cwd();
      const manifestPath = join(cwd, "theme.json");
      if (!existsSync(manifestPath)) {
        throw new Error("theme.json not found. Run this inside a theme directory.");
      }

      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      const themeId = typeof manifest.id === "string" && manifest.id ? manifest.id : "dev-theme";
      const themeName = manifest.name || themeId;
      const entry = manifest.entry || "theme.js";
      const port = Number(opts.port);
      if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error("Port must be an integer from 1 to 65535");
      }
      const entryPath = resolveThemeRootFile(cwd, entry, ["js", "mjs"]);

      const RUNTIME_HTML = generateDevHtml(themeId, themeName);

      const MIME: Record<string, string> = {
        ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
        ".css": "text/css", ".json": "application/json", ".png": "image/png",
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
        ".svg": "image/svg+xml", ".webp": "image/webp", ".mp3": "audio/mpeg",
        ".ogg": "audio/ogg", ".wav": "audio/wav", ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
      };

      const reloadClients = new Set<ServerResponse>();
      let reloadWatcher: ReturnType<typeof watch> | null = null;
      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = (req.url || "/").split("#")[0];

        if (url === "/" || url.startsWith("/?") || url === "/index.html") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(RUNTIME_HTML);
          return;
        }

        if (url === "/bridge.js") {
          res.writeHead(200, { "Content-Type": "text/javascript" });
          res.end(THEME_BRIDGE);
          return;
        }

        if (url === "/theme.js") {
          res.writeHead(200, { "Content-Type": "text/javascript" });
          res.end(readFileSync(entryPath));
          return;
        }

        // Assets are a flat namespace (single filename segment), mirroring prod.
        if (url.startsWith("/assets/")) {
          let filename: string;
          try {
            filename = decodeURIComponent(url.slice("/assets/".length).split("?", 1)[0]);
          } catch {
            res.writeHead(400);
            res.end("Invalid filename");
            return;
          }
          try {
            if (RESERVED_THEME_PROJECT_FILES.has(filename)) {
              throw new Error("Reserved project file");
            }
            const filePath = resolveThemeRootFile(cwd, filename, ALLOWED_EXTENSIONS);
            const ct = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
            res.writeHead(200, { "Content-Type": ct });
            res.end(readFileSync(filePath));
            return;
          } catch {
            res.writeHead(404);
            res.end("Not found");
            return;
          }
        }

        if (url === "/__reload") {
          if (reloadClients.size >= MAX_RELOAD_CLIENTS) {
            res.writeHead(503);
            res.end("Too many reload clients");
            return;
          }
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          res.write("data: connected\n\n");
          reloadClients.add(res);
          reloadWatcher ??= watch(cwd, { recursive: true }, (_event, filename) => {
            if (filename && !filename.startsWith(".") && !filename.includes("node_modules")) {
              for (const client of reloadClients) client.write("data: reload\n\n");
            }
          });
          req.on("close", () => {
            reloadClients.delete(res);
            if (reloadClients.size === 0) {
              reloadWatcher?.close();
              reloadWatcher = null;
            }
          });
          return;
        }

        res.writeHead(404);
        res.end("Not found");
      });

      server.listen(port, "127.0.0.1", () => {
        printNote(`\n  Arinova Theme Dev Server`);
        printNote(`  Theme:  ${themeName} (${themeId})`);
        printNote(`  URL:    http://localhost:${port}`);
        printNote(`  Serves the real SDK bridge — dev mirrors production.`);
        printNote(`  Press Ctrl+C to stop\n`);
      });

      // Keep the process alive until interrupted — otherwise the CLI's
      // top-level `parseAsync().then(() => process.exit(0))` would tear the
      // server down the instant it starts listening.
      await new Promise<void>((resolve) => {
        const shutdown = () => {
          reloadWatcher?.close();
          reloadWatcher = null;
          for (const client of reloadClients) client.end();
          reloadClients.clear();
          server.close();
          resolve();
        };
        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);
      });
    });

  theme
    .command("build")
    .description("Package the theme as a flat ZIP bundle for upload")
    .action(async () => {
      const cwd = process.cwd();
      const manifestPath = join(cwd, "theme.json");
      if (!existsSync(manifestPath)) {
        throw new Error("theme.json not found. Run this inside a theme directory.");
      }

      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      const manifestError = validateManifestForBuild(manifest);
      if (manifestError) {
        throw new Error(manifestError);
      }

      const id: string = manifest.id;
      const entry: string = manifest.entry || "theme.js";
      const previewName: string = manifest.preview || "preview.png";
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

      // Assemble a FLAT bundle keyed by final entry name (production serves a
      // single-segment filename namespace and rejects nested paths).
      // theme.json is deliberately NOT packed: the server derives the
      // manifest from the multipart 'manifest' field and rejects bundles
      // that contain a duplicate theme.json member.
      const entries = new Map<string, Buffer>();
      entries.set("theme.js", readFileSync(entryPath));
      entries.set(previewName, readFileSync(previewPath));

      let skippedDirs = false;
      for (const name of readdirSync(cwd)) {
        if (name.startsWith(".")) continue;
        if (RESERVED_THEME_PROJECT_FILES.has(name)) continue;
        const full = join(cwd, name);
        const st = lstatSync(full);
        if (st.isSymbolicLink()) {
          throw new Error(`Symlink assets are not allowed: ${name}`);
        }
        if (st.isDirectory()) {
          if (readdirSync(full).some((f) => !f.startsWith("."))) skippedDirs = true;
          continue;
        }
        if (name === "theme.json" || name === outFile || name === entry) continue;
        const ext = extname(name).slice(1).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) continue;
        if (entries.has(name)) continue;
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
