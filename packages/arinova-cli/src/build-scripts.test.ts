import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { THEME_BRIDGE, THEME_BRIDGE_SOURCE_SHA256 } from "./generated/theme-bridge.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("CLI build scripts", () => {
  it("embeds the exact theme bridge and its SHA-256", () => {
    const source = readFileSync(resolve(packageRoot, "../theme-sdk/src/bridge.js"), "utf8");
    expect(THEME_BRIDGE).toBe(source);
    expect(THEME_BRIDGE_SOURCE_SHA256).toBe(
      createHash("sha256").update(source).digest("hex"),
    );
  });

  it("requires an explicit server checkout for route generation", () => {
    const env = { ...process.env };
    delete env.ARINOVA_SERVER_ROOT;
    const result = spawnSync(process.execPath, ["scripts/generate-v1-routes.mjs"], {
      cwd: packageRoot,
      env,
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("ARINOVA_SERVER_ROOT is required");
  });
});
