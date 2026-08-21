#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SDK_PACKAGE_NAME = "@arinova-ai/agent-sdk";
const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "../..");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

export function alignSidecarSdkMetadata({
  sdkPackage,
  sidecarPackage,
  sidecarLock,
}) {
  const sdk = cloneJson(requireObject(sdkPackage, "agent SDK package.json"));
  const sidecar = cloneJson(requireObject(sidecarPackage, "sidecar package.json"));
  const lock = cloneJson(requireObject(sidecarLock, "sidecar package-lock.json"));

  if (sdk.name !== SDK_PACKAGE_NAME) {
    throw new Error(`Expected ${SDK_PACKAGE_NAME}, received ${String(sdk.name)}`);
  }
  if (typeof sdk.version !== "string" || sdk.version.length === 0) {
    throw new Error("Agent SDK package version must be a non-empty string");
  }

  const dependencies = requireObject(sidecar.dependencies, "sidecar dependencies");
  const lockPackages = requireObject(lock.packages, "sidecar lockfile packages");
  const lockRoot = requireObject(lockPackages[""], "sidecar lockfile root package");
  const lockedSdk = requireObject(
    lockPackages[`node_modules/${SDK_PACKAGE_NAME}`],
    "sidecar lockfile agent SDK package",
  );
  const lockDependencies = requireObject(
    lockRoot.dependencies,
    "sidecar lockfile root dependencies",
  );

  dependencies[SDK_PACKAGE_NAME] = sdk.version;
  lockDependencies[SDK_PACKAGE_NAME] = sdk.version;
  lockedSdk.version = sdk.version;
  lockedSdk.resolved =
    `https://registry.npmjs.org/${SDK_PACKAGE_NAME}/-/agent-sdk-${sdk.version}.tgz`;
  // The version PR is created before this tarball exists. npm and pnpm do not
  // necessarily produce byte-identical tarballs, so a local pack integrity
  // would make npm ci reject the package after it is published. Keep the exact
  // version and registry URL; npm verifies the fetched tarball against the
  // integrity advertised by the registry.
  delete lockedSdk.integrity;
  lockedSdk.license = sdk.license;
  if (sdk.engines === undefined) {
    delete lockedSdk.engines;
  } else {
    lockedSdk.engines = cloneJson(sdk.engines);
  }

  return { sidecarPackage: sidecar, sidecarLock: lock };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function syncSidecarSdkVersion(root = repositoryRoot) {
  const sdkDirectory = path.join(root, "packages/agent-sdk");
  const sdkPackagePath = path.join(sdkDirectory, "package.json");
  const sidecarDirectory = path.join(root, "packages/hermes-arinova-plugin/sidecar");
  const sidecarPackagePath = path.join(sidecarDirectory, "package.json");
  const sidecarLockPath = path.join(sidecarDirectory, "package-lock.json");

  const sdkPackage = await readJson(sdkPackagePath);
  const sidecarPackage = await readJson(sidecarPackagePath);
  const sidecarLock = await readJson(sidecarLockPath);
  if (sidecarPackage.dependencies?.[SDK_PACKAGE_NAME] === sdkPackage.version) {
    process.stdout.write(
      `Hermes sidecar already targets ${sdkPackage.name}@${sdkPackage.version}\n`,
    );
    return;
  }
  const aligned = alignSidecarSdkMetadata({
    sdkPackage,
    sidecarPackage,
    sidecarLock,
  });

  await writeJson(sidecarPackagePath, aligned.sidecarPackage);
  await writeJson(sidecarLockPath, aligned.sidecarLock);
  process.stdout.write(`Aligned Hermes sidecar to ${sdkPackage.name}@${sdkPackage.version}\n`);
}

if (path.resolve(process.argv[1] ?? "") === scriptPath) {
  await syncSidecarSdkVersion();
}
