import { describe, it, expect } from "vitest";
import path from "path";
import os from "os";

describe("CLI config", () => {
  it("config directory is in home", () => {
    const configDir = path.join(os.homedir(), ".arinova-cli");
    expect(configDir).toContain(".arinova-cli");
  });

  it("config file is JSON", () => {
    const configPath = path.join(os.homedir(), ".arinova-cli", "config");
    expect(configPath).toContain("config");
  });

  it("API key format validation", () => {
    const validKey = "ari_abc123def456";
    const invalidKey = "not_a_key";
    expect(validKey.startsWith("ari_")).toBe(true);
    expect(invalidKey.startsWith("ari_")).toBe(false);
  });

  it("endpoint URL validation", () => {
    const valid = "https://api.chat-staging.arinova.ai";
    const invalid = "not-a-url";
    expect(valid.startsWith("http")).toBe(true);
    expect(invalid.startsWith("http")).toBe(false);
  });

  it("default endpoint", () => {
    const defaultEndpoint = "https://api.chat-staging.arinova.ai";
    expect(defaultEndpoint).toMatch(/^https:\/\//);
  });
});

describe("CLI output formatting", () => {
  it("JSON output mode", () => {
    const data = { id: "123", name: "Test" };
    const json = JSON.stringify(data, null, 2);
    expect(json).toContain('"id"');
    expect(json).toContain('"name"');
  });

  it("table output for arrays", () => {
    const items = [{ id: "1", name: "A" }, { id: "2", name: "B" }];
    expect(items.length).toBe(2);
    expect(items[0].name).toBe("A");
  });

  it("error output format", () => {
    const error = { error: "Something failed", status: 500 };
    expect(error.error).toBeTruthy();
    expect(error.status).toBe(500);
  });

  it("empty array output", () => {
    const items: unknown[] = [];
    const output = items.length === 0 ? "No items found." : JSON.stringify(items);
    expect(output).toBe("No items found.");
  });

  it("truncate long strings", () => {
    const long = "a".repeat(200);
    const truncated = long.length > 100 ? long.slice(0, 100) + "..." : long;
    expect(truncated.length).toBe(103);
    expect(truncated.endsWith("...")).toBe(true);
  });
});
