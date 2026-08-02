#!/usr/bin/env bash
# Place the workspace build of @arinova-ai/agent-sdk where the sidecar
# resolves it.
#
# The plugin's gate (scripts/check_local.py) asserts that the SDK the sidecar
# loads is byte-identical to the workspace source, and its sidecar e2e checks
# exercise behavior that only exists in that source. `npm ci` inside sidecar/
# installs the last published tarball instead, which is older than the source
# for most of a development cycle — so the gate can only run against a synced
# copy. sidecar/package-lock.json still pins the published version that a real
# install ships; this only affects local and CI verification.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
sdk="$(cd "$here/../agent-sdk" && pwd)"
dest="$here/sidecar/node_modules/@arinova-ai/agent-sdk"

if [ ! -d "$sdk/dist" ]; then
  echo "sync-sidecar-sdk: $sdk/dist is missing; run the agent-sdk build first" >&2
  exit 1
fi

mkdir -p "$dest"
rm -rf "${dest:?}/dist"
cp -R "$sdk/dist" "$dest/dist"
cp "$sdk/package.json" "$sdk/README.md" "$dest/"

echo "sync-sidecar-sdk: synced $(node -p "require('$dest/package.json').version") into $dest"
