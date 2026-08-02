#!/usr/bin/env python3
"""Verify this checkout is the enabled Arinova plugin in the real Hermes home."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import threading
import types
from pathlib import Path

from install_check_helpers import REQUIRED_PLUGIN_FILES, require_hermes_python


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SDK_ROOT = Path.home() / ".arinova-bridge/workspace/projects/arinova-packages/packages/agent-sdk"
EXPECTED_SIDECAR_CHECKS = {
    "check-index-lifecycle.mjs",
    "check-runtime.mjs",
    "check-sdk-e2e.mjs",
    "check-sdk-http.mjs",
}
EXPECTED_SIDECAR_SYNTAX_CHECKS = {
    "index.mjs",
    "runtime.mjs",
}
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
    parser.add_argument("--hermes-root", default=str(Path.home() / "hermes-agent"))
    parser.add_argument("--sdk-root", default=str(DEFAULT_SDK_ROOT), help="Path to the agent-sdk checkout.")
    return parser.parse_args()


def manifest_tools(path: Path) -> set[str]:
    source = path.read_text(encoding="utf-8")
    block = source.split("provides_tools:", 1)[1].split("requires_env:", 1)[0]
    return set(re.findall(r"^\s*-\s*([A-Za-z0-9_]+)\s*$", block, re.M))


def manifest_hooks(path: Path) -> set[str]:
    source = path.read_text(encoding="utf-8")
    block = source.split("provides_hooks:", 1)[1].split("provides_tools:", 1)[0]
    return set(re.findall(r"^\s*-\s*([A-Za-z0-9_]+)\s*$", block, re.M))


def assert_sidecar_check_script(sidecar_package: dict) -> None:
    check_script = str(sidecar_package.get("scripts", {}).get("check") or "")
    missing_syntax = sorted(
        script
        for script in EXPECTED_SIDECAR_SYNTAX_CHECKS
        if f"node --check {script}" not in check_script
    )
    if missing_syntax:
        raise RuntimeError(f"enabled user sidecar check script is missing syntax check(s): {', '.join(missing_syntax)}")
    missing = sorted(
        script
        for script in EXPECTED_SIDECAR_CHECKS
        if f"node --check {script}" not in check_script or f"node {script}" not in check_script
    )
    if missing:
        raise RuntimeError(f"enabled user sidecar check script is missing verifier(s): {', '.join(missing)}")


def assert_sdk_dist_matches_local(installed_sdk: Path, sdk_root: Path) -> None:
    missing = [relative_path for relative_path in SDK_PACKAGE_FILES if not (installed_sdk / relative_path).exists()]
    if missing:
        raise RuntimeError(f"enabled user plugin SDK install is missing package file(s): {', '.join(missing)}")
    drift = [
        relative_path
        for relative_path in SDK_PACKAGE_FILES
        if (sdk_root / relative_path).read_text(encoding="utf-8")
        != (installed_sdk / relative_path).read_text(encoding="utf-8")
    ]
    if drift:
        raise RuntimeError(
            "enabled user plugin SDK package files differ from local agent-sdk package: "
            f"{', '.join(drift)}"
        )


def sdk_package_public_metadata(package: dict) -> dict:
    return {key: package.get(key) for key in SDK_PACKAGE_PUBLIC_METADATA_KEYS}


def assert_sdk_package_matches_local(installed_package_path: Path, sdk_root: Path) -> None:
    installed_package = json.loads(installed_package_path.read_text(encoding="utf-8"))
    local_package = json.loads((sdk_root / "package.json").read_text(encoding="utf-8"))
    if installed_package.get("version") != local_package.get("version"):
        raise RuntimeError(
            "enabled user plugin SDK package version differs from local agent-sdk package: "
            f"expected={local_package.get('version')!r} actual={installed_package.get('version')!r}"
        )
    if sdk_package_public_metadata(installed_package) != sdk_package_public_metadata(local_package):
        raise RuntimeError(
            "enabled user plugin SDK package metadata differs from local agent-sdk package: "
            f"expected={sdk_package_public_metadata(local_package)} "
            f"actual={sdk_package_public_metadata(installed_package)}"
        )
    assert_sdk_dist_matches_local(installed_package_path.parent, sdk_root)


def assert_sidecar_lock_matches_local(sidecar_dir: Path, sdk_root: Path) -> None:
    sidecar_package = json.loads((sidecar_dir / "package.json").read_text(encoding="utf-8"))
    lockfile = json.loads((sidecar_dir / "package-lock.json").read_text(encoding="utf-8"))
    local_package = json.loads((sdk_root / "package.json").read_text(encoding="utf-8"))
    local_version = str(local_package.get("version"))
    package_name = "@arinova-ai/agent-sdk"
    if lockfile.get("lockfileVersion") != 3:
        raise RuntimeError("enabled user sidecar lockfile version is not npm v3")
    if lockfile.get("requires") is not True:
        raise RuntimeError("enabled user sidecar lockfile does not declare dependency requirements")
    root_package = lockfile.get("packages", {}).get("", {})
    if root_package.get("name") != sidecar_package.get("name"):
        raise RuntimeError("enabled user sidecar lockfile root package name differs from package.json")
    if root_package.get("version") != sidecar_package.get("version"):
        raise RuntimeError("enabled user sidecar lockfile root package version differs from package.json")
    if root_package.get("dependencies") != sidecar_package.get("dependencies"):
        raise RuntimeError("enabled user sidecar lockfile root dependencies differ from package.json")
    if root_package.get("engines") != sidecar_package.get("engines"):
        raise RuntimeError("enabled user sidecar lockfile root engines differ from package.json")
    root_dependency = root_package.get("dependencies", {}).get(package_name)
    if sidecar_package.get("dependencies", {}).get(package_name) != local_version:
        raise RuntimeError("enabled user sidecar package.json SDK dependency is not pinned to local agent-sdk package")
    if root_dependency != local_version:
        raise RuntimeError("enabled user sidecar lockfile SDK dependency is not pinned to local agent-sdk package")
    locked_package = lockfile.get("packages", {}).get(f"node_modules/{package_name}", {})
    if locked_package.get("version") != local_version:
        raise RuntimeError("enabled user sidecar lockfile SDK package version differs from local agent-sdk package")
    expected_resolved = f"https://registry.npmjs.org/{package_name}/-/agent-sdk-{local_version}.tgz"
    if locked_package.get("resolved") != expected_resolved:
        raise RuntimeError("enabled user sidecar lockfile SDK package tarball differs from local agent-sdk package")
    if locked_package.get("license") != local_package.get("license"):
        raise RuntimeError("enabled user sidecar lockfile SDK package license differs from local agent-sdk package")
    integrity = locked_package.get("integrity")
    if not isinstance(integrity, str) or not integrity.startswith("sha512-"):
        raise RuntimeError("enabled user sidecar lockfile SDK package integrity is missing or not sha512")


def assert_required_plugin_files(plugin_dir: Path) -> None:
    missing = [relative_path for relative_path in REQUIRED_PLUGIN_FILES if not (plugin_dir / relative_path).is_file()]
    if missing:
        raise RuntimeError(f"enabled user plugin is missing required file(s): {', '.join(missing)}")


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


def expected_tool_schemas(module) -> dict[str, dict]:
    tools = module.register_tools.__globals__
    expected = {
        "arinova_sdk_call": tools["_generic_agent_schema"](),
        "arinova_task_call": tools["_generic_task_schema"](),
    }
    for method in tools["MODEL_AGENT_METHODS"]:
        tool_name = f"arinova_{tools['_snake'](method)}"
        expected[tool_name] = tools["_method_schema"](tool_name, method)
    for method in tools["TASK_METHODS"]:
        tool_name = f"arinova_task_{tools['_snake'](method)}"
        expected[tool_name] = tools["_method_schema"](tool_name, method, task_scoped=True)
    return expected


def assert_registry_schemas(registry, module, expected_tools: set[str]) -> None:
    class DefinitionAdapter:
        is_connected = True

        def is_running(self):
            return True

    previous = module.adapter._active_adapter
    module.adapter._active_adapter = DefinitionAdapter()
    try:
        definitions = registry.get_definitions(
            expected_tools,
            quiet=True,
        )
    finally:
        module.adapter._active_adapter = previous

    by_name = {item["function"]["name"]: item for item in definitions}
    if set(by_name) != expected_tools:
        raise RuntimeError(f"enabled user plugin registry schema definitions mismatch: {sorted(by_name)}")
    tools = module.register_tools.__globals__
    expected_schemas = expected_tool_schemas(module)
    if set(expected_schemas) != expected_tools:
        raise RuntimeError(f"enabled user plugin generated schema set mismatch: {sorted(expected_schemas)}")
    for name, definition in by_name.items():
        function = definition.get("function")
        if not isinstance(function, dict) or function.get("name") != name:
            raise RuntimeError(f"enabled user plugin schema function name mismatch: {name} -> {function}")
        expected_schema = expected_schemas[name]
        if function.get("description") != expected_schema.get("description"):
            raise RuntimeError(f"enabled user plugin schema description drifted: {name}")
        if function.get("parameters") != expected_schema.get("parameters"):
            raise RuntimeError(f"enabled user plugin schema parameters drifted from generated schema: {name}")
        parameters = function.get("parameters")
        if not isinstance(parameters, dict) or parameters.get("type") != "object":
            raise RuntimeError(f"enabled user plugin schema parameters are not an object: {name}")
        properties = parameters.get("properties")
        if not isinstance(properties, dict):
            raise RuntimeError(f"enabled user plugin schema properties are missing: {name}")
        if parameters.get("additionalProperties") is not False:
            raise RuntimeError(f"enabled user plugin schema allows unknown fields: {name}")
        if "args" not in properties:
            raise RuntimeError(f"enabled user plugin schema does not expose positional args: {name}")
        if name in {"arinova_sdk_call", "arinova_task_call"}:
            if parameters.get("required") != ["method"]:
                raise RuntimeError(f"enabled user plugin generic schema does not require method: {name}")
            method_schema = properties.get("method")
            if not isinstance(method_schema, dict) or not method_schema.get("enum"):
                raise RuntimeError(f"enabled user plugin generic schema has no method enum: {name}")
            expected_method_enum = list(
                tools["TASK_METHODS"] if name == "arinova_task_call" else tools["MODEL_AGENT_METHODS"]
            )
            if method_schema.get("enum") != expected_method_enum:
                raise RuntimeError(f"enabled user plugin generic schema method enum drifted: {name}")
        elif "method" in properties:
            raise RuntimeError(f"enabled user plugin method-specific schema unexpectedly exposes method: {name}")
        if name.startswith("arinova_task_"):
            if not {"task_id", "taskId"}.issubset(properties):
                raise RuntimeError(f"enabled user plugin task schema missing task id aliases: {name}")
    for method, specs in tools["ARG_SPECS"].items():
        tool_name = f"arinova_{tools['_snake'](method)}"
        if method not in tools["MODEL_AGENT_METHODS"]:
            if tool_name in by_name:
                raise RuntimeError(f"user plugin exposed internal SDK method to the model: {tool_name}")
            continue
        properties = by_name[tool_name]["function"]["parameters"]["properties"]
        expected_aliases = {
            alias
            for param_name, _schema in specs
            for alias in tools["_aliases_for"](param_name)
        }
        if not expected_aliases.issubset(properties):
            raise RuntimeError(
                f"enabled user plugin method schema missing aliases: {tool_name} "
                f"{sorted(expected_aliases - set(properties))}"
            )
    for method, specs in tools["TASK_ARG_SPECS"].items():
        tool_name = f"arinova_task_{tools['_snake'](method)}"
        properties = by_name[tool_name]["function"]["parameters"]["properties"]
        expected_aliases = {
            "taskId",
            *(
                alias
                for param_name, _schema in specs
                for alias in tools["_aliases_for"](param_name)
            ),
        }
        if not expected_aliases.issubset(properties):
            raise RuntimeError(
                f"enabled user plugin task method schema missing aliases: {tool_name} "
                f"{sorted(expected_aliases - set(properties))}"
            )
    agent_upload_props = by_name["arinova_upload_file"]["function"]["parameters"]["properties"]
    if not {"conversation_id", "conversationId", "file", "file_name", "fileName", "file_type", "fileType", "args"}.issubset(agent_upload_props):
        raise RuntimeError(f"enabled user plugin uploadFile schema fields missing: {agent_upload_props}")
    task_upload_props = by_name["arinova_task_upload_file"]["function"]["parameters"]["properties"]
    if not {"task_id", "taskId", "file", "file_name", "fileName", "file_type", "fileType", "args"}.issubset(task_upload_props):
        raise RuntimeError(f"enabled user plugin task uploadFile schema fields missing: {task_upload_props}")
    generic_props = by_name["arinova_sdk_call"]["function"]["parameters"]["properties"]
    if not {"method", "args", "conversation_id", "conversationId", "file", "file_name", "fileName", "file_type", "fileType"}.issubset(generic_props):
        raise RuntimeError(f"enabled user plugin generic SDK schema fields missing: {generic_props}")
    if {"action", "action_args", "actionArgs", "task_id", "taskId", "message_id", "messageId"} & set(generic_props):
        raise RuntimeError(f"enabled user plugin generic SDK schema exposed global action attribution: {generic_props}")
    generic_task_props = by_name["arinova_task_call"]["function"]["parameters"]["properties"]
    if not {"method", "task_id", "taskId", "args", "file", "file_name", "fileName", "file_type", "fileType", "actionArgs"}.issubset(generic_task_props):
        raise RuntimeError(f"enabled user plugin generic task schema fields missing: {generic_task_props}")


def assert_registry_toolset_index(registry, expected_tools: set[str]) -> None:
    if "hermes-arinova" not in registry.get_registered_toolset_names():
        raise RuntimeError("enabled user plugin toolset missing from Hermes registry toolset index")
    indexed_tools = set(registry.get_tool_names_for_toolset("hermes-arinova"))
    if indexed_tools != expected_tools:
        raise RuntimeError(
            "enabled user plugin registry toolset index did not match manifest tools: "
            f"missing={sorted(expected_tools - indexed_tools)} extra={sorted(indexed_tools - expected_tools)}"
        )
    tool_to_toolset = registry.get_tool_to_toolset_map()
    drift = {name: tool_to_toolset.get(name) for name in expected_tools if tool_to_toolset.get(name) != "hermes-arinova"}
    if drift:
        raise RuntimeError(f"enabled user plugin registry tool-to-toolset map drifted: {drift}")
    available_toolsets = registry.get_available_toolsets()
    available_entry = available_toolsets.get("hermes-arinova")
    if not isinstance(available_entry, dict) or set(available_entry.get("tools") or []) != expected_tools:
        raise RuntimeError(
            "enabled user plugin available toolset metadata did not expose manifest tools: "
            f"{available_entry!r}"
        )


def assert_model_tools_enabled_toolset(module, expected_tools: set[str]) -> None:
    import model_tools
    from model_tools import _clear_tool_defs_cache, get_tool_definitions
    from tools import tool_search
    from tools.registry import invalidate_check_fn_cache

    class DefinitionAdapter:
        is_connected = True

        def is_running(self):
            return True

    class BridgeDispatchAdapter(DefinitionAdapter):
        def __init__(self) -> None:
            self.calls: list[tuple] = []

        async def call_agent_sdk(self, method: str, *args):
            self.calls.append(("agent", method, args))
            return None

    previous = module.adapter._active_adapter
    module.adapter._active_adapter = DefinitionAdapter()
    try:
        _clear_tool_defs_cache()
        invalidate_check_fn_cache()
        definitions = get_tool_definitions(
            enabled_toolsets=["hermes-arinova"],
            quiet_mode=True,
        )
    finally:
        module.adapter._active_adapter = previous
        _clear_tool_defs_cache()
        invalidate_check_fn_cache()

    names = {item.get("function", {}).get("name") for item in definitions}
    arinova_names = {name for name in names if isinstance(name, str) and name.startswith("arinova_")}
    if arinova_names != expected_tools:
        raise RuntimeError(
            "enabled user plugin model_tools enabled_toolsets did not expose manifest Arinova tools: "
            f"missing={sorted(expected_tools - arinova_names)} extra={sorted(arinova_names - expected_tools)}"
        )

    previous_load_config = tool_search.load_config
    tool_search.load_config = lambda: tool_search.ToolSearchConfig(
        enabled="on",
        threshold_pct=0.0,
        search_default_limit=5,
        max_search_limit=20,
    )
    previous = module.adapter._active_adapter
    module.adapter._active_adapter = DefinitionAdapter()
    try:
        _clear_tool_defs_cache()
        invalidate_check_fn_cache()
        bridged_definitions = get_tool_definitions(
            enabled_toolsets=["hermes-arinova"],
            quiet_mode=True,
        )
        bridge_search = json.loads(model_tools.handle_function_call(
            "tool_search",
            {"query": "send message", "limit": 5},
            enabled_toolsets=["hermes-arinova"],
            skip_pre_tool_call_hook=True,
            skip_tool_request_middleware=True,
        ))
        bridge_describe = json.loads(model_tools.handle_function_call(
            "tool_describe",
            {"name": "arinova_send_message"},
            enabled_toolsets=["hermes-arinova"],
            skip_pre_tool_call_hook=True,
            skip_tool_request_middleware=True,
        ))
        scope_adapter = BridgeDispatchAdapter()
        module.adapter._active_adapter = scope_adapter
        bridge_out_of_scope = json.loads(model_tools.handle_function_call(
            "tool_call",
            {
                "name": "arinova_send_message",
                "arguments": {
                    "conversation_id": "conv-model-tools-out-of-scope",
                    "content": "must not dispatch",
                },
            },
            enabled_toolsets=[],
            skip_pre_tool_call_hook=True,
            skip_tool_request_middleware=True,
        ))
    finally:
        module.adapter._active_adapter = previous
        tool_search.load_config = previous_load_config
        _clear_tool_defs_cache()
        invalidate_check_fn_cache()

    bridged_names = {item.get("function", {}).get("name") for item in bridged_definitions}
    bridge_tool_names = {"tool_search", "tool_describe", "tool_call"}
    if not bridge_tool_names.issubset(bridged_names):
        raise RuntimeError(f"enabled user plugin model_tools Tool Search bridge tools missing: {bridged_names}")
    bridged_arinova_names = {name for name in bridged_names if isinstance(name, str) and name.startswith("arinova_")}
    if bridged_arinova_names:
        raise RuntimeError(f"enabled user plugin model_tools Tool Search did not defer Arinova tools: {sorted(bridged_arinova_names)}")
    matches = bridge_search.get("matches")
    if not isinstance(matches, list) or not any(match.get("name") == "arinova_send_message" for match in matches if isinstance(match, dict)):
        raise RuntimeError(f"enabled user plugin tool_search did not surface arinova_send_message: {bridge_search}")
    describe_props = (bridge_describe.get("parameters") or {}).get("properties") or {}
    if not {"conversation_id", "content"}.issubset(describe_props):
        raise RuntimeError(f"enabled user plugin tool_describe did not expose arinova_send_message schema: {bridge_describe}")
    if scope_adapter.calls or "arinova_send_message' is not available in this session" not in str(bridge_out_of_scope.get("error")):
        raise RuntimeError(
            "enabled user plugin model_tools tool_call did not block out-of-scope Arinova bridge call: "
            f"calls={scope_adapter.calls!r} result={bridge_out_of_scope!r}"
        )


def assert_real_agent_init_enabled_toolset(module, expected_tools: set[str]) -> None:
    sys.modules.setdefault("httpx", types.ModuleType("httpx"))
    sys.modules.setdefault("requests", types.ModuleType("requests"))

    import model_tools
    import run_agent
    from agent import auxiliary_client, ssl_guard
    from model_tools import _clear_tool_defs_cache
    from tools import tool_search
    from tools.registry import invalidate_check_fn_cache

    class DefinitionAdapter:
        is_connected = True

        def is_running(self):
            return True

    class FakeClient:
        api_key = "sk-test-hermes-arinova"
        base_url = "https://api.openai.test/v1"
        default_headers = {}

        def close(self):
            pass

    previous_adapter = module.adapter._active_adapter
    previous_load_config = tool_search.load_config
    previous_resolve_provider_client = auxiliary_client.resolve_provider_client
    previous_verify_ca_bundle = ssl_guard.verify_ca_bundle_with_fallback
    previous_create_openai_client = run_agent.AIAgent._create_openai_client
    module.adapter._active_adapter = DefinitionAdapter()
    tool_search.load_config = lambda: tool_search.ToolSearchConfig(
        enabled="on",
        threshold_pct=0.0,
        search_default_limit=5,
        max_search_limit=20,
    )
    auxiliary_client.resolve_provider_client = lambda *_args, **_kwargs: (
        types.SimpleNamespace(
            api_key="sk-test-hermes-arinova",
            base_url="https://api.openai.test/v1",
            default_headers={},
        ),
        "gpt-4o-mini",
    )
    ssl_guard.verify_ca_bundle_with_fallback = lambda: None
    run_agent.AIAgent._create_openai_client = lambda self, client_kwargs, *, reason, shared: FakeClient()
    try:
        _clear_tool_defs_cache()
        invalidate_check_fn_cache()
        agent = run_agent.AIAgent(
            provider="openai",
            model="gpt-4o-mini",
            enabled_toolsets=["hermes-arinova"],
            quiet_mode=True,
            skip_context_files=True,
            skip_memory=True,
            max_iterations=1,
            tool_delay=0,
            session_id="arinova-init-session",
        )
    finally:
        module.adapter._active_adapter = previous_adapter
        tool_search.load_config = previous_load_config
        auxiliary_client.resolve_provider_client = previous_resolve_provider_client
        ssl_guard.verify_ca_bundle_with_fallback = previous_verify_ca_bundle
        run_agent.AIAgent._create_openai_client = previous_create_openai_client
        _clear_tool_defs_cache()
        invalidate_check_fn_cache()

    if agent.enabled_toolsets != ["hermes-arinova"]:
        raise RuntimeError(f"enabled user plugin AIAgent init did not preserve enabled_toolsets: {agent.enabled_toolsets!r}")
    initialized_names = {item.get("function", {}).get("name") for item in agent.tools}
    bridge_tool_names = {"tool_search", "tool_describe", "tool_call"}
    if not bridge_tool_names.issubset(initialized_names):
        raise RuntimeError(f"enabled user plugin AIAgent init did not expose Tool Search bridge tools: {initialized_names}")
    initialized_arinova_names = {
        name for name in initialized_names if isinstance(name, str) and name.startswith("arinova_")
    }
    if initialized_arinova_names:
        raise RuntimeError(f"enabled user plugin AIAgent init leaked direct Arinova tools with Tool Search enabled: {sorted(initialized_arinova_names)}")
    if not bridge_tool_names.issubset(agent.valid_tool_names):
        raise RuntimeError(f"enabled user plugin AIAgent init valid_tool_names missed bridge tools: {agent.valid_tool_names}")

    _clear_tool_defs_cache()
    invalidate_check_fn_cache()
    module.adapter._active_adapter = DefinitionAdapter()
    try:
        search = json.loads(model_tools.handle_function_call(
            "tool_search",
            {"query": "send message", "limit": 5},
            enabled_toolsets=["hermes-arinova"],
            skip_pre_tool_call_hook=True,
            skip_tool_request_middleware=True,
        ))
    finally:
        module.adapter._active_adapter = previous_adapter
        _clear_tool_defs_cache()
        invalidate_check_fn_cache()
    matches = search.get("matches")
    if not isinstance(matches, list) or not any(match.get("name") == "arinova_send_message" for match in matches if isinstance(match, dict)):
        raise RuntimeError(f"enabled user plugin AIAgent init tool_search could not find Arinova tool: {search}")


class FakeDispatchAdapter:
    is_connected = True
    VOID_AGENT_METHODS = {
        "sendMessage",
        "sendTelemetry",
        "sendHud",
        "sendTaskUpdate",
        "reportToolCall",
        "deleteNote",
        "archiveBoard",
        "deleteColumn",
        "reorderColumns",
        "linkCardNote",
        "unlinkCardNote",
        "deleteLabel",
        "addCardLabel",
        "removeCardLabel",
    }

    def __init__(self) -> None:
        self.calls: list[tuple] = []

    def is_running(self) -> bool:
        return True

    def active_task_id(self) -> str:
        return "task-active"

    def _task_conversation_id(self, task_id: str) -> str | None:
        if task_id == "task-cron":
            return None
        return "conv-active" if task_id == "task-active" else None

    def _no_conversation_task_error(self, task_id: str, api: str) -> str:
        task_kind = "cron_wakeup" if task_id == "task-cron" else "unknown"
        return f"{api} is unavailable: this task (taskKind={task_kind}) is not bound to a conversation"

    async def call_agent_sdk(self, method: str, *args):
        self.calls.append(("agent", method, args))
        if method in self.VOID_AGENT_METHODS:
            return None
        return {"method": method, "args": list(args)}

    async def call_task_sdk(self, task_id: str, method: str, *args):
        self.calls.append(("task", task_id, method, args))
        return {"taskId": task_id, "method": method, "args": list(args)}


async def assert_registry_dispatches(registry, module) -> None:
    fake_adapter = FakeDispatchAdapter()
    previous = module.adapter._active_adapter
    module.adapter._active_adapter = fake_adapter
    try:
        generic_agent = registry.get_entry("arinova_sdk_call")
        named_agent = registry.get_entry("arinova_send_message")
        upload_agent = registry.get_entry("arinova_upload_file")
        generic_task = registry.get_entry("arinova_task_call")
        named_task = registry.get_entry("arinova_task_call_action")
        task_history = registry.get_entry("arinova_task_fetch_history")
        task_upload = registry.get_entry("arinova_task_upload_file")
        if not all((generic_agent, named_agent, upload_agent, generic_task, named_task, task_history, task_upload)):
            raise RuntimeError("enabled user plugin registry dispatch sample tool missing")

        generic_agent_result = json.loads(await generic_agent.handler({
            "method": "queryMemory",
            "options": {"query": "hello", "limit": 2},
        }))
        generic_agent_upload_result = json.loads(await generic_agent.handler({
            "method": "uploadFile",
            "conversation_id": "conv-1",
            "file": {"base64": "R0E="},
            "file_name": "generic-agent-upload.txt",
            "file_type": "text/plain",
        }))
        named_agent_result = json.loads(await named_agent.handler({
            "conversation_id": "conv-1",
            "content": "hello from Hermes registry",
        }))
        upload_agent_result = json.loads(await upload_agent.handler({
            "conversation_id": "conv-1",
            "file": {"base64": "SGk="},
            "file_name": "hello.txt",
            "file_type": "text/plain",
        }))
        generic_task_result = json.loads(await generic_task.handler({
            "method": "callAction",
            "task_id": "task-active",
            "action": "open.memo",
            "action_args": {"memoId": "memo-1"},
            "options": {"dryRun": True, "reason": "install-check"},
        }))
        generic_task_upload_result = json.loads(await generic_task.handler({
            "method": "uploadFile",
            "task_id": "task-active",
            "file": {"base64": "R0k="},
            "file_name": "generic-task-upload.txt",
            "file_type": "text/plain",
        }))
        named_task_result = json.loads(await named_task.handler({
            "task_id": "task-active",
            "action": "close.memo",
            "action_args": {"memoId": "memo-1"},
        }))
        task_upload_result = json.loads(await task_upload.handler({
            "task_id": "task-active",
            "file": {"base64": "IQ=="},
            "file_name": "task-upload.txt",
            "file_type": "text/plain",
        }))
        task_history_no_conversation = json.loads(await task_history.handler({
            "task_id": "task-cron",
            "options": {"limit": 1},
        }))
        non_object_generic_agent_payload = json.loads(await generic_agent.handler([]))
        non_object_named_agent_payload = json.loads(await named_agent.handler([]))
        non_object_generic_task_payload = json.loads(await generic_task.handler([]))
        non_object_named_task_payload = json.loads(await task_history.handler([]))
    finally:
        module.adapter._active_adapter = previous

    results = {
        "generic agent": generic_agent_result,
        "generic agent upload": generic_agent_upload_result,
        "named agent": named_agent_result,
        "upload agent": upload_agent_result,
        "generic task": generic_task_result,
        "generic task upload": generic_task_upload_result,
        "named task": named_task_result,
        "task upload": task_upload_result,
    }
    failed = {name: result for name, result in results.items() if result.get("success") is not True}
    if failed:
        raise RuntimeError(f"enabled user plugin registry dispatch failed: {failed}")
    expected_non_object_payload_errors = {
        "generic agent": {"success": False, "error": "tool payload must be a JSON object"},
        "named agent": {"success": False, "method": "sendMessage", "error": "tool payload must be a JSON object"},
        "generic task": {"success": False, "error": "tool payload must be a JSON object"},
        "named task": {"success": False, "method": "fetchHistory", "error": "tool payload must be a JSON object"},
    }
    non_object_payload_errors = {
        "generic agent": non_object_generic_agent_payload,
        "named agent": non_object_named_agent_payload,
        "generic task": non_object_generic_task_payload,
        "named task": non_object_named_task_payload,
    }
    if non_object_payload_errors != expected_non_object_payload_errors:
        raise RuntimeError(
            "enabled user plugin registry dispatch did not reject non-object tool payloads: "
            f"{non_object_payload_errors!r}"
        )
    expected_calls = [
        ("agent", "queryMemory", ({"query": "hello", "limit": 2},)),
        ("agent", "uploadFile", ("conv-1", {"base64": "R0E="}, "generic-agent-upload.txt", "text/plain")),
        ("agent", "sendMessage", ("conv-1", "hello from Hermes registry")),
        ("agent", "uploadFile", ("conv-1", {"base64": "SGk="}, "hello.txt", "text/plain")),
        ("task", "task-active", "callAction", ("open.memo", {"memoId": "memo-1"}, {"dryRun": True, "reason": "install-check"})),
        ("task", "task-active", "uploadFile", ({"base64": "R0k="}, "generic-task-upload.txt", "text/plain")),
        ("task", "task-active", "callAction", ("close.memo", {"memoId": "memo-1"})),
        ("task", "task-active", "uploadFile", ({"base64": "IQ=="}, "task-upload.txt", "text/plain")),
    ]
    if fake_adapter.calls != expected_calls:
        raise RuntimeError(
            "enabled user plugin registry dispatch did not route expected SDK calls: "
            f"{fake_adapter.calls!r}"
        )
    if (
        task_history_no_conversation.get("success") is not False
        or task_history_no_conversation.get("task_id") != "task-cron"
        or task_history_no_conversation.get("method") != "fetchHistory"
        or "taskKind=cron_wakeup" not in str(task_history_no_conversation.get("error"))
    ):
        raise RuntimeError(
            "enabled user plugin registry dispatch did not preserve no-conversation task guard: "
            f"{task_history_no_conversation!r}"
        )


def assert_agent_runtime_invokes_enabled_toolset(module) -> None:
    sys.modules.setdefault("httpx", types.ModuleType("httpx"))

    from agent import agent_runtime_helpers
    import model_tools

    class FakeHermesAgent:
        session_id = "arinova-runtime-session"
        valid_tool_names = ["arinova_send_message", "tool_call"]
        enabled_toolsets = ["hermes-arinova"]
        disabled_toolsets = []
        _current_turn_id = "turn-runtime"
        _current_api_request_id = "api-runtime"
        _memory_manager = None

    fake_adapter = FakeDispatchAdapter()
    previous = module.adapter._active_adapter
    previous_ra = agent_runtime_helpers._ra
    module.adapter._active_adapter = fake_adapter
    agent_runtime_helpers._ra = lambda: model_tools
    try:
        raw = agent_runtime_helpers.invoke_tool(
            FakeHermesAgent(),
            "arinova_send_message",
            {"conversation_id": "conv-runtime", "content": "hello from Hermes agent runtime"},
            "task-runtime",
            tool_call_id="call-runtime",
            messages=[],
            pre_tool_block_checked=True,
            skip_tool_request_middleware=True,
        )
        bridge_raw = agent_runtime_helpers.invoke_tool(
            FakeHermesAgent(),
            "tool_call",
            {
                "name": "arinova_send_message",
                "arguments": {
                    "conversation_id": "conv-runtime-bridge",
                    "content": "hello from Hermes tool_call bridge",
                },
            },
            "task-runtime",
            tool_call_id="call-runtime-bridge",
            messages=[],
            pre_tool_block_checked=True,
            skip_tool_request_middleware=True,
        )
        non_object_raw = agent_runtime_helpers.invoke_tool(
            FakeHermesAgent(),
            "arinova_send_message",
            [],
            "task-runtime",
            tool_call_id="call-runtime-non-object",
            messages=[],
            pre_tool_block_checked=True,
            skip_tool_request_middleware=True,
        )
    finally:
        agent_runtime_helpers._ra = previous_ra
        module.adapter._active_adapter = previous

    parsed = json.loads(raw)
    if parsed.get("success") is not True:
        raise RuntimeError(f"enabled user plugin Hermes agent runtime invoke failed: {raw}")
    bridge_parsed = json.loads(bridge_raw)
    if bridge_parsed.get("success") is not True:
        raise RuntimeError(f"enabled user plugin Hermes tool_call bridge invoke failed: {bridge_raw}")
    non_object_parsed = json.loads(non_object_raw)
    if non_object_parsed != {
        "success": False,
        "method": "sendMessage",
        "error": "args for sendMessage requires at least 2 item(s)",
    }:
        raise RuntimeError(
            "enabled user plugin Hermes agent runtime invoke did not preserve positional argument bound error: "
            f"{non_object_parsed!r}"
        )
    if fake_adapter.calls != [
        ("agent", "sendMessage", ("conv-runtime", "hello from Hermes agent runtime")),
        ("agent", "sendMessage", ("conv-runtime-bridge", "hello from Hermes tool_call bridge")),
    ]:
        raise RuntimeError(
            "enabled user plugin Hermes agent runtime invoke did not route expected SDK call: "
            f"{fake_adapter.calls!r}"
        )

    sys.modules.setdefault("requests", types.ModuleType("requests"))

    import run_agent
    from agent import tool_executor

    class AllowingGuardrails:
        def before_call(self, _name, _args):
            return types.SimpleNamespace(allows_execution=True)

    class DisabledCheckpointManager:
        enabled = False

    class EmptySubdirHints:
        def check_tool_call(self, _name, _args):
            return ""

    class FakeToolExecutorAgent:
        session_id = "arinova-executor-session"
        valid_tool_names = ["tool_call", "arinova_send_message"]
        enabled_toolsets = ["hermes-arinova"]
        disabled_toolsets = []
        _current_turn_id = "turn-executor"
        _current_api_request_id = "api-executor"
        _memory_manager = None
        _context_engine_tool_names = set()
        _interrupt_requested = False
        _tool_guardrails = AllowingGuardrails()
        _checkpoint_mgr = DisabledCheckpointManager()
        _subdirectory_hints = EmptySubdirHints()
        quiet_mode = True
        verbose_logging = False
        tool_progress_mode = "off"
        tool_progress_callback = None
        tool_start_callback = None
        tool_complete_callback = None
        tool_delay = 0
        log_prefix = ""
        log_prefix_chars = 120

        def __init__(self):
            self._tool_worker_threads = set()
            self._tool_worker_threads_lock = threading.Lock()

        def _touch_activity(self, _message):
            pass

        def _vprint(self, *_args, **_kwargs):
            pass

        def _wrap_verbose(self, _prefix, value):
            return value

        def _should_emit_quiet_tool_messages(self):
            return False

        def _should_start_quiet_spinner(self):
            return False

        def _append_guardrail_observation(self, _name, _args, result, *, failed=False):
            return result

        def _guardrail_block_result(self, decision):
            return json.dumps({"error": getattr(decision, "message", "blocked")})

        def _record_file_mutation_result(self, *_args, **_kwargs):
            pass

        def _tool_result_content_for_active_model(self, _name, result):
            return result

        def _flush_messages_to_session_db(self, _messages):
            pass

        def _apply_pending_steer_to_tool_results(self, _messages, _count):
            pass

        def _invoke_tool(
            self,
            function_name,
            function_args,
            effective_task_id,
            tool_call_id,
            *,
            messages=None,
            pre_tool_block_checked=False,
            skip_tool_request_middleware=False,
            tool_request_middleware_trace=None,
        ):
            return run_agent.AIAgent._invoke_tool(
                self,
                function_name,
                function_args,
                effective_task_id,
                tool_call_id=tool_call_id,
                messages=messages,
                pre_tool_block_checked=pre_tool_block_checked,
                skip_tool_request_middleware=skip_tool_request_middleware,
                tool_request_middleware_trace=list(tool_request_middleware_trace or []),
            )

    class OutOfScopeToolExecutorAgent(FakeToolExecutorAgent):
        valid_tool_names = ["tool_call"]
        enabled_toolsets = []
        disabled_toolsets = ["hermes-arinova"]

    executor_adapter = FakeDispatchAdapter()
    previous = module.adapter._active_adapter
    previous_ra = tool_executor._ra
    module.adapter._active_adapter = executor_adapter
    tool_executor._ra = lambda: model_tools
    executor_messages = []
    try:
        tool_executor.execute_tool_calls_sequential(
            FakeToolExecutorAgent(),
            types.SimpleNamespace(tool_calls=[
                types.SimpleNamespace(
                    id="call-executor-bridge",
                    function=types.SimpleNamespace(
                        name="tool_call",
                        arguments=json.dumps({
                            "name": "arinova_send_message",
                            "arguments": {
                                "conversation_id": "conv-executor-bridge",
                                "content": "hello from Hermes tool executor bridge",
                            },
                        }),
                    ),
                ),
                types.SimpleNamespace(
                    id="call-executor-bridge-bad-args",
                    function=types.SimpleNamespace(
                        name="tool_call",
                        arguments=json.dumps({
                            "name": "arinova_send_message",
                            "arguments": [],
                        }),
                    ),
                ),
            ]),
            executor_messages,
            "task-executor",
        )
    finally:
        tool_executor._ra = previous_ra
        module.adapter._active_adapter = previous
    if executor_adapter.calls != [
        ("agent", "sendMessage", ("conv-executor-bridge", "hello from Hermes tool executor bridge")),
    ]:
        raise RuntimeError(
            "enabled user plugin tool_executor did not unwrap tool_call through enabled Arinova toolset: "
            f"{executor_adapter.calls!r}"
        )
    if len(executor_messages) != 2 or executor_messages[0].get("tool_call_id") != "call-executor-bridge":
        raise RuntimeError(f"enabled user plugin tool_executor did not append expected tool result: {executor_messages!r}")
    executor_bad_args = json.loads(executor_messages[1].get("content") or "{}")
    if (
        executor_messages[1].get("tool_call_id") != "call-executor-bridge-bad-args"
        or executor_messages[1].get("name") != "tool_call"
        or executor_bad_args != {"error": "tool_call 'arguments' must be an object"}
    ):
        raise RuntimeError(
            "enabled user plugin tool_executor did not preserve bridge argument object error: "
            f"{executor_messages!r}"
        )

    scoped_adapter = FakeDispatchAdapter()
    previous = module.adapter._active_adapter
    previous_ra = tool_executor._ra
    module.adapter._active_adapter = scoped_adapter
    tool_executor._ra = lambda: model_tools
    scoped_messages = []
    try:
        tool_executor.execute_tool_calls_sequential(
            OutOfScopeToolExecutorAgent(),
            types.SimpleNamespace(tool_calls=[
                types.SimpleNamespace(
                    id="call-executor-bridge-out-of-scope",
                    function=types.SimpleNamespace(
                        name="tool_call",
                        arguments=json.dumps({
                            "name": "arinova_send_message",
                            "arguments": {
                                "conversation_id": "conv-out-of-scope",
                                "content": "blocked by scope",
                            },
                        }),
                    ),
                )
            ]),
            scoped_messages,
            "task-executor-scope",
        )
    finally:
        tool_executor._ra = previous_ra
        module.adapter._active_adapter = previous
    scoped_error = json.loads(scoped_messages[0].get("content") or "{}") if scoped_messages else {}
    if scoped_adapter.calls or (
        len(scoped_messages) != 1
        or scoped_messages[0].get("tool_call_id") != "call-executor-bridge-out-of-scope"
        or scoped_messages[0].get("name") != "tool_call"
        or "arinova_send_message' is not available in this session" not in str(scoped_error.get("error"))
    ):
        raise RuntimeError(
            "enabled user plugin tool_executor did not block out-of-scope Arinova bridge call: "
            f"calls={scoped_adapter.calls!r} messages={scoped_messages!r}"
        )

    concurrent_adapter = FakeDispatchAdapter()
    previous = module.adapter._active_adapter
    previous_ra = tool_executor._ra
    previous_agent_runtime_ra = agent_runtime_helpers._ra
    module.adapter._active_adapter = concurrent_adapter
    tool_executor._ra = lambda: model_tools
    agent_runtime_helpers._ra = lambda: model_tools
    concurrent_messages = []
    try:
        tool_executor.execute_tool_calls_concurrent(
            FakeToolExecutorAgent(),
            types.SimpleNamespace(tool_calls=[
                types.SimpleNamespace(
                    id="call-executor-concurrent-bridge",
                    function=types.SimpleNamespace(
                        name="tool_call",
                        arguments=json.dumps({
                            "name": "arinova_send_message",
                            "arguments": {
                                "conversation_id": "conv-executor-concurrent",
                                "content": "hello from Hermes concurrent tool executor bridge",
                            },
                        }),
                    ),
                ),
                types.SimpleNamespace(
                    id="call-executor-concurrent-bridge-bad-args",
                    function=types.SimpleNamespace(
                        name="tool_call",
                        arguments=json.dumps({
                            "name": "arinova_send_message",
                            "arguments": [],
                        }),
                    ),
                ),
            ]),
            concurrent_messages,
            "task-executor-concurrent",
        )
    finally:
        tool_executor._ra = previous_ra
        agent_runtime_helpers._ra = previous_agent_runtime_ra
        module.adapter._active_adapter = previous
    if concurrent_adapter.calls != [
        ("agent", "sendMessage", ("conv-executor-concurrent", "hello from Hermes concurrent tool executor bridge")),
    ]:
        raise RuntimeError(
            "enabled user plugin concurrent tool_executor did not unwrap tool_call through enabled Arinova toolset: "
            f"{concurrent_adapter.calls!r}"
        )
    if len(concurrent_messages) != 2 or concurrent_messages[0].get("tool_call_id") != "call-executor-concurrent-bridge":
        raise RuntimeError(
            f"enabled user plugin concurrent tool_executor did not append expected tool result: {concurrent_messages!r}"
        )
    concurrent_bad_args = json.loads(concurrent_messages[1].get("content") or "{}")
    if (
        concurrent_messages[1].get("tool_call_id") != "call-executor-concurrent-bridge-bad-args"
        or concurrent_messages[1].get("name") != "tool_call"
        or concurrent_bad_args != {"error": "tool_call 'arguments' must be an object"}
    ):
        raise RuntimeError(
            "enabled user plugin concurrent tool_executor did not preserve bridge argument object error: "
            f"{concurrent_messages!r}"
        )

    concurrent_scoped_adapter = FakeDispatchAdapter()
    previous = module.adapter._active_adapter
    previous_ra = tool_executor._ra
    previous_agent_runtime_ra = agent_runtime_helpers._ra
    module.adapter._active_adapter = concurrent_scoped_adapter
    tool_executor._ra = lambda: model_tools
    agent_runtime_helpers._ra = lambda: model_tools
    concurrent_scoped_messages = []
    try:
        tool_executor.execute_tool_calls_concurrent(
            OutOfScopeToolExecutorAgent(),
            types.SimpleNamespace(tool_calls=[
                types.SimpleNamespace(
                    id="call-executor-concurrent-bridge-out-of-scope",
                    function=types.SimpleNamespace(
                        name="tool_call",
                        arguments=json.dumps({
                            "name": "arinova_send_message",
                            "arguments": {
                                "conversation_id": "conv-concurrent-out-of-scope",
                                "content": "blocked by concurrent scope",
                            },
                        }),
                    ),
                )
            ]),
            concurrent_scoped_messages,
            "task-executor-concurrent-scope",
        )
    finally:
        tool_executor._ra = previous_ra
        agent_runtime_helpers._ra = previous_agent_runtime_ra
        module.adapter._active_adapter = previous
    concurrent_scoped_error = json.loads(concurrent_scoped_messages[0].get("content") or "{}") if concurrent_scoped_messages else {}
    if concurrent_scoped_adapter.calls or (
        len(concurrent_scoped_messages) != 1
        or concurrent_scoped_messages[0].get("tool_call_id") != "call-executor-concurrent-bridge-out-of-scope"
        or concurrent_scoped_messages[0].get("name") != "tool_call"
        or "arinova_send_message' is not available in this session" not in str(concurrent_scoped_error.get("error"))
    ):
        raise RuntimeError(
            "enabled user plugin concurrent tool_executor did not block out-of-scope Arinova bridge call: "
            f"calls={concurrent_scoped_adapter.calls!r} messages={concurrent_scoped_messages!r}"
        )


def assert_platform_callbacks(entry, module, platform_config) -> None:
    if entry.source != "plugin":
        raise RuntimeError(f"enabled user plugin Arinova platform source drifted: {entry.source!r}")
    if entry.plugin_name != "hermes-arinova-plugin":
        raise RuntimeError(f"enabled user plugin Arinova platform plugin_name drifted: {entry.plugin_name!r}")
    if entry.required_env != ["ARINOVA_SERVER_URL", "ARINOVA_BOT_TOKEN"]:
        raise RuntimeError(f"enabled user plugin Arinova platform required_env drifted: {entry.required_env!r}")
    if entry.allowed_users_env != "ARINOVA_ALLOWED_USERS":
        raise RuntimeError(f"enabled user plugin Arinova allowed users env drifted: {entry.allowed_users_env!r}")
    if entry.allow_all_env != "ARINOVA_ALLOW_ALL_USERS":
        raise RuntimeError(f"enabled user plugin Arinova allow-all env drifted: {entry.allow_all_env!r}")
    if entry.install_hint != "Run `npm install` inside the plugin sidecar directory.":
        raise RuntimeError(f"enabled user plugin Arinova install hint drifted: {entry.install_hint!r}")
    if "Arinova Chat" not in entry.platform_hint or "streamed progress" not in entry.platform_hint:
        raise RuntimeError(f"enabled user plugin Arinova platform hint drifted: {entry.platform_hint!r}")
    valid_factory_config = platform_config(
        enabled=True,
        token="ari_user_factory_token",
        extra={"server_url": "wss://user-factory.example"},
    )
    old_server = os.environ.get("ARINOVA_SERVER_URL")
    old_token = os.environ.get("ARINOVA_BOT_TOKEN")
    os.environ.pop("ARINOVA_SERVER_URL", None)
    os.environ.pop("ARINOVA_BOT_TOKEN", None)
    try:
        created = entry.adapter_factory(valid_factory_config)
        if not isinstance(created, module.ArinovaAdapter):
            raise RuntimeError(f"enabled user plugin Arinova adapter factory returned unexpected adapter: {created!r}")
        if created.config is not valid_factory_config:
            raise RuntimeError("enabled user plugin Arinova adapter factory did not preserve PlatformConfig object")
        if created.server_url != "wss://user-factory.example" or created.bot_token != "ari_user_factory_token":
            raise RuntimeError(
                "enabled user plugin Arinova adapter factory did not hydrate credentials: "
                f"server_url={created.server_url!r} bot_token={created.bot_token!r}"
            )
    finally:
        if old_server is None:
            os.environ.pop("ARINOVA_SERVER_URL", None)
        else:
            os.environ["ARINOVA_SERVER_URL"] = old_server
        if old_token is None:
            os.environ.pop("ARINOVA_BOT_TOKEN", None)
        else:
            os.environ["ARINOVA_BOT_TOKEN"] = old_token
    if entry.validate_config is not module.validate_config:
        raise RuntimeError("enabled user plugin did not register Arinova validate_config callback")
    if entry.is_connected is not module.is_connected:
        raise RuntimeError("enabled user plugin did not register Arinova is_connected callback")
    empty_config = platform_config(enabled=True, extra={})
    if entry.validate_config(empty_config) or entry.is_connected(empty_config):
        raise RuntimeError("enabled user plugin Arinova config callbacks accepted missing credentials")
    old_server = os.environ.get("ARINOVA_SERVER_URL")
    old_token = os.environ.get("ARINOVA_BOT_TOKEN")
    os.environ["ARINOVA_SERVER_URL"] = "   "
    os.environ["ARINOVA_BOT_TOKEN"] = "  "
    try:
        if entry.validate_config(empty_config) or entry.is_connected(empty_config):
            raise RuntimeError("enabled user plugin Arinova config callbacks accepted blank env credentials")
    finally:
        if old_server is None:
            os.environ.pop("ARINOVA_SERVER_URL", None)
        else:
            os.environ["ARINOVA_SERVER_URL"] = old_server
        if old_token is None:
            os.environ.pop("ARINOVA_BOT_TOKEN", None)
        else:
            os.environ["ARINOVA_BOT_TOKEN"] = old_token
    configured = platform_config(
        enabled=True,
        extra={"server_url": "wss://user.example", "bot_token": "ari_user"},
    )
    if not entry.validate_config(configured) or not entry.is_connected(configured):
        raise RuntimeError("enabled user plugin Arinova config callbacks rejected configured credentials")
    old_server = os.environ.get("ARINOVA_SERVER_URL")
    old_token = os.environ.get("ARINOVA_BOT_TOKEN")
    os.environ["ARINOVA_SERVER_URL"] = "   "
    os.environ["ARINOVA_BOT_TOKEN"] = "  "
    try:
        blank_env_created = entry.adapter_factory(configured)
        if blank_env_created.server_url != "wss://user.example" or blank_env_created.bot_token != "ari_user":
            raise RuntimeError("enabled user plugin blank env credentials shadowed configured credentials")
    finally:
        if old_server is None:
            os.environ.pop("ARINOVA_SERVER_URL", None)
        else:
            os.environ["ARINOVA_SERVER_URL"] = old_server
        if old_token is None:
            os.environ.pop("ARINOVA_BOT_TOKEN", None)
        else:
            os.environ["ARINOVA_BOT_TOKEN"] = old_token
    token_configured = platform_config(
        enabled=True,
        token="ari_user_token",
        extra={"server_url": "wss://user-token.example"},
    )
    if not entry.validate_config(token_configured) or not entry.is_connected(token_configured):
        raise RuntimeError("enabled user plugin Arinova config callbacks rejected PlatformConfig.token credentials")
    old_server = os.environ.get("ARINOVA_SERVER_URL")
    old_token = os.environ.get("ARINOVA_BOT_TOKEN")
    os.environ["ARINOVA_SERVER_URL"] = "wss://user-env.example"
    os.environ["ARINOVA_BOT_TOKEN"] = "ari_user_env"
    try:
        env_configured = platform_config(enabled=True, extra={})
        if not entry.validate_config(env_configured) or not entry.is_connected(env_configured):
            raise RuntimeError("enabled user plugin Arinova config callbacks rejected env credentials")
    finally:
        if old_server is None:
            os.environ.pop("ARINOVA_SERVER_URL", None)
        else:
            os.environ["ARINOVA_SERVER_URL"] = old_server
        if old_token is None:
            os.environ.pop("ARINOVA_BOT_TOKEN", None)
        else:
            os.environ["ARINOVA_BOT_TOKEN"] = old_token


def assert_yaml_bridge(entry) -> None:
    env_keys = [
        "ARINOVA_SERVER_URL",
        "ARINOVA_BOT_TOKEN",
        "ARINOVA_ALLOWED_USERS",
        "ARINOVA_ALLOW_ALL_USERS",
        "ARINOVA_ALLOW_BOTS",
        "ARINOVA_NODE_BIN",
        "ARINOVA_HOME_CONVERSATION",
        "ARINOVA_HOME_CONVERSATION_NAME",
        "ARINOVA_AGENT_SKILLS_JSON",
        "ARINOVA_AGENT_SKILLS",
    ]
    old_env = {key: os.environ.get(key) for key in env_keys}
    for key in env_keys:
        os.environ.pop(key, None)
    try:
        seeded = entry.apply_yaml_config_fn(
            {},
            {
                "server_url": "wss://user-yaml.example",
                "bot_token": "ari_user_yaml",
                "allowed_users": ["user-1", "user-2"],
                "allow_all_users": False,
                "allow_bots": "all",
                "sidecar_bind": "127.0.0.2",
                "adapter_bind": "127.0.0.3",
                "home_conversation": {"chat_id": "conv-user-yaml", "name": "User YAML Home"},
                "agent_skills": [{"id": "memo", "name": "Memo", "description": "Use memos"}],
                "concurrency_mode": "unbounded",
                "adapter_post_timeout_ms": 5432,
            },
        )
        if seeded is None:
            raise RuntimeError("enabled user plugin YAML bridge returned no extras")
        expected = {
            "server_url": "wss://user-yaml.example",
            "bot_token": "ari_user_yaml",
            "allow_bots": "all",
            "sidecar_bind": "127.0.0.2",
            "adapter_bind": "127.0.0.3",
            "concurrency_mode": "unbounded",
            "adapter_post_timeout_ms": 5432,
        }
        for key, value in expected.items():
            if seeded.get(key) != value:
                raise RuntimeError(f"enabled user plugin YAML bridge extra {key!r} mismatch: {seeded}")
        if json.loads(seeded.get("agent_skills_json", "[]")) != [
            {"id": "memo", "name": "Memo", "description": "Use memos"}
        ]:
            raise RuntimeError(f"enabled user plugin YAML bridge did not encode agent skills: {seeded}")
        if os.environ.get("ARINOVA_HOME_CONVERSATION") != "conv-user-yaml":
            raise RuntimeError("enabled user plugin YAML bridge did not set ARINOVA_HOME_CONVERSATION")
        if os.environ.get("ARINOVA_ALLOWED_USERS") != "user-1,user-2":
            raise RuntimeError("enabled user plugin YAML bridge did not set ARINOVA_ALLOWED_USERS")

        for key in env_keys:
            os.environ.pop(key, None)
        token_alias_seeded = entry.apply_yaml_config_fn(
            {},
            {
                "server_url": "wss://user-token-alias.example",
                "token": "ari_user_token_alias",
            },
        )
        if token_alias_seeded.get("bot_token") != "ari_user_token_alias":
            raise RuntimeError(f"enabled user plugin YAML bridge did not accept token alias: {token_alias_seeded}")
        if os.environ.get("ARINOVA_BOT_TOKEN") != "ari_user_token_alias":
            raise RuntimeError("enabled user plugin YAML bridge did not seed ARINOVA_BOT_TOKEN from token alias")

        for key in env_keys:
            os.environ.pop(key, None)
        home_alias_seeded = entry.apply_yaml_config_fn(
            {},
            {
                "server_url": "wss://user-home-alias.example",
                "token": "ari_user_home_alias",
                "home_channel": {"chat_id": "conv-user-home-alias", "name": "User Home Alias"},
            },
        )
        if home_alias_seeded.get("home_channel") != {
            "chat_id": "conv-user-home-alias",
            "name": "User Home Alias",
        }:
            raise RuntimeError(f"enabled user plugin YAML bridge did not accept home_channel alias: {home_alias_seeded}")
        if os.environ.get("ARINOVA_HOME_CONVERSATION") != "conv-user-home-alias":
            raise RuntimeError("enabled user plugin YAML bridge did not seed ARINOVA_HOME_CONVERSATION from home_channel alias")
        if os.environ.get("ARINOVA_HOME_CONVERSATION_NAME") != "User Home Alias":
            raise RuntimeError("enabled user plugin YAML bridge did not seed ARINOVA_HOME_CONVERSATION_NAME from home_channel alias")
    finally:
        for key, value in old_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def assert_adapter_sidecar_env(module, platform_config) -> None:
    env_keys = [
        "ARINOVA_SERVER_URL",
        "ARINOVA_BOT_TOKEN",
        "ARINOVA_SIDECAR_PORT",
        "ARINOVA_SIDECAR_BIND",
        "ARINOVA_ADAPTER_BIND",
        "ARINOVA_AGENT_SKILLS_JSON",
        "ARINOVA_AGENT_SKILLS",
        "ARINOVA_CONCURRENCY_MODE",
        "ARINOVA_AGENT_CONCURRENCY_MODE",
        "ARINOVA_RECONNECT_INTERVAL_MS",
        "ARINOVA_PING_INTERVAL_MS",
        "ARINOVA_PING_TIMEOUT_MS",
        "ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION",
        "ARINOVA_ADAPTER_POST_TIMEOUT_MS",
        "ARINOVA_CONTROL_MAX_BODY_BYTES",
        "ARINOVA_AGENT_SDK_ROOT",
        "ARINOVA_SIDECAR_POST_TIMEOUT_MS",
        "ARINOVA_CONNECT_TIMEOUT_MS",
        "ARINOVA_DOWNLOAD_ATTACHMENTS",
        "ARINOVA_ATTACHMENT_MAX_BYTES",
        "ARINOVA_SIDECAR_AUTOSTART",
        "ARINOVA_ALLOW_BOTS",
    ]
    old_env = {key: os.environ.get(key) for key in env_keys}
    for key in env_keys:
        os.environ.pop(key, None)
    try:
        adapter = module.ArinovaAdapter(
            platform_config(
                enabled=True,
                token="ari_user_sidecar_env",
                extra={
                    "server_url": "ws://user-sidecar-env.example",
                    "sidecar_port": 18794,
                    "sidecar_bind": "127.0.0.6",
                    "adapter_bind": "127.0.0.7",
                    "agent_skills_json": '[{"id":"memo","name":"Memo","description":"Use memos"}]',
                    "concurrency_mode": "agent-wide",
                    "reconnect_interval_ms": 1234,
                    "ping_interval_ms": 2345,
                    "ping_timeout_ms": 3456,
                    "max_consecutive_per_conversation": 3,
                    "adapter_post_timeout_ms": 4567,
                    "control_max_body_bytes": 5678,
                    "agent_sdk_root": "/tmp/hermes-arinova-user-sdk-root",
                    "sidecar_post_timeout_ms": 6789,
                    "connect_timeout_ms": 7890,
                    "download_attachments": False,
                    "attachment_max_bytes": 8901,
                    "sidecar_autostart": False,
                    "allow_bots": "all",
                },
            )
        )
        sidecar_env = adapter._sidecar_env()
    finally:
        for key, value in old_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
    expected = {
        "ARINOVA_SERVER_URL": "ws://user-sidecar-env.example",
        "ARINOVA_BOT_TOKEN": "ari_user_sidecar_env",
        "ARINOVA_SIDECAR_PORT": "18794",
        "ARINOVA_SIDECAR_BIND": "127.0.0.6",
        "ARINOVA_ADAPTER_URL": f"http://127.0.0.7:{adapter.adapter_port}",
        "ARINOVA_BRIDGE_TOKEN": adapter._shared_token,
        "ARINOVA_AGENT_SKILLS_JSON": '[{"id":"memo","name":"Memo","description":"Use memos"}]',
        "ARINOVA_CONCURRENCY_MODE": "agent-wide",
        "ARINOVA_RECONNECT_INTERVAL_MS": "1234",
        "ARINOVA_PING_INTERVAL_MS": "2345",
        "ARINOVA_PING_TIMEOUT_MS": "3456",
        "ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION": "3",
        "ARINOVA_ADAPTER_POST_TIMEOUT_MS": "4567",
        "ARINOVA_CONTROL_MAX_BODY_BYTES": "5678",
        "ARINOVA_AGENT_SDK_ROOT": "/tmp/hermes-arinova-user-sdk-root",
    }
    for key, value in expected.items():
        if sidecar_env.get(key) != value:
            raise RuntimeError(f"enabled user plugin sidecar env {key} mismatch: {sidecar_env.get(key)!r} != {value!r}")
    if (
        adapter.sidecar_post_timeout_ms != 6789
        or adapter.connect_timeout_ms != 7890
        or adapter.download_attachments is not False
        or adapter.attachment_max_bytes != 8901
        or adapter.autostart_sidecar is not False
        or adapter.allow_bots != "all"
    ):
        raise RuntimeError(
            "enabled user plugin adapter runtime controls drifted: "
            f"sidecar_post={adapter.sidecar_post_timeout_ms} connect={adapter.connect_timeout_ms} "
            f"download={adapter.download_attachments} attachment_max={adapter.attachment_max_bytes} "
            f"autostart={adapter.autostart_sidecar} allow_bots={adapter.allow_bots!r}"
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
