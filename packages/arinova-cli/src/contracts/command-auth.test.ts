import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface AuthRule {
  commands: string[];
  identities: string[];
}

interface CommandAuthMatrix {
  schemaVersion: number;
  sourceCommit: string;
  rules: AuthRule[];
}

const matrix = JSON.parse(readFileSync(
  new URL("./command-auth.json", import.meta.url),
  "utf8",
)) as CommandAuthMatrix;
const routeFixture = JSON.parse(readFileSync(
  new URL("./api-v1-routes.json", import.meta.url),
  "utf8",
)) as { sourceCommit: string };

const expectedTopLevel = [
  "action", "agent", "app", "auth", "auto-send", "autopilot", "calendar",
  "chat", "community", "completion", "config", "conversation", "cron",
  "delivery", "doc", "economy", "expert", "external-image", "file", "form",
  "image", "kanban", "list", "memo", "memory", "message",
  "mindmap", "note", "notebook", "painter", "profile", "resolve", "search",
  "setup-openclaw", "skill", "skill-package", "slide", "space", "stats",
  "sticker", "theme", "trigger", "user", "webhook", "workbook",
  "workflow",
];

describe("command auth matrix", () => {
  it("is pinned to the same server commit as the route fixture", () => {
    expect(matrix.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(matrix.sourceCommit).toBe(routeFixture.sourceCommit);
  });

  it("classifies every top-level command and uses known identities", () => {
    const classified = new Set(matrix.rules.flatMap((rule) =>
      rule.commands.map((command) => command.split(" ")[0])
    ));
    expect([...classified].sort()).toEqual(expectedTopLevel);
    expect(matrix.rules.flatMap((rule) => rule.identities).every((identity) =>
      ["userApiKey", "botToken", "oauthUser", "local"].includes(identity)
    )).toBe(true);
  });

  it("classifies Space runtime storage as OAuth-only", () => {
    const storageRule = matrix.rules.find((rule) =>
      rule.commands.includes("space storage")
    );

    expect(storageRule?.identities).toEqual(["oauthUser"]);
  });
});
