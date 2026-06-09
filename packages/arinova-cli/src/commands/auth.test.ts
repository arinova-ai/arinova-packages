import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEndpoint: vi.fn(() => "https://api.example.test"),
  getEnvironmentLabel: vi.fn(() => "test"),
  getProfile: vi.fn(),
  listProfiles: vi.fn(() => []),
  loadConfig: vi.fn(() => ({})),
  printError: vi.fn(),
  printResult: vi.fn(),
  printSuccess: vi.fn(),
  resolveApiKey: vi.fn(),
  resolveProfileName: vi.fn(),
  saveConfig: vi.fn(),
  setProfile: vi.fn(),
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
  printResult: mocks.printResult,
  printSuccess: mocks.printSuccess,
}));

const { registerAuth } = await import("./auth.js");

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
    expect(mocks.printSuccess).toHaveBeenCalledWith("Bot profile 'agent-a' saved (key: ari_token_12...)");
  });

  it("set-token rejects invalid key formats before saving", async () => {
    const program = createProgram();

    await program.parseAsync(["node", "arinova", "--profile", "agent-a", "auth", "set-token", "bad-token"]);

    expect(mocks.setProfile).not.toHaveBeenCalled();
    expect(mocks.printError).toHaveBeenCalledWith(new Error("Invalid key format. Expected key starting with ari_"));
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

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/api/agent/me", {
      headers: { Authorization: "Bearer ari_user_123" },
    });
    expect(mocks.printResult).toHaveBeenCalledWith(expect.objectContaining({
      identityType: "bot",
      agentId: "agent-1",
      agentName: "Agent One",
      keyPrefix: "ari_user_123...",
    }));
  });
});
