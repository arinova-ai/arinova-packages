import { Command } from "commander";
import { request } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEndpoint: vi.fn(() => "https://api.example.test"),
  getEnvironmentLabel: vi.fn(() => "test"),
  getProfile: vi.fn(),
  listProfiles: vi.fn(() => []),
  loadConfig: vi.fn(() => ({})),
  printError: vi.fn(),
  printNote: vi.fn(),
  printResult: vi.fn(),
  printSuccess: vi.fn(),
  resolveApiKey: vi.fn(),
  resolveProfileName: vi.fn(),
  saveConfig: vi.fn(),
  setProfile: vi.fn(),
  spawn: vi.fn((_command?: string, _args?: string[]) => ({ unref: vi.fn() })),
}));

vi.mock("../config.js", () => ({
  getEndpoint: mocks.getEndpoint,
  getEnvironmentLabel: mocks.getEnvironmentLabel,
  getProfile: mocks.getProfile,
  listProfiles: mocks.listProfiles,
  loadConfig: mocks.loadConfig,
  resolveApiKey: mocks.resolveApiKey,
  resolveProfileName: mocks.resolveProfileName,
  saveConfig: mocks.saveConfig,
  setProfile: mocks.setProfile,
}));

vi.mock("../output.js", () => ({
  printError: mocks.printError,
  printNote: mocks.printNote,
  printResult: mocks.printResult,
  printSuccess: mocks.printSuccess,
}));

vi.mock("node:child_process", () => ({
  spawn: mocks.spawn,
}));

const { registerAuth, waitForLoginCallback } = await import("./auth.js");

function callback(port: number, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path }, (res) => {
      res.resume();
      res.once("end", () => resolve(res.statusCode ?? 0));
    });
    req.once("error", reject);
    req.end();
  });
}

function createProgram() {
  const program = new Command();
  program.exitOverride();
  program.name("arinova");
  program.option("--profile <name>");
  program.option("--token <token>");
  registerAuth(program);
  return program;
}

describe("auth command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("set-token writes a bot profile from --profile", async () => {
    const program = createProgram();

    await program.parseAsync(["node", "arinova", "--profile", "agent-a", "auth", "set-token", "ari_token_123"]);

    expect(mocks.setProfile).toHaveBeenCalledWith("agent-a", {
      type: "bot",
      apiKey: "ari_token_123",
    });
    expect(mocks.printSuccess).toHaveBeenCalledWith("Bot profile 'agent-a' saved (key stored securely)");
  });

  it("set-token rejects invalid key formats before saving", async () => {
    const program = createProgram();

    await expect(program.parseAsync([
      "node", "arinova", "--profile", "agent-a", "auth", "set-token", "bad-token",
    ])).rejects.toThrow("Invalid key format");

    expect(mocks.setProfile).not.toHaveBeenCalled();
  });

  it("whoami checks bot identity with bearer auth first", async () => {
    mocks.resolveApiKey.mockReturnValue({
      apiKey: "ari_user_123",
      profileName: "default",
      source: "profile",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "agent-1", name: "Agent One" }), { status: 200 }),
    );
    const program = createProgram();

    await program.parseAsync(["node", "arinova", "auth", "whoami"]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/agent/me",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer ari_user_123" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(mocks.printResult).toHaveBeenCalledWith(expect.objectContaining({
      identityType: "bot",
      agentId: "agent-1",
      agentName: "Agent One",
      key: "<redacted>",
    }));
  });

  it("accepts only the exact callback path and matching one-time state", async () => {
    const port = 19_000 + Math.floor(Math.random() * 10_000);
    const result = waitForLoginCallback(port, "expected-state", 2_000);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(await callback(port, "/wrong?key=ari_attacker&state=expected-state")).toBe(404);
    expect(await callback(port, "/callback?key=ari_attacker&state=wrong")).toBe(404);
    expect(await callback(port, "/callback?key=bad&state=expected-state")).toBe(400);
    expect(await callback(port, "/callback?key=ari_valid&state=expected-state")).toBe(200);
    await expect(result).resolves.toBe("ari_valid");
  });

  it("persists only a server-confirmed key from the active browser flow", async () => {
    const port = 29_000 + Math.floor(Math.random() * 10_000);
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        nonce: "a".repeat(64),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        username: "Alice",
      }), { status: 200 }));
    mocks.spawn.mockImplementationOnce((_command?: string, args?: string[]) => {
      const loginUrl = new URL(args!.at(-1)!);
      void callback(
        port,
        `/callback?key=ari_confirmed&state=${loginUrl.searchParams.get("state")}`,
      );
      return { unref: vi.fn() };
    });

    const program = createProgram();
    await program.parseAsync([
      "node", "arinova", "auth", "login", "--port", String(port),
    ]);

    expect(mocks.setProfile).toHaveBeenCalledWith("alice", {
      type: "user",
      apiKey: "ari_confirmed",
    });
  });

  it("does not persist a callback key when identity confirmation fails", async () => {
    const port = 39_000 + Math.floor(Math.random() * 10_000);
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        nonce: "a".repeat(64),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    mocks.spawn.mockImplementationOnce((_command?: string, args?: string[]) => {
      const loginUrl = new URL(args!.at(-1)!);
      void callback(
        port,
        `/callback?key=ari_unconfirmed&state=${loginUrl.searchParams.get("state")}`,
      );
      return { unref: vi.fn() };
    });

    const program = createProgram();
    await expect(program.parseAsync([
      "node", "arinova", "auth", "login", "--port", String(port),
    ])).rejects.toThrow("401");

    expect(mocks.setProfile).not.toHaveBeenCalled();
  });

  it("reports an HTML registration failure without an opaque JSON parse error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("<html>bad gateway</html>", {
      status: 502,
      headers: { "content-type": "text/html" },
    }));
    const program = createProgram();
    await expect(program.parseAsync([
      "node", "arinova", "auth", "login", "--port", "31001",
    ])).rejects.toThrow("502");
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
