import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getApiKey: vi.fn(() => "ari_cli_token"),
  getEndpoint: vi.fn(() => "https://api.chat.arinova.ai"),
  resolveApiKey: vi.fn(() => ({
    apiKey: "ari_cli_token",
    profileName: "test",
    source: "test",
  })),
  printError: vi.fn(),
  printNote: vi.fn(),
  printWarning: vi.fn(),
  printSuccess: vi.fn(),
}));

vi.mock("../config.js", () => ({
  getApiKey: mocks.getApiKey,
  getEndpoint: mocks.getEndpoint,
  resolveApiKey: mocks.resolveApiKey,
}));

vi.mock("../output.js", () => ({
  printError: mocks.printError,
  printNote: mocks.printNote,
  printSuccess: mocks.printSuccess,
  printWarning: mocks.printWarning,
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
      apiUrl: "https://api.chat.arinova.ai",
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
    expect((await stat(configPath)).mode & 0o777).toBe(0o600);
    const backup = (await readdir(join(configPath, "..")))
      .find((name) => name.startsWith("openclaw.json.") && name.endsWith(".bak"));
    expect(backup).toBeDefined();
    expect((await stat(join(configPath, "..", backup!))).mode & 0o777).toBe(0o600);
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
      "https://api.chat-staging.arinova.ai/",
      "setup-openclaw",
      "--workspace",
      configPath,
      "--dry-run",
    ]);

    expect(await readJson(configPath)).toEqual(original);
    await expect(readFile(`${configPath}.bak`, "utf-8")).rejects.toThrow();
    expect(mocks.printNote).toHaveBeenCalledWith("\nDry run: openclaw.json was not modified.");
    expect(mocks.printSuccess).toHaveBeenCalledWith("OpenClaw Arinova integration dry run complete.");
  });

  it("reports configuration failures before calling the API", async () => {
    mocks.resolveApiKey.mockImplementationOnce(() => {
      throw new Error("missing profile");
    });
    const configPath = await writeOpenclawConfig({});
    const program = createProgram();

    await expect(program.parseAsync([
      "node", "arinova", "setup-openclaw", "--workspace", configPath,
    ])).rejects.toThrow("No API key configured");

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects an untrusted API host before attaching credentials", async () => {
    const configPath = await writeOpenclawConfig({
      plugins: { entries: { "openclaw-arinova-ai": {} } },
      agents: { list: [{ id: "ada", name: "Ada" }] },
    });

    await expect(createProgram().parseAsync([
      "node",
      "arinova",
      "--api-url",
      "https://attacker.example",
      "setup-openclaw",
      "--workspace",
      configPath,
    ])).rejects.toThrow("official HTTPS Arinova API host");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does not create bots after an unauthorized bot lookup", async () => {
    const configPath = await writeOpenclawConfig({
      plugins: { entries: { "openclaw-arinova-ai": {} }, allow: [] },
      agents: { list: [{ id: "ada", name: "Ada" }] },
    });
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }));

    await createProgram().parseAsync([
      "node", "arinova", "setup-openclaw", "--workspace", configPath,
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("GET");
    expect(mocks.printWarning).toHaveBeenCalledWith(expect.stringContaining("Authentication failed"));
    const updated = await readJson(configPath);
    expect((updated.channels as Record<string, { accounts: object }>)["openclaw-arinova-ai"].accounts).toEqual({});
  });

  it("restores the backup when writing the updated config fails", () => {
    const ops = {
      writeFileSync: vi.fn(() => {
        throw new Error("disk full");
      }),
      copyFileSync: vi.fn(),
      chmodSync: vi.fn(),
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
      { encoding: "utf-8", mode: 0o600 },
    );
    expect(ops.copyFileSync).toHaveBeenCalledWith(
      "/tmp/openclaw.json.bak",
      "/tmp/openclaw.json",
    );
    expect(ops.chmodSync).toHaveBeenCalledWith("/tmp/openclaw.json", 0o600);
  });

  it("never prints a raw create-bot response when no token field is recognized", async () => {
    const configPath = await writeOpenclawConfig({
      plugins: { entries: { "openclaw-arinova-ai": {} } },
      agents: { list: [{ id: "grace", name: "Grace" }] },
    });
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "created",
        privateCredential: "must-not-leak",
      })));

    await createProgram().parseAsync([
      "node", "arinova", "setup-openclaw", "--workspace", configPath,
    ]);

    const renderedNotes = mocks.printNote.mock.calls.flat().join("\n");
    expect(renderedNotes).not.toContain("must-not-leak");
    expect(renderedNotes).not.toContain("privateCredential");
    expect(renderedNotes).toContain("raw response data was not printed");
  });

  it("retains only the newest five managed backups", async () => {
    const configPath = await writeOpenclawConfig({
      plugins: { entries: { "openclaw-arinova-ai": {} } },
      agents: { list: [{ id: "ada", name: "Ada" }] },
    });
    const directory = join(configPath, "..");
    for (let index = 0; index < 6; index += 1) {
      await writeFile(
        join(directory, `openclaw.json.2025-01-0${index + 1}T00-00-00-000Z.bak`),
        "old backup",
      );
    }

    await createProgram().parseAsync([
      "node", "arinova", "setup-openclaw", "--workspace", configPath,
    ]);

    const backups = (await readdir(directory)).filter(
      (name) => name.startsWith("openclaw.json.") && name.endsWith(".bak"),
    );
    expect(backups).toHaveLength(5);
    for (const backup of backups) {
      expect((await stat(join(directory, backup))).mode & 0o777).toBe(0o600);
    }
  });
});
