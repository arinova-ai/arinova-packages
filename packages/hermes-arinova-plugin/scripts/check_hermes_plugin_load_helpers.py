from __future__ import annotations

import argparse
import asyncio
import inspect
import json
import os
import re
import sys
import threading
import types
from pathlib import Path


def require_hermes_python() -> None:
    if sys.version_info < (3, 10):
        version = ".".join(str(part) for part in sys.version_info[:3])
        raise SystemExit(
            "Hermes checks require Python 3.10+ because ~/hermes-agent uses "
            f"modern type syntax; current interpreter is Python {version}. "
            "Run this check with the same Python used by Hermes, for example python3.13."
        )


def manifest_tools(path: Path) -> set[str]:
    source = path.read_text(encoding="utf-8")
    block = source.split("provides_tools:", 1)[1].split("requires_env:", 1)[0]
    return set(re.findall(r"^\s*-\s*([A-Za-z0-9_]+)\s*$", block, re.M))


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


def assert_registry_schemas(registry, module, expected_tools: set[str]) -> dict[str, dict]:
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
        raise RuntimeError(f"Hermes plugin registry schema definitions mismatch: {sorted(by_name)}")
    expected_schemas = expected_tool_schemas(module)
    if set(expected_schemas) != expected_tools:
        raise RuntimeError(f"Hermes plugin generated schema set mismatch: {sorted(expected_schemas)}")
    for name, definition in by_name.items():
        function = definition.get("function")
        if not isinstance(function, dict) or function.get("name") != name:
            raise RuntimeError(f"Hermes plugin schema function name mismatch: {name} -> {function}")
        expected_schema = expected_schemas[name]
        if function.get("description") != expected_schema.get("description"):
            raise RuntimeError(f"Hermes plugin schema description drifted: {name}")
        if function.get("parameters") != expected_schema.get("parameters"):
            raise RuntimeError(f"Hermes plugin schema parameters drifted from generated schema: {name}")
    return by_name


def assert_registry_toolset_index(registry, expected_tools: set[str]) -> None:
    if "hermes-arinova" not in registry.get_registered_toolset_names():
        raise RuntimeError("Hermes plugin toolset missing from registry toolset index")
    indexed_tools = set(registry.get_tool_names_for_toolset("hermes-arinova"))
    if indexed_tools != expected_tools:
        raise RuntimeError(
            "Hermes plugin registry toolset index did not match manifest tools: "
            f"missing={sorted(expected_tools - indexed_tools)} extra={sorted(indexed_tools - expected_tools)}"
        )
    tool_to_toolset = registry.get_tool_to_toolset_map()
    drift = {name: tool_to_toolset.get(name) for name in expected_tools if tool_to_toolset.get(name) != "hermes-arinova"}
    if drift:
        raise RuntimeError(f"Hermes plugin registry tool-to-toolset map drifted: {drift}")
    available_toolsets = registry.get_available_toolsets()
    available_entry = available_toolsets.get("hermes-arinova")
    if not isinstance(available_entry, dict) or set(available_entry.get("tools") or []) != expected_tools:
        raise RuntimeError(
            "Hermes plugin available toolset metadata did not expose manifest tools: "
            f"{available_entry!r}"
        )


def assert_platform_metadata(platform_entry) -> None:
    if platform_entry.source != "plugin":
        raise RuntimeError(f"Arinova platform source drifted: {platform_entry.source!r}")
    if platform_entry.plugin_name != "hermes-arinova-plugin":
        raise RuntimeError(f"Arinova platform plugin_name drifted: {platform_entry.plugin_name!r}")
    if platform_entry.required_env != ["ARINOVA_SERVER_URL", "ARINOVA_BOT_TOKEN"]:
        raise RuntimeError(f"Arinova platform required_env drifted: {platform_entry.required_env!r}")
    if platform_entry.allowed_users_env != "ARINOVA_ALLOWED_USERS":
        raise RuntimeError(f"Arinova allowed users env drifted: {platform_entry.allowed_users_env!r}")
    if platform_entry.allow_all_env != "ARINOVA_ALLOW_ALL_USERS":
        raise RuntimeError(f"Arinova allow-all env drifted: {platform_entry.allow_all_env!r}")
    if platform_entry.install_hint != "Run `npm install` inside the plugin sidecar directory.":
        raise RuntimeError(f"Arinova install hint drifted: {platform_entry.install_hint!r}")
    if "Arinova Chat" not in platform_entry.platform_hint or "streamed progress" not in platform_entry.platform_hint:
        raise RuntimeError(f"Arinova platform hint drifted: {platform_entry.platform_hint!r}")


def assert_platform_registry_factory(platform_registry, module, platform_config) -> None:
    valid_config = platform_config(
        enabled=True,
        token="ari_factory_token",
        extra={"server_url": "wss://factory.example"},
    )
    old_server = os.environ.get("ARINOVA_SERVER_URL")
    old_token = os.environ.get("ARINOVA_BOT_TOKEN")
    os.environ.pop("ARINOVA_SERVER_URL", None)
    os.environ.pop("ARINOVA_BOT_TOKEN", None)
    try:
        created = platform_registry.create_adapter("arinova", valid_config)
        if not isinstance(created, module.ArinovaAdapter):
            raise RuntimeError(f"Arinova platform registry factory returned unexpected adapter: {created!r}")
        if created.config is not valid_config:
            raise RuntimeError("Arinova platform registry factory did not preserve PlatformConfig object")
        if created.server_url != "wss://factory.example" or created.bot_token != "ari_factory_token":
            raise RuntimeError(
                "Arinova platform registry factory did not hydrate adapter credentials: "
                f"server_url={created.server_url!r} bot_token={created.bot_token!r}"
            )
        if platform_registry.create_adapter("arinova", platform_config(enabled=True, extra={})) is not None:
            raise RuntimeError("Arinova platform registry factory accepted missing credentials")
        if platform_registry.create_adapter("missing-arinova", valid_config) is not None:
            raise RuntimeError("Arinova platform registry created adapter for an unregistered platform")
    finally:
        if old_server is None:
            os.environ.pop("ARINOVA_SERVER_URL", None)
        else:
            os.environ["ARINOVA_SERVER_URL"] = old_server
        if old_token is None:
            os.environ.pop("ARINOVA_BOT_TOKEN", None)
        else:
            os.environ["ARINOVA_BOT_TOKEN"] = old_token


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
        definition_kwargs = {
            "enabled_toolsets": ["hermes-arinova"],
            "quiet_mode": True,
        }
        # Newer Hermes releases defer non-core plugin tools behind the
        # tool-search bridge by default. This first assertion verifies the
        # underlying registered toolset; bridge behavior is checked below.
        if "skip_tool_search_assembly" in inspect.signature(get_tool_definitions).parameters:
            definition_kwargs["skip_tool_search_assembly"] = True
        definitions = get_tool_definitions(**definition_kwargs)
    finally:
        module.adapter._active_adapter = previous
        _clear_tool_defs_cache()
        invalidate_check_fn_cache()

    names = {item.get("function", {}).get("name") for item in definitions}
    arinova_names = {name for name in names if isinstance(name, str) and name.startswith("arinova_")}
    if arinova_names != expected_tools:
        raise RuntimeError(
            "Hermes model_tools enabled_toolsets did not expose manifest Arinova tools: "
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
        raise RuntimeError(f"Hermes model_tools Tool Search bridge tools missing: {bridged_names}")
    bridged_arinova_names = {name for name in bridged_names if isinstance(name, str) and name.startswith("arinova_")}
    if bridged_arinova_names:
        raise RuntimeError(f"Hermes model_tools Tool Search did not defer Arinova tools: {sorted(bridged_arinova_names)}")
    matches = bridge_search.get("matches")
    if not isinstance(matches, list) or not any(match.get("name") == "arinova_send_message" for match in matches if isinstance(match, dict)):
        raise RuntimeError(f"Hermes tool_search did not surface arinova_send_message: {bridge_search}")
    describe_props = (bridge_describe.get("parameters") or {}).get("properties") or {}
    if not {"conversation_id", "content"}.issubset(describe_props):
        raise RuntimeError(f"Hermes tool_describe did not expose arinova_send_message schema: {bridge_describe}")
    if scope_adapter.calls or "arinova_send_message' is not available in this session" not in str(bridge_out_of_scope.get("error")):
        raise RuntimeError(
            "Hermes model_tools tool_call did not block out-of-scope Arinova bridge call: "
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
        raise RuntimeError(f"Hermes AIAgent init did not preserve enabled_toolsets: {agent.enabled_toolsets!r}")
    initialized_names = {item.get("function", {}).get("name") for item in agent.tools}
    bridge_tool_names = {"tool_search", "tool_describe", "tool_call"}
    if not bridge_tool_names.issubset(initialized_names):
        raise RuntimeError(f"Hermes AIAgent init did not expose Tool Search bridge tools: {initialized_names}")
    initialized_arinova_names = {
        name for name in initialized_names if isinstance(name, str) and name.startswith("arinova_")
    }
    if initialized_arinova_names:
        raise RuntimeError(f"Hermes AIAgent init leaked direct Arinova tools with Tool Search enabled: {sorted(initialized_arinova_names)}")
    if not bridge_tool_names.issubset(agent.valid_tool_names):
        raise RuntimeError(f"Hermes AIAgent init valid_tool_names missed bridge tools: {agent.valid_tool_names}")

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
        raise RuntimeError(f"Hermes AIAgent init tool_search could not find Arinova tool: {search}")


class FakeAdapter:
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

    async def call_agent_sdk(self, method: str, *args):
        if method == "getAgentId":
            return "agent-1"
        if method == "getOnboardingSeed":
            return {"kind": "first_touch_opening", "seedId": "seed-1", "prompt": "hello"}
        self.calls.append(("agent", method, args))
        if method in self.VOID_AGENT_METHODS:
            return None
        return {"echo": method, "args": list(args)}

    async def call_task_sdk(self, task_id: str, method: str, *args):
        self.calls.append(("task", task_id, method, args))
        return {"echo": method, "task_id": task_id, "args": list(args)}

    def active_task_id(self) -> str:
        return "task-1"

    def _task_conversation_id(self, task_id: str) -> str | None:
        if task_id == "task-cron":
            return None
        return "conv-active"

    def _no_conversation_task_error(self, task_id: str, api: str) -> str:
        task_kind = "cron_wakeup" if task_id == "task-cron" else "unknown"
        return f"{api} is unavailable: this task (taskKind={task_kind}) is not bound to a conversation"


class FakeHttpResponse:
    def __init__(self, body: bytes = b'{"messageId":"msg-1"}', content_type: str | None = "application/json") -> None:
        self._body = body
        self.headers = {"Content-Type": content_type} if content_type is not None else {}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self) -> bytes:
        return self._body

    def close(self) -> None:
        return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--hermes-root",
        default=str(Path.home() / "hermes-agent"),
        help="Path to the hermes-agent checkout.",
    )
    return parser.parse_args()


class ToolReportAdapter:
    def __init__(self):
        self._loop = asyncio.new_event_loop()
        self._session_by_task = {
            "task-active": "session-1",
            "task-other": "session-2",
        }
        self._message_by_task = {
            "task-active": "msg-active",
            "task-other": "msg-other",
        }
        self.calls = []
        self.called = threading.Event()
        self.running = True
        self.connected = True
        self.thread = threading.Thread(target=self._loop.run_forever, daemon=True)
        self.thread.start()

    def is_running(self):
        return self.running

    def is_connected(self):
        return self.connected

    async def call_agent_sdk(self, method, *args):
        self.calls.append((method, args))
        self.called.set()
        return {"ok": True}

    def close(self):
        self._loop.call_soon_threadsafe(self._loop.stop)
        self.thread.join(timeout=2)
        self._loop.close()


class ExitedSidecarProc:
    returncode = 7

    def poll(self):
        return self.returncode


class RunningSidecarProc:
    def __init__(self):
        self.terminated = False
        self.killed = False
        self.wait_timeout = None

    def poll(self):
        return None if not self.terminated and not self.killed else 0

    def terminate(self):
        self.terminated = True

    def wait(self, timeout=None):
        self.wait_timeout = timeout
        return 0

    def kill(self):
        self.killed = True


class StubbornSidecarProc:
    def __init__(self):
        self.terminated = False
        self.killed = False
        self.wait_calls = []

    def poll(self):
        return None if not self.killed else 0

    def terminate(self):
        self.terminated = True

    def wait(self, timeout=None):
        self.wait_calls.append(timeout)
        if not self.killed:
            raise TimeoutError("still running")
        return 0

    def kill(self):
        self.killed = True


class FakeSidecarResponse:
    def __init__(self, body: bytes, content_type: str | None = "application/json"):
        self.body = body
        self.headers = {"Content-Type": content_type} if content_type is not None else {}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.body


class LimitedAttachmentResponse:
    headers = {"Content-Type": "text/plain; charset=utf-8"}

    def __init__(self) -> None:
        self._chunks = [b"abcd", b""]

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self, _size):
        return self._chunks.pop(0)
