import assert from "node:assert/strict";
import test from "node:test";

import { alignSidecarSdkMetadata } from "./sync-sidecar-sdk-version.mjs";

function fixture() {
  const packageName = "@arinova-ai/agent-sdk";
  return {
    sdkPackage: {
      name: packageName,
      version: "0.2.0",
      license: "MIT",
      engines: { node: ">=22" },
    },
    sidecarPackage: {
      name: "hermes-arinova-sidecar",
      version: "0.1.0",
      dependencies: { [packageName]: "0.1.0" },
      engines: { node: ">=22" },
    },
    sidecarLock: {
      name: "hermes-arinova-sidecar",
      version: "0.1.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "hermes-arinova-sidecar",
          version: "0.1.0",
          dependencies: { [packageName]: "0.1.0" },
          engines: { node: ">=22" },
        },
        [`node_modules/${packageName}`]: {
          version: "0.1.0",
          resolved:
            "https://registry.npmjs.org/@arinova-ai/agent-sdk/-/agent-sdk-0.1.0.tgz",
          integrity: "sha512-old",
          license: "MIT",
          engines: { node: ">=20" },
        },
      },
    },
    packedSdk: {
      name: packageName,
      version: "0.2.0",
      integrity: "sha512-new",
    },
  };
}

test("aligns the sidecar manifest and lockfile to the packed SDK", () => {
  const input = fixture();
  const result = alignSidecarSdkMetadata(input);
  const packageName = input.sdkPackage.name;
  const lockRoot = result.sidecarLock.packages[""];
  const lockedSdk = result.sidecarLock.packages[`node_modules/${packageName}`];

  assert.equal(result.sidecarPackage.dependencies[packageName], "0.2.0");
  assert.equal(lockRoot.dependencies[packageName], "0.2.0");
  assert.deepEqual(lockRoot.engines, { node: ">=22" });
  assert.deepEqual(lockedSdk, {
    version: "0.2.0",
    resolved:
      "https://registry.npmjs.org/@arinova-ai/agent-sdk/-/agent-sdk-0.2.0.tgz",
    integrity: "sha512-new",
    license: "MIT",
    engines: { node: ">=22" },
  });
  assert.equal(input.sidecarPackage.dependencies[packageName], "0.1.0");
});

test("rejects pack metadata that does not match the versioned SDK", () => {
  const input = fixture();
  input.packedSdk.version = "0.1.0";

  assert.throws(
    () => alignSidecarSdkMetadata(input),
    /does not match @arinova-ai\/agent-sdk@0\.2\.0/,
  );
});
