import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiKey: vi.fn(),
  getEndpoint: vi.fn(() => "https://api.example.test"),
}));

vi.mock("./config.js", () => ({
  resolveApiKey: mocks.resolveApiKey,
  getEndpoint: mocks.getEndpoint,
}));

const { ApiClient } = await import("./client.js");
const { apiCall, getOpts } = await import("./api.js");

function command(args: string[]) {
  const program = new Command().exitOverride()
    .option("--profile <name>")
    .option("--token <token>")
    .option("--api-url <url>");
  program.command("show").action(() => {});
  program.parse(["node", "arinova", ...args]);
  return program.commands[0];
}

describe("legacy API adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves the selected profile and endpoint exactly once", () => {
    mocks.resolveApiKey.mockReturnValue({ apiKey: "ari_selected", profileName: "selected" });
    expect(getOpts(command(["--profile", "selected", "--api-url", "https://custom.test/", "show"]))).toEqual({
      token: "ari_selected", apiUrl: "https://custom.test", profileName: "selected",
    });
    expect(mocks.resolveApiKey).toHaveBeenCalledWith({ token: undefined, profile: "selected" });
  });

  it("propagates missing-profile errors without a fallback token", () => {
    mocks.resolveApiKey.mockImplementation(() => { throw new Error("Profile 'missing' not found"); });
    expect(() => getOpts(command(["--profile", "missing", "show"]))).toThrow("Profile 'missing' not found");
  });

  it("converts an absolute URL into an ApiClient request", async () => {
    const request = vi.spyOn(ApiClient.prototype, "request").mockResolvedValue({ ok: true });
    await expect(apiCall({
      method: "PATCH",
      url: "https://api.example.test/api/v1/items/a?x=1",
      token: "ari_token",
      body: { name: "n" },
    })).resolves.toEqual({ ok: true });
    expect(request).toHaveBeenCalledWith({
      method: "PATCH", path: "/api/v1/items/a?x=1", body: { name: "n" }, headers: undefined,
    });
  });
});
