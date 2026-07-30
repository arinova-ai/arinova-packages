#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = resolve(
  process.argv[2] ??
    process.env.ARINOVA_SERVER_ROOT ??
    join(packageRoot, "../../../arinova-chat-cli-update"),
);
const sourceRoot = join(serverRoot, "apps/rust-server/src");
const outputPath = join(packageRoot, "src/contracts/api-v1-routes.json");

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith(".rs") ? [path] : [];
  });
}

function parseRouteCalls(source) {
  const calls = [];
  for (let position = 0; ; position += 1) {
    position = source.indexOf(".route(", position);
    if (position < 0) return calls;
    let cursor = position + ".route(".length;
    let depth = 1;
    let inString = false;
    let escaped = false;
    for (; cursor < source.length && depth > 0; cursor += 1) {
      const char = source[cursor];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') inString = true;
      else if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
    }
    calls.push(source.slice(position + ".route(".length, cursor - 1));
  }
}

function authKind(path) {
  if (path === "/api/v1/hud") return "websocket";
  if (path.startsWith("/api/v1/webhooks/inbound/")) return "signed-public";
  if (
    path.startsWith("/api/v1/user/") ||
    path.startsWith("/api/v1/agent/chat") ||
    path.startsWith("/api/v1/economy/")
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

const files = walk(sourceRoot).filter((path) => {
  const name = relative(sourceRoot, path);
  return (
    !name.split("/").some((part) => part === "tests") &&
    !/(^|[/_])tests?\.rs$/.test(name) &&
    name !== "router.rs" &&
    !name.startsWith("middleware/")
  );
});

const entries = new Map();
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const call of parseRouteCalls(source)) {
    const match = call.match(
      /^\s*"(\/api\/v1[^"\\]*)"\s*,([\s\S]*)$/,
    );
    if (!match) continue;
    const [, path, handlers] = match;
    const methods = [
      ...new Set(
        [...handlers.matchAll(/\b(get|post|put|patch|delete)\s*\(/g)].map(
          (item) => item[1].toUpperCase(),
        ),
      ),
    ];
    for (const method of methods) {
      const key = `${method} ${path}`;
      entries.set(key, {
        method,
        path,
        auth: authKind(path),
        requestMode: requestMode(method, path),
        responseMode: responseMode(path),
        source: relative(sourceRoot, file),
      });
    }
  }
}

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
