import { readFileSync } from "node:fs";
import { validateManifestForBuild } from "./theme-build.js";

export interface ThemeManifestFile {
  data: Buffer;
  manifest: Record<string, unknown>;
}

export function readThemeManifest(filePath: string): ThemeManifestFile {
  const data = readFileSync(filePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(data.toString("utf-8"));
  } catch {
    throw new Error(`Invalid theme manifest JSON: ${filePath}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid theme manifest: expected JSON object in ${filePath}`);
  }
  return { data, manifest: parsed as Record<string, unknown> };
}

export function assertValidThemeManifest(manifest: unknown): asserts manifest is Record<string, unknown> {
  const error = validateManifestForBuild(manifest);
  if (error) throw new Error(error);
}

export function readValidatedThemeManifest(filePath: string): ThemeManifestFile {
  const result = readThemeManifest(filePath);
  assertValidThemeManifest(result.manifest);
  return result;
}
