"""Shared assertions for installed and isolated Hermes plugin verification."""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import threading
import types
from pathlib import Path


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
REQUIRED_PLUGIN_FILES = (
    "README.md",
    "__init__.py",
    "_attachments.py",
    "_http.py",
    "_runtime_contract.py",
    "_sidecar.py",
    "adapter.py",
    "arinova_tools.py",
    "plugin.yaml",
    "package.json",
    "runtime-contract.json",
    "sdk-contract.json",
    "sidecar/index.mjs",
    "sidecar/runtime.mjs",
    "sidecar/package.json",
    "sidecar/package-lock.json",
    "sidecar/check-index-lifecycle.mjs",
    "sidecar/check-runtime.mjs",
    "sidecar/check-runtime-fixtures.mjs",
    "sidecar/check-sdk-e2e.mjs",
    "sidecar/check-sdk-e2e-fixtures.mjs",
    "sidecar/check-sdk-http.mjs",
    "sidecar/check-sdk-http-fixtures.mjs",
    "scripts/check_agent_sdk_source.py",
    "scripts/check_arinova_tools.py",
    "scripts/check_arinova_tools_helpers.py",
    "scripts/check_clean_install.py",
    "scripts/check_gateway_config_load.py",
    "scripts/check_hermes_plugin_load.py",
    "scripts/check_hermes_plugin_load_helpers.py",
    "scripts/check_live_connection.py",
    "scripts/check_live_connection_gate.py",
    "scripts/check_live_connection_gate_fake_hermes.py",
    "scripts/check_live_connection_gate_helpers.py",
    "scripts/check_local.py",
    "scripts/check_runtime_contract.py",
    "scripts/check_sdk_surface.py",
    "scripts/check_sdk_surface_helpers.py",
    "scripts/check_user_install.py",
    "scripts/install_check_helpers.py",
    "scripts/sync-sidecar-sdk.sh",
)


def require_hermes_python() -> None:
    if sys.version_info >= (3, 10):
        return
    version = ".".join(str(part) for part in sys.version_info[:3])
    raise SystemExit(
        "Hermes checks require Python 3.10+ because ~/hermes-agent uses "
        f"modern type syntax; current interpreter is Python {version}. "
        "Run this check with the same Python used by Hermes, for example python3.13."
    )


def ignore_plugin_copy(_directory: str, names: list[str]) -> set[str]:
    ignored = {".git", "__pycache__", "node_modules"}
    ignored.update(name for name in names if name.endswith((".pyc", ".pyo")))
    return ignored & set(names)


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
        raise RuntimeError(f"Hermes sidecar install check script is missing syntax check(s): {', '.join(missing_syntax)}")
    missing = sorted(
        script
        for script in EXPECTED_SIDECAR_CHECKS
        if f"node --check {script}" not in check_script or f"node {script}" not in check_script
    )
    if missing:
        raise RuntimeError(f"Hermes sidecar install check script is missing verifier(s): {', '.join(missing)}")


def assert_sdk_dist_matches_local(installed_sdk: Path, sdk_root: Path) -> None:
    missing = [relative_path for relative_path in SDK_PACKAGE_FILES if not (installed_sdk / relative_path).exists()]
    if missing:
        raise RuntimeError(f"Hermes sidecar install SDK install is missing package file(s): {', '.join(missing)}")
    drift = [
        relative_path
        for relative_path in SDK_PACKAGE_FILES
        if (sdk_root / relative_path).read_text(encoding="utf-8")
        != (installed_sdk / relative_path).read_text(encoding="utf-8")
    ]
    if drift:
        raise RuntimeError(
            "Hermes sidecar install SDK package files differ from local agent-sdk package: "
            f"{', '.join(drift)}"
        )


def sdk_package_public_metadata(package: dict) -> dict:
    return {key: package.get(key) for key in SDK_PACKAGE_PUBLIC_METADATA_KEYS}


def assert_sdk_package_matches_local(installed_package_path: Path, sdk_root: Path) -> None:
    installed_package = json.loads(installed_package_path.read_text(encoding="utf-8"))
    local_package = json.loads((sdk_root / "package.json").read_text(encoding="utf-8"))
    if installed_package.get("version") != local_package.get("version"):
        raise RuntimeError(
            "Hermes sidecar install SDK package version differs from local agent-sdk package: "
            f"expected={local_package.get('version')!r} actual={installed_package.get('version')!r}"
        )
    if sdk_package_public_metadata(installed_package) != sdk_package_public_metadata(local_package):
        raise RuntimeError(
            "Hermes sidecar install SDK package metadata differs from local agent-sdk package: "
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
        raise RuntimeError("Hermes sidecar install lockfile version is not npm v3")
    if lockfile.get("requires") is not True:
        raise RuntimeError("Hermes sidecar install lockfile does not declare dependency requirements")
    root_package = lockfile.get("packages", {}).get("", {})
    if root_package.get("name") != sidecar_package.get("name"):
        raise RuntimeError("Hermes sidecar install lockfile root package name differs from package.json")
    if root_package.get("version") != sidecar_package.get("version"):
        raise RuntimeError("Hermes sidecar install lockfile root package version differs from package.json")
    if root_package.get("dependencies") != sidecar_package.get("dependencies"):
        raise RuntimeError("Hermes sidecar install lockfile root dependencies differ from package.json")
    if root_package.get("engines") != sidecar_package.get("engines"):
        raise RuntimeError("Hermes sidecar install lockfile root engines differ from package.json")
    root_dependency = root_package.get("dependencies", {}).get(package_name)
    if sidecar_package.get("dependencies", {}).get(package_name) != local_version:
        raise RuntimeError("Hermes sidecar install package.json SDK dependency is not pinned to local agent-sdk package")
    if root_dependency != local_version:
        raise RuntimeError("Hermes sidecar install lockfile SDK dependency is not pinned to local agent-sdk package")
    locked_package = lockfile.get("packages", {}).get(f"node_modules/{package_name}", {})
    if locked_package.get("version") != local_version:
        raise RuntimeError("Hermes sidecar install lockfile SDK package version differs from local agent-sdk package")
    expected_resolved = f"https://registry.npmjs.org/{package_name}/-/agent-sdk-{local_version}.tgz"
    if locked_package.get("resolved") != expected_resolved:
        raise RuntimeError("Hermes sidecar install lockfile SDK package tarball differs from local agent-sdk package")
    if locked_package.get("license") != local_package.get("license"):
        raise RuntimeError("Hermes sidecar install lockfile SDK package license differs from local agent-sdk package")
    integrity = locked_package.get("integrity")
    if not isinstance(integrity, str) or not integrity.startswith("sha512-"):
        raise RuntimeError("Hermes sidecar install lockfile SDK package integrity is missing or not sha512")


def assert_required_plugin_files(plugin_dir: Path) -> None:
    missing = [relative_path for relative_path in REQUIRED_PLUGIN_FILES if not (plugin_dir / relative_path).is_file()]
    if missing:
        raise RuntimeError(f"Hermes plugin install is missing required file(s): {', '.join(missing)}")


def assert_platform_listing_and_toolset_resolution() -> None:
    from hermes_cli.platforms import get_all_platforms, platform_label
    from hermes_cli.tools_config import _get_platform_tools

    platforms = get_all_platforms()
    arinova = platforms.get("arinova")
    if arinova is None:
        raise RuntimeError("Hermes plugin install Arinova platform missing from Hermes platform listing")
    if arinova.label != "🔌  Arinova Chat":
        raise RuntimeError(f"Hermes plugin install Arinova platform label drifted: {arinova.label!r}")
    if arinova.default_toolset != "hermes-arinova":
        raise RuntimeError(
            "Hermes plugin install Arinova platform default toolset drifted: "
            f"{arinova.default_toolset!r}"
        )
    if platform_label("arinova") != "🔌  Arinova Chat":
        raise RuntimeError("Hermes plugin install Arinova platform_label() did not use registry metadata")
    enabled_toolsets = _get_platform_tools(
        {},
        "arinova",
        include_default_mcp_servers=False,
    )
    if "hermes-arinova" not in enabled_toolsets:
        raise RuntimeError(
            "Hermes plugin install Arinova platform toolset did not resolve through Hermes tools_config: "
            f"{sorted(enabled_toolsets)!r}"
        )


def assert_gateway_runner_platform_toolset_resolution() -> None:
    sys.modules.setdefault("httpx", types.ModuleType("httpx"))
    sys.modules.setdefault("requests", types.ModuleType("requests"))

    import gateway.run as gateway_run
    from hermes_cli.tools_config import _get_platform_tools

    platform = types.SimpleNamespace(value="arinova")
    platform_key = gateway_run._platform_config_key(platform)
    if platform_key != "arinova":
        raise RuntimeError(f"Hermes plugin install gateway platform key drifted: {platform_key!r}")
    enabled_toolsets = sorted(
        _get_platform_tools(
            {},
            platform_key,
            include_default_mcp_servers=False,
        )
    )
    if "hermes-arinova" not in enabled_toolsets:
        raise RuntimeError(
            "Hermes plugin install gateway runner did not resolve the Arinova platform toolset: "
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
        raise RuntimeError(f"Hermes plugin install registry schema definitions mismatch: {sorted(by_name)}")
    tools = module.register_tools.__globals__
    expected_schemas = expected_tool_schemas(module)
    if set(expected_schemas) != expected_tools:
        raise RuntimeError(f"Hermes plugin install generated schema set mismatch: {sorted(expected_schemas)}")
    for name, definition in by_name.items():
        function = definition.get("function")
        if not isinstance(function, dict) or function.get("name") != name:
            raise RuntimeError(f"Hermes plugin install schema function name mismatch: {name} -> {function}")
        expected_schema = expected_schemas[name]
        if function.get("description") != expected_schema.get("description"):
            raise RuntimeError(f"Hermes plugin install schema description drifted: {name}")
        if function.get("parameters") != expected_schema.get("parameters"):
            raise RuntimeError(f"Hermes plugin install schema parameters drifted from generated schema: {name}")
        parameters = function.get("parameters")
        if not isinstance(parameters, dict) or parameters.get("type") != "object":
            raise RuntimeError(f"Hermes plugin install schema parameters are not an object: {name}")
        properties = parameters.get("properties")
        if not isinstance(properties, dict):
            raise RuntimeError(f"Hermes plugin install schema properties are missing: {name}")
        if parameters.get("additionalProperties") is not False:
            raise RuntimeError(f"Hermes plugin install schema allows unknown fields: {name}")
        if "args" not in properties:
            raise RuntimeError(f"Hermes plugin install schema does not expose positional args: {name}")
        if name in {"arinova_sdk_call", "arinova_task_call"}:
            if parameters.get("required") != ["method"]:
                raise RuntimeError(f"Hermes plugin install generic schema does not require method: {name}")
            method_schema = properties.get("method")
            if not isinstance(method_schema, dict) or not method_schema.get("enum"):
                raise RuntimeError(f"Hermes plugin install generic schema has no method enum: {name}")
            expected_method_enum = list(
                tools["TASK_METHODS"] if name == "arinova_task_call" else tools["MODEL_AGENT_METHODS"]
            )
            if method_schema.get("enum") != expected_method_enum:
                raise RuntimeError(f"Hermes plugin install generic schema method enum drifted: {name}")
        elif "method" in properties:
            raise RuntimeError(f"Hermes plugin install method-specific schema unexpectedly exposes method: {name}")
        if name.startswith("arinova_task_"):
            if not {"task_id", "taskId"}.issubset(properties):
                raise RuntimeError(f"Hermes plugin install task schema missing task id aliases: {name}")
    for method, specs in tools["ARG_SPECS"].items():
        tool_name = f"arinova_{tools['_snake'](method)}"
        if method not in tools["MODEL_AGENT_METHODS"]:
            if tool_name in by_name:
                raise RuntimeError(f"Hermes plugin install exposed internal SDK method to the model: {tool_name}")
            continue
        properties = by_name[tool_name]["function"]["parameters"]["properties"]
        expected_aliases = {
            alias
            for param_name, _schema in specs
            for alias in tools["_aliases_for"](param_name)
        }
        if not expected_aliases.issubset(properties):
            raise RuntimeError(
                f"Hermes plugin install method schema missing aliases: {tool_name} "
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
                f"Hermes plugin install task method schema missing aliases: {tool_name} "
                f"{sorted(expected_aliases - set(properties))}"
            )
    agent_upload_props = by_name["arinova_upload_file"]["function"]["parameters"]["properties"]
    if not {"conversation_id", "conversationId", "file", "file_name", "fileName", "file_type", "fileType", "args"}.issubset(agent_upload_props):
        raise RuntimeError(f"Hermes plugin install uploadFile schema fields missing: {agent_upload_props}")
    task_upload_props = by_name["arinova_task_upload_file"]["function"]["parameters"]["properties"]
    if not {"task_id", "taskId", "file", "file_name", "fileName", "file_type", "fileType", "args"}.issubset(task_upload_props):
        raise RuntimeError(f"Hermes plugin install task uploadFile schema fields missing: {task_upload_props}")
    generic_props = by_name["arinova_sdk_call"]["function"]["parameters"]["properties"]
    if not {"method", "args", "conversation_id", "conversationId", "file", "file_name", "fileName", "file_type", "fileType"}.issubset(generic_props):
        raise RuntimeError(f"Hermes plugin install generic SDK schema fields missing: {generic_props}")
    if {"action", "action_args", "actionArgs", "task_id", "taskId", "message_id", "messageId"} & set(generic_props):
        raise RuntimeError(f"Hermes plugin install generic SDK schema exposed global action attribution: {generic_props}")
    generic_task_props = by_name["arinova_task_call"]["function"]["parameters"]["properties"]
    if not {"method", "task_id", "taskId", "args", "file", "file_name", "fileName", "file_type", "fileType", "actionArgs"}.issubset(generic_task_props):
        raise RuntimeError(f"Hermes plugin install generic task schema fields missing: {generic_task_props}")


def assert_registry_toolset_index(registry, expected_tools: set[str]) -> None:
    if "hermes-arinova" not in registry.get_registered_toolset_names():
        raise RuntimeError("Hermes plugin install toolset missing from Hermes registry toolset index")
    indexed_tools = set(registry.get_tool_names_for_toolset("hermes-arinova"))
    if indexed_tools != expected_tools:
        raise RuntimeError(
            "Hermes plugin install registry toolset index did not match manifest tools: "
            f"missing={sorted(expected_tools - indexed_tools)} extra={sorted(indexed_tools - expected_tools)}"
        )
    tool_to_toolset = registry.get_tool_to_toolset_map()
    drift = {name: tool_to_toolset.get(name) for name in expected_tools if tool_to_toolset.get(name) != "hermes-arinova"}
    if drift:
        raise RuntimeError(f"Hermes plugin install registry tool-to-toolset map drifted: {drift}")
    available_toolsets = registry.get_available_toolsets()
    available_entry = available_toolsets.get("hermes-arinova")
    if not isinstance(available_entry, dict) or set(available_entry.get("tools") or []) != expected_tools:
        raise RuntimeError(
            "Hermes plugin install available toolset metadata did not expose manifest tools: "
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
            "Hermes plugin install model_tools enabled_toolsets did not expose manifest Arinova tools: "
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
        raise RuntimeError(f"Hermes plugin install model_tools Tool Search bridge tools missing: {bridged_names}")
    bridged_arinova_names = {name for name in bridged_names if isinstance(name, str) and name.startswith("arinova_")}
    if bridged_arinova_names:
        raise RuntimeError(f"Hermes plugin install model_tools Tool Search did not defer Arinova tools: {sorted(bridged_arinova_names)}")
    matches = bridge_search.get("matches")
    if not isinstance(matches, list) or not any(match.get("name") == "arinova_send_message" for match in matches if isinstance(match, dict)):
        raise RuntimeError(f"Hermes plugin install tool_search did not surface arinova_send_message: {bridge_search}")
    describe_props = (bridge_describe.get("parameters") or {}).get("properties") or {}
    if not {"conversation_id", "content"}.issubset(describe_props):
        raise RuntimeError(f"Hermes plugin install tool_describe did not expose arinova_send_message schema: {bridge_describe}")
    if scope_adapter.calls or "arinova_send_message' is not available in this session" not in str(bridge_out_of_scope.get("error")):
        raise RuntimeError(
            "Hermes plugin install model_tools tool_call did not block out-of-scope Arinova bridge call: "
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
        raise RuntimeError(f"Hermes plugin install AIAgent init did not preserve enabled_toolsets: {agent.enabled_toolsets!r}")
    initialized_names = {item.get("function", {}).get("name") for item in agent.tools}
    bridge_tool_names = {"tool_search", "tool_describe", "tool_call"}
    if not bridge_tool_names.issubset(initialized_names):
        raise RuntimeError(f"Hermes plugin install AIAgent init did not expose Tool Search bridge tools: {initialized_names}")
    initialized_arinova_names = {
        name for name in initialized_names if isinstance(name, str) and name.startswith("arinova_")
    }
    if initialized_arinova_names:
        raise RuntimeError(f"Hermes plugin install AIAgent init leaked direct Arinova tools with Tool Search enabled: {sorted(initialized_arinova_names)}")
    if not bridge_tool_names.issubset(agent.valid_tool_names):
        raise RuntimeError(f"Hermes plugin install AIAgent init valid_tool_names missed bridge tools: {agent.valid_tool_names}")

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
        raise RuntimeError(f"Hermes plugin install AIAgent init tool_search could not find Arinova tool: {search}")


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
            raise RuntimeError("Hermes plugin install registry dispatch sample tool missing")

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
            "content": "hello from Hermes install registry",
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
            "options": {"dryRun": True, "reason": "clean-install-check"},
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
        raise RuntimeError(f"Hermes plugin install registry dispatch failed: {failed}")
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
            "Hermes plugin install registry dispatch did not reject non-object tool payloads: "
            f"{non_object_payload_errors!r}"
        )
    expected_calls = [
        ("agent", "queryMemory", ({"query": "hello", "limit": 2},)),
        ("agent", "uploadFile", ("conv-1", {"base64": "R0E="}, "generic-agent-upload.txt", "text/plain")),
        ("agent", "sendMessage", ("conv-1", "hello from Hermes install registry")),
        ("agent", "uploadFile", ("conv-1", {"base64": "SGk="}, "hello.txt", "text/plain")),
        ("task", "task-active", "callAction", ("open.memo", {"memoId": "memo-1"}, {"dryRun": True, "reason": "clean-install-check"})),
        ("task", "task-active", "uploadFile", ({"base64": "R0k="}, "generic-task-upload.txt", "text/plain")),
        ("task", "task-active", "callAction", ("close.memo", {"memoId": "memo-1"})),
        ("task", "task-active", "uploadFile", ({"base64": "IQ=="}, "task-upload.txt", "text/plain")),
    ]
    if fake_adapter.calls != expected_calls:
        raise RuntimeError(
            "Hermes plugin install registry dispatch did not route expected SDK calls: "
            f"{fake_adapter.calls!r}"
        )
    if (
        task_history_no_conversation.get("success") is not False
        or task_history_no_conversation.get("task_id") != "task-cron"
        or task_history_no_conversation.get("method") != "fetchHistory"
        or "taskKind=cron_wakeup" not in str(task_history_no_conversation.get("error"))
    ):
        raise RuntimeError(
            "Hermes plugin install registry dispatch did not preserve no-conversation task guard: "
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
        raise RuntimeError(f"Hermes plugin install Hermes agent runtime invoke failed: {raw}")
    bridge_parsed = json.loads(bridge_raw)
    if bridge_parsed.get("success") is not True:
        raise RuntimeError(f"Hermes plugin install Hermes tool_call bridge invoke failed: {bridge_raw}")
    non_object_parsed = json.loads(non_object_raw)
    if non_object_parsed != {
        "success": False,
        "method": "sendMessage",
        "error": "args for sendMessage requires at least 2 item(s)",
    }:
        raise RuntimeError(
            "Hermes plugin install Hermes agent runtime invoke did not preserve positional argument bound error: "
            f"{non_object_parsed!r}"
        )
    if fake_adapter.calls != [
        ("agent", "sendMessage", ("conv-runtime", "hello from Hermes agent runtime")),
        ("agent", "sendMessage", ("conv-runtime-bridge", "hello from Hermes tool_call bridge")),
    ]:
        raise RuntimeError(
            "Hermes plugin install Hermes agent runtime invoke did not route expected SDK call: "
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
            "Hermes plugin install tool_executor did not unwrap tool_call through enabled Arinova toolset: "
            f"{executor_adapter.calls!r}"
        )
    if len(executor_messages) != 2 or executor_messages[0].get("tool_call_id") != "call-executor-bridge":
        raise RuntimeError(f"Hermes plugin install tool_executor did not append expected tool result: {executor_messages!r}")
    executor_bad_args = json.loads(executor_messages[1].get("content") or "{}")
    if (
        executor_messages[1].get("tool_call_id") != "call-executor-bridge-bad-args"
        or executor_messages[1].get("name") != "tool_call"
        or executor_bad_args != {"error": "tool_call 'arguments' must be an object"}
    ):
        raise RuntimeError(
            "Hermes plugin install tool_executor did not preserve bridge argument object error: "
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
            "Hermes plugin install tool_executor did not block out-of-scope Arinova bridge call: "
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
            "Hermes plugin install concurrent tool_executor did not unwrap tool_call through enabled Arinova toolset: "
            f"{concurrent_adapter.calls!r}"
        )
    if len(concurrent_messages) != 2 or concurrent_messages[0].get("tool_call_id") != "call-executor-concurrent-bridge":
        raise RuntimeError(
            f"Hermes plugin install concurrent tool_executor did not append expected tool result: {concurrent_messages!r}"
        )
    concurrent_bad_args = json.loads(concurrent_messages[1].get("content") or "{}")
    if (
        concurrent_messages[1].get("tool_call_id") != "call-executor-concurrent-bridge-bad-args"
        or concurrent_messages[1].get("name") != "tool_call"
        or concurrent_bad_args != {"error": "tool_call 'arguments' must be an object"}
    ):
        raise RuntimeError(
            "Hermes plugin install concurrent tool_executor did not preserve bridge argument object error: "
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
            "Hermes plugin install concurrent tool_executor did not block out-of-scope Arinova bridge call: "
            f"calls={concurrent_scoped_adapter.calls!r} messages={concurrent_scoped_messages!r}"
        )


def assert_platform_callbacks(entry, module, platform_config) -> None:
    if entry.source != "plugin":
        raise RuntimeError(f"Hermes plugin install Arinova platform source drifted: {entry.source!r}")
    if entry.plugin_name != "hermes-arinova-plugin":
        raise RuntimeError(f"Hermes plugin install Arinova platform plugin_name drifted: {entry.plugin_name!r}")
    if entry.required_env != ["ARINOVA_SERVER_URL", "ARINOVA_BOT_TOKEN"]:
        raise RuntimeError(f"Hermes plugin install Arinova platform required_env drifted: {entry.required_env!r}")
    if entry.allowed_users_env != "ARINOVA_ALLOWED_USERS":
        raise RuntimeError(f"Hermes plugin install Arinova allowed users env drifted: {entry.allowed_users_env!r}")
    if entry.allow_all_env != "ARINOVA_ALLOW_ALL_USERS":
        raise RuntimeError(f"Hermes plugin install Arinova allow-all env drifted: {entry.allow_all_env!r}")
    if entry.install_hint != "Run `npm install` inside the plugin sidecar directory.":
        raise RuntimeError(f"Hermes plugin install Arinova install hint drifted: {entry.install_hint!r}")
    if "Arinova Chat" not in entry.platform_hint or "streamed progress" not in entry.platform_hint:
        raise RuntimeError(f"Hermes plugin install Arinova platform hint drifted: {entry.platform_hint!r}")
    valid_factory_config = platform_config(
        enabled=True,
        token="ari_clean_factory_token",
        extra={"server_url": "wss://clean-factory.example"},
    )
    old_server = os.environ.get("ARINOVA_SERVER_URL")
    old_token = os.environ.get("ARINOVA_BOT_TOKEN")
    os.environ.pop("ARINOVA_SERVER_URL", None)
    os.environ.pop("ARINOVA_BOT_TOKEN", None)
    try:
        created = entry.adapter_factory(valid_factory_config)
        if not isinstance(created, module.ArinovaAdapter):
            raise RuntimeError(f"Hermes plugin install Arinova adapter factory returned unexpected adapter: {created!r}")
        if created.config is not valid_factory_config:
            raise RuntimeError("Hermes plugin install Arinova adapter factory did not preserve PlatformConfig object")
        if created.server_url != "wss://clean-factory.example" or created.bot_token != "ari_clean_factory_token":
            raise RuntimeError(
                "Hermes plugin install Arinova adapter factory did not hydrate credentials: "
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
        raise RuntimeError("Hermes plugin install did not register Arinova validate_config callback")
    if entry.is_connected is not module.is_connected:
        raise RuntimeError("Hermes plugin install did not register Arinova is_connected callback")
    empty_config = platform_config(enabled=True, extra={})
    if entry.validate_config(empty_config) or entry.is_connected(empty_config):
        raise RuntimeError("Hermes plugin install Arinova config callbacks accepted missing credentials")
    old_server = os.environ.get("ARINOVA_SERVER_URL")
    old_token = os.environ.get("ARINOVA_BOT_TOKEN")
    os.environ["ARINOVA_SERVER_URL"] = "   "
    os.environ["ARINOVA_BOT_TOKEN"] = "  "
    try:
        if entry.validate_config(empty_config) or entry.is_connected(empty_config):
            raise RuntimeError("Hermes plugin install Arinova config callbacks accepted blank env credentials")
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
        extra={"server_url": "wss://clean.example", "bot_token": "ari_clean"},
    )
    if not entry.validate_config(configured) or not entry.is_connected(configured):
        raise RuntimeError("Hermes plugin install Arinova config callbacks rejected configured credentials")
    old_server = os.environ.get("ARINOVA_SERVER_URL")
    old_token = os.environ.get("ARINOVA_BOT_TOKEN")
    os.environ["ARINOVA_SERVER_URL"] = "   "
    os.environ["ARINOVA_BOT_TOKEN"] = "  "
    try:
        blank_env_created = entry.adapter_factory(configured)
        if blank_env_created.server_url != "wss://clean.example" or blank_env_created.bot_token != "ari_clean":
            raise RuntimeError("Hermes plugin install blank env credentials shadowed configured credentials")
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
        token="ari_clean_token",
        extra={"server_url": "wss://clean-token.example"},
    )
    if not entry.validate_config(token_configured) or not entry.is_connected(token_configured):
        raise RuntimeError("Hermes plugin install Arinova config callbacks rejected PlatformConfig.token credentials")
    old_server = os.environ.get("ARINOVA_SERVER_URL")
    old_token = os.environ.get("ARINOVA_BOT_TOKEN")
    os.environ["ARINOVA_SERVER_URL"] = "wss://clean-env.example"
    os.environ["ARINOVA_BOT_TOKEN"] = "ari_clean_env"
    try:
        env_configured = platform_config(enabled=True, extra={})
        if not entry.validate_config(env_configured) or not entry.is_connected(env_configured):
            raise RuntimeError("Hermes plugin install Arinova config callbacks rejected env credentials")
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
                "server_url": "wss://clean-yaml.example",
                "bot_token": "ari_clean_yaml",
                "allowed_users": ["user-1", "user-2"],
                "allow_all_users": False,
                "allow_bots": "all",
                "sidecar_bind": "127.0.0.2",
                "adapter_bind": "127.0.0.3",
                "home_conversation": {"chat_id": "conv-clean-yaml", "name": "Clean YAML Home"},
                "agent_skills": [{"id": "memo", "name": "Memo", "description": "Use memos"}],
                "concurrency_mode": "unbounded",
                "adapter_post_timeout_ms": 5432,
            },
        )
        if seeded is None:
            raise RuntimeError("Hermes plugin install YAML bridge returned no extras")
        expected = {
            "server_url": "wss://clean-yaml.example",
            "bot_token": "ari_clean_yaml",
            "allow_bots": "all",
            "sidecar_bind": "127.0.0.2",
            "adapter_bind": "127.0.0.3",
            "concurrency_mode": "unbounded",
            "adapter_post_timeout_ms": 5432,
            "allowed_users": ["user-1", "user-2"],
            "allow_all_users": False,
            "home_channel": {"chat_id": "conv-clean-yaml", "name": "Clean YAML Home"},
        }
        for key, value in expected.items():
            if seeded.get(key) != value:
                raise RuntimeError(f"Hermes plugin install YAML bridge extra {key!r} mismatch: {seeded}")
        if json.loads(seeded.get("agent_skills_json", "[]")) != [
            {"id": "memo", "name": "Memo", "description": "Use memos"}
        ]:
            raise RuntimeError(f"Hermes plugin install YAML bridge did not encode agent skills: {seeded}")
        expected_bridge_env = {
            "ARINOVA_SERVER_URL": "wss://clean-yaml.example",
            "ARINOVA_BOT_TOKEN": "ari_clean_yaml",
            "ARINOVA_ALLOWED_USERS": "user-1,user-2",
            "ARINOVA_ALLOW_ALL_USERS": "False",
            "ARINOVA_ALLOW_BOTS": "all",
            "ARINOVA_NODE_BIN": None,
            "ARINOVA_HOME_CONVERSATION": "conv-clean-yaml",
            "ARINOVA_HOME_CONVERSATION_NAME": "Clean YAML Home",
            "ARINOVA_AGENT_SKILLS_JSON": None,
            "ARINOVA_AGENT_SKILLS": None,
        }
        bridge_env = {key: os.environ.get(key) for key in env_keys}
        if bridge_env != expected_bridge_env:
            raise RuntimeError(f"Hermes plugin install YAML bridge did not seed unset env from YAML config: {bridge_env}")

        preset_env = {
            "ARINOVA_SERVER_URL": "wss://clean-preset.example",
            "ARINOVA_BOT_TOKEN": "ari_clean_preset",
            "ARINOVA_ALLOWED_USERS": "preset-user",
            "ARINOVA_ALLOW_ALL_USERS": "true",
            "ARINOVA_HOME_CONVERSATION": "conv-clean-preset",
            "ARINOVA_HOME_CONVERSATION_NAME": "Clean Preset Home",
        }
        for key in env_keys:
            os.environ.pop(key, None)
        os.environ.update(preset_env)
        entry.apply_yaml_config_fn(
            {},
            {
                "server_url": "wss://clean-yaml.example",
                "bot_token": "ari_clean_yaml",
                "allowed_users": ["user-1", "user-2"],
                "allow_all_users": False,
                "home_conversation": {"chat_id": "conv-clean-yaml", "name": "Clean YAML Home"},
            },
        )
        overridden = {key: os.environ.get(key) for key in preset_env if os.environ.get(key) != preset_env[key]}
        if overridden:
            raise RuntimeError(f"Hermes plugin install YAML bridge overrode pre-set env values: {overridden}")

        for key in env_keys:
            os.environ.pop(key, None)
        token_alias_seeded = entry.apply_yaml_config_fn(
            {},
            {
                "server_url": "wss://clean-token-alias.example",
                "token": "ari_clean_token_alias",
            },
        )
        if token_alias_seeded.get("bot_token") != "ari_clean_token_alias":
            raise RuntimeError(f"Hermes plugin install YAML bridge did not accept token alias: {token_alias_seeded}")
        if os.environ.get("ARINOVA_BOT_TOKEN") != "ari_clean_token_alias":
            raise RuntimeError("Hermes plugin install YAML bridge did not seed ARINOVA_BOT_TOKEN from token alias")

        for key in env_keys:
            os.environ.pop(key, None)
        home_alias_seeded = entry.apply_yaml_config_fn(
            {},
            {
                "server_url": "wss://clean-home-alias.example",
                "token": "ari_clean_home_alias",
                "home_channel": {"chat_id": "conv-clean-home-alias", "name": "Clean Home Alias"},
            },
        )
        if home_alias_seeded.get("home_channel") != {
            "chat_id": "conv-clean-home-alias",
            "name": "Clean Home Alias",
        }:
            raise RuntimeError(f"Hermes plugin install YAML bridge did not accept home_channel alias: {home_alias_seeded}")
        if os.environ.get("ARINOVA_HOME_CONVERSATION") != "conv-clean-home-alias":
            raise RuntimeError("Hermes plugin install YAML bridge did not seed ARINOVA_HOME_CONVERSATION from home_channel alias")
        if os.environ.get("ARINOVA_HOME_CONVERSATION_NAME") != "Clean Home Alias":
            raise RuntimeError(
                "Hermes plugin install YAML bridge did not seed ARINOVA_HOME_CONVERSATION_NAME from home_channel alias"
            )
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
                token="ari_clean_sidecar_env",
                extra={
                    "server_url": "ws://clean-sidecar-env.example",
                    "sidecar_port": 18793,
                    "sidecar_bind": "127.0.0.8",
                    "adapter_bind": "127.0.0.9",
                    "agent_skills_json": '[{"id":"memo","name":"Memo","description":"Use memos"}]',
                    "concurrency_mode": "agent-wide",
                    "reconnect_interval_ms": 1234,
                    "ping_interval_ms": 2345,
                    "ping_timeout_ms": 3456,
                    "max_consecutive_per_conversation": 3,
                    "adapter_post_timeout_ms": 4567,
                    "control_max_body_bytes": 5678,
                    "agent_sdk_root": "/tmp/hermes-arinova-clean-sdk-root",
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
        "ARINOVA_SERVER_URL": "ws://clean-sidecar-env.example",
        "ARINOVA_BOT_TOKEN": "ari_clean_sidecar_env",
        "ARINOVA_SIDECAR_PORT": "18793",
        "ARINOVA_SIDECAR_BIND": "127.0.0.8",
        "ARINOVA_ADAPTER_URL": f"http://127.0.0.9:{adapter.adapter_port}",
        "ARINOVA_BRIDGE_TOKEN": adapter._shared_token,
        "ARINOVA_AGENT_SKILLS_JSON": '[{"id":"memo","name":"Memo","description":"Use memos"}]',
        "ARINOVA_CONCURRENCY_MODE": "agent-wide",
        "ARINOVA_RECONNECT_INTERVAL_MS": "1234",
        "ARINOVA_PING_INTERVAL_MS": "2345",
        "ARINOVA_PING_TIMEOUT_MS": "3456",
        "ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION": "3",
        "ARINOVA_ADAPTER_POST_TIMEOUT_MS": "4567",
        "ARINOVA_CONTROL_MAX_BODY_BYTES": "5678",
        "ARINOVA_AGENT_SDK_ROOT": "/tmp/hermes-arinova-clean-sdk-root",
    }
    for key, value in expected.items():
        if sidecar_env.get(key) != value:
            raise RuntimeError(f"Hermes plugin install sidecar env {key} mismatch: {sidecar_env.get(key)!r} != {value!r}")
    if (
        adapter.sidecar_post_timeout_ms != 6789
        or adapter.connect_timeout_ms != 7890
        or adapter.download_attachments is not False
        or adapter.attachment_max_bytes != 8901
        or adapter.autostart_sidecar is not False
        or adapter.allow_bots != "all"
    ):
        raise RuntimeError(
            "Hermes plugin install adapter runtime controls drifted: "
            f"sidecar_post={adapter.sidecar_post_timeout_ms} connect={adapter.connect_timeout_ms} "
            f"download={adapter.download_attachments} attachment_max={adapter.attachment_max_bytes} "
            f"autostart={adapter.autostart_sidecar} allow_bots={adapter.allow_bots!r}"
        )
