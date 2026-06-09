import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getApiKey: vi.fn(() => "ari_cli_token"),
  getEndpoint: vi.fn(() => "https://chat.example.test"),
  printError: vi.fn(),
  printSuccess: vi.fn(),
}));

vi.mock("../config.js", () => ({
  getApiKey: mocks.getApiKey,
  getEndpoint: mocks.getEndpoint,
}));

vi.mock("../output.js", () => ({
  printError: mocks.printError,
  printSuccess: mocks.printSuccess,
}));

const { registerSetupOpenclaw, writeConfigWithRollback } = await import("./setup-openclaw.js");

const tempDirs: string[] = [];

function createProgram() {
  const program = new Command();
  program.exitOverride();
  program.name("arinova");
  program.option("--api-url <url>");
  registerSetupOpenclaw(program);
  return program;
}

async function writeOpenclawConfig(config: unknown) {
  const dir = await mkdtemp(join(tmpdir(), "arinova-cli-openclaw-"));
  tempDirs.push(dir);
  const path = join(dir, "openclaw.json");
  await writeFile(path, JSON.stringify(config, null, 2) + "\n");
  return path;
}

async function readJson(path: string) {
  return JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/agents") && init?.method === "GET") {
      return new Response(JSON.stringify({
        agents: [
          { id: "remote-1", name: "Ada", botToken: "ari_ada_token" },
        ],
      }), { status: 200 });
    }
    if (url.endsWith("/api/agents") && init?.method === "POST") {
      return new Response(JSON.stringify({
        id: "remote-created",
        name: "Grace",
        secretToken: "ari_grace_token",
      }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("setup-openclaw command", () => {
  it("merges existing channel accounts and bindings without force", async () => {
    const configPath = await writeOpenclawConfig({
      plugins: { entries: { "openclaw-arinova-ai": {} }, allow: [] },
      agents: {
        list: [
          { id: "ada", name: "Ada" },
          { id: "grace", name: "Grace" },
        ],
      },
      channels: {
        "openclaw-arinova-ai": {
          accounts: {
            ada: { enabled: true, botToken: "ari_existing_ada" },
          },
        },
      },
      bindings: [],
    });
    const program = createProgram();

    await program.parseAsync(["node", "arinova", "setup-openclaw", "--workspace", configPath]);

    const updated = await readJson(configPath);
    const channel = (updated.channels as Record<string, Record<string, unknown>>)["openclaw-arinova-ai"];
    expect(channel).toMatchObject({
      enabled: true,
      apiUrl: "https://api.chat.example.test",
      accounts: {
        ada: { enabled: true, botToken: "ari_existing_ada" },
        grace: { enabled: true, botToken: "ari_grace_token" },
      },
    });
    expect((updated.plugins as Record<string, unknown>).allow).toContain("openclaw-arinova-ai");
    expect(updated.bindings).toEqual(expect.arrayContaining([
      { agentId: "ada", match: { channel: "openclaw-arinova-ai", accountId: "ada" } },
      { agentId: "grace", match: { channel: "openclaw-arinova-ai", accountId: "grace" } },
    ]));
    expect(mocks.printSuccess).toHaveBeenCalledWith("OpenClaw Arinova integration setup complete!");
  });

  it("uses agents.defaults and dry-run avoids backup and file writes", async () => {
    const original = {
      plugins: { installs: { "openclaw-arinova-ai": {} } },
      agents: { defaults: { id: "default-agent", name: "Ada" } },
    };
    const configPath = await writeOpenclawConfig(original);
    const program = createProgram();

    await program.parseAsync([
      "node",
      "arinova",
      "--api-url",
      "https://api.override.test/",
      "setup-openclaw",
      "--workspace",
      configPath,
      "--dry-run",
    ]);

    expect(await readJson(configPath)).toEqual(original);
    await expect(readFile(`${configPath}.bak`, "utf-8")).rejects.toThrow();
    expect(console.log).toHaveBeenCalledWith("\nDry run: openclaw.json was not modified.");
    expect(mocks.printSuccess).toHaveBeenCalledWith("OpenClaw Arinova integration dry run complete.");
  });

  it("reports configuration failures before calling the API", async () => {
    mocks.getApiKey.mockReturnValueOnce("");
    const configPath = await writeOpenclawConfig({});
    const program = createProgram();

    await program.parseAsync(["node", "arinova", "setup-openclaw", "--workspace", configPath]);

    expect(mocks.printError).toHaveBeenCalledWith("No API key configured. Please run `arinova auth login` first");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("restores the backup when writing the updated config fails", () => {
    const ops = {
      writeFileSync: vi.fn(() => {
        throw new Error("disk full");
      }),
      copyFileSync: vi.fn(),
    };

    expect(() =>
      writeConfigWithRollback(
        "/tmp/openclaw.json",
        "/tmp/openclaw.json.bak",
        "{\"channels\":{}}\n",
        ops as never,
      ),
    ).toThrow("disk full");

    expect(ops.writeFileSync).toHaveBeenCalledWith(
      "/tmp/openclaw.json",
      "{\"channels\":{}}\n",
      "utf-8",
    );
    expect(ops.copyFileSync).toHaveBeenCalledWith(
      "/tmp/openclaw.json.bak",
      "/tmp/openclaw.json",
    );
  });
});
