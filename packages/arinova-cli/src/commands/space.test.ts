import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildSpaceProject,
  validateSpaceManifestForBuild,
} from "./space-build.js";
import { scaffoldSpaceProject } from "./space-scaffold.js";
import { friendlySpaceError } from "./space.js";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "arinova-space-"));
  temporaryDirectories.push(directory);
  return directory;
}

function unzipStored(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("ZIP end record not found");
  const count = buffer.readUInt16LE(end + 10);
  let central = buffer.readUInt32LE(end + 16);
  for (let index = 0; index < count; index += 1) {
    const compressedSize = buffer.readUInt32LE(central + 20);
    const size = buffer.readUInt32LE(central + 24);
    const method = buffer.readUInt16LE(central + 10);
    const nameLength = buffer.readUInt16LE(central + 28);
    const extraLength = buffer.readUInt16LE(central + 30);
    const commentLength = buffer.readUInt16LE(central + 32);
    const localOffset = buffer.readUInt32LE(central + 42);
    const name = buffer.toString("utf8", central + 46, central + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const payload = Buffer.from(buffer.subarray(start, start + compressedSize));
    const data = method === 8 ? inflateRawSync(payload) : payload;
    expect(data).toHaveLength(size);
    files.set(name, data);
    central += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("validateSpaceManifestForBuild", () => {
  const paths = new Set(["space.json", "index.html", "assets/app.js"]);
  const manifest = {
    id: "oauth-client-1",
    version: "1.2.3-beta.1+build.4",
    entry: "index.html",
    assets: ["assets/app.js"],
    declaredApiOrigins: ["https://api.chat.arinova.ai"],
    requestedScopes: ["profile", "economy"],
  };

  it("accepts the server manifest contract", () => {
    expect(validateSpaceManifestForBuild(manifest, paths)).toBeNull();
  });

  it("rejects unknown fields, placeholders, invalid SemVer, and missing entries", () => {
    expect(validateSpaceManifestForBuild({ ...manifest, iframeUrl: "https://example.test" }, paths)).toMatch(/unknown field/);
    expect(validateSpaceManifestForBuild({ ...manifest, id: "YOUR_OAUTH_CLIENT_ID" }, paths)).toMatch(/Client ID/);
    expect(validateSpaceManifestForBuild({ ...manifest, version: "01.2.3" }, paths)).toMatch(/SemVer/);
    expect(validateSpaceManifestForBuild({ ...manifest, entry: "missing.html" }, paths)).toMatch(/existing/);
  });

  it("rejects invalid assets, origins, and embedded scopes", () => {
    expect(validateSpaceManifestForBuild({ ...manifest, assets: ["../app.js"] }, paths)).toMatch(/assets/);
    expect(validateSpaceManifestForBuild({ ...manifest, declaredApiOrigins: ["https://api.test/path"] }, paths)).toMatch(/bare https/);
    expect(validateSpaceManifestForBuild({ ...manifest, declaredApiOrigins: ["https://api.test", "https://api.test"] }, paths)).toMatch(/duplicates/);
    expect(validateSpaceManifestForBuild({ ...manifest, requestedScopes: ["economy"] }, paths)).toMatch(/profile/);
    expect(validateSpaceManifestForBuild({ ...manifest, requestedScopes: ["profile", "email"] }, paths)).toMatch(/only profile/);
  });
});

describe("managed Space init and build", () => {
  it("scaffolds a token-bound project and creates a deterministic nested ZIP", () => {
    const parent = temporaryDirectory();
    const root = scaffoldSpaceProject("My Game", "https://api.chat.arinova.ai/path", parent);
    const manifestPath = join(root, "space.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.id).toBe("YOUR_OAUTH_CLIENT_ID");
    expect(manifest.declaredApiOrigins).toEqual(["https://api.chat.arinova.ai"]);

    manifest.id = "my-game-oauth";
    manifest.assets = ["app.js", "assets/icon.svg"];
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    mkdirSync(join(root, "assets"));
    writeFileSync(join(root, "assets", "icon.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");

    const first = buildSpaceProject(root);
    const firstBytes = readFileSync(first.outputPath);
    const second = buildSpaceProject(root);
    expect(readFileSync(second.outputPath)).toEqual(firstBytes);
    const files = unzipStored(firstBytes);
    expect([...files.keys()]).toEqual(["app.js", "assets/icon.svg", "index.html", "space.json"]);
    expect(JSON.parse(files.get("space.json")!.toString("utf8")).id).toBe("my-game-oauth");
    expect(second.skipped).toContain("dist/");
  });

  it("rejects unsupported files, HTML base elements, and symlinks", () => {
    const parent = temporaryDirectory();
    const unsupported = scaffoldSpaceProject("unsupported", "https://api.chat.arinova.ai", parent);
    writeFileSync(join(unsupported, "notes.txt"), "not allowed");
    expect(() => buildSpaceProject(unsupported)).toThrow(/Unsupported/);

    const htmlBase = scaffoldSpaceProject("html-base", "https://api.chat.arinova.ai", parent);
    writeFileSync(join(htmlBase, "index.html"), "<BASE href=\"https://evil.test\">");
    expect(() => buildSpaceProject(htmlBase)).toThrow(/<base>/i);

    const linked = scaffoldSpaceProject("linked", "https://api.chat.arinova.ai", parent);
    symlinkSync(join(linked, "app.js"), join(linked, "linked.js"));
    expect(() => buildSpaceProject(linked)).toThrow(/Symlinks/);
  });
});

describe("managed Space API errors", () => {
  it("turns lifecycle codes into actionable messages without losing metadata", () => {
    const error = friendlySpaceError({
      code: "SPACE_VERSION_EXISTS",
      status: 409,
      details: { version: "1.0.0" },
    }) as Error & { code?: string; status?: number; details?: unknown };
    expect(error.message).toMatch(/Bump.*version/i);
    expect(error).toMatchObject({ code: "SPACE_VERSION_EXISTS", status: 409 });

    const invalid = friendlySpaceError({
      code: "INVALID_SPACE_BUNDLE",
      status: 400,
      details: { reason: "missing_space_json" },
    });
    expect(invalid.message).toContain("missing_space_json");
  });
});
