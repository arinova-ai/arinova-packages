import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { createZip, isSafeNestedZipEntryName, type ZipEntry } from "../zip.js";

export const SPACE_BUNDLE_LIMITS = {
  archiveBytes: 20 * 1024 * 1024,
  manifestBytes: 256 * 1024,
  files: 512,
  fileBytes: 10 * 1024 * 1024,
  uncompressedBytes: 40 * 1024 * 1024,
  declaredOrigins: 8,
} as const;

export const SPACE_ALLOWED_EXTENSIONS = new Set([
  "html", "js", "mjs", "css", "json", "png", "jpg", "jpeg", "gif", "webp",
  "svg", "woff", "woff2", "ttf", "otf", "mp3", "ogg", "wav", "wasm",
]);

const SPACE_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/;
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const MANIFEST_KEYS = new Set([
  "id", "version", "entry", "name", "description", "assets",
  "declaredApiOrigins", "requestedScopes",
]);
const REQUESTED_SCOPES = new Set(["profile", "agents", "economy"]);
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "dist"]);

export interface SpaceManifestForBuild {
  id: string;
  version: string;
  entry: string;
  name?: string | null;
  description?: string | null;
  assets?: string[];
  declaredApiOrigins?: string[];
  requestedScopes?: string[];
}

export interface BuiltSpaceBundle {
  outputPath: string;
  archiveBytes: number;
  uncompressedBytes: number;
  fileCount: number;
  manifest: SpaceManifestForBuild;
  skipped: string[];
}

function isBareHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      url.href.replace(/\/$/, "") === value.replace(/\/$/, "");
  } catch {
    return false;
  }
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Mirror the managed Space manifest checks enforced by the server. */
export function validateSpaceManifestForBuild(
  manifest: unknown,
  paths: ReadonlySet<string>,
): string | null {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return "space.json must be a JSON object.";
  }
  const m = manifest as Record<string, unknown>;
  const unknown = Object.keys(m).filter((key) => !MANIFEST_KEYS.has(key));
  if (unknown.length > 0) {
    return `space.json contains unknown field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`;
  }
  if (m.id === "YOUR_OAUTH_CLIENT_ID") {
    return "Replace space.json 'id' with the Client ID returned by `arinova app create`.";
  }
  if (typeof m.id !== "string" || !SPACE_ID_RE.test(m.id)) {
    return "space.json 'id' must exactly match an OAuth Client ID: 1-128 lowercase ASCII letters, numbers, or hyphens.";
  }
  if (typeof m.version !== "string" || !SEMVER_RE.test(m.version)) {
    return "space.json 'version' must be valid SemVer (for example, 1.0.0).";
  }
  if (
    typeof m.entry !== "string" ||
    !isSafeNestedZipEntryName(m.entry) ||
    !m.entry.endsWith(".html") ||
    !paths.has(m.entry)
  ) {
    return "space.json 'entry' must name an existing safe .html file in the bundle.";
  }
  if (m.name != null && typeof m.name !== "string") {
    return "space.json 'name' must be a string when provided.";
  }
  if (m.description != null && typeof m.description !== "string") {
    return "space.json 'description' must be a string when provided.";
  }
  const assets = m.assets ?? [];
  if (
    !stringArray(assets) ||
    assets.length > SPACE_BUNDLE_LIMITS.files ||
    assets.some((asset) => !isSafeNestedZipEntryName(asset) || !paths.has(asset))
  ) {
    return "space.json 'assets' must contain at most 512 existing safe bundle paths.";
  }
  const origins = m.declaredApiOrigins ?? [];
  if (
    !stringArray(origins) ||
    origins.length > SPACE_BUNDLE_LIMITS.declaredOrigins ||
    origins.some((origin) => !isBareHttpsOrigin(origin))
  ) {
    return "space.json 'declaredApiOrigins' must contain at most 8 bare https origins (no path, query, credentials, or fragment).";
  }
  if (new Set(origins).size !== origins.length) {
    return "space.json 'declaredApiOrigins' must not contain duplicates.";
  }
  const scopes = m.requestedScopes ?? ["profile"];
  if (
    !stringArray(scopes) ||
    scopes.length < 1 ||
    scopes.length > 3 ||
    !scopes.includes("profile") ||
    scopes.some((scope) => !REQUESTED_SCOPES.has(scope))
  ) {
    return "space.json 'requestedScopes' must contain profile and only profile, agents, or economy (at most 3).";
  }
  if (new Set(scopes).size !== scopes.length) {
    return "space.json 'requestedScopes' must not contain duplicates.";
  }
  return null;
}

function collectSpaceFiles(root: string): { entries: ZipEntry[]; skipped: string[] } {
  const realRoot = realpathSync(root);
  const entries: ZipEntry[] = [];
  const skipped: string[] = [];

  const walk = (directory: string, prefix = "") => {
    for (const dirent of readdirSync(directory, { withFileTypes: true })) {
      const archivePath = prefix ? `${prefix}/${dirent.name}` : dirent.name;
      const fullPath = join(directory, dirent.name);
      const stat = lstatSync(fullPath);
      if (stat.isSymbolicLink()) {
        throw new Error(`Symlinks are not allowed in a Space project: ${archivePath}`);
      }
      if (stat.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(dirent.name) || dirent.name.startsWith(".")) {
          skipped.push(`${archivePath}/`);
          continue;
        }
        walk(fullPath, archivePath);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(`Special files are not allowed in a Space project: ${archivePath}`);
      }
      if (dirent.name.startsWith(".")) {
        skipped.push(archivePath);
        continue;
      }
      if (!isSafeNestedZipEntryName(archivePath)) {
        throw new Error(`Unsafe Space bundle path: ${archivePath}`);
      }
      const extension = extname(archivePath).slice(1).toLowerCase();
      if (!SPACE_ALLOWED_EXTENSIONS.has(extension)) {
        throw new Error(`Unsupported Space bundle file type: ${archivePath}`);
      }
      const realFile = realpathSync(fullPath);
      const rel = relative(realRoot, realFile);
      if (!rel || rel.startsWith("..") || resolve(realRoot, rel) !== realFile) {
        throw new Error(`Space bundle file escapes the project root: ${archivePath}`);
      }
      if (stat.size > SPACE_BUNDLE_LIMITS.fileBytes) {
        throw new Error(`Space bundle file exceeds 10 MiB: ${archivePath}`);
      }
      const data = readFileSync(realFile);
      if (extension === "html" && data.toString("utf8").toLowerCase().includes("<base")) {
        throw new Error(`HTML <base> elements are not allowed: ${archivePath}`);
      }
      entries.push({ name: archivePath, data });
      if (entries.length > SPACE_BUNDLE_LIMITS.files) {
        throw new Error("A Space bundle may contain at most 512 files.");
      }
    }
  };

  walk(realRoot);
  return { entries, skipped };
}

export function buildSpaceProject(root = process.cwd(), outputPath?: string): BuiltSpaceBundle {
  const resolvedRoot = resolve(root);
  const manifestPath = join(resolvedRoot, "space.json");
  if (!existsSync(manifestPath)) {
    throw new Error("space.json not found. Run this inside a managed Space directory.");
  }
  const manifestStat = lstatSync(manifestPath);
  if (manifestStat.isSymbolicLink() || !manifestStat.isFile()) {
    throw new Error("space.json must be a regular non-symlink file.");
  }
  if (manifestStat.size > SPACE_BUNDLE_LIMITS.manifestBytes) {
    throw new Error("space.json exceeds the 256 KiB manifest limit.");
  }

  const { entries, skipped } = collectSpaceFiles(resolvedRoot);
  if (entries.length === 0) throw new Error("The Space bundle is empty.");
  const paths = new Set(entries.map((entry) => entry.name));
  if (!paths.has("space.json")) {
    throw new Error("space.json must be at the project root and included in the bundle.");
  }
  const sortedPaths = [...paths].sort();
  for (let index = 1; index < sortedPaths.length; index += 1) {
    if (sortedPaths[index].startsWith(`${sortedPaths[index - 1]}/`)) {
      throw new Error(`Space bundle path-prefix conflict: ${sortedPaths[index - 1]} and ${sortedPaths[index]}`);
    }
  }
  const uncompressedBytes = entries.reduce((total, entry) => total + entry.data.length, 0);
  if (uncompressedBytes > SPACE_BUNDLE_LIMITS.uncompressedBytes) {
    throw new Error("Space bundle exceeds the 40 MiB uncompressed-size limit.");
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`space.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const manifestError = validateSpaceManifestForBuild(manifest, paths);
  if (manifestError) throw new Error(manifestError);
  const typedManifest = manifest as SpaceManifestForBuild;

  entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  const archive = createZip(entries, { allowNested: true, compression: "deflate" });
  if (archive.length > SPACE_BUNDLE_LIMITS.archiveBytes) {
    throw new Error("Space ZIP exceeds the 20 MiB upload limit.");
  }
  const destination = resolve(
    outputPath ?? join(resolvedRoot, "dist", `${typedManifest.id}-${typedManifest.version}.zip`),
  );
  mkdirSync(resolve(destination, ".."), { recursive: true });
  writeFileSync(destination, archive);
  return {
    outputPath: destination,
    archiveBytes: archive.length,
    uncompressedBytes,
    fileCount: entries.length,
    manifest: typedManifest,
    skipped,
  };
}
