#!/usr/bin/env python3
"""Smoke-test this plugin from a clean copied install."""

from __future__ import annotations

import argparse
import asyncio
import inspect
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from install_check_helpers import (
    assert_adapter_sidecar_env,
    assert_agent_runtime_invokes_enabled_toolset,
    assert_gateway_runner_platform_toolset_resolution,
    assert_model_tools_enabled_toolset,
    assert_platform_callbacks,
    assert_platform_listing_and_toolset_resolution,
    assert_real_agent_init_enabled_toolset,
    assert_registry_dispatches,
    assert_registry_schemas,
    assert_registry_toolset_index,
    assert_required_plugin_files,
    assert_sdk_package_matches_local,
    assert_sidecar_check_script,
    assert_sidecar_lock_matches_local,
    assert_yaml_bridge,
    ignore_plugin_copy,
    manifest_hooks,
    manifest_tools,
    require_hermes_python,
)


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SDK_ROOT = ROOT.parent / "agent-sdk"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hermes-root", default=str(Path.home() / "hermes-agent"))
    parser.add_argument("--sdk-root", default=str(DEFAULT_SDK_ROOT), help="Path to the agent-sdk checkout.")
    parser.add_argument(
        "--skip-npm-ci",
        action="store_true",
        help="Skip sidecar npm ci and only verify copied plugin discovery.",
    )
    return parser.parse_args()


def main() -> int:
    require_hermes_python()
    args = parse_args()
    hermes_root = Path(args.hermes_root).expanduser().resolve()
    sdk_root = Path(args.sdk_root).expanduser().resolve()
    sys.path.insert(0, str(hermes_root))

    with tempfile.TemporaryDirectory(prefix="hermes-arinova-clean-") as tmp:
        temp_root = Path(tmp)
        plugin_dir = temp_root / "plugins" / "hermes-arinova-plugin"
        plugin_dir.parent.mkdir(parents=True)
        shutil.copytree(ROOT, plugin_dir, ignore=ignore_plugin_copy)
        assert_required_plugin_files(plugin_dir)

        if not args.skip_npm_ci:
            subprocess.run(
                ["npm", "ci", "--ignore-scripts"],
                cwd=plugin_dir / "sidecar",
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=300,
            )
            packed = subprocess.run(
                ["npm", "pack", str(sdk_root), "--pack-destination", str(temp_root)],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=300,
            )
            sdk_tarball = temp_root / packed.stdout.strip().splitlines()[-1]
            subprocess.run(
                ["npm", "install", "--ignore-scripts", "--no-save", str(sdk_tarball)],
                cwd=plugin_dir / "sidecar",
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=300,
            )
            subprocess.run(
                ["npm", "run", "check"],
                cwd=plugin_dir / "sidecar",
                check=True,
                timeout=300,
            )
            subprocess.run(
                [
                    sys.executable,
                    str(plugin_dir / "scripts/check_gateway_config_load.py"),
                    "--hermes-root",
                    str(hermes_root),
                ],
                cwd=plugin_dir,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=300,
            )

        from gateway.config import PlatformConfig
        from gateway.platform_registry import platform_registry
        from hermes_cli.plugins import PluginManager
        from tools.registry import registry

        manager = PluginManager()
        manifest = manager._parse_manifest(plugin_dir / "plugin.yaml", plugin_dir, source="user", prefix="")
        if manifest is None:
            raise RuntimeError("copied plugin manifest did not parse")
        manager._load_plugin(manifest)
        loaded = manager._plugins.get(manifest.key or manifest.name)
        if loaded is None or not loaded.enabled or loaded.error:
            raise RuntimeError(f"copied plugin did not load cleanly: {getattr(loaded, 'error', None)}")
        entry = platform_registry.get("arinova")
        if entry is None:
            raise RuntimeError("copied plugin did not register arinova platform")
        assert_platform_listing_and_toolset_resolution()
        assert_gateway_runner_platform_toolset_resolution()
        if entry.standalone_sender_fn is None:
            raise RuntimeError("copied plugin did not register arinova standalone sender")
        if entry.cron_deliver_env_var != "ARINOVA_HOME_CONVERSATION":
            raise RuntimeError(
                "copied plugin registered unexpected cron delivery env var: "
                f"{entry.cron_deliver_env_var!r}"
            )
        if entry.apply_yaml_config_fn is None:
            raise RuntimeError("copied plugin did not register arinova YAML config bridge")
        assert_yaml_bridge(entry)
        assert_platform_callbacks(entry, loaded.module, PlatformConfig)
        assert_adapter_sidecar_env(loaded.module, PlatformConfig)
        expected_hooks = manifest_hooks(plugin_dir / "plugin.yaml")
        registered_hooks = set(loaded.hooks_registered)
        if registered_hooks != expected_hooks:
            raise RuntimeError(
                "copied plugin registered hooks did not match manifest: "
                f"missing={sorted(expected_hooks - registered_hooks)} extra={sorted(registered_hooks - expected_hooks)}"
            )
        expected_tools = manifest_tools(plugin_dir / "plugin.yaml")
        registered_tools = set(loaded.tools_registered)
        if registered_tools != expected_tools:
            raise RuntimeError(
                "copied plugin registered tools did not match manifest: "
                f"missing={sorted(expected_tools - registered_tools)} extra={sorted(registered_tools - expected_tools)}"
            )
        missing_registry_tools = sorted(name for name in expected_tools if registry.get_entry(name) is None)
        if missing_registry_tools:
            raise RuntimeError(f"copied plugin tools missing from registry: {missing_registry_tools}")
        assert_registry_toolset_index(registry, expected_tools)
        try:
            assert_model_tools_enabled_toolset(loaded.module, expected_tools)
            assert_real_agent_init_enabled_toolset(loaded.module, expected_tools)
        except ImportError as error:
            print(f"clean install Hermes toolset integration skipped for incompatible checkout: {error}")
        assert_registry_schemas(registry, loaded.module, expected_tools)
        asyncio.run(assert_registry_dispatches(registry, loaded.module))
        try:
            from agent import agent_runtime_helpers as runtime_helpers

            # Deterministic capability probe, not a TypeError catch: when the
            # Hermes checkout supports skip_tool_request_middleware the
            # assertion runs unguarded, so a genuine TypeError from a
            # signature bug fails this check instead of being swallowed.
            if "skip_tool_request_middleware" not in inspect.signature(runtime_helpers.invoke_tool).parameters:
                print(
                    "clean install agent runtime integration skipped for incompatible checkout: "
                    "invoke_tool lacks skip_tool_request_middleware"
                )
            else:
                assert_agent_runtime_invokes_enabled_toolset(loaded.module)
        except ImportError as error:
            print(f"clean install agent runtime integration skipped for incompatible checkout: {error}")
        sidecar_package = json.loads((plugin_dir / "sidecar/package.json").read_text(encoding="utf-8"))
        assert_sidecar_check_script(sidecar_package)
        assert_sidecar_lock_matches_local(plugin_dir / "sidecar", sdk_root)
        if not args.skip_npm_ci:
            sdk_package_path = plugin_dir / "sidecar/node_modules/@arinova-ai/agent-sdk/package.json"
            if not sdk_package_path.exists():
                raise RuntimeError("copied sidecar dependency install did not produce @arinova-ai/agent-sdk")
            sdk_package = json.loads(sdk_package_path.read_text(encoding="utf-8"))
            expected_sdk_version = sidecar_package["dependencies"]["@arinova-ai/agent-sdk"]
            if sdk_package.get("version") != expected_sdk_version:
                raise RuntimeError(
                    "copied sidecar installed unexpected @arinova-ai/agent-sdk version: "
                    f"{sdk_package.get('version')!r} != {expected_sdk_version!r}"
                )
            if sdk_package.get("type") != "module":
                raise RuntimeError(f"copied sidecar SDK package is not ESM: {sdk_package}")
            exports = sdk_package.get("exports", {}).get(".")
            if exports != {"import": "./dist/index.js", "types": "./dist/index.d.ts"}:
                raise RuntimeError(f"copied sidecar SDK package exports drifted: {exports}")
            assert_sdk_package_matches_local(sdk_package_path, sdk_root)
            if not loaded.module.adapter.check_requirements():
                raise RuntimeError("copied plugin check_requirements() did not pass after npm ci")

    suffix = "with sidecar dependencies" if not args.skip_npm_ci else "without installing sidecar dependencies"
    print(f"clean plugin install OK: copied plugin loads {suffix}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
