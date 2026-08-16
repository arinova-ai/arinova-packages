#!/usr/bin/env python3
"""Verify this checkout is the enabled Arinova plugin in the real Hermes home."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import types
from pathlib import Path

from install_check_helpers import (
    assert_adapter_sidecar_env,
    assert_agent_runtime_invokes_enabled_toolset,
    assert_model_tools_enabled_toolset,
    assert_platform_callbacks,
    assert_real_agent_init_enabled_toolset,
    assert_registry_dispatches,
    assert_registry_schemas,
    assert_registry_toolset_index,
    assert_required_plugin_files,
    assert_sdk_package_matches_local,
    assert_sidecar_check_script,
    assert_sidecar_lock_matches_local,
    assert_yaml_bridge,
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
    return parser.parse_args()


def assert_real_config_enabled(hermes_home: Path) -> None:
    config_path = hermes_home / "config.yaml"
    if not config_path.is_file():
        raise RuntimeError(f"enabled user plugin Hermes config is missing: {config_path}")
    try:
        import yaml

        config = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    except Exception as exc:
        raise RuntimeError(f"enabled user plugin could not read Hermes config.yaml: {exc}") from exc
    plugins = config.get("plugins") if isinstance(config, dict) else None
    enabled = plugins.get("enabled") if isinstance(plugins, dict) else None
    if not isinstance(enabled, list) or "hermes-arinova-plugin" not in enabled:
        raise RuntimeError(
            "enabled user plugin is not listed in real Hermes plugins.enabled: "
            f"{enabled!r}"
        )


def assert_platform_listing() -> None:
    from hermes_cli.platforms import get_all_platforms, platform_label

    platforms = get_all_platforms()
    arinova = platforms.get("arinova")
    if arinova is None:
        raise RuntimeError("enabled user plugin Arinova platform missing from Hermes platform listing")
    if arinova.label != "🔌  Arinova Chat":
        raise RuntimeError(f"enabled user plugin Arinova platform label drifted: {arinova.label!r}")
    if arinova.default_toolset != "hermes-arinova":
        raise RuntimeError(
            "enabled user plugin Arinova platform default toolset drifted: "
            f"{arinova.default_toolset!r}"
        )
    if platform_label("arinova") != "🔌  Arinova Chat":
        raise RuntimeError("enabled user plugin Arinova platform_label() did not use registry metadata")


def assert_platform_toolset_resolution() -> None:
    from hermes_cli.config import load_config
    from hermes_cli.tools_config import _get_platform_tools

    enabled_toolsets = _get_platform_tools(
        load_config(),
        "arinova",
        include_default_mcp_servers=False,
    )
    if "hermes-arinova" not in enabled_toolsets:
        raise RuntimeError(
            "enabled user plugin Arinova platform toolset did not resolve through Hermes tools_config: "
            f"{sorted(enabled_toolsets)!r}"
        )


def assert_gateway_runner_platform_toolset_resolution() -> None:
    sys.modules.setdefault("httpx", types.ModuleType("httpx"))
    sys.modules.setdefault("requests", types.ModuleType("requests"))

    import gateway.run as gateway_run
    from hermes_cli.config import load_config
    from hermes_cli.tools_config import _get_platform_tools

    platform = types.SimpleNamespace(value="arinova")
    platform_key = gateway_run._platform_config_key(platform)
    if platform_key != "arinova":
        raise RuntimeError(f"enabled user plugin gateway platform key drifted: {platform_key!r}")
    enabled_toolsets = sorted(
        _get_platform_tools(
            load_config(),
            platform_key,
            include_default_mcp_servers=False,
        )
    )
    if "hermes-arinova" not in enabled_toolsets:
        raise RuntimeError(
            "enabled user plugin gateway runner did not resolve the Arinova platform toolset: "
            f"{enabled_toolsets!r}"
        )


def main() -> int:
    require_hermes_python()
    args = parse_args()
    hermes_root = Path(args.hermes_root).expanduser().resolve()
    sdk_root = Path(args.sdk_root).expanduser().resolve()
    sys.path.insert(0, str(hermes_root))

    from gateway.config import PlatformConfig
    from gateway.platform_registry import platform_registry
    from hermes_cli.plugins import PluginManager, get_hermes_home
    from tools.registry import registry

    hermes_home = get_hermes_home()
    plugin_dir = hermes_home / "plugins" / "hermes-arinova-plugin"
    if not plugin_dir.exists():
        print(f"user install check skipped: {plugin_dir} does not exist")
        return 0
    if plugin_dir.resolve() != ROOT:
        raise RuntimeError(f"{plugin_dir} resolves to {plugin_dir.resolve()}, expected {ROOT}")
    assert_real_config_enabled(hermes_home)

    manager = PluginManager()
    manager.discover_and_load(force=True)
    loaded = manager._plugins.get("hermes-arinova-plugin")
    if loaded is None:
        raise RuntimeError("hermes-arinova-plugin was not discovered from the real Hermes home")
    if not loaded.enabled or loaded.error:
        raise RuntimeError(f"hermes-arinova-plugin is not enabled cleanly: {loaded.error!r}")
    if Path(str(loaded.manifest.path)).resolve() != plugin_dir.resolve():
        raise RuntimeError(f"Hermes loaded unexpected plugin path: {loaded.manifest.path}")
    assert_required_plugin_files(plugin_dir)
    assert_platform_toolset_resolution()
    sidecar_package = json.loads((plugin_dir / "sidecar/package.json").read_text(encoding="utf-8"))
    assert_sidecar_check_script(sidecar_package)
    assert_sidecar_lock_matches_local(plugin_dir / "sidecar", sdk_root)
    sdk_package_path = plugin_dir / "sidecar/node_modules/@arinova-ai/agent-sdk/package.json"
    if not sdk_package_path.exists():
        raise RuntimeError("enabled user plugin sidecar dependency is missing @arinova-ai/agent-sdk")
    sdk_package = json.loads(sdk_package_path.read_text(encoding="utf-8"))
    expected_sdk_version = sidecar_package["dependencies"]["@arinova-ai/agent-sdk"]
    if sdk_package.get("version") != expected_sdk_version:
        raise RuntimeError(
            "enabled user plugin installed unexpected @arinova-ai/agent-sdk version: "
            f"{sdk_package.get('version')!r} != {expected_sdk_version!r}"
        )
    if sdk_package.get("type") != "module":
        raise RuntimeError(f"enabled user plugin SDK package is not ESM: {sdk_package}")
    exports = sdk_package.get("exports", {}).get(".")
    if exports != {"import": "./dist/index.js", "types": "./dist/index.d.ts"}:
        raise RuntimeError(f"enabled user plugin SDK package exports drifted: {exports}")
    assert_sdk_package_matches_local(sdk_package_path, sdk_root)
    if not loaded.module.adapter.check_requirements():
        raise RuntimeError("enabled user plugin check_requirements() did not pass with installed sidecar dependencies")

    entry = platform_registry.get("arinova")
    if entry is None:
        raise RuntimeError("enabled user plugin did not register the arinova platform")
    if entry.standalone_sender_fn is None:
        raise RuntimeError("enabled user plugin did not register the standalone sender")
    if entry.cron_deliver_env_var != "ARINOVA_HOME_CONVERSATION":
        raise RuntimeError(f"unexpected Arinova cron env var: {entry.cron_deliver_env_var!r}")
    if entry.apply_yaml_config_fn is None:
        raise RuntimeError("enabled user plugin did not register the YAML config bridge")
    assert_platform_listing()
    assert_gateway_runner_platform_toolset_resolution()
    assert_yaml_bridge(entry)
    assert_platform_callbacks(entry, loaded.module, PlatformConfig)
    assert_adapter_sidecar_env(loaded.module, PlatformConfig)
    expected_hooks = manifest_hooks(ROOT / "plugin.yaml")
    registered_hooks = set(loaded.hooks_registered)
    if registered_hooks != expected_hooks:
        raise RuntimeError(
            "enabled user plugin registered hooks did not match manifest: "
            f"missing={sorted(expected_hooks - registered_hooks)} "
            f"extra={sorted(registered_hooks - expected_hooks)}"
        )

    expected_tools = manifest_tools(ROOT / "plugin.yaml")
    registered_tools = set(loaded.tools_registered)
    if registered_tools != expected_tools:
        raise RuntimeError(
            "enabled user plugin registered tools did not match manifest: "
            f"missing={sorted(expected_tools - registered_tools)} "
            f"extra={sorted(registered_tools - expected_tools)}"
        )
    missing_registry_tools = sorted(name for name in expected_tools if registry.get_entry(name) is None)
    if missing_registry_tools:
        raise RuntimeError(f"enabled user plugin tools missing from registry: {missing_registry_tools}")
    assert_registry_toolset_index(registry, expected_tools)
    assert_model_tools_enabled_toolset(loaded.module, expected_tools)
    assert_real_agent_init_enabled_toolset(loaded.module, expected_tools)
    assert_registry_schemas(registry, loaded.module, expected_tools)
    asyncio.run(assert_registry_dispatches(registry, loaded.module))
    assert_agent_runtime_invokes_enabled_toolset(loaded.module)

    print(f"user plugin install OK: {plugin_dir} enabled with {len(expected_tools)} tools")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
