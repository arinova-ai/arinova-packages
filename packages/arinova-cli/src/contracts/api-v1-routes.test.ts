import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

describe("API v1 route contract fixture", () => {
  it("pins the inventoried server commit and complete route count", () => {
    expect(fixture.sourceCommit).toBe(
      "33b7c06ad9df8b9cb5ab9e21fff109955a3cc3cc",
    );
    expect(fixture.routeCount).toBe(378);
    expect(fixture.routes).toHaveLength(fixture.routeCount);
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

  it("contains no known stale endpoint literals in command sources", () => {
    const source = readdirSync(commandsDirectory)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .map((name) => readFileSync(join(commandsDirectory, name), "utf8"))
      .join("\n");
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
});
