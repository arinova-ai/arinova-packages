import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tempDirs: string[] = [];

async function loadConfigModule() {
  const home = await mkdtemp(join(tmpdir(), "arinova-cli-config-"));
  tempDirs.push(home);
  vi.resetModules();
  vi.doMock("node:os", () => ({ homedir: () => home }));
  return import("./config.js");
}

async function loadConfigModuleWithHome() {
  const home = await mkdtemp(join(tmpdir(), "arinova-cli-config-"));
  tempDirs.push(home);
  vi.resetModules();
  vi.doMock("node:os", () => ({ homedir: () => home }));
  return { config: await import("./config.js"), home };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("CLI config", () => {
  it("resolves --token before profiles", async () => {
    const config = await loadConfigModule();

    expect(config.resolveApiKey({ token: "ari_cli_inline" })).toEqual({
      apiKey: "ari_cli_inline",
      profileName: "(--token override)",
      source: "flag",
    });
  });

  it("saves and resolves a named profile", async () => {
    const config = await loadConfigModule();
    config.setProfile("staging", { type: "user", apiKey: "ari_cli_staging" });

    expect(config.resolveApiKey({ profile: "staging" })).toEqual({
      apiKey: "ari_cli_staging",
      profileName: "staging",
      source: "profile",
    });
    expect(config.listProfiles()).toEqual([
      { name: "staging", profile: { type: "user", apiKey: "ari_cli_staging" } },
    ]);
  });

  it("requires an explicit profile name when no --token override is provided", async () => {
    const config = await loadConfigModule();

    expect(() => config.resolveProfileName()).toThrow(
      "--profile <name> or ARINOVA_PROFILE is required",
    );
  });

  it("uses env endpoint first and trims trailing slashes", async () => {
    vi.stubEnv("ARINOVA_ENDPOINT", "https://api.example.test///");
    const config = await loadConfigModule();

    expect(config.getEndpoint()).toBe("https://api.example.test");
  });

  it.each([
    "http://localhost.attacker.test",
    "http://localhost@attacker.test",
    "http://127.0.0.1.attacker.test",
    "ftp://localhost",
  ])("rejects unsafe ARINOVA_ENDPOINT value %s", async (endpoint) => {
    vi.stubEnv("ARINOVA_ENDPOINT", endpoint);
    const config = await loadConfigModule();

    expect(() => config.getEndpoint()).toThrow();
  });

  it.each([
    "http://localhost:8787/",
    "http://127.0.0.1:8787/",
    "http://[::1]:8787/",
  ])("allows loopback development endpoint %s", async (endpoint) => {
    vi.stubEnv("ARINOVA_ENDPOINT", endpoint);
    const config = await loadConfigModule();

    expect(config.getEndpoint()).toBe(endpoint.replace(/\/$/, ""));
  });

  it("uses configured endpoint when env is absent", async () => {
    const config = await loadConfigModule();
    config.saveConfig({ endpoint: "https://configured.example.test" });

    expect(config.getEndpoint()).toBe("https://configured.example.test");
  });

  it("honors ARINOVA_PROFILE when the flag is absent", async () => {
    vi.stubEnv("ARINOVA_PROFILE", "env-profile");
    const config = await loadConfigModule();
    config.setProfile("env-profile", { type: "bot", apiKey: "ari_env" });
    expect(config.resolveApiKey({})).toMatchObject({ apiKey: "ari_env", profileName: "env-profile" });
  });

  it("backs up malformed config and refuses to overwrite it", async () => {
    const { config, home } = await loadConfigModuleWithHome();
    const directory = join(home, ".arinova-cli");
    const path = join(directory, "config");
    await mkdir(directory, { recursive: true });
    await writeFile(path, "{broken", "utf8");

    expect(() => config.setProfile("new", { type: "user", apiKey: "ari_new" })).toThrow("Config is malformed");
    expect(await readFile(path, "utf8")).toBe("{broken");
    const backups = (await readdir(directory)).filter((name) => name.startsWith("config.corrupt-") && name.endsWith(".bak"));
    expect(backups).toHaveLength(1);
    expect(await readFile(join(directory, backups[0]), "utf8")).toBe("{broken");
  });

  it("migrates the legacy key once and preserves the migrated profile", async () => {
    const { config, home } = await loadConfigModuleWithHome();
    const directory = join(home, ".arinova-cli");
    const path = join(directory, "config");
    await mkdir(directory, { recursive: true });
    await writeFile(path, JSON.stringify({ apiKey: "ari_legacy", tokenType: "bot" }), "utf8");
    const note = vi.spyOn(console, "error").mockImplementation(() => {});

    config.migrateConfigIfNeeded();
    config.migrateConfigIfNeeded();

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      profiles: { migrated: { type: "bot", apiKey: "ari_legacy" } },
    });
    expect(note).toHaveBeenCalledTimes(1);
  });
});
