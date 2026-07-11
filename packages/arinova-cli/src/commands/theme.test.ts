import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import { readFileSync, mkdtempSync, existsSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  registerTheme,
  slugifyThemeId,
  validateManifestForBuild,
  scaffoldThemeJs,
  generateDevHtml,
} from "./theme.js";
import { THEME_BRIDGE } from "../generated/theme-bridge.js";
import { createZip } from "../zip.js";

const bridgePath = fileURLToPath(new URL("../../../theme-sdk/src/bridge.js", import.meta.url));
const bridgeSource = readFileSync(bridgePath, "utf-8");

// ── Minimal STORED-zip reader for round-trip validation ──
function unzipStored(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let p = buf.length - 22;
  while (p >= 0 && buf.readUInt32LE(p) !== 0x06054b50) p--;
  if (p < 0) throw new Error("no EOCD");
  const count = buf.readUInt16LE(p + 10);
  let cd = buf.readUInt32LE(p + 16);
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(cd)).toBe(0x02014b50);
    const size = buf.readUInt32LE(cd + 24);
    const nameLen = buf.readUInt16LE(cd + 28);
    const extraLen = buf.readUInt16LE(cd + 30);
    const commentLen = buf.readUInt16LE(cd + 32);
    const lho = buf.readUInt32LE(cd + 42);
    const name = buf.toString("utf-8", cd + 46, cd + 46 + nameLen);
    expect(buf.readUInt32LE(lho)).toBe(0x04034b50);
    const lNameLen = buf.readUInt16LE(lho + 26);
    const lExtraLen = buf.readUInt16LE(lho + 28);
    const dataStart = lho + 30 + lNameLen + lExtraLen;
    out.set(name, Buffer.from(buf.subarray(dataStart, dataStart + size)));
    cd += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

describe("theme bridge parity with @arinova-ai/theme-sdk", () => {
  it("dev bridge is byte-identical to the published bridge.js", () => {
    // Enforces the single-source-of-truth: run `pnpm build` to regenerate if this fails.
    expect(THEME_BRIDGE).toBe(bridgeSource);
  });

  it("bridge.js implements the real runtime protocol", () => {
    expect(bridgeSource).toContain("bridgeToken");
    expect(bridgeSource).toContain("__ARINOVA_PARENT_ORIGIN__");
    expect(bridgeSource).toContain("e.source !== window.parent");
    expect(bridgeSource).toContain("onResize");
    expect(bridgeSource).toContain("onConnectedAgentsChange");
  });

  it("bridge.js does not carry the removed/insecure surface", () => {
    expect(bridgeSource).not.toContain('postMessage(msg, "*")');
    expect(bridgeSource).not.toContain('postMessage(payload, "*")');
    expect(bridgeSource).not.toContain("__ARINOVA_SDK__");
    expect(bridgeSource).not.toMatch(/\bloadJSON\b/);
    expect(bridgeSource).not.toMatch(/\bloadFont\b/);
    expect(bridgeSource).not.toMatch(/\bgetAgent\b/);
    expect(bridgeSource).not.toMatch(/emit:/);
  });
});

describe("slugifyThemeId", () => {
  it("produces valid kebab-case ids", () => {
    expect(slugifyThemeId("My Cool Theme")).toBe("my-cool-theme");
    expect(slugifyThemeId("  Spaces & Symbols!! ")).toBe("spaces-symbols");
    expect(slugifyThemeId("Café 2000")).toBe("caf-2000");
    expect(slugifyThemeId("!!!")).toBe("my-theme");
    expect(slugifyThemeId("already-kebab")).toBe("already-kebab");
    expect(slugifyThemeId("My Cool Theme")).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
  });
});

describe("validateManifestForBuild", () => {
  const base = { id: "my-theme", name: "My Theme", version: "1.0.0", entry: "theme.js" };
  it("accepts a valid manifest", () => {
    expect(validateManifestForBuild(base)).toBeNull();
  });
  it("rejects bad id / version / name / entry / price", () => {
    expect(validateManifestForBuild({ ...base, id: "Bad Id" })).toMatch(/kebab/);
    expect(validateManifestForBuild({ ...base, version: "1.0" })).toMatch(/semver/);
    expect(validateManifestForBuild({ ...base, name: "" })).toMatch(/1-100/);
    expect(validateManifestForBuild({ ...base, entry: undefined })).toMatch(/entry/);
    expect(validateManifestForBuild({ ...base, price: -1 })).toMatch(/price/);
  });
});

describe("scaffoldThemeJs", () => {
  const js = scaffoldThemeJs("Demo");
  it("is runtime-correct and CSP-safe", () => {
    expect(js).toContain("sdk.agents");
    expect(js).toContain("sdk.onAgentsChange");
    expect(js).toContain("sdk.onResize");
    expect(js).toContain("a.currentTask"); // used as a string
    expect(js).not.toContain(".currentTask.title");
    expect(js).not.toContain("sdk.emit");
    expect(js).not.toContain("sdk.getAgent");
    expect(js).not.toContain("<style>");
    // No dead resize()/destroy() module-hook exports (onResize subscription is fine).
    expect(js).not.toMatch(/^\s*resize\s*\(/m);
    expect(js).not.toMatch(/^\s*destroy\s*\(/m);
  });
});

describe("generateDevHtml", () => {
  const html = generateDevHtml("demo-theme", "Demo Theme");
  it("mirrors the production runtime handshake", () => {
    expect(html).toContain('src="/bridge.js"');
    expect(html).toContain('import theme from "/theme.js"');
    expect(html).toContain("__ARINOVA_PARENT_ORIGIN__ = location.origin");
    expect(html).toContain("bridgeToken=arinova-dev");
    expect(html).toContain('case "ready"'); // host emulator responds to ready...
    expect(html).toContain('type: "init"'); // ...by sending init
    expect(html).toContain("currentTask:"); // string-shaped mock agents
    expect(html).not.toContain("collaboratingWith");
    expect(html).not.toContain("sessionDurationMs");
  });
});

describe("createZip", () => {
  it("round-trips flat STORED entries", () => {
    const entries = [
      { name: "theme.json", data: Buffer.from('{"id":"x"}') },
      { name: "theme.js", data: Buffer.from("export default {};") },
      { name: "preview.png", data: Buffer.from([1, 2, 3, 4, 5]) },
    ];
    const zip = createZip(entries);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50); // starts with a local header
    const back = unzipStored(zip);
    expect([...back.keys()].sort()).toEqual(["preview.png", "theme.js", "theme.json"]);
    expect(back.get("theme.js")!.toString()).toBe("export default {};");
    expect([...back.get("preview.png")!]).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("init → build (end to end)", () => {
  let workdir: string;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    workdir = mkdtempSync(join(tmpdir(), "arinova-theme-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    process.chdir(origCwd);
    vi.restoreAllMocks();
    rmSync(workdir, { recursive: true, force: true });
  });

  function makeProgram(): Command {
    const program = new Command();
    program.exitOverride();
    registerTheme(program);
    return program;
  }

  it("scaffolds an uploadable theme and builds a flat bundle", async () => {
    process.chdir(workdir);
    await makeProgram().parseAsync(["theme", "init", "My Theme"], { from: "user" });

    const themeDir = join(workdir, "My Theme");
    expect(existsSync(join(themeDir, "theme.json"))).toBe(true);
    expect(existsSync(join(themeDir, "theme.js"))).toBe(true);
    expect(existsSync(join(themeDir, "preview.png"))).toBe(true);
    // No assets/ subfolder is scaffolded (production serves a flat namespace).
    expect(readdirSync(themeDir)).not.toContain("assets");

    const manifest = JSON.parse(readFileSync(join(themeDir, "theme.json"), "utf-8"));
    expect(manifest.id).toBe("my-theme");
    expect(manifest.entry).toBe("theme.js");
    expect(manifest.preview).toBe("preview.png");
    expect(manifest.license).toBe("standard");
    expect(manifest.author).toBeDefined();
    // The scaffold must satisfy the same rules the server enforces.
    expect(validateManifestForBuild(manifest)).toBeNull();

    process.chdir(themeDir);
    await makeProgram().parseAsync(["theme", "build"], { from: "user" });

    const zipPath = join(themeDir, "my-theme.zip");
    expect(existsSync(zipPath)).toBe(true);
    const back = unzipStored(readFileSync(zipPath));
    const names = [...back.keys()];
    // Flat entries, no nesting.
    expect(names).toContain("theme.json");
    expect(names).toContain("theme.js");
    expect(names).toContain("preview.png");
    expect(names.every((n) => !n.includes("/"))).toBe(true);

    const themeJs = back.get("theme.js")!.toString();
    expect(themeJs).toContain("sdk.onResize");
    expect(themeJs).not.toContain(".currentTask.title");
  });
});
