#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configuredServerRoot = process.env.ARINOVA_SERVER_ROOT;
if (!configuredServerRoot) {
  throw new Error("ARINOVA_SERVER_ROOT is required and must point to an arinova-chat checkout");
}
const serverRoot = resolve(configuredServerRoot);
const inventoryPath = join(serverRoot, "docs/rust-backend-route-inventory.md");
if (!existsSync(inventoryPath)) {
  throw new Error(`Generated route inventory not found: ${inventoryPath}`);
}
const outputPath = join(packageRoot, "src/contracts/api-v1-routes.json");

function authKind(path) {
  if (path === "/api/v1/hud") return "websocket";
  if (path.startsWith("/api/v1/webhooks/inbound/")) return "signed-public";
  if (path.startsWith("/api/v1/wager/")) return "space-service";
  if (path.startsWith("/api/v1/space-llm/")) return "space-llm";
  if (
    path.startsWith("/api/v1/user/") ||
    path.startsWith("/api/v1/agent/chat") ||
    path.startsWith("/api/v1/economy/") ||
    /^\/api\/v1\/spaces\/[^/]+\/(?:storage|products|inventory)(?:\/|$)/.test(path)
  ) {
    return "oauth";
  }
  return "authenticated";
}

function requestMode(method, path) {
  if (method === "GET" || method === "DELETE") return "none";
  if (
    path.includes("/upload") ||
    path.endsWith("/import") ||
    path.endsWith("/assets") ||
    path.endsWith("/cover") ||
    /^\/api\/v1\/spaces\/[^/]+\/versions$/.test(path) ||
    path === "/api/v1/image-assets"
  ) {
    return "multipart-or-json";
  }
  return "json";
}

function responseMode(path) {
  if (path === "/api/v1/agent/chat/stream") return "sse";
  if (
    path.endsWith("/content") ||
    path.endsWith("/download") ||
    path === "/api/v1/external-images/content"
  ) {
    return "binary";
  }
  if (path === "/api/v1/hud") return "websocket";
  return "json";
}

const entries = new Map();
const inventory = readFileSync(inventoryPath, "utf8");
for (const line of inventory.split("\n")) {
  const match = line.match(/^\| `([A-Z]+)` \| `(\/api\/v1[^`]*)` \| [^|]+ \| [^|]+ \| `([^`]+)` \|$/);
  if (!match) continue;
  const [, method, path, source] = match;
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) continue;
  const key = `${method} ${path}`;
  entries.set(key, {
    method,
    path,
    auth: authKind(path),
    requestMode: requestMode(method, path),
    responseMode: responseMode(path),
    source,
  });
}
if (entries.size === 0) throw new Error(`No API v1 routes parsed from ${inventoryPath}`);

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: serverRoot,
  encoding: "utf8",
}).trim();
const sourceCommitDate = execFileSync(
  "git",
  ["show", "-s", "--format=%cI", sourceCommit],
  { cwd: serverRoot, encoding: "utf8" },
).trim();
const routes = [...entries.values()].sort(
  (left, right) =>
    left.path.localeCompare(right.path) ||
    left.method.localeCompare(right.method),
);
const fixture = {
  generatedAt: sourceCommitDate,
  sourceRepository: "arinova-chat",
  sourceCommit,
  routeCount: routes.length,
  routes,
};

writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`Wrote ${routes.length} method/path routes to ${outputPath}`);
