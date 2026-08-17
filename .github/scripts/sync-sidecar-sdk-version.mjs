#!/usr/bin/env node

import { execFileSync } from "node:child_process";
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
  packedSdk,
}) {
  const sdk = cloneJson(requireObject(sdkPackage, "agent SDK package.json"));
  const sidecar = cloneJson(requireObject(sidecarPackage, "sidecar package.json"));
  const lock = cloneJson(requireObject(sidecarLock, "sidecar package-lock.json"));
  const packed = requireObject(packedSdk, "npm pack result");

  if (sdk.name !== SDK_PACKAGE_NAME) {
    throw new Error(`Expected ${SDK_PACKAGE_NAME}, received ${String(sdk.name)}`);
  }
  if (typeof sdk.version !== "string" || sdk.version.length === 0) {
    throw new Error("Agent SDK package version must be a non-empty string");
  }
  if (packed.name !== sdk.name || packed.version !== sdk.version) {
    throw new Error(
      `Packed SDK metadata ${String(packed.name)}@${String(packed.version)} ` +
        `does not match ${sdk.name}@${sdk.version}`,
    );
  }
  if (typeof packed.integrity !== "string" || !packed.integrity.startsWith("sha512-")) {
    throw new Error("Packed SDK must provide a sha512 integrity value");
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
  lockedSdk.integrity = packed.integrity;
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

function packSdk(sdkDirectory) {
  const output = execFileSync(
    "npm",
    ["pack", "--json", "--dry-run", "--ignore-scripts"],
    { cwd: sdkDirectory, encoding: "utf8" },
  );
  const results = JSON.parse(output);
  if (!Array.isArray(results) || results.length !== 1) {
    throw new Error("npm pack must return exactly one package result");
  }
  return results[0];
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
  const packedSdk = packSdk(sdkDirectory);
  const aligned = alignSidecarSdkMetadata({
    sdkPackage,
    sidecarPackage,
    sidecarLock,
    packedSdk,
  });

  await writeJson(sidecarPackagePath, aligned.sidecarPackage);
  await writeJson(sidecarLockPath, aligned.sidecarLock);
  process.stdout.write(`Aligned Hermes sidecar to ${sdkPackage.name}@${sdkPackage.version}\n`);
}

if (path.resolve(process.argv[1] ?? "") === scriptPath) {
  await syncSidecarSdkVersion();
}
