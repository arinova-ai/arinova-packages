#!/usr/bin/env python3
"""Verify the local agent-sdk source checkout that this plugin targets."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COMMAND_TIMEOUT_SECONDS = 300
DEFAULT_SDK_ROOT = Path.home() / ".arinova-bridge/workspace/projects/arinova-packages/packages/agent-sdk"
SDK_DIST_FILES = (
    "dist/client.d.ts",
    "dist/client.d.ts.map",
    "dist/client.js",
    "dist/client.js.map",
    "dist/index.d.ts",
    "dist/index.d.ts.map",
    "dist/index.js",
    "dist/index.js.map",
    "dist/types.d.ts",
    "dist/types.d.ts.map",
    "dist/types.js",
    "dist/types.js.map",
)
SDK_PACKAGE_FILES = ("README.md", *SDK_DIST_FILES)
SDK_SOURCE_FILES = (
    "package.json",
    "src/client.ts",
    "src/types.ts",
    "src/index.ts",
    "src/client.test.ts",
    "src/types.test.ts",
)
SDK_PACKAGE_PUBLIC_METADATA_KEYS = (
    "name",
    "description",
    "type",
    "main",
    "types",
    "exports",
    "files",
    "keywords",
    "license",
    "dependencies",
    "scripts",
    "devDependencies",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sdk-root", default=str(DEFAULT_SDK_ROOT))
    parser.add_argument("--skip-lint", action="store_true")
    parser.add_argument("--skip-tests", action="store_true")
    return parser.parse_args()


def package_public_metadata(package: dict) -> dict:
    return {key: package.get(key) for key in SDK_PACKAGE_PUBLIC_METADATA_KEYS}


def assert_required_files(sdk_root: Path) -> None:
    missing = [
        relative_path
        for relative_path in (*SDK_SOURCE_FILES, *SDK_PACKAGE_FILES)
        if not (sdk_root / relative_path).is_file()
    ]
    if missing:
        raise RuntimeError(f"local agent-sdk checkout is missing required file(s): {', '.join(missing)}")


def git_root(path: Path) -> Path | None:
    probe = subprocess.run(
        ["git", "-C", str(path), "rev-parse", "--show-toplevel"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        timeout=COMMAND_TIMEOUT_SECONDS,
    )
    if probe.returncode != 0:
        return None
    return Path(probe.stdout.strip()).resolve()


def assert_sdk_source_clean(sdk_root: Path, phase: str) -> None:
    root = git_root(sdk_root)
    if root is None:
        return
    status = subprocess.run(
        ["git", "-C", str(root), "status", "--short", "--", str(sdk_root)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=COMMAND_TIMEOUT_SECONDS,
    )
    if status.returncode != 0:
        raise RuntimeError(f"could not inspect local agent-sdk git status {phase}: {status.stderr.strip()}")
    if status.stdout.strip():
        raise RuntimeError(
            "local agent-sdk checkout is dirty "
            f"{phase}; plugin checks must not modify {sdk_root}:\n{status.stdout.rstrip()}"
        )


def assert_bundled_sdk_matches_source(sdk_root: Path) -> str:
    source_package_path = sdk_root / "package.json"
    bundled_sdk = ROOT / "sidecar/node_modules/@arinova-ai/agent-sdk"
    bundled_package_path = bundled_sdk / "package.json"
    if not bundled_package_path.is_file():
        raise RuntimeError("sidecar is missing bundled @arinova-ai/agent-sdk package.json")

    source_package = json.loads(source_package_path.read_text(encoding="utf-8"))
    bundled_package = json.loads(bundled_package_path.read_text(encoding="utf-8"))
    if source_package.get("version") != bundled_package.get("version"):
        raise RuntimeError(
            "bundled @arinova-ai/agent-sdk version differs from local agent-sdk source: "
            f"expected={source_package.get('version')!r} actual={bundled_package.get('version')!r}"
        )
    if package_public_metadata(source_package) != package_public_metadata(bundled_package):
        raise RuntimeError("bundled @arinova-ai/agent-sdk package metadata differs from local agent-sdk source")

    drift = [
        relative_path
        for relative_path in SDK_PACKAGE_FILES
        if (sdk_root / relative_path).read_text(encoding="utf-8")
        != (bundled_sdk / relative_path).read_text(encoding="utf-8")
    ]
    if drift:
        raise RuntimeError(
            "bundled @arinova-ai/agent-sdk package files differ from local agent-sdk source: "
            f"{', '.join(drift)}"
        )
    return str(source_package.get("version"))


def run_sdk_command(sdk_root: Path, command: list[str]) -> None:
    subprocess.run(command, cwd=sdk_root, check=True, timeout=COMMAND_TIMEOUT_SECONDS)


def main() -> int:
    args = parse_args()
    sdk_root = Path(args.sdk_root).expanduser().resolve()
    assert_required_files(sdk_root)
    assert_sdk_source_clean(sdk_root, "before source SDK checks")
    version = assert_bundled_sdk_matches_source(sdk_root)
    if not args.skip_lint:
        run_sdk_command(sdk_root, ["npm", "run", "lint"])
    if not args.skip_tests:
        run_sdk_command(sdk_root, ["npm", "test", "--", "--run"])
    assert_sdk_source_clean(sdk_root, "after source SDK checks")
    print(f"agent-sdk source OK: {sdk_root} version={version}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
