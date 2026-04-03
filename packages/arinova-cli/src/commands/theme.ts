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
import { basename, join, extname, resolve } from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execSync } from "node:child_process";

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
    .description("Upload a theme (manifest JSON + optional zip bundle)")
    .action(async (manifestFile: string, bundleFile?: string) => {
      try {
        if (!existsSync(manifestFile)) { printError(new Error(`File not found: ${manifestFile}`)); return; }
        if (bundleFile && !existsSync(bundleFile)) { printError(new Error(`File not found: ${bundleFile}`)); return; }
        const manifestData = readFileSync(manifestFile);
        const fields: Record<string, string | Blob> = {
          manifest: new Blob([manifestData], { type: "application/json" }),
        };
        if (bundleFile) {
          const bundleData = readFileSync(bundleFile);
          fields.bundle = new Blob([bundleData], { type: "application/zip" });
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
        const manifestData = readFileSync(manifestFile);
        const fields: Record<string, string | Blob> = {
          manifest: new Blob([manifestData], { type: "application/json" }),
        };
        if (bundleFile) {
          const bundleData = readFileSync(bundleFile);
          fields.bundle = new Blob([bundleData], { type: "application/zip" });
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
    .description("Publish a theme")
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

  // ── New SDK v2 commands ───────────────────────────────────

  theme
    .command("init <name>")
    .description("Scaffold a new SDK v2 theme project")
    .action(async (name: string) => {
      try {
        const dir = resolve(name);
        if (existsSync(dir)) {
          printError(new Error(`Directory already exists: ${name}`));
          return;
        }

        mkdirSync(dir, { recursive: true });
        mkdirSync(join(dir, "assets"), { recursive: true });

        const themeJson = {
          name,
          version: "1.0.0",
          renderer: "iframe",
          description: "",
          entry: "theme.js",
        };

        writeFileSync(join(dir, "theme.json"), JSON.stringify(themeJson, null, 2) + "\n");

        writeFileSync(
          join(dir, "theme.js"),
          `// ${name} — Arinova Office SDK v2 Theme
// Docs: https://docs.arinova.ai/themes/sdk-v2

export default {
  async init(sdk, container) {
    const style = document.createElement("style");
    style.textContent = \`
      #grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 12px;
        padding: 16px;
        height: 100%;
        align-content: start;
      }
      .agent-card {
        background: #1e293b;
        border-radius: 12px;
        padding: 16px;
        cursor: pointer;
        transition: transform 0.2s, box-shadow 0.2s;
        border: 2px solid transparent;
      }
      .agent-card:hover { transform: scale(1.04); }
      .agent-card.working { border-color: #4ade80; box-shadow: 0 0 12px #4ade8040; }
      .agent-card.idle { border-color: #64748b; }
      .agent-card.blocked { border-color: #f87171; }
      .agent-card.collaborating { border-color: #60a5fa; }
      .agent-name { font-size: 16px; font-weight: 600; color: #f1f5f9; }
      .agent-role { font-size: 13px; color: #94a3b8; margin-top: 2px; }
      .agent-task { font-size: 12px; color: #4ade80; margin-top: 8px; }
    \`;
    container.appendChild(style);
    container.innerHTML += '<div id="grid"></div>';

    const grid = container.querySelector("#grid");

    function render(agents) {
      grid.innerHTML = agents.map(function (a) {
        return '<div class="agent-card ' + a.status + '" data-id="' + a.id + '">'
          + '<div class="agent-name">' + a.emoji + ' ' + a.name + '</div>'
          + '<div class="agent-role">' + a.role + '</div>'
          + (a.currentTask ? '<div class="agent-task">' + a.currentTask.title + '</div>' : '')
          + '</div>';
      }).join("");

      grid.querySelectorAll(".agent-card").forEach(function (card) {
        card.addEventListener("click", function () {
          sdk.selectAgent(card.dataset.id);
        });
      });
    }

    render(sdk.agents);
    sdk.onAgentsChange(render);
  },

  resize(w, h) {},
  destroy() {},
};
`,
        );

        printSuccess(`Theme scaffolded in ./${name}/`);
        console.log("  theme.json  — metadata");
        console.log("  theme.js    — entry point");
        console.log("  assets/     — static resources");
        console.log("");
        console.log("Next steps:");
        console.log(`  cd ${name}`);
        console.log("  arinova theme dev");
      } catch (err) {
        printError(err);
      }
    });

  theme
    .command("dev")
    .description("Start local dev server for theme development")
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
        const themeName = manifest.name || "dev-theme";
        const port = parseInt(opts.port, 10);

        const MOCK_BRIDGE = generateMockBridge(themeName);
        const RUNTIME_HTML = generateDevHtml(themeName);

        const MIME: Record<string, string> = {
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
          ".woff": "font/woff",
          ".woff2": "font/woff2",
          ".ttf": "font/ttf",
          ".mp3": "audio/mpeg",
          ".ogg": "audio/ogg",
          ".wav": "audio/wav",
          ".glb": "model/gltf-binary",
        };

        const server = createServer((req: IncomingMessage, res: ServerResponse) => {
          const url = req.url || "/";

          if (url === "/" || url === "/index.html") {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(RUNTIME_HTML);
            return;
          }

          if (url === "/bridge.js") {
            res.writeHead(200, { "Content-Type": "text/javascript" });
            res.end(MOCK_BRIDGE);
            return;
          }

          if (url === "/theme.js") {
            const entry = manifest.entry || "theme.js";
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

          // Serve assets
          if (url.startsWith("/assets/")) {
            const relPath = url.slice("/assets/".length);
            const filePath = join(cwd, "assets", relPath);
            if (existsSync(filePath) && statSync(filePath).isFile()) {
              const ext = extname(filePath).toLowerCase();
              const ct = MIME[ext] || "application/octet-stream";
              res.writeHead(200, { "Content-Type": ct });
              res.end(readFileSync(filePath));
              return;
            }
          }

          // Live reload event stream
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
          console.log(`  Theme:  ${themeName}`);
          console.log(`  URL:    http://localhost:${port}`);
          console.log(`  Press Ctrl+C to stop\n`);
        });
      } catch (err) {
        printError(err);
      }
    });

  theme
    .command("build")
    .description("Package theme as a ZIP for upload")
    .action(async () => {
      try {
        const cwd = process.cwd();
        const manifestPath = join(cwd, "theme.json");
        if (!existsSync(manifestPath)) {
          printError(new Error("theme.json not found. Run this inside a theme directory."));
          return;
        }

        const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
        if (!manifest.name) {
          printError(new Error("theme.json is missing 'name' field."));
          return;
        }
        if (!manifest.entry) {
          printError(new Error("theme.json is missing 'entry' field."));
          return;
        }

        const entry = manifest.entry || "theme.js";
        if (!existsSync(join(cwd, entry))) {
          printError(new Error(`Entry file not found: ${entry}`));
          return;
        }

        const outFile = `${manifest.name}.zip`;

        // Collect files to include
        const files = ["theme.json", entry];
        const assetsDir = join(cwd, "assets");
        if (existsSync(assetsDir) && statSync(assetsDir).isDirectory()) {
          collectFiles(assetsDir, "assets", files);
        }

        // Use system zip command
        const fileList = files.join(" ");
        execSync(`zip -r "${outFile}" ${fileList}`, { cwd, stdio: "pipe" });

        const size = statSync(join(cwd, outFile)).size;
        printSuccess(`Built ${outFile} (${(size / 1024).toFixed(1)} KB, ${files.length} files)`);
        console.log("\nUpload with:");
        console.log(`  arinova theme upload theme.json ${outFile}`);
      } catch (err) {
        printError(err);
      }
    });
}

// ── Helpers ─────────────────────────────────────────────────

function collectFiles(dir: string, prefix: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const rel = prefix + "/" + entry;
    if (statSync(full).isDirectory()) {
      collectFiles(full, rel, out);
    } else {
      out.push(rel);
    }
  }
}

function generateDevHtml(themeName: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${themeName} — Dev</title>
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #0f172a; }
  #container { width: 100%; height: 100%; }
</style>
</head>
<body>
<div id="container"></div>
<script src="/bridge.js"></script>
<script type="module">
  import theme from "/theme.js";
  window.__ARINOVA_REGISTER_THEME__(theme);
</script>
<script>
  var es = new EventSource("/__reload");
  es.onmessage = function(e) { if (e.data === "reload") location.reload(); };
</script>
</body>
</html>`;
}

function generateMockBridge(themeName: string): string {
  return `(function() {
  "use strict";

  var THEME_ID = "${themeName}";
  var ASSETS_BASE = "/assets";

  var MOCK_NAMES = ["Alice", "Bob", "Charlie", "Diana", "Eve"];
  var MOCK_ROLES = ["Engineer", "Designer", "PM", "QA", "Writer"];
  var MOCK_EMOJIS = ["\\u{1F469}\\u200D\\u{1F4BB}", "\\u{1F468}\\u200D\\u{1F527}", "\\u{1F9D1}\\u200D\\u{1F3A8}", "\\u{1F9D1}\\u200D\\u{1F52C}", "\\u270D\\uFE0F"];
  var MOCK_COLORS = ["#f472b6", "#60a5fa", "#4ade80", "#fbbf24", "#a78bfa"];
  var STATUSES = ["working", "idle", "blocked", "collaborating"];

  function makeMockAgents() {
    return MOCK_NAMES.map(function(name, i) {
      var status = STATUSES[Math.floor(Math.random() * STATUSES.length)];
      return {
        id: "agent-" + (i + 1),
        name: name,
        role: MOCK_ROLES[i],
        emoji: MOCK_EMOJIS[i],
        color: MOCK_COLORS[i],
        status: status,
        online: true,
        collaboratingWith: status === "collaborating" ? ["agent-" + (((i + 1) % 5) + 1)] : [],
        currentTask: status === "working" ? { title: "Task #" + (i + 1), priority: "medium", progress: Math.floor(Math.random() * 100), subtasks: [] } : null,
        recentActivity: [{ time: new Date().toISOString(), text: "Updated status to " + status }],
        model: "claude-sonnet-4",
        tokenUsage: { input: 1000 + i * 500, output: 500 + i * 200, total: 1500 + i * 700 },
        sessionDurationMs: 60000 * (i + 1),
        currentToolDetail: status === "working" ? "edit_file" : null,
      };
    });
  }

  var _agents = makeMockAgents();
  var _agentListeners = [];
  var _user = { id: "dev-user", name: "Developer", username: "dev" };
  var _themeVersion = "0.0.0";
  var _width = window.innerWidth;
  var _height = window.innerHeight;
  var _isMobile = window.innerWidth < 768;
  var _pixelRatio = window.devicePixelRatio || 1;
  var _initialized = false;
  var _themeModule = null;
  var _container = null;

  function notifyAgentListeners() {
    for (var i = 0; i < _agentListeners.length; i++) {
      try { _agentListeners[i](_agents); } catch (e) { console.error("[MockSDK]", e); }
    }
  }

  var sdk = {
    get agents() { return _agents; },
    onAgentsChange: function(cb) {
      _agentListeners.push(cb);
      return function() {
        var idx = _agentListeners.indexOf(cb);
        if (idx !== -1) _agentListeners.splice(idx, 1);
      };
    },
    getAgent: function(id) { return _agents.find(function(a) { return a.id === id; }); },
    assetUrl: function(rel) {
      if (!rel) return "";
      if (rel.charAt(0) === "/") rel = rel.slice(1);
      return ASSETS_BASE + "/" + rel;
    },
    loadJSON: function(rel) {
      return fetch(sdk.assetUrl(rel)).then(function(r) {
        if (!r.ok) throw new Error("Failed to load " + rel);
        return r.json();
      });
    },
    loadFont: function(name, rel) {
      var face = new FontFace(name, "url(" + sdk.assetUrl(rel) + ")");
      return face.load().then(function(f) { document.fonts.add(f); });
    },
    selectAgent: function(id) { console.log("[MockSDK] selectAgent:", id); },
    openChat: function(id) { console.log("[MockSDK] openChat:", id); },
    navigate: function(path) { console.log("[MockSDK] navigate:", path); },
    emit: function(event, data) { console.log("[MockSDK] emit:", event, data); },
    get width() { return _width; },
    get height() { return _height; },
    get isMobile() { return _isMobile; },
    get pixelRatio() { return _pixelRatio; },
    get user() { return _user; },
    get themeId() { return THEME_ID; },
    get themeVersion() { return _themeVersion; },
  };

  window.__ARINOVA_SDK__ = sdk;

  window.__ARINOVA_REGISTER_THEME__ = function(mod) {
    _themeModule = mod;
    _container = document.getElementById("container");
    if (!_container) return;
    _initialized = true;
    var m = mod.default || mod;
    if (typeof m.init === "function") {
      try {
        var result = m.init(sdk, _container);
        if (result && typeof result.catch === "function") result.catch(function(e) { console.error("[MockSDK] init error:", e); });
      } catch (e) { console.error("[MockSDK] init error:", e); }
    }
  };

  // Simulate agent updates every 5 seconds
  setInterval(function() {
    _agents = makeMockAgents();
    notifyAgentListeners();
  }, 5000);

  window.addEventListener("resize", function() {
    _width = window.innerWidth;
    _height = window.innerHeight;
    if (_themeModule) {
      var m = _themeModule.default || _themeModule;
      if (typeof m.resize === "function") {
        try { m.resize(_width, _height); } catch (e) { console.error("[MockSDK] resize error:", e); }
      }
    }
  });
})();
`;
}
