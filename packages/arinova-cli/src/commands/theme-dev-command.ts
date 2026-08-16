import { existsSync, readFileSync, watch } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join } from "node:path";
import type { Command } from "commander";
import { THEME_BRIDGE } from "../generated/theme-bridge.js";
import { printNote } from "../output.js";
import { resolveThemeRootFile } from "./theme-build.js";
import { generateDevHtml } from "./theme-dev.js";
import { readValidatedThemeManifest } from "./theme-manifest.js";

const ALLOWED_EXTENSIONS = [
  "png", "jpg", "jpeg", "webp", "gif", "svg", "glb", "gltf",
  "mp3", "ogg", "wav", "json", "js", "css", "html",
];
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
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
};

export function registerThemeDevCommand(theme: Command): void {
  theme
    .command("dev")
    .description("Start a local dev server that mirrors the production runtime")
    .option("-p, --port <port>", "Port number", "3100")
    .action(async (options: { port: string }) => {
      const cwd = process.cwd();
      const manifestPath = join(cwd, "theme.json");
      if (!existsSync(manifestPath)) {
        throw new Error("theme.json not found. Run this inside a theme directory.");
      }

      const { manifest } = readValidatedThemeManifest(manifestPath);
      const themeId = manifest.id as string;
      const themeName = manifest.name as string;
      const entry = manifest.entry as string;
      const port = Number(options.port);
      if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error("Port must be an integer from 1 to 65535");
      }
      const entryPath = resolveThemeRootFile(cwd, entry, ["js", "mjs"]);
      const runtimeHtml = generateDevHtml(themeId, themeName);

      const reloadClients = new Set<ServerResponse>();
      let reloadWatcher: ReturnType<typeof watch> | null = null;
      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = (req.url || "/").split("#")[0];
        if (url === "/" || url.startsWith("/?") || url === "/index.html") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(runtimeHtml);
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
        if (url.startsWith("/assets/")) {
          serveAsset(cwd, url, res);
          return;
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
        printNote("\n  Arinova Theme Dev Server");
        printNote(`  Theme:  ${themeName} (${themeId})`);
        printNote(`  URL:    http://localhost:${port}`);
        printNote("  Serves the real SDK bridge — dev mirrors production.");
        printNote("  Press Ctrl+C to stop\n");
      });

      await new Promise<void>((resolve) => {
        const shutdown = () => {
          process.off("SIGINT", shutdown);
          process.off("SIGTERM", shutdown);
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
}

function serveAsset(cwd: string, url: string, res: ServerResponse): void {
  let filename: string;
  try {
    filename = decodeURIComponent(url.slice("/assets/".length).split("?", 1)[0]);
  } catch {
    res.writeHead(400);
    res.end("Invalid filename");
    return;
  }
  try {
    if (RESERVED_THEME_PROJECT_FILES.has(filename)) throw new Error("Reserved project file");
    const filePath = resolveThemeRootFile(cwd, filename, ALLOWED_EXTENSIONS);
    const contentType = MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(readFileSync(filePath));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}
