import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface RouteFixture {
  sourceCommit: string;
  routeCount: number;
  routes: Array<{
    method: string;
    path: string;
    auth: string;
    requestMode: string;
    responseMode: string;
    source: string;
  }>;
}

const contractsDirectory = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(contractsDirectory, "api-v1-routes.json"), "utf8"),
) as RouteFixture;
const commandsDirectory = join(contractsDirectory, "../commands");
const openClawSourceDirectory = resolve(contractsDirectory, "../../../openclaw-plugin/src");

function readProductionTypeScriptSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return readProductionTypeScriptSources(path);
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) return [];
    return [readFileSync(path, "utf8")];
  });
}

describe("API v1 route contract fixture", () => {
  it("is internally fresh and matches the configured server checkout", () => {
    expect(fixture.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(fixture.routeCount).toBeGreaterThan(0);
    expect(fixture.routes).toHaveLength(fixture.routeCount);
    if (process.env.ARINOVA_SERVER_ROOT) {
      const head = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: resolve(process.env.ARINOVA_SERVER_ROOT), encoding: "utf8",
      }).trim();
      expect(fixture.sourceCommit).toBe(head);
    }
  });

  it("has unique method/path entries with transport metadata", () => {
    const keys = new Set<string>();
    for (const route of fixture.routes) {
      expect(route.path).toMatch(/^\/api\/v1(?:\/|$)/);
      expect(route.method).toMatch(/^(GET|POST|PUT|PATCH|DELETE)$/);
      expect(route.auth).toBeTruthy();
      expect(route.requestMode).toBeTruthy();
      expect(route.responseMode).toBeTruthy();
      expect(route.source).toBeTruthy();
      keys.add(`${route.method} ${route.path}`);
    }
    expect(keys.size).toBe(fixture.routeCount);
  });

  it("identifies the two confidential Space service extractors", () => {
    const authFor = (path: string) => fixture.routes
      .filter((route) => route.path === path)
      .map((route) => route.auth);

    expect(authFor("/api/v1/wager/sessions")).toEqual(["space-service"]);
    expect(authFor("/api/v1/space-llm/generate")).toEqual(["space-llm"]);
  });

  it("contains no known stale endpoint literals in command sources", () => {
    const source = [
      ...readProductionTypeScriptSources(commandsDirectory),
      ...readProductionTypeScriptSources(openClawSourceDirectory),
    ].join("\n");
    for (const stale of [
      "/api/v1/auto-send",
      "/api/v1/wiki",
      "/api/v1/creator/agents",
      "/api/v1/creator/community",
      "/api/themes/",
      "/api/creator/stickers/",
    ]) {
      expect(source).not.toContain(stale);
    }
  });

  it("maps every literal CLI method/path call to a server route", () => {
    const files = readProductionTypeScriptSources(commandsDirectory);
    const calls = new Set<string>();
    const add = (method: string, rawPath: string) => {
      const path = rawPath
        .replace(/^\$\{apiUrl\}/, "")
        .replace(/\$\{buildQuery\([\s\S]*$/, "")
        .replace(/(?<!\/)\$\{[\s\S]*$/, "")
        .split("?")[0]
        .replace(/\$\{[^}]+\}/g, "{param}");
      if (path.startsWith("/api/v1")) calls.add(`${method} ${path}`);
    };
    for (const source of files) {
      for (const match of source.matchAll(/\b(get|post|put|patch|del|delete|upload|download)\(\s*([`'"])(\/api\/v1[\s\S]*?)\2/g)) {
        const method = ({ del: "DELETE", delete: "DELETE", upload: "POST", download: "GET" } as Record<string, string>)[match[1]] ?? match[1].toUpperCase();
        add(method, match[3]);
      }
      for (const match of source.matchAll(/apiCall\(\{\s*method:\s*"(GET|POST|PUT|PATCH|DELETE)"[\s\S]*?url:\s*`(\$\{apiUrl\}\/api\/v1[^`]*)`/g)) {
        add(match[1], match[2]);
      }
    }
    const matches = (cliPath: string, serverPath: string) => {
      const left = cliPath.split("/");
      const right = serverPath.split("/");
      return left.length === right.length && left.every((part, index) =>
        part === "{param}" || /^\{[^}]+\}$/.test(right[index]) || part === right[index]
      );
    };
    const missing = [...calls].filter((call) => {
      const separator = call.indexOf(" ");
      const method = call.slice(0, separator);
      const path = call.slice(separator + 1);
      return !fixture.routes.some((route) => route.method === method && matches(path, route.path));
    });
    expect(missing).toEqual([]);
  });
});
