import { Command } from "commander";
import { get, del, patch, uploadMultipart } from "../client.js";
import { printResult, printError, printSuccess, table } from "../output.js";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  watch,
} from "node:fs";
import { join, extname, resolve } from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { THEME_BRIDGE } from "../generated/theme-bridge.js";
import { createZip, type ZipEntry } from "../zip.js";
import { PLACEHOLDER_PREVIEW_PNG_BASE64 } from "../placeholder-preview.js";

/** Asset extensions the server accepts in a theme bundle (mirrors manifest.rs). */
const ALLOWED_EXTENSIONS = [
  "png", "jpg", "jpeg", "webp", "gif", "svg", "glb", "gltf",
  "mp3", "ogg", "wav", "json", "js", "css", "html",
];

const ID_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

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
      try {
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
      } catch (err) {
        printError(err);
      }
    });

  theme
    .command("upload <manifestFile> [bundleFile]")
    .description("Upload a theme (manifest JSON + zip bundle). Defaults to ./theme.json and ./<id>.zip.")
    .action(async (manifestFile?: string, bundleFile?: string) => {
      try {
        const resolvedManifest = manifestFile ?? "theme.json";
        if (!existsSync(resolvedManifest)) {
          printError(new Error(`File not found: ${resolvedManifest}`));
          return;
        }
        // Default the bundle to <id>.zip next to the manifest, if present.
        let resolvedBundle = bundleFile;
        if (!resolvedBundle) {
          try {
            const parsed = JSON.parse(readFileSync(resolvedManifest, "utf-8"));
            const guess = parsed?.id ? `${parsed.id}.zip` : undefined;
            if (guess && existsSync(guess)) resolvedBundle = guess;
          } catch {
            // fall through — bundle stays undefined
          }
        }
        if (resolvedBundle && !existsSync(resolvedBundle)) {
          printError(new Error(`File not found: ${resolvedBundle}`));
          return;
        }
        const manifestData = readThemeManifest(resolvedManifest);
        const fields: Record<string, string | Blob> = {
          manifest: new Blob([blobPartFromBuffer(manifestData)], { type: "application/json" }),
        };
        if (resolvedBundle) {
          const bundleData = readFileSync(resolvedBundle);
          fields.bundle = new Blob([blobPartFromBuffer(bundleData)], { type: "application/zip" });
        }
        const data = await uploadMultipart("/api/v1/themes/upload", fields);
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  theme
    .command("update <id> <manifestFile> [bundleFile]")
    .description("Update a theme")
    .action(async (id: string, manifestFile: string, bundleFile?: string) => {
      try {
        if (!existsSync(manifestFile)) { printError(new Error(`File not found: ${manifestFile}`)); return; }
        if (bundleFile && !existsSync(bundleFile)) { printError(new Error(`File not found: ${bundleFile}`)); return; }
        const manifestData = readThemeManifest(manifestFile);
        const fields: Record<string, string | Blob> = {
          manifest: new Blob([blobPartFromBuffer(manifestData)], { type: "application/json" }),
        };
        if (bundleFile) {
          const bundleData = readFileSync(bundleFile);
          fields.bundle = new Blob([blobPartFromBuffer(bundleData)], { type: "application/zip" });
        }
        const data = await uploadMultipart(`/api/themes/${id}`, fields, "PUT");
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  theme
    .command("delete <id>")
    .description("Delete a theme")
    .action(async (id: string) => {
      try {
        await del(`/api/themes/${id}`);
        printSuccess(`Theme ${id} deleted.`);
      } catch (err) {
        printError(err);
      }
    });

  theme
    .command("publish <id>")
    .description("Publish a theme (requires an approved safety review)")
    .action(async (id: string) => {
      try {
        const data = await patch(`/api/themes/${id}/status`, { status: "published" });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  theme
    .command("unpublish <id>")
    .description("Unpublish a theme")
    .action(async (id: string) => {
      try {
        const data = await patch(`/api/themes/${id}/status`, { status: "draft" });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  theme
    .command("info <id>")
    .description("Show detailed info about a theme")
    .action(async (id: string) => {
      try {
        const data = await get(`/api/themes/${id}`);
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  // ── SDK theme authoring commands ──────────────────────────

  theme
    .command("init <name>")
    .description("Scaffold a new Arinova Office theme project")
    .action(async (name: string) => {
      try {
        const dir = resolve(name);
        if (existsSync(dir)) {
          printError(new Error(`Directory already exists: ${name}`));
          return;
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
        console.log("  theme.json   — manifest (id: " + id + ")");
        console.log("  theme.js     — entry point");
        console.log("  preview.png  — placeholder preview (replace with a real 16:9 screenshot)");
        console.log("");
        console.log("Asset files (png, jpg, svg, mp3, glb, …) go flat next to theme.js — no subfolders.");
        console.log("");
        console.log("Next steps:");
        console.log(`  cd ${name}`);
        console.log("  arinova theme dev      # preview locally");
        console.log("  arinova theme build    # package as <id>.zip");
        console.log("  arinova theme upload   # upload (then publish once approved)");
      } catch (err) {
        printError(err);
      }
    });

  theme
    .command("dev")
    .description("Start a local dev server that mirrors the production runtime")
    .option("-p, --port <port>", "Port number", "3100")
    .action(async (opts: { port: string }) => {
      try {
        const cwd = process.cwd();
        const manifestPath = join(cwd, "theme.json");
        if (!existsSync(manifestPath)) {
          printError(new Error("theme.json not found. Run this inside a theme directory."));
          return;
        }

        const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
        const themeId = typeof manifest.id === "string" && manifest.id ? manifest.id : "dev-theme";
        const themeName = manifest.name || themeId;
        const entry = manifest.entry || "theme.js";
        const port = parseInt(opts.port, 10);

        const RUNTIME_HTML = generateDevHtml(themeId, themeName);

        const MIME: Record<string, string> = {
          ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
          ".css": "text/css", ".json": "application/json", ".png": "image/png",
          ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
          ".svg": "image/svg+xml", ".webp": "image/webp", ".mp3": "audio/mpeg",
          ".ogg": "audio/ogg", ".wav": "audio/wav", ".glb": "model/gltf-binary",
          ".gltf": "model/gltf+json",
        };

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
            const filePath = join(cwd, entry);
            if (!existsSync(filePath)) {
              res.writeHead(404);
              res.end("Not found");
              return;
            }
            res.writeHead(200, { "Content-Type": "text/javascript" });
            res.end(readFileSync(filePath));
            return;
          }

          // Assets are a flat namespace (single filename segment), mirroring prod.
          if (url.startsWith("/assets/")) {
            const filename = decodeURIComponent(url.slice("/assets/".length));
            if (!filename || filename.includes("/") || filename.includes("..")) {
              res.writeHead(400);
              res.end("Invalid filename");
              return;
            }
            const filePath = join(cwd, filename);
            if (existsSync(filePath) && statSync(filePath).isFile()) {
              const ct = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
              res.writeHead(200, { "Content-Type": ct });
              res.end(readFileSync(filePath));
              return;
            }
            res.writeHead(404);
            res.end("Not found");
            return;
          }

          if (url === "/__reload") {
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            });
            res.write("data: connected\n\n");
            const watcher = watch(cwd, { recursive: true }, (_event, filename) => {
              if (filename && !filename.startsWith(".") && !filename.includes("node_modules")) {
                res.write("data: reload\n\n");
              }
            });
            req.on("close", () => watcher.close());
            return;
          }

          res.writeHead(404);
          res.end("Not found");
        });

        server.listen(port, () => {
          console.log(`\n  Arinova Theme Dev Server`);
          console.log(`  Theme:  ${themeName} (${themeId})`);
          console.log(`  URL:    http://localhost:${port}`);
          console.log(`  Serves the real SDK bridge — dev mirrors production.`);
          console.log(`  Press Ctrl+C to stop\n`);
        });

        // Keep the process alive until interrupted — otherwise the CLI's
        // top-level `parseAsync().then(() => process.exit(0))` would tear the
        // server down the instant it starts listening.
        await new Promise<void>((resolve) => {
          const shutdown = () => {
            server.close();
            resolve();
          };
          process.once("SIGINT", shutdown);
          process.once("SIGTERM", shutdown);
        });
      } catch (err) {
        printError(err);
      }
    });

  theme
    .command("build")
    .description("Package the theme as a flat ZIP bundle for upload")
    .action(async () => {
      try {
        const cwd = process.cwd();
        const manifestPath = join(cwd, "theme.json");
        if (!existsSync(manifestPath)) {
          printError(new Error("theme.json not found. Run this inside a theme directory."));
          return;
        }

        const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
        const manifestError = validateManifestForBuild(manifest);
        if (manifestError) {
          printError(new Error(manifestError));
          return;
        }

        const id: string = manifest.id;
        const entry: string = manifest.entry || "theme.js";
        const previewName: string = manifest.preview || "preview.png";
        const outFile = `${id}.zip`;

        if (!existsSync(join(cwd, entry))) {
          printError(new Error(`Entry file not found: ${entry}`));
          return;
        }
        if (!existsSync(join(cwd, previewName)) || !statSync(join(cwd, previewName)).isFile()) {
          printError(new Error(`Preview file not found at bundle root: ${previewName}`));
          return;
        }
        if (entry !== "theme.js") {
          console.log(`  note: entry '${entry}' will be packaged as 'theme.js' (the runtime always loads theme.js).`);
        }

        // Assemble a FLAT bundle keyed by final entry name (production serves a
        // single-segment filename namespace and rejects nested paths).
        const entries = new Map<string, Buffer>();
        entries.set("theme.json", readFileSync(manifestPath));
        entries.set("theme.js", readFileSync(join(cwd, entry)));
        entries.set(previewName, readFileSync(join(cwd, previewName)));

        let skippedDirs = false;
        for (const name of readdirSync(cwd)) {
          if (name.startsWith(".")) continue;
          const full = join(cwd, name);
          const st = statSync(full);
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
          console.log("  warning: subdirectories were skipped — production serves assets flat.");
          console.log("           Move any asset files to the theme root (no subfolders).");
        }

        const zipEntries: ZipEntry[] = Array.from(entries, ([name, data]) => ({ name, data }));
        const zip = createZip(zipEntries);
        writeFileSync(join(cwd, outFile), zip);

        printSuccess(`Built ${outFile} (${(zip.length / 1024).toFixed(1)} KB, ${zipEntries.length} files)`);
        console.log("\nUpload with:");
        console.log(`  arinova theme upload theme.json ${outFile}`);
        console.log("Then publish once your safety review is approved:");
        console.log(`  arinova theme publish ${id}`);
      } catch (err) {
        printError(err);
      }
    });
}

// ── Helpers ─────────────────────────────────────────────────

/** Slugify a theme name into a valid kebab-case id (server rule: ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$, ≤100). */
export function slugifyThemeId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
  return slug.length > 0 && ID_RE.test(slug) ? slug : "my-theme";
}

/** Validate a manifest the way the server will, returning a friendly error string (or null). */
export function validateManifestForBuild(manifest: unknown): string | null {
  if (!manifest || typeof manifest !== "object") return "theme.json must be a JSON object.";
  const m = manifest as Record<string, unknown>;
  if (typeof m.id !== "string" || !ID_RE.test(m.id) || m.id.length > 100) {
    return "theme.json 'id' must be kebab-case (e.g. my-cool-theme), ≤100 chars.";
  }
  if (typeof m.name !== "string" || m.name.trim().length === 0 || m.name.length > 100) {
    return "theme.json 'name' must be 1-100 characters.";
  }
  if (typeof m.version !== "string" || !SEMVER_RE.test(m.version)) {
    return "theme.json 'version' must be semver (e.g. 1.0.0).";
  }
  if (typeof m.entry !== "string" || m.entry.length === 0) {
    return "theme.json is missing required 'entry'.";
  }
  if (m.price != null && (typeof m.price !== "number" || m.price < 0)) {
    return "theme.json 'price' must be an integer ≥ 0.";
  }
  return null;
}

/** The scaffolded theme.js — runtime-correct and CSP-safe (CSSOM styling, string currentTask). */
export function scaffoldThemeJs(name: string): string {
  return `// ${name} — Arinova Office theme
// The runtime calls only init(sdk, container). Subscribe to viewport changes
// with sdk.onResize(). The runtime CSP blocks author style elements and inline
// style attributes, so set styles via the CSSOM (element.style) in JS instead.

export default {
  init(sdk, container) {
    const grid = document.createElement("div");
    Object.assign(grid.style, {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
      gap: "12px",
      padding: "16px",
      height: "100%",
      alignContent: "start",
      boxSizing: "border-box",
      fontFamily: "system-ui, sans-serif",
    });
    container.appendChild(grid);

    const BORDER = {
      working: "#4ade80", idle: "#64748b", blocked: "#f87171",
      collaborating: "#60a5fa", unbound: "#334155",
    };

    function render(agents) {
      grid.replaceChildren();
      agents.forEach((a) => {
        const card = document.createElement("div");
        Object.assign(card.style, {
          background: "#1e293b",
          borderRadius: "12px",
          padding: "16px",
          cursor: "pointer",
          color: "#f1f5f9",
          border: "2px solid " + (BORDER[a.status] || "transparent"),
        });

        const nameEl = document.createElement("div");
        Object.assign(nameEl.style, { fontSize: "16px", fontWeight: "600" });
        nameEl.textContent = (a.emoji || "🤖") + " " + a.name;

        const roleEl = document.createElement("div");
        Object.assign(roleEl.style, { fontSize: "13px", color: "#94a3b8", marginTop: "2px" });
        roleEl.textContent = a.role || "";

        card.append(nameEl, roleEl);

        // currentTask is a plain string (undefined when idle).
        if (a.currentTask) {
          const taskEl = document.createElement("div");
          Object.assign(taskEl.style, { fontSize: "12px", color: "#4ade80", marginTop: "8px" });
          taskEl.textContent = a.currentTask;
          card.append(taskEl);
        }

        card.addEventListener("click", () => sdk.selectAgent(a.id));
        grid.append(card);
      });
    }

    render(sdk.agents);
    sdk.onAgentsChange(render);
    sdk.onResize((size) => {
      grid.style.gridTemplateColumns =
        size.width < 480 ? "1fr" : "repeat(auto-fill, minmax(160px, 1fr))";
    });
  },
};
`;
}

/**
 * Dev runtime HTML. Mirrors the production runtime: sets the same globals, loads
 * the REAL bridge, and drives it over the real postMessage protocol (bridgeToken
 * + origin checks) from an in-page host emulator with mock data shaped exactly
 * like the real Agent. Same document acts as parent, so window.parent === window.
 */
export function generateDevHtml(themeId: string, themeName: string): string {
  const safeId = JSON.stringify(themeId);
  const safeTitle = escapeHtml(themeName);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle} — Dev</title>
</head>
<body style="margin:0">
<div id="container" style="width:100vw;height:100vh"></div>
<script>
  // Must run before bridge.js: globals + a per-session bridge token in the hash.
  window.__ARINOVA_THEME_ID__ = ${safeId};
  window.__ARINOVA_ASSETS_BASE__ = "/assets";
  window.__ARINOVA_PARENT_ORIGIN__ = location.origin;
  if (!/bridgeToken=/.test(location.hash)) location.hash = "bridgeToken=arinova-dev";
</script>
<script src="/bridge.js"></script>
<script>
  // In-page host emulator — speaks the real protocol to the bridge.
  (function () {
    var TOKEN = new URLSearchParams(location.hash.slice(1)).get("bridgeToken") || "";
    var ORIGIN = location.origin;
    var NAMES = ["Alice", "Bob", "Charlie", "Diana", "Eve"];
    var ROLES = ["Engineer", "Designer", "PM", "QA", "Writer"];
    var EMOJIS = ["\\uD83D\\uDC69\\u200D\\uD83D\\uDCBB", "\\uD83D\\uDC68\\u200D\\uD83D\\uDD27", "\\uD83E\\uDDD1\\u200D\\uD83C\\uDFA8", "\\uD83E\\uDDD1\\u200D\\uD83D\\uDD2C", "\\u270D\\uFE0F"];
    var COLORS = ["#f472b6", "#60a5fa", "#4ade80", "#fbbf24", "#a78bfa"];
    var STATUSES = ["working", "idle", "blocked", "collaborating"];

    function makeAgents() {
      var now = Date.now();
      return NAMES.map(function (name, i) {
        var status = STATUSES[Math.floor(Math.random() * STATUSES.length)];
        return {
          id: "agent-" + (i + 1),
          name: name,
          role: ROLES[i],
          emoji: EMOJIS[i],
          color: COLORS[i],
          status: status,
          online: true,
          currentTask: status === "working" ? "Working on task #" + (i + 1) : undefined,
          taskStartedAt: status === "working" ? now - Math.floor(Math.random() * 600000) : undefined,
          recentActivity: [{ time: new Date().toLocaleTimeString(), text: "Status: " + status }],
          model: "claude-sonnet-4-5",
          tokenUsage: { contextPercent: Math.floor(Math.random() * 100) + "%" },
        };
      });
    }

    var agents = makeAgents();
    var connectedAgents = agents.map(function (a) { return { id: a.id, name: a.name }; });
    var bindings = [];
    var user = { id: "dev-user", name: "Developer", username: "dev" };

    function post(msg) {
      msg.bridgeToken = TOKEN;
      window.postMessage(msg, ORIGIN);
    }
    function sendInit() {
      post({
        type: "init", user: user, themeId: ${safeId}, themeVersion: "0.0.0",
        isMobile: window.innerWidth < 768, pixelRatio: window.devicePixelRatio || 1,
        agents: agents, connectedAgents: connectedAgents, bindings: bindings,
        width: window.innerWidth, height: window.innerHeight,
      });
    }

    window.addEventListener("message", function (e) {
      if (e.source !== window || e.origin !== ORIGIN) return;
      var d = e.data;
      if (!d || typeof d.type !== "string" || d.bridgeToken !== TOKEN) return;
      switch (d.type) {
        case "ready": sendInit(); break;
        case "agent:select": console.log("[dev] selectAgent", d.agentId); break;
        case "agent:openChat": console.log("[dev] openChat", d.agentId); break;
        case "navigate": console.log("[dev] navigate", d.path); break;
        case "agent:bind":
          bindings = bindings.filter(function (b) { return b.slotIndex !== d.slotIndex; });
          bindings.push({ slotIndex: d.slotIndex, agentId: d.agentId });
          post({ type: "bindings:update", bindings: bindings });
          break;
        case "agent:unbind":
          bindings = bindings.filter(function (b) { return b.slotIndex !== d.slotIndex; });
          post({ type: "bindings:update", bindings: bindings });
          break;
      }
    });

    setInterval(function () {
      agents = makeAgents();
      post({ type: "agents:update", agents: agents });
    }, 5000);

    window.addEventListener("resize", function () {
      post({ type: "resize", width: window.innerWidth, height: window.innerHeight });
    });
  })();
</script>
<script type="module">
  import theme from "/theme.js";
  window.__ARINOVA_REGISTER_THEME__(theme);
</script>
<script>
  var es = new EventSource("/__reload");
  es.onmessage = function (e) { if (e.data === "reload") location.reload(); };
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
