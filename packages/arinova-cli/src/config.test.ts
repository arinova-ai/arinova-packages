import { mkdtemp, rm } from "node:fs/promises";
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
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => config.resolveProfileName()).toThrow("exit");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("uses env endpoint first and trims trailing slashes", async () => {
    vi.stubEnv("ARINOVA_ENDPOINT", "https://api.example.test///");
    const config = await loadConfigModule();

    expect(config.getEndpoint()).toBe("https://api.example.test");
  });

  it("uses configured endpoint when env is absent", async () => {
    const config = await loadConfigModule();
    config.saveConfig({ endpoint: "https://configured.example.test" });

    expect(config.getEndpoint()).toBe("https://configured.example.test");
  });
});
