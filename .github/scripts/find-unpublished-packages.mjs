#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const packagesRoot = path.join(repositoryRoot, "packages");
const packageDirectories = (await readdir(packagesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const unpublished = [];

for (const directory of packageDirectories) {
  const manifestPath = path.join(packagesRoot, directory, "package.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      continue;
    }
    throw error;
  }

  if (manifest.private === true) {
    continue;
  }
  if (typeof manifest.name !== "string" || typeof manifest.version !== "string") {
    throw new Error(`${manifestPath} must declare string name and version fields`);
  }

  const packageVersionUrl = new URL(
    `${encodeURIComponent(manifest.name)}/${encodeURIComponent(manifest.version)}`,
    "https://registry.npmjs.org/",
  );
  const response = await fetch(packageVersionUrl, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 404) {
    unpublished.push(`${manifest.name}@${manifest.version}`);
    continue;
  }
  if (!response.ok) {
    throw new Error(
      `npm registry lookup failed for ${manifest.name}@${manifest.version}: ` +
        `${response.status} ${response.statusText}`,
    );
  }
}

process.stdout.write(`${JSON.stringify(unpublished)}\n`);
