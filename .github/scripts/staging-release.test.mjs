import assert from "node:assert/strict";
import test from "node:test";

import {
  isStagingAligned,
  nextStagingVersion,
  replaceWorkspaceDependencies,
} from "./staging-release.mjs";

test("only a staging prerelease with the same base is aligned", () => {
  assert.equal(isStagingAligned("0.2.0", "0.2.0-staging.0"), true);
  assert.equal(isStagingAligned("0.2.0", "0.2.0"), false);
  assert.equal(isStagingAligned("0.2.0", "0.1.9-staging.8"), false);
  assert.equal(isStagingAligned("0.2.0", undefined), false);
});

test("replaces published workspace dependency ranges with the channel version", () => {
  const manifest = {
    name: "@arinova-ai/consumer",
    dependencies: { "@arinova-ai/agent-sdk": "workspace:*", commander: "^12" },
  };
  replaceWorkspaceDependencies(
    manifest,
    new Map([["@arinova-ai/agent-sdk", "0.2.0-staging.0"]]),
  );
  assert.deepEqual(manifest.dependencies, {
    "@arinova-ai/agent-sdk": "0.2.0-staging.0",
    commander: "^12",
  });
});

test("selects the next unused staging revision for a stable base", () => {
  assert.equal(
    nextStagingVersion("0.2.0", ["0.2.0", "0.2.0-staging.0", "0.2.0-staging.2"]),
    "0.2.0-staging.3",
  );
  assert.equal(nextStagingVersion("0.3.0", ["0.2.0-staging.9"]), "0.3.0-staging.0");
  assert.throws(() => nextStagingVersion("0.3.0-staging.0", []), /must be stable/);
});
