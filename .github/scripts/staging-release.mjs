#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "../..");
const STAGING_SUFFIX = /-staging\.(\d+)$/;

export function isStagingAligned(baseVersion, taggedVersion) {
  return typeof taggedVersion === "string" &&
    taggedVersion.replace(STAGING_SUFFIX, "") === baseVersion &&
    STAGING_SUFFIX.test(taggedVersion);
}

export function nextStagingVersion(baseVersion, publishedVersions) {
  if (STAGING_SUFFIX.test(baseVersion)) {
    throw new Error(`Repository version must be stable, received ${baseVersion}`);
  }
  let next = 0;
  for (const version of publishedVersions) {
    const match = version.match(STAGING_SUFFIX);
    if (match && version.replace(STAGING_SUFFIX, "") === baseVersion) {
      next = Math.max(next, Number(match[1]) + 1);
    }
  }
  return `${baseVersion}-staging.${next}`;
}

export function replaceWorkspaceDependencies(manifest, workspaceVersions) {
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (typeof range === "string" && range.startsWith("workspace:")) {
        const version = workspaceVersions.get(name);
        if (version === undefined) {
          throw new Error(`${manifest.name} references unknown workspace package ${name}`);
        }
        manifest[field][name] = version;
      }
    }
  }
  return manifest;
}

async function publicPackages(root) {
  const packagesRoot = path.join(root, "packages");
  const directories = (await readdir(packagesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const packages = [];
  for (const directory of directories) {
    const manifestPath = path.join(packagesRoot, directory, "package.json");
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (manifest.private === true) continue;
    if (typeof manifest.name !== "string" || typeof manifest.version !== "string") {
      throw new Error(`${manifestPath} must declare string name and version fields`);
    }
    if (STAGING_SUFFIX.test(manifest.version)) {
      throw new Error(`${manifest.name} must keep a stable repository version`);
    }
    packages.push({ directory, manifestPath, manifest });
  }
  return packages;
}

async function packument(name) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return { versions: {}, "dist-tags": {} };
  if (!response.ok) {
    throw new Error(`npm registry lookup failed for ${name}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function detectStagingPackages(root = repositoryRoot) {
  const candidates = [];
  for (const item of await publicPackages(root)) {
    const metadata = await packument(item.manifest.name);
    if (!isStagingAligned(item.manifest.version, metadata["dist-tags"]?.staging)) {
      candidates.push(`${item.manifest.name}@${item.manifest.version}`);
    }
  }
  return candidates;
}

export async function prepareStagingPackages(requested, root = repositoryRoot) {
  const requestedSet = new Set(requested);
  const packages = await publicPackages(root);
  const metadataByName = new Map();
  for (const item of packages) metadataByName.set(item.manifest.name, await packument(item.manifest.name));
  const stagingVersions = new Map();
  const prepared = [];
  for (const item of packages) {
    const spec = `${item.manifest.name}@${item.manifest.version}`;
    const metadata = metadataByName.get(item.manifest.name);
    const requestedPackage = requestedSet.delete(spec);
    const stagingVersion = requestedPackage
      ? nextStagingVersion(item.manifest.version, Object.keys(metadata.versions ?? {}))
      : metadata["dist-tags"]?.staging;
    if (isStagingAligned(item.manifest.version, stagingVersion)) {
      stagingVersions.set(item.manifest.name, stagingVersion);
    }
    if (!requestedPackage) continue;
    const baseVersion = item.manifest.version;
    item.manifest.version = stagingVersion;
    prepared.push({ ...item, baseVersion, stagingVersion });
  }
  if (requestedSet.size > 0) {
    throw new Error(`Unknown or stale staging package specs: ${[...requestedSet].join(", ")}`);
  }
  for (const item of prepared) {
    replaceWorkspaceDependencies(item.manifest, stagingVersions);
    await writeFile(item.manifestPath, `${JSON.stringify(item.manifest, null, 2)}\n`);
  }
  return prepared.map(({ directory, manifest, baseVersion, stagingVersion }) => ({
    directory,
    name: manifest.name,
    baseVersion,
    stagingVersion,
  }));
}

export async function prepareProductionPackage(directory, root = repositoryRoot) {
  const packages = await publicPackages(root);
  const versions = new Map(packages.map((item) => [item.manifest.name, item.manifest.version]));
  const target = packages.find((item) => item.directory === directory);
  if (target === undefined) throw new Error(`Unknown public package directory: ${directory}`);
  replaceWorkspaceDependencies(target.manifest, versions);
  await writeFile(target.manifestPath, `${JSON.stringify(target.manifest, null, 2)}\n`);
  return { directory, name: target.manifest.name, version: target.manifest.version };
}

if (path.resolve(process.argv[1] ?? "") === scriptPath) {
  const command = process.argv[2];
  if (command === "detect") {
    process.stdout.write(`${JSON.stringify(await detectStagingPackages())}\n`);
  } else if (command === "prepare") {
    const requested = JSON.parse(process.env.STAGING_PACKAGES ?? "[]");
    process.stdout.write(`${JSON.stringify(await prepareStagingPackages(requested))}\n`);
  } else if (command === "prepare-production") {
    process.stdout.write(`${JSON.stringify(await prepareProductionPackage(process.argv[3]))}\n`);
  } else {
    throw new Error("Usage: staging-release.mjs <detect|prepare|prepare-production PACKAGE_DIR>");
  }
}
