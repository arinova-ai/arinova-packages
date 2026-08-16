import { lstatSync, realpathSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const ID_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export function isSafeBundleFileName(name: string): boolean {
  return Boolean(
    name &&
    name !== "." &&
    name !== ".." &&
    basename(name) === name &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !name.includes("\0"),
  );
}

export function resolveThemeRootFile(
  root: string,
  name: string,
  allowedExtensions: readonly string[],
): string {
  if (!isSafeBundleFileName(name)) {
    throw new Error(`Theme file must be a single bundle-root filename: ${name}`);
  }
  const extension = extname(name).slice(1).toLowerCase();
  if (!allowedExtensions.includes(extension)) {
    throw new Error(`Theme file type is not allowed: ${name}`);
  }
  const candidate = join(root, name);
  const stat = lstatSync(candidate);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Theme file must be a regular non-symlink file: ${name}`);
  }
  const realRoot = realpathSync(root);
  const realCandidate = realpathSync(candidate);
  const rel = relative(realRoot, realCandidate);
  if (!rel || rel.startsWith("..") || resolve(realRoot, rel) !== realCandidate) {
    throw new Error(`Theme file escapes the bundle root: ${name}`);
  }
  return realCandidate;
}

/** Validate a manifest the way the server will, returning a friendly error string (or null). */
export function validateManifestForBuild(manifest: unknown): string | null {
  if (!manifest || typeof manifest !== "object") return "theme.json must be a JSON object.";
  const m = manifest as Record<string, unknown>;
  if (typeof m.id !== "string" || !ID_RE.test(m.id) || m.id.length > 100) {
    return "theme.json 'id' must be kebab-case (e.g. my-cool-theme), ≤100 chars.";
  }
  if (typeof m.name !== "string" || m.name.trim().length === 0 || m.name.length > 100) {
    return "theme.json 'name' must be 1-100 characters.";
  }
  if (typeof m.version !== "string" || !SEMVER_RE.test(m.version)) {
    return "theme.json 'version' must be semver (e.g. 1.0.0).";
  }
  if (typeof m.entry !== "string" || m.entry.length === 0) {
    return "theme.json is missing required 'entry'.";
  }
  if (!isSafeBundleFileName(m.entry) || !["js", "mjs"].includes(extname(m.entry).slice(1).toLowerCase())) {
    return "theme.json 'entry' must be a JavaScript filename at the bundle root.";
  }
  if (
    m.preview != null &&
    (
      typeof m.preview !== "string" ||
      !isSafeBundleFileName(m.preview) ||
      !["png", "jpg", "jpeg", "webp", "gif"].includes(extname(m.preview).slice(1).toLowerCase())
    )
  ) {
    return "theme.json 'preview' must be an image filename at the bundle root.";
  }
  if (m.price != null && (typeof m.price !== "number" || !Number.isInteger(m.price) || m.price < 0)) {
    return "theme.json 'price' must be an integer ≥ 0.";
  }
  return null;
}
