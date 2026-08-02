#!/usr/bin/env python3
"""Smoke-test Hermes loading this plugin through PluginManager."""

from __future__ import annotations

import asyncio
import inspect
import json
import os
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import types
import urllib.error
import urllib.request
from pathlib import Path

from check_hermes_plugin_load_helpers import (
    FakeAdapter,
    FakeHttpResponse,
    ToolReportAdapter,
    ExitedSidecarProc,
    RunningSidecarProc,
    StubbornSidecarProc,
    FakeSidecarResponse,
    LimitedAttachmentResponse,
    assert_model_tools_enabled_toolset,
    assert_platform_metadata,
    assert_platform_registry_factory,
    assert_real_agent_init_enabled_toolset,
    assert_registry_schemas,
    assert_registry_toolset_index,
    manifest_tools,
    parse_args,
    require_hermes_python,
)


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    require_hermes_python()
    args = parse_args()
    hermes_root = Path(args.hermes_root).expanduser().resolve()
    sys.path.insert(0, str(hermes_root))

    from gateway.platform_registry import platform_registry
    from gateway.config import Platform, PlatformConfig
    from gateway.platforms.base import MessageEvent, ProcessingOutcome
    from hermes_cli.plugins import PluginManager
    from tools.registry import registry

    manager = PluginManager()
    manifest = manager._parse_manifest(ROOT / "plugin.yaml", ROOT, source="user", prefix="")
    if manifest is None:
        raise RuntimeError("plugin manifest did not parse")

    manager._load_plugin(manifest)
    loaded = manager._plugins.get(manifest.key or manifest.name)
    if loaded is None or not loaded.enabled or loaded.error:
        raise RuntimeError(f"plugin did not load cleanly: {getattr(loaded, 'error', None)}")
    if not any(callback is loaded.module._on_post_tool_call for callback in manager._hooks.get("post_tool_call", [])):
        raise RuntimeError("plugin did not register Arinova post_tool_call reporting hook")

    default_adapter = loaded.module.ArinovaAdapter(
        PlatformConfig(enabled=True, token="ari_test", extra={"server_url": "ws://example"})
    )
    if default_adapter.concurrency_mode != "per-conversation":
        raise RuntimeError("adapter default concurrency mode drifted from SDK per-conversation default")

    adapter = loaded.module.ArinovaAdapter(
        PlatformConfig(
            enabled=True,
            token="ari_test",
            extra={
                "server_url": "ws://example",
                "agent_skills_json": '[{"id":"memo","name":"Memo","description":"Use memos"}]',
                "concurrency_mode": "per-conversation",
                "reconnect_interval_ms": 1000,
                "ping_interval_ms": 2000,
                "ping_timeout_ms": 3000,
                "connect_timeout_ms": 4000,
                "adapter_post_timeout_ms": 5000,
                "control_max_body_bytes": 7000,
                "sidecar_post_timeout_ms": 6000,
                "max_consecutive_per_conversation": 4,
                "sidecar_bind": "127.0.0.2",
                "adapter_bind": "127.0.0.3",
                "node_bin": "/usr/local/bin/node-custom",
                "agent_sdk_root": "/tmp/hermes-arinova-agent-sdk-root",
            },
        )
    )
    if (
        adapter.concurrency_mode != "per-conversation"
        or adapter.reconnect_interval_ms != 1000
        or adapter.connect_timeout_ms != 4000
        or adapter.adapter_post_timeout_ms != 5000
        or adapter.control_max_body_bytes != 7000
        or adapter.sidecar_post_timeout_ms != 6000
        or adapter.sidecar_host != "127.0.0.2"
        or adapter.bind_host != "127.0.0.3"
        or adapter.node_bin != "/usr/local/bin/node-custom"
        or adapter.agent_sdk_root != "/tmp/hermes-arinova-agent-sdk-root"
    ):
        raise RuntimeError("adapter did not preserve SDK option config")
    if adapter.download_attachments is not True or adapter.attachment_max_bytes <= 0:
        raise RuntimeError("adapter did not preserve attachment download config")
    sidecar_env = adapter._sidecar_env()
    expected_sidecar_env = {
        "ARINOVA_SERVER_URL": "ws://example",
        "ARINOVA_BOT_TOKEN": "ari_test",
        "ARINOVA_SIDECAR_PORT": str(adapter.sidecar_port),
        "ARINOVA_SIDECAR_BIND": adapter.sidecar_host,
        "ARINOVA_ADAPTER_URL": f"http://{adapter.bind_host}:{adapter.adapter_port}",
        "ARINOVA_BRIDGE_TOKEN": adapter._shared_token,
        "ARINOVA_AGENT_SKILLS_JSON": '[{"id":"memo","name":"Memo","description":"Use memos"}]',
        "ARINOVA_CONCURRENCY_MODE": "per-conversation",
        "ARINOVA_RECONNECT_INTERVAL_MS": "1000",
        "ARINOVA_PING_INTERVAL_MS": "2000",
        "ARINOVA_PING_TIMEOUT_MS": "3000",
        "ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION": "4",
        "ARINOVA_ADAPTER_POST_TIMEOUT_MS": "5000",
        "ARINOVA_CONTROL_MAX_BODY_BYTES": "7000",
        "ARINOVA_AGENT_SDK_ROOT": "/tmp/hermes-arinova-agent-sdk-root",
    }
    for key, expected in expected_sidecar_env.items():
        if sidecar_env.get(key) != expected:
            raise RuntimeError(f"adapter sidecar env {key} mismatch: {sidecar_env.get(key)!r} != {expected!r}")

    parsed_skills_adapter = loaded.module.ArinovaAdapter(
        PlatformConfig(
            enabled=True,
            token="ari_test",
            extra={
                "server_url": "ws://example",
                "agent_skills_json": [{"id": "yaml", "name": "YAML", "description": "Parsed YAML skill"}],
            },
        )
    )
    parsed_skills_env = parsed_skills_adapter._sidecar_env()
    if parsed_skills_env.get("ARINOVA_AGENT_SKILLS_JSON") != (
        '[{"id": "yaml", "name": "YAML", "description": "Parsed YAML skill"}]'
    ):
        raise RuntimeError(
            "adapter did not JSON-normalize parsed agent_skills_json list for sidecar env: "
            f"{parsed_skills_env}"
        )

    old_agent_skills_env = {
        "ARINOVA_AGENT_SKILLS_JSON": os.environ.get("ARINOVA_AGENT_SKILLS_JSON"),
        "ARINOVA_AGENT_SKILLS": os.environ.get("ARINOVA_AGENT_SKILLS"),
    }
    os.environ.pop("ARINOVA_AGENT_SKILLS_JSON", None)
    os.environ["ARINOVA_AGENT_SKILLS"] = '[{"id":"chat","name":"Chat","description":"Chat skill"}]'
    try:
        alias_skills_adapter = loaded.module.ArinovaAdapter(
            PlatformConfig(
                enabled=True,
                token="ari_test",
                extra={
                    "server_url": "ws://example",
                    "agent_skills_json": '[{"id":"config","name":"Config","description":"Config skill"}]',
                },
            )
        )
        alias_sidecar_env = alias_skills_adapter._sidecar_env()
    finally:
        for key, value in old_agent_skills_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
    if alias_sidecar_env.get("ARINOVA_AGENT_SKILLS_JSON") != '[{"id":"chat","name":"Chat","description":"Chat skill"}]':
        raise RuntimeError(
            "adapter did not normalize ARINOVA_AGENT_SKILLS alias over config extras in sidecar env: "
            f"{alias_sidecar_env}"
        )


    original_active_adapter = loaded.module.adapter._active_adapter
    report_adapter = ToolReportAdapter()
    loaded.module.adapter._active_adapter = report_adapter
    try:
        loaded.module._on_post_tool_call(
            tool_name="terminal",
            args={"cmd": "printf outside"},
            result="outside",
            task_id="outside-task",
            session_id="outside-session",
            turn_id="turn-outside",
            duration_ms=1,
            status="ok",
        )
        if report_adapter.called.wait(0.1):
            raise RuntimeError("post_tool_call hook reported a non-Arinova session")
        report_adapter.running = False
        loaded.module._on_post_tool_call(
            tool_name="terminal",
            args={"cmd": "printf stopped"},
            result="stopped",
            task_id="task-active",
            session_id="",
            turn_id="turn-stopped",
            duration_ms=1,
            status="ok",
        )
        if report_adapter.called.wait(0.1):
            raise RuntimeError("post_tool_call hook reported while Arinova adapter was stopped")
        report_adapter.running = True
        report_adapter.connected = False
        loaded.module._on_post_tool_call(
            tool_name="terminal",
            args={"cmd": "printf disconnected"},
            result="disconnected",
            task_id="task-active",
            session_id="",
            turn_id="turn-disconnected",
            duration_ms=1,
            status="ok",
        )
        if report_adapter.called.wait(0.1):
            raise RuntimeError("post_tool_call hook reported while Arinova adapter was disconnected")
        report_adapter.connected = True
        original_report_loop = report_adapter._loop
        report_adapter._loop = None
        loaded.module._on_post_tool_call(
            tool_name="terminal",
            args={"cmd": "printf no-loop"},
            result="no-loop",
            task_id="task-active",
            session_id="",
            turn_id="turn-no-loop",
            duration_ms=1,
            status="ok",
        )
        if report_adapter.called.wait(0.1):
            raise RuntimeError("post_tool_call hook reported without a running adapter loop")
        report_adapter._loop = original_report_loop
        loaded.module._on_post_tool_call(
            tool_name="terminal",
            args={"cmd": "printf hello"},
            result="hello",
            task_id="task-active",
            session_id="",
            turn_id="turn-1",
            duration_ms=12,
            status="ok",
        )
        if not report_adapter.called.wait(2):
            raise RuntimeError("post_tool_call hook did not schedule reportToolCall")
        report_adapter.called.clear()
        loaded.module._on_post_tool_call(
            tool_name="terminal",
            args={"cmd": "printf again"},
            result="again",
            task_id="task-active",
            session_id="",
            turn_id="turn-1",
            duration_ms=3,
            status="ok",
        )
        if not report_adapter.called.wait(2):
            raise RuntimeError("post_tool_call hook did not schedule second same-turn reportToolCall")
        report_adapter.called.clear()
        loaded.module._on_post_tool_call(
            function_name="terminal_alias",
            function_args={"cmd": "printf alias"},
            result="alias",
            task_id="task-active",
            session_id="",
            turn_id="turn-1",
            duration_ms=8,
            status="ok",
        )
        if not report_adapter.called.wait(2):
            raise RuntimeError("post_tool_call hook did not schedule function-name alias reportToolCall")
        report_adapter.called.clear()
        loaded.module._on_post_tool_call(
            tool_name="terminal",
            args={"cmd": "blocked"},
            result="should not be reported as output",
            task_id="task-active",
            session_id="",
            turn_id="turn-2",
            duration_ms="not-an-int",
            status="blocked",
        )
        if not report_adapter.called.wait(2):
            raise RuntimeError("post_tool_call hook did not schedule blocked reportToolCall")
        report_adapter.called.clear()
        loaded.module._on_post_tool_call(
            tool_name="terminal",
            args={"cmd": "printf other"},
            result="other",
            task_id="task-other",
            session_id="",
            turn_id="turn-1",
            duration_ms=2,
            status="ok",
        )
        if not report_adapter.called.wait(2):
            raise RuntimeError("post_tool_call hook did not schedule cross-session reportToolCall")
        report_adapter.called.clear()
        loaded.module._on_post_tool_call(
            tool_name="terminal",
            args={"cmd": "x" * 20_050},
            result="y" * 20_010,
            task_id="task-active",
            session_id="",
            turn_id="turn-3",
            duration_ms=5,
            status="ok",
        )
        if not report_adapter.called.wait(2):
            raise RuntimeError("post_tool_call hook did not schedule truncated reportToolCall")
        report_adapter.called.clear()
        loaded.module._on_post_tool_call(
            tool_name="terminal",
            args={"cmd": "exit 1"},
            result="should not be reported on explicit error",
            task_id="task-active",
            session_id="",
            turn_id="turn-4",
            duration_ms=9,
            status="ok",
            error_message="explicit tool failure",
        )
        if not report_adapter.called.wait(2):
            raise RuntimeError("post_tool_call hook did not schedule explicit-error reportToolCall")
        report_adapter.called.clear()
        loaded.module._on_post_tool_call(
            tool_name="terminal",
            args=["not", "a", "dict"],
            result=Path("/tmp/arinova-tool-result"),
            task_id="task-active",
            session_id="",
            turn_id="turn-5",
            duration_ms=4,
            status="ok",
        )
        if not report_adapter.called.wait(2):
            raise RuntimeError("post_tool_call hook did not schedule non-json reportToolCall")
        report_adapter.called.clear()
        loaded.module._on_post_tool_call(
            tool_name="terminal",
            args={"cmd": "printf normalized"},
            result="normalized",
            task_id="task-active",
            session_id="",
            turn_id="turn-6",
            duration_ms=-18,
            status="SUCCESS",
        )
        if not report_adapter.called.wait(2):
            raise RuntimeError("post_tool_call hook did not schedule normalized-success reportToolCall")
        report_adapter.called.clear()
        loaded.module._on_post_tool_call(
            tool_name="terminal",
            args={"limit": float("nan"), "nested": {"value": float("inf")}},
            result={"value": float("-inf")},
            task_id="task-active",
            session_id="",
            turn_id="turn-7",
            duration_ms=float("nan"),
            status="ok",
        )
        if not report_adapter.called.wait(2):
            raise RuntimeError("post_tool_call hook did not schedule non-finite reportToolCall")
        report_adapter.called.clear()
        loaded.module._on_post_tool_call(
            tool_name="terminal",
            args={"cmd": "typed failure"},
            result="should not be reported on error_type",
            task_id="task-active",
            session_id="",
            turn_id="turn-8",
            duration_ms=7,
            status="ok",
            error_type="TypedToolFailure",
        )
        if not report_adapter.called.wait(2):
            raise RuntimeError("post_tool_call hook did not schedule error-type reportToolCall")
        report_adapter.called.clear()
        loaded.module._on_post_tool_call(
            tool_name="terminal",
            args={"cmd": "session lookup"},
            result="looked up by session",
            task_id="",
            session_id="session-2",
            turn_id="turn-9",
            duration_ms=11,
            status="ok",
        )
        if not report_adapter.called.wait(2):
            raise RuntimeError("post_tool_call hook did not schedule session-id fallback reportToolCall")
        report_adapter.called.clear()
        loaded.module._on_post_tool_call(
            tool_name="terminal",
            args={"cmd": "trimmed ids"},
            result="trimmed",
            task_id="  task-active  ",
            session_id="  session-1  ",
            turn_id="turn-10",
            duration_ms=13,
            status="ok",
        )
        if not report_adapter.called.wait(2):
            raise RuntimeError("post_tool_call hook did not schedule trimmed identity reportToolCall")
    finally:
        loaded.module.adapter._active_adapter = original_active_adapter
        report_adapter.close()
    if not report_adapter.calls or report_adapter.calls[0][0] != "reportToolCall":
        raise RuntimeError(f"post_tool_call hook called unexpected SDK method: {report_adapter.calls}")
    report = report_adapter.calls[0][1][0]
    expected_report = {
        "sessionId": "session-1",
        "turnId": "turn-1",
        "seqOrder": 0,
        "toolName": "terminal",
        "input": {"type": "object", "fieldCount": 1},
        "output": {"type": "string", "charCount": 5},
        "durationMs": 12,
        "success": True,
        "messageId": "msg-active",
    }
    if report != expected_report:
        raise RuntimeError(f"post_tool_call hook built unexpected report with derived session id: {report}")
    second_report = report_adapter.calls[1][1][0]
    alias_report = report_adapter.calls[2][1][0]
    if second_report["seqOrder"] != 1 or alias_report["seqOrder"] != 2:
        raise RuntimeError("post_tool_call hook did not increment same-turn seqOrder")
    blocked_report = report_adapter.calls[3][1][0]
    if blocked_report["success"] is not False or blocked_report["error"] != "tool_failed":
        raise RuntimeError(f"post_tool_call hook built unexpected failed report: {blocked_report}")
    cross_session_report = report_adapter.calls[4][1][0]
    if cross_session_report["sessionId"] != "session-2" or cross_session_report["seqOrder"] != 0:
        raise RuntimeError(f"post_tool_call hook leaked seqOrder across sessions: {cross_session_report}")
    truncated_report = report_adapter.calls[5][1][0]
    if truncated_report["input"] != {"type": "object", "fieldCount": 1}:
        raise RuntimeError(f"post_tool_call hook did not summarize long input: {truncated_report}")
    if truncated_report["output"] != {"type": "string", "charCount": 20_010}:
        raise RuntimeError(f"post_tool_call hook did not summarize long output: {truncated_report}")
    explicit_error_report = report_adapter.calls[6][1][0]
    if explicit_error_report["error"] != "tool_failed":
        raise RuntimeError(f"post_tool_call hook built unexpected explicit-error report: {explicit_error_report}")
    non_json_report = report_adapter.calls[7][1][0]
    if non_json_report["output"] != {"type": "other"}:
        raise RuntimeError(f"post_tool_call hook built unexpected non-json report: {non_json_report}")
    nonfinite_report = report_adapter.calls[9][1][0]
    if nonfinite_report["input"] != {"type": "object", "fieldCount": 2}:
        raise RuntimeError(f"post_tool_call hook built unexpected non-finite report: {nonfinite_report}")
    error_type_report = report_adapter.calls[10][1][0]
    if error_type_report["error"] != "tool_failed":
        raise RuntimeError(f"post_tool_call hook built unexpected error-type report: {error_type_report}")
    session_fallback_report = report_adapter.calls[11][1][0]
    if session_fallback_report["sessionId"] != "session-2":
        raise RuntimeError(
            f"post_tool_call hook built unexpected session-id fallback report: {session_fallback_report}"
        )
    trimmed_identity_report = report_adapter.calls[12][1][0]
    if trimmed_identity_report["sessionId"] != "session-1":
        raise RuntimeError(f"post_tool_call hook built unexpected trimmed identity report: {trimmed_identity_report}")
    serialized_reports = json.dumps([call[1][0] for call in report_adapter.calls], sort_keys=True)
    for sensitive in (
        "printf hello",
        "explicit tool failure",
        "TypedToolFailure",
        "/tmp/arinova-tool-result",
        "should not be reported",
    ):
        if sensitive in serialized_reports:
            raise RuntimeError(f"post_tool_call hook leaked sensitive content: {sensitive}")

    original_sidecar_dir = loaded.module.adapter.SIDECAR_DIR
    original_node_version_supported = loaded.module.adapter._node_version_supported
    original_adapter_node_bin = adapter.node_bin
    original_adapter_agent_sdk_root = adapter.agent_sdk_root
    with tempfile.TemporaryDirectory(prefix="arinova-sidecar-req-") as tmp:
        fake_sidecar = Path(tmp)
        loaded.module.adapter.SIDECAR_DIR = fake_sidecar
        adapter.node_bin = "node"
        adapter.agent_sdk_root = None
        original_agent_sdk_root_env = os.environ.get("ARINOVA_AGENT_SDK_ROOT")
        # Track the real pin so a release does not require touching fixtures.
        sidecar_sdk_version = json.loads(
            (ROOT / "sidecar/package.json").read_text(encoding="utf-8")
        )["dependencies"]["@arinova-ai/agent-sdk"]
        fake_sidecar_package = {
            "name": "hermes-arinova-sidecar",
            "version": "0.1.0",
            "dependencies": {"@arinova-ai/agent-sdk": sidecar_sdk_version},
            "engines": {"node": ">=22"},
        }
        (fake_sidecar / "package.json").write_text(json.dumps(fake_sidecar_package), encoding="utf-8")

        def write_fake_lockfile(
            *,
            version: str | None = None,
            resolved: str | None = None,
            license: str = "MIT",
            integrity: str | None = "sha512-test",
        ) -> None:
            version = version or sidecar_sdk_version
            locked_package = {
                "version": version,
                "resolved": resolved or f"https://registry.npmjs.org/@arinova-ai/agent-sdk/-/agent-sdk-{version}.tgz",
                "license": license,
            }
            if integrity is not None:
                locked_package["integrity"] = integrity
            (fake_sidecar / "package-lock.json").write_text(
                json.dumps(
                    {
                        "name": fake_sidecar_package["name"],
                        "version": fake_sidecar_package["version"],
                        "lockfileVersion": 3,
                        "requires": True,
                        "packages": {
                            "": fake_sidecar_package,
                            "node_modules/@arinova-ai/agent-sdk": locked_package,
                        },
                    }
                ),
                encoding="utf-8",
            )

        try:
            if loaded.module.adapter.check_requirements():
                raise RuntimeError("check_requirements passed without sidecar dependencies")
            (fake_sidecar / "node_modules").mkdir()
            if loaded.module.adapter.check_requirements():
                raise RuntimeError("check_requirements passed without @arinova-ai/agent-sdk package")
            try:
                adapter._start_sidecar()
            except RuntimeError as exc:
                if "@arinova-ai/agent-sdk" not in str(exc) and "sidecar dependencies are missing" not in str(exc):
                    raise RuntimeError(f"_start_sidecar failed with unexpected missing dependency error: {exc}") from exc
            else:
                raise RuntimeError("_start_sidecar passed without @arinova-ai/agent-sdk package marker")
            (fake_sidecar / "node_modules/@arinova-ai/agent-sdk").mkdir(parents=True)
            (fake_sidecar / "node_modules/@arinova-ai/agent-sdk/package.json").write_text(
                '{"name":"@arinova-ai/agent-sdk"}',
                encoding="utf-8",
            )
            if loaded.module.adapter.check_requirements():
                raise RuntimeError("check_requirements passed with mismatched @arinova-ai/agent-sdk package metadata")
            try:
                adapter._start_sidecar()
            except RuntimeError as exc:
                if "sidecar SDK version mismatch" not in str(exc):
                    raise RuntimeError(f"_start_sidecar failed with unexpected SDK mismatch error: {exc}") from exc
            else:
                raise RuntimeError("_start_sidecar passed with mismatched @arinova-ai/agent-sdk package metadata")
            (fake_sidecar / "node_modules/@arinova-ai/agent-sdk/package.json").write_text(
                json.dumps(
                    {
                        "name": "@arinova-ai/agent-sdk",
                        "description": "SDK for connecting AI agents to Arinova Chat",
                        "version": sidecar_sdk_version,
                        "type": "module",
                        "main": "./dist/client.js",
                        "types": "./dist/client.d.ts",
                        "files": ["dist"],
                        "keywords": ["arinova", "agent", "sdk", "websocket", "streaming", "ai"],
                        "license": "MIT",
                        "scripts": {
                            "build": "tsc",
                            "dev": "tsc --watch",
                            "lint": "tsc --noEmit",
                            "test": "vitest run",
                        },
                        "devDependencies": {
                            "typescript": "^5",
                            "vitest": "^3.2.4",
                        },
                        "exports": {
                            ".": {
                                "import": "./dist/index.js",
                                "types": "./dist/index.d.ts",
                            }
                        },
                    }
                ),
                encoding="utf-8",
            )
            write_fake_lockfile()
            if loaded.module.adapter.check_requirements():
                raise RuntimeError("check_requirements passed with drifted SDK package metadata")
            try:
                adapter._start_sidecar()
            except RuntimeError as exc:
                if not any(
                    expected in str(exc)
                    for expected in ("sidecar SDK package metadata drifted", "sidecar SDK package files are missing")
                ):
                    raise RuntimeError(f"_start_sidecar failed with unexpected SDK metadata drift error: {exc}") from exc
            else:
                raise RuntimeError("_start_sidecar passed with drifted SDK package metadata")
            (fake_sidecar / "node_modules/@arinova-ai/agent-sdk/package.json").write_text(
                json.dumps(
                    {
                        "name": "@arinova-ai/agent-sdk",
                        "description": "SDK for connecting AI agents to Arinova Chat",
                        "version": sidecar_sdk_version,
                        "type": "module",
                        "main": "./dist/index.js",
                        "types": "./dist/index.d.ts",
                        "files": ["dist", "README.md"],
                        "keywords": ["arinova", "agent", "sdk", "websocket", "streaming", "ai"],
                        "license": "MIT",
                        "dependencies": {"left-pad": "^1.3.0"},
                        "scripts": {
                            "build": "tsc",
                            "dev": "tsc --watch",
                            "lint": "tsc --noEmit",
                            "test": "vitest run",
                        },
                        "devDependencies": {
                            "typescript": "^5",
                            "vitest": "^3.2.4",
                        },
                        "exports": {
                            ".": {
                                "import": "./dist/index.js",
                                "types": "./dist/index.d.ts",
                            }
                        },
                    }
                ),
                encoding="utf-8",
            )
            if loaded.module.adapter.check_requirements():
                raise RuntimeError("check_requirements passed with drifted SDK runtime dependencies")
            try:
                adapter._start_sidecar()
            except RuntimeError as exc:
                if "sidecar SDK package metadata drifted" not in str(exc):
                    raise RuntimeError(f"_start_sidecar failed with unexpected SDK dependency drift error: {exc}") from exc
            else:
                raise RuntimeError("_start_sidecar passed with drifted SDK runtime dependencies")
            (fake_sidecar / "node_modules/@arinova-ai/agent-sdk/package.json").write_text(
                (loaded.module.adapter.DEFAULT_SDK_ROOT / "package.json").read_text(),
                encoding="utf-8",
            )
            if loaded.module.adapter.check_requirements():
                raise RuntimeError("check_requirements passed without SDK package files")
            try:
                adapter._start_sidecar()
            except RuntimeError as exc:
                if "sidecar SDK package files are missing" not in str(exc):
                    raise RuntimeError(f"_start_sidecar failed with unexpected SDK package file error: {exc}") from exc
            else:
                raise RuntimeError("_start_sidecar passed without SDK package files")
            (fake_sidecar / "node_modules/@arinova-ai/agent-sdk/README.md").write_text(
                "# Arinova Agent SDK\n",
                encoding="utf-8",
            )
            (fake_sidecar / "index.mjs").write_text("export {};\n", encoding="utf-8")
            (fake_sidecar / "runtime.mjs").write_text("export {};\n", encoding="utf-8")
            (fake_sidecar / "node_modules/@arinova-ai/agent-sdk/dist").mkdir()
            for relative_path, content in {
                "client.d.ts": "export declare class ArinovaAgent {}\n",
                "client.d.ts.map": "{}\n",
                "client.js": "export class ArinovaAgent {}\n",
                "client.js.map": "{}\n",
                "index.d.ts": "export {};\n",
                "index.d.ts.map": "{}\n",
                "index.js": "export {};\n",
                "index.js.map": "{}\n",
                "types.d.ts": "export {};\n",
                "types.d.ts.map": "{}\n",
                "types.js": "export {};\n",
                "types.js.map": "{}\n",
            }.items():
                (fake_sidecar / f"node_modules/@arinova-ai/agent-sdk/dist/{relative_path}").write_text(
                    content,
                    encoding="utf-8",
                )
            valid_sdk_package_path = fake_sidecar / "node_modules/@arinova-ai/agent-sdk/package.json"
            synthetic_sdk_root = fake_sidecar / "local-agent-sdk"
            shutil.copytree(valid_sdk_package_path.parent, synthetic_sdk_root)
            os.environ["ARINOVA_AGENT_SDK_ROOT"] = str(synthetic_sdk_root)
            write_fake_lockfile(resolved="https://registry.npmjs.org/@arinova-ai/agent-sdk/-/agent-sdk-0.0.0.tgz")
            if loaded.module.adapter.check_requirements():
                raise RuntimeError("check_requirements passed with invalid sidecar package-lock.json SDK tarball")
            try:
                adapter._start_sidecar()
            except RuntimeError as exc:
                if "sidecar package-lock.json SDK package tarball drifted" not in str(exc):
                    raise RuntimeError(f"_start_sidecar failed with unexpected sidecar lockfile tarball error: {exc}") from exc
            else:
                raise RuntimeError("_start_sidecar passed with invalid sidecar package-lock.json SDK tarball")
            write_fake_lockfile(license="Apache-2.0")
            if loaded.module.adapter.check_requirements():
                raise RuntimeError("check_requirements passed with invalid sidecar package-lock.json SDK license")
            try:
                adapter._start_sidecar()
            except RuntimeError as exc:
                if "sidecar package-lock.json SDK package license drifted" not in str(exc):
                    raise RuntimeError(f"_start_sidecar failed with unexpected sidecar lockfile license error: {exc}") from exc
            else:
                raise RuntimeError("_start_sidecar passed with invalid sidecar package-lock.json SDK license")
            write_fake_lockfile(integrity="sha1-bad")
            if loaded.module.adapter.check_requirements():
                raise RuntimeError("check_requirements passed with invalid sidecar package-lock.json SDK integrity")
            try:
                adapter._start_sidecar()
            except RuntimeError as exc:
                if "sidecar package-lock.json SDK package integrity is missing or not sha512" not in str(exc):
                    raise RuntimeError(f"_start_sidecar failed with unexpected sidecar lockfile error: {exc}") from exc
            else:
                raise RuntimeError("_start_sidecar passed with invalid sidecar package-lock.json SDK integrity")
            write_fake_lockfile()
            if not loaded.module.adapter.check_requirements():
                raise RuntimeError("check_requirements failed with valid SDK package marker present")
            installed_sdk_readme = valid_sdk_package_path.parent / "README.md"
            installed_sdk_readme.write_text("# Drifted Arinova Agent SDK\n", encoding="utf-8")
            if loaded.module.adapter.check_requirements():
                raise RuntimeError("check_requirements passed with drifted SDK package files")
            try:
                adapter._start_sidecar()
            except RuntimeError as exc:
                if "sidecar SDK package files drifted" not in str(exc):
                    raise RuntimeError(f"_start_sidecar failed with unexpected SDK file drift error: {exc}") from exc
            else:
                raise RuntimeError("_start_sidecar passed with drifted SDK package files")
            installed_sdk_readme.write_text(
                (synthetic_sdk_root / "README.md").read_text(encoding="utf-8"),
                encoding="utf-8",
            )
            valid_sdk_package = json.loads(valid_sdk_package_path.read_text(encoding="utf-8"))
            override_sdk_package = dict(valid_sdk_package)
            override_sdk_package["dependencies"] = {"override-only": "^1.0.0"}
            override_sdk_root = fake_sidecar / "override-agent-sdk"
            shutil.copytree(synthetic_sdk_root, override_sdk_root)
            (override_sdk_root / "package.json").write_text(
                json.dumps(override_sdk_package),
                encoding="utf-8",
            )
            valid_sdk_package_path.write_text(
                json.dumps(override_sdk_package),
                encoding="utf-8",
            )
            previous_agent_sdk_root_env = os.environ.get("ARINOVA_AGENT_SDK_ROOT")
            os.environ["ARINOVA_AGENT_SDK_ROOT"] = str(override_sdk_root)
            try:
                if not loaded.module.adapter.check_requirements():
                    raise RuntimeError("check_requirements ignored ARINOVA_AGENT_SDK_ROOT metadata override")
            finally:
                if previous_agent_sdk_root_env is None:
                    os.environ.pop("ARINOVA_AGENT_SDK_ROOT", None)
                else:
                    os.environ["ARINOVA_AGENT_SDK_ROOT"] = previous_agent_sdk_root_env
                valid_sdk_package_path.write_text(
                    json.dumps(valid_sdk_package),
                    encoding="utf-8",
                )
            sdk_index_js = fake_sidecar / "node_modules/@arinova-ai/agent-sdk/dist/index.js"
            local_sdk_index_js = synthetic_sdk_root / "dist/index.js"
            sdk_index_js.write_text("export const broken = ;\n", encoding="utf-8")
            local_sdk_index_js.write_text("export const broken = ;\n", encoding="utf-8")
            if loaded.module.adapter.check_requirements():
                raise RuntimeError("check_requirements passed with invalid SDK JavaScript")
            try:
                adapter._start_sidecar()
            except RuntimeError as exc:
                if "sidecar JavaScript syntax check failed" not in str(exc):
                    raise RuntimeError(f"_start_sidecar failed with unexpected SDK syntax error: {exc}") from exc
            else:
                raise RuntimeError("_start_sidecar passed with invalid SDK JavaScript")
            sdk_index_js.write_text("export {};\n", encoding="utf-8")
            local_sdk_index_js.write_text("export {};\n", encoding="utf-8")
            loaded.module.adapter._node_version_supported = lambda _node_bin: False
            if loaded.module.adapter.check_requirements():
                raise RuntimeError("check_requirements passed with unsupported Node version")
            adapter.node_bin = "node"
            try:
                adapter._start_sidecar()
            except RuntimeError as exc:
                if "requires Node >=22" not in str(exc):
                    raise RuntimeError(f"_start_sidecar failed with unexpected Node version error: {exc}") from exc
            else:
                raise RuntimeError("_start_sidecar passed with unsupported Node version")
        finally:
            loaded.module.adapter.SIDECAR_DIR = original_sidecar_dir
            loaded.module.adapter._node_version_supported = original_node_version_supported
            adapter.node_bin = original_adapter_node_bin
            adapter.agent_sdk_root = original_adapter_agent_sdk_root
            if original_agent_sdk_root_env is None:
                os.environ.pop("ARINOVA_AGENT_SDK_ROOT", None)
            else:
                os.environ["ARINOVA_AGENT_SDK_ROOT"] = original_agent_sdk_root_env

    invalid_numeric_env = {
        "ARINOVA_SIDECAR_PORT": "bad",
        "ARINOVA_ADAPTER_PORT": "-1",
        "ARINOVA_CONNECT_TIMEOUT_MS": "not-a-number",
        "ARINOVA_ATTACHMENT_MAX_BYTES": "-5",
        "ARINOVA_SIDECAR_POST_TIMEOUT_MS": "bad",
        "ARINOVA_RECONNECT_INTERVAL_MS": "bad",
        "ARINOVA_PING_INTERVAL_MS": "-1",
        "ARINOVA_PING_TIMEOUT_MS": "bad",
        "ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION": "-2",
        "ARINOVA_ADAPTER_POST_TIMEOUT_MS": "bad",
        "ARINOVA_CONTROL_MAX_BODY_BYTES": "bad",
    }
    old_numeric_env = {key: os.environ.get(key) for key in invalid_numeric_env}
    os.environ.update(invalid_numeric_env)
    try:
        fallback_adapter = loaded.module.ArinovaAdapter(
            PlatformConfig(
                enabled=True,
                token="ari_test",
                extra={
                    "server_url": "ws://example",
                    "sidecar_port": "also-bad",
                    "adapter_port": "-2",
                    "connect_timeout_ms": "also-bad",
                    "attachment_max_bytes": "-10",
                    "sidecar_post_timeout_ms": "-5",
                    "reconnect_interval_ms": "also-bad",
                    "ping_interval_ms": "-1",
                    "ping_timeout_ms": "also-bad",
                    "max_consecutive_per_conversation": "-2",
                    "adapter_post_timeout_ms": "-5",
                    "control_max_body_bytes": "-5",
                },
            )
        )
    finally:
        for key, value in old_numeric_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
    if (
        fallback_adapter.sidecar_port != loaded.module.adapter.DEFAULT_SIDECAR_PORT
        or fallback_adapter.adapter_port != loaded.module.adapter.DEFAULT_ADAPTER_PORT
        or fallback_adapter.connect_timeout_ms != loaded.module.adapter.DEFAULT_CONNECT_TIMEOUT_MS
        or fallback_adapter.attachment_max_bytes != loaded.module.adapter.DEFAULT_ATTACHMENT_MAX_BYTES
        or fallback_adapter.control_max_body_bytes != loaded.module.adapter.DEFAULT_CONTROL_MAX_BODY_BYTES
        or fallback_adapter.sidecar_post_timeout_ms != loaded.module.adapter.DEFAULT_SIDECAR_POST_TIMEOUT_MS
    ):
        raise RuntimeError(
            "adapter did not fall back for invalid numeric config: "
            f"sidecar={fallback_adapter.sidecar_port} adapter={fallback_adapter.adapter_port} "
            f"connect={fallback_adapter.connect_timeout_ms} attachment={fallback_adapter.attachment_max_bytes} "
            f"sidecar_post={fallback_adapter.sidecar_post_timeout_ms}"
        )
    fallback_env = fallback_adapter._sidecar_env()
    for key in [
        "ARINOVA_RECONNECT_INTERVAL_MS",
        "ARINOVA_PING_INTERVAL_MS",
        "ARINOVA_PING_TIMEOUT_MS",
        "ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION",
        "ARINOVA_ADAPTER_POST_TIMEOUT_MS",
    ]:
        if key in fallback_env:
            raise RuntimeError(f"invalid optional SDK timing config leaked into sidecar env: {key}={fallback_env[key]!r}")
    if fallback_env.get("ARINOVA_CONTROL_MAX_BODY_BYTES") != str(
        loaded.module.adapter.DEFAULT_CONTROL_MAX_BODY_BYTES
    ):
        raise RuntimeError("invalid callback body limit did not fall back to the finite default")

    boolean_numeric_adapter = loaded.module.ArinovaAdapter(
        PlatformConfig(
            enabled=True,
            token="ari_test",
            extra={
                "server_url": "ws://example",
                "sidecar_port": True,
                "adapter_port": False,
                "connect_timeout_ms": True,
                "attachment_max_bytes": False,
                "sidecar_post_timeout_ms": True,
                "reconnect_interval_ms": True,
                "ping_interval_ms": False,
                "ping_timeout_ms": True,
                "max_consecutive_per_conversation": False,
                "adapter_post_timeout_ms": True,
                "control_max_body_bytes": False,
            },
        )
    )
    if (
        boolean_numeric_adapter.sidecar_port != loaded.module.adapter.DEFAULT_SIDECAR_PORT
        or boolean_numeric_adapter.adapter_port != loaded.module.adapter.DEFAULT_ADAPTER_PORT
        or boolean_numeric_adapter.connect_timeout_ms != loaded.module.adapter.DEFAULT_CONNECT_TIMEOUT_MS
        or boolean_numeric_adapter.attachment_max_bytes != loaded.module.adapter.DEFAULT_ATTACHMENT_MAX_BYTES
        or boolean_numeric_adapter.control_max_body_bytes != loaded.module.adapter.DEFAULT_CONTROL_MAX_BODY_BYTES
        or boolean_numeric_adapter.sidecar_post_timeout_ms != loaded.module.adapter.DEFAULT_SIDECAR_POST_TIMEOUT_MS
    ):
        raise RuntimeError("adapter coerced boolean YAML numeric config into required integer settings")
    boolean_numeric_env = boolean_numeric_adapter._sidecar_env()
    for key in [
        "ARINOVA_RECONNECT_INTERVAL_MS",
        "ARINOVA_PING_INTERVAL_MS",
        "ARINOVA_PING_TIMEOUT_MS",
        "ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION",
        "ARINOVA_ADAPTER_POST_TIMEOUT_MS",
    ]:
        if key in boolean_numeric_env:
            raise RuntimeError(f"boolean optional SDK timing config leaked into sidecar env: {key}={boolean_numeric_env[key]!r}")
    if boolean_numeric_env.get("ARINOVA_CONTROL_MAX_BODY_BYTES") != str(
        loaded.module.adapter.DEFAULT_CONTROL_MAX_BODY_BYTES
    ):
        raise RuntimeError("boolean callback body limit did not fall back to the finite default")

    float_numeric_adapter = loaded.module.ArinovaAdapter(
        PlatformConfig(
            enabled=True,
            token="ari_test",
            extra={
                "server_url": "ws://example",
                "sidecar_port": 1.0,
                "adapter_port": 2.5,
                "connect_timeout_ms": 3.5,
                "attachment_max_bytes": 4.5,
                "sidecar_post_timeout_ms": 5.5,
            },
        )
    )
    if (
        float_numeric_adapter.sidecar_port != loaded.module.adapter.DEFAULT_SIDECAR_PORT
        or float_numeric_adapter.adapter_port != loaded.module.adapter.DEFAULT_ADAPTER_PORT
        or float_numeric_adapter.connect_timeout_ms != loaded.module.adapter.DEFAULT_CONNECT_TIMEOUT_MS
        or float_numeric_adapter.attachment_max_bytes != loaded.module.adapter.DEFAULT_ATTACHMENT_MAX_BYTES
        or float_numeric_adapter.sidecar_post_timeout_ms != loaded.module.adapter.DEFAULT_SIDECAR_POST_TIMEOUT_MS
    ):
        raise RuntimeError("adapter accepted float YAML numeric config for required integer settings")

    zero_numeric_adapter = loaded.module.ArinovaAdapter(
        PlatformConfig(
            enabled=True,
            token="ari_test",
            extra={
                "server_url": "ws://example",
                "max_queued_tasks": 0,
                "attachment_max_bytes": 0,
                "attachment_max_count": 0,
                "attachment_total_max_bytes": 0,
                "connect_timeout_ms": 0,
                "sidecar_post_timeout_ms": 0,
                "control_max_body_bytes": 0,
                "sidecar_port": 0,
            },
        )
    )
    if (
        zero_numeric_adapter.max_queued_tasks != 0
        or zero_numeric_adapter.attachment_max_bytes != 0
        or zero_numeric_adapter.attachment_max_count != 0
        or zero_numeric_adapter.attachment_total_max_bytes != 0
    ):
        raise RuntimeError(
            "adapter did not preserve zero for settings where zero is meaningful: "
            f"queued={zero_numeric_adapter.max_queued_tasks} "
            f"bytes={zero_numeric_adapter.attachment_max_bytes} "
            f"count={zero_numeric_adapter.attachment_max_count} "
            f"total={zero_numeric_adapter.attachment_total_max_bytes}"
        )
    if (
        zero_numeric_adapter.connect_timeout_ms != loaded.module.adapter.DEFAULT_CONNECT_TIMEOUT_MS
        or zero_numeric_adapter.sidecar_post_timeout_ms != loaded.module.adapter.DEFAULT_SIDECAR_POST_TIMEOUT_MS
        or zero_numeric_adapter.control_max_body_bytes != loaded.module.adapter.DEFAULT_CONTROL_MAX_BODY_BYTES
        or zero_numeric_adapter.sidecar_port != loaded.module.adapter.DEFAULT_SIDECAR_PORT
    ):
        raise RuntimeError("adapter accepted zero YAML config for strictly-positive settings")
    zero_numeric_env = zero_numeric_adapter._sidecar_env()
    if zero_numeric_env.get("ARINOVA_MAX_QUEUED_TASKS") != "0":
        raise RuntimeError(
            "zero max_queued_tasks did not propagate to sidecar env: "
            f"{zero_numeric_env.get('ARINOVA_MAX_QUEUED_TASKS')!r}"
        )

    plus_numeric_env = {
        "ARINOVA_SIDECAR_PORT": "+1",
        "ARINOVA_RECONNECT_INTERVAL_MS": "+250",
    }
    old_plus_numeric_env = {key: os.environ.get(key) for key in plus_numeric_env}
    os.environ.update(plus_numeric_env)
    try:
        plus_numeric_adapter = loaded.module.ArinovaAdapter(
            PlatformConfig(
                enabled=True,
                token="ari_test",
                extra={
                    "server_url": "ws://example",
                    "sidecar_port": "+2",
                    "reconnect_interval_ms": "+500",
                },
            )
        )
    finally:
        for key, value in old_plus_numeric_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
    if plus_numeric_adapter.sidecar_port != loaded.module.adapter.DEFAULT_SIDECAR_PORT:
        raise RuntimeError("adapter accepted plus-signed env numeric config for required integer settings")
    if "ARINOVA_RECONNECT_INTERVAL_MS" in plus_numeric_adapter._sidecar_env():
        raise RuntimeError("plus-signed optional SDK timing config leaked into sidecar env")


    exited_adapter = loaded.module.ArinovaAdapter(
        PlatformConfig(
            enabled=True,
            token="ari_test",
            extra={
                "server_url": "ws://example",
                "sidecar_autostart": False,
                "connect_timeout_ms": 1000,
            },
        )
    )
    exited_adapter._sidecar_proc = ExitedSidecarProc()
    exited_adapter._sidecar_log_tail = ["booting sidecar", "missing env", "fatal startup"]
    try:
        asyncio.run(exited_adapter._wait_for_sidecar())
    except RuntimeError as exc:
        if "sidecar exited before SDK authentication (exit 7)" not in str(exc):
            raise RuntimeError(f"_wait_for_sidecar reported unexpected sidecar exit error: {exc}") from exc
        if "recent sidecar output: booting sidecar | missing env | fatal startup" not in str(exc):
            raise RuntimeError(f"_wait_for_sidecar did not include sidecar log tail: {exc}") from exc
    else:
        raise RuntimeError("_wait_for_sidecar did not fail when supervised sidecar process exited")

    health_agent_adapter = loaded.module.ArinovaAdapter(
        PlatformConfig(
            enabled=True,
            token="ari_test",
            extra={
                "server_url": "ws://example",
                "sidecar_autostart": False,
                "connect_timeout_ms": 1000,
            },
        )
    )
    health_agent_adapter._post_sidecar = lambda _path, _payload: {
        "ok": True,
        "connected": True,
        "agentId": "agent-health",
    }
    asyncio.run(health_agent_adapter._wait_for_sidecar())
    if health_agent_adapter._claimed_agent_id != "agent-health":
        raise RuntimeError("adapter did not record healthz agent id during sidecar readiness")

    malformed_health_agent_adapter = loaded.module.ArinovaAdapter(
        PlatformConfig(
            enabled=True,
            token="ari_test",
            extra={
                "server_url": "ws://example",
                "sidecar_autostart": False,
                "connect_timeout_ms": 1000,
            },
        )
    )
    malformed_health_agent_adapter._post_sidecar = lambda _path, _payload: {
        "ok": True,
        "connected": True,
        "agentId": {"id": "agent-malformed-health"},
    }
    asyncio.run(malformed_health_agent_adapter._wait_for_sidecar())
    if malformed_health_agent_adapter._claimed_agent_id is not None:
        raise RuntimeError("_wait_for_sidecar recorded malformed healthz agent id")

    unhealthy_adapter = loaded.module.ArinovaAdapter(
        PlatformConfig(
            enabled=True,
            token="ari_test",
            extra={
                "server_url": "ws://example",
                "sidecar_autostart": False,
                "connect_timeout_ms": 1,
            },
        )
    )
    unhealthy_adapter._post_sidecar = lambda _path, _payload: {
        "ok": False,
        "connected": True,
        "agentId": "agent-unhealthy",
    }
    try:
        asyncio.run(unhealthy_adapter._wait_for_sidecar())
    except RuntimeError as exc:
        if "sidecar control server reported unhealthy state" not in str(exc):
            raise RuntimeError(f"_wait_for_sidecar reported unexpected unhealthy health error: {exc}") from exc
    else:
        raise RuntimeError("_wait_for_sidecar accepted unhealthy sidecar health")
    if unhealthy_adapter._claimed_agent_id is not None:
        raise RuntimeError("_wait_for_sidecar recorded agent id from unhealthy sidecar health")

    bool_adapter = loaded.module.ArinovaAdapter(
        PlatformConfig(
            enabled=True,
            token="ari_test",
            extra={
                "server_url": "ws://example",
                "download_attachments": "false",
                "sidecar_autostart": "false",
            },
        )
    )
    if bool_adapter.download_attachments is not False or bool_adapter.autostart_sidecar is not False:
        raise RuntimeError(
            "adapter did not parse string boolean config: "
            f"download={bool_adapter.download_attachments} autostart={bool_adapter.autostart_sidecar}"
        )
    old_bool_env = {
        "ARINOVA_DOWNLOAD_ATTACHMENTS": os.environ.get("ARINOVA_DOWNLOAD_ATTACHMENTS"),
        "ARINOVA_SIDECAR_AUTOSTART": os.environ.get("ARINOVA_SIDECAR_AUTOSTART"),
    }
    os.environ["ARINOVA_DOWNLOAD_ATTACHMENTS"] = "true"
    os.environ["ARINOVA_SIDECAR_AUTOSTART"] = "true"
    try:
        env_bool_adapter = loaded.module.ArinovaAdapter(
            PlatformConfig(
                enabled=True,
                token="ari_test",
                extra={
                    "server_url": "ws://example",
                    "download_attachments": "false",
                    "sidecar_autostart": "false",
                },
            )
        )
    finally:
        for key, value in old_bool_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
    if env_bool_adapter.download_attachments is not True or env_bool_adapter.autostart_sidecar is not True:
        raise RuntimeError(
            "adapter boolean env overrides did not win over config extras: "
            f"download={env_bool_adapter.download_attachments} autostart={env_bool_adapter.autostart_sidecar}"
        )

    timeout_requests = []
    original_urlopen_for_timeout = loaded.module.adapter.urllib.request.urlopen

    def fake_timeout_urlopen(req, timeout=0):
        timeout_requests.append((req, timeout))
        return FakeHttpResponse(b'{"ok":true,"connected":true}')

    loaded.module.adapter.urllib.request.urlopen = fake_timeout_urlopen
    try:
        health = adapter._post_sidecar("/healthz", {})
    finally:
        loaded.module.adapter.urllib.request.urlopen = original_urlopen_for_timeout
    if health.get("connected") is not True or len(timeout_requests) != 1:
        raise RuntimeError(f"sidecar health timeout probe failed: health={health} requests={timeout_requests}")
    timeout_req, timeout_value = timeout_requests[0]
    if timeout_value != 6 or timeout_req.full_url != f"http://{adapter.sidecar_host}:{adapter.sidecar_port}/healthz":
        raise RuntimeError(
            "adapter did not use sidecar_post_timeout_ms for sidecar control calls: "
            f"url={timeout_req.full_url} timeout={timeout_value}"
        )

    adapter._handle_token_claimed({"agentId": "agent-1", "permanentToken": "ari_perm"})
    if (
        adapter.bot_token != "ari_perm"
        or adapter._claimed_agent_id != "agent-1"
        or adapter._claimed_permanent_token != "ari_perm"
        or adapter.config.token != "ari_perm"
        or adapter.config.extra.get("bot_token") != "ari_perm"
    ):
        raise RuntimeError("adapter did not record token_claimed state")
    adapter._handle_token_claimed({"agentId": None, "permanentToken": "ari_null_agent_perm"})
    if (
        adapter.bot_token != "ari_null_agent_perm"
        or adapter._claimed_agent_id != "agent-1"
        or adapter._claimed_permanent_token != "ari_null_agent_perm"
        or adapter.config.token != "ari_null_agent_perm"
        or adapter.config.extra.get("bot_token") != "ari_null_agent_perm"
    ):
        raise RuntimeError("adapter did not record token_claimed state without agent id")
    adapter._handle_token_claimed({"agentId": "agent-malformed", "permanentToken": {"token": "ari_bad"}})
    if (
        adapter.bot_token != "ari_null_agent_perm"
        or adapter._claimed_agent_id != "agent-1"
        or adapter._claimed_permanent_token != "ari_null_agent_perm"
        or adapter.config.token != "ari_null_agent_perm"
        or adapter.config.extra.get("bot_token") != "ari_null_agent_perm"
    ):
        raise RuntimeError("adapter accepted malformed token_claimed state")
    adapter._handle_token_claimed({"agentId": "agent-empty", "permanentToken": "   "})
    if (
        adapter.bot_token != "ari_null_agent_perm"
        or adapter._claimed_agent_id != "agent-1"
        or adapter._claimed_permanent_token != "ari_null_agent_perm"
        or adapter.config.token != "ari_null_agent_perm"
        or adapter.config.extra.get("bot_token") != "ari_null_agent_perm"
    ):
        raise RuntimeError("adapter accepted blank token_claimed token")
    adapter._handle_onboarding_seed(
        {
            "kind": "first_touch_opening",
            "seedId": "seed-1",
            "agentId": "agent-1",
            "action": "open",
            "prompt": "hello",
        }
    )
    if adapter._onboarding_seed is None or adapter._onboarding_seed.get("prompt") != "hello":
        raise RuntimeError("adapter did not record onboarding seed state")
    adapter._handle_onboarding_seed({"kind": "first_touch_opening", "seedId": "malformed"})
    if adapter._onboarding_seed is None or adapter._onboarding_seed.get("seedId") != "seed-1":
        raise RuntimeError("adapter accepted malformed onboarding seed state")
    adapter._handle_onboarding_seed(
        {
            "kind": "first_touch_opening",
            "seedId": "",
            "agentId": "",
            "action": "",
            "prompt": "",
        }
    )
    if adapter._onboarding_seed != {
        "kind": "first_touch_opening",
        "seedId": "",
        "agentId": "",
        "action": "",
        "prompt": "",
    }:
        raise RuntimeError("adapter rejected SDK-valid empty-string onboarding seed state")

    def seed_active_task_state(task_id: str, conversation_id: str) -> None:
        adapter._conversation_by_task[task_id] = conversation_id
        adapter._task_by_conversation[conversation_id] = task_id
        adapter._task_context_by_task[task_id] = {"conversationId": conversation_id, "taskKind": "trigger"}
        adapter._buffer_by_task[task_id] = ["partial"]
        adapter._mentions_by_task[task_id] = ["user-1"]
        adapter._session_by_task[task_id] = f"arinova:{conversation_id}"
        adapter._message_by_task[task_id] = f"msg:{task_id}"
        adapter._task_started_at[task_id] = 123.0

    def assert_active_task_state_cleared(label: str) -> None:
        if (
            adapter._conversation_by_task
            or adapter._task_by_conversation
            or adapter._task_context_by_task
            or adapter._buffer_by_task
            or adapter._mentions_by_task
            or adapter._session_by_task
            or adapter._message_by_task
            or adapter._task_started_at
        ):
            raise RuntimeError(
                f"{label} left active task state: "
                f"tasks={adapter._task_by_conversation} conversations={adapter._conversation_by_task} "
                f"contexts={adapter._task_context_by_task} buffers={adapter._buffer_by_task} mentions={adapter._mentions_by_task} "
                f"sessions={adapter._session_by_task} messages={adapter._message_by_task} "
                f"starts={adapter._task_started_at}"
            )

    def assert_active_task_state_present(label: str, task_id: str, conversation_id: str) -> None:
        if (
            adapter._conversation_by_task.get(task_id) != conversation_id
            or adapter._task_by_conversation.get(conversation_id) != task_id
            or adapter._task_context_by_task.get(task_id) != {"conversationId": conversation_id, "taskKind": "trigger"}
            or task_id not in adapter._buffer_by_task
            or task_id not in adapter._mentions_by_task
            or task_id not in adapter._session_by_task
            or task_id not in adapter._task_started_at
        ):
            raise RuntimeError(
                f"{label} did not preserve active task state: "
                f"tasks={adapter._task_by_conversation} conversations={adapter._conversation_by_task} "
                f"contexts={adapter._task_context_by_task} buffers={adapter._buffer_by_task} mentions={adapter._mentions_by_task} "
                f"sessions={adapter._session_by_task} starts={adapter._task_started_at}"
            )

    previous_active_adapter = loaded.module.adapter._active_adapter
    loaded.module.adapter._active_adapter = None
    adapter._handle_connection_status({"connected": True, "agentId": "agent-1"})
    if not adapter.is_connected or adapter._claimed_agent_id != "agent-1":
        raise RuntimeError("adapter did not record connected state")
    if loaded.module.adapter._active_adapter is not adapter:
        raise RuntimeError("connection-status true did not register active adapter singleton")
    adapter._handle_connection_status({"connected": "true", "agentId": "agent-string"})
    if not adapter.is_connected or adapter._claimed_agent_id != "agent-string":
        raise RuntimeError("adapter did not parse string connected state")
    adapter._handle_connection_status({"connected": True, "agentId": {"id": "agent-malformed-connected"}})
    if not adapter.is_connected or adapter._claimed_agent_id != "agent-string":
        raise RuntimeError("adapter accepted malformed connection-status agent id")
    adapter._handle_connection_status({"connected": "maybe", "agentId": "agent-malformed"})
    if not adapter.is_connected or adapter._claimed_agent_id != "agent-string":
        raise RuntimeError("adapter accepted malformed connection status as state-changing")
    seed_active_task_state("task-disconnected", "conv-disconnected")
    adapter._handle_connection_status({"connected": False})
    if adapter.is_connected:
        raise RuntimeError("adapter did not record disconnected state")
    if loaded.module.adapter._active_adapter is adapter:
        raise RuntimeError("connection-status false did not clear active adapter singleton")
    assert_active_task_state_present("connection-status false", "task-disconnected", "conv-disconnected")
    loaded.module.adapter._active_adapter = adapter
    seed_active_task_state("task-string-disconnected", "conv-string-disconnected")
    adapter._handle_connection_status({"connected": "false"})
    if adapter.is_connected:
        raise RuntimeError("adapter treated string false connection state as connected")
    if loaded.module.adapter._active_adapter is adapter:
        raise RuntimeError("connection-status string false did not clear active adapter singleton")
    assert_active_task_state_present("connection-status string false", "task-string-disconnected", "conv-string-disconnected")
    loaded.module.adapter._active_adapter = previous_active_adapter
    seed_active_task_state("task-auth-failed", "conv-auth-failed")
    auth_failed_cancelled_sessions = []
    original_schedule_cancel_sessions = adapter._schedule_cancel_sessions
    adapter._schedule_cancel_sessions = lambda session_keys: auth_failed_cancelled_sessions.extend(session_keys)
    adapter._handle_auth_failed({"error": "invalid token", "retryable": False})
    adapter._schedule_cancel_sessions = original_schedule_cancel_sessions
    if adapter.fatal_error_code != "auth_failed" or adapter.fatal_error_retryable is not False:
        raise RuntimeError("adapter did not record auth_failed fatal state")
    if set(auth_failed_cancelled_sessions) != {
        "arinova:conv-disconnected",
        "arinova:conv-string-disconnected",
        "arinova:conv-auth-failed",
    }:
        raise RuntimeError(f"auth_failed did not cancel active Hermes sessions: {auth_failed_cancelled_sessions}")
    assert_active_task_state_cleared("auth_failed")
    adapter._handle_auth_failed({"error": "string false", "retryable": "false"})
    if adapter.fatal_error_retryable is not False:
        raise RuntimeError("adapter treated string false auth retryable as true")
    adapter._handle_auth_failed({"error": "string true", "retryable": "true"})
    if adapter.fatal_error_retryable is not True:
        raise RuntimeError("adapter did not parse string true auth retryable")
    adapter._handle_sdk_error({"error": "background parser failed"})
    if adapter._last_sdk_error != "background parser failed":
        raise RuntimeError("adapter did not record SDK error lifecycle state")
    adapter._mark_connected()

    with socket.socket() as port_socket:
        port_socket.bind(("127.0.0.1", 0))
        real_sidecar_port = port_socket.getsockname()[1]
    supervised_adapter = loaded.module.ArinovaAdapter(
        PlatformConfig(
            enabled=True,
            token="ari_supervision",
            extra={
                "server_url": "ws://127.0.0.1:9",
                "sidecar_port": real_sidecar_port,
                "sidecar_autostart": False,
            },
        )
    )
    supervised_adapter._start_sidecar()
    first_proc = supervised_adapter._sidecar_proc
    first_thread = supervised_adapter._sidecar_log_thread
    if not isinstance(first_proc, subprocess.Popen):
        raise RuntimeError("_start_sidecar did not create a real Popen process")
    deadline = time.monotonic() + 3
    while not supervised_adapter._sidecar_log_tail and time.monotonic() < deadline:
        time.sleep(0.02)
    first_stdout = first_proc.stdout
    first_proc.terminate()
    first_proc.wait(timeout=5)
    supervised_adapter._start_sidecar()
    if first_stdout is None or not first_stdout.closed:
        raise RuntimeError("sidecar restart did not close the previous stdout pipe")
    if first_thread is not None and first_thread.is_alive():
        raise RuntimeError("sidecar restart left the previous log drain thread alive")
    if len(supervised_adapter._sidecar_log_tail) > 20:
        raise RuntimeError("real sidecar log drain exceeded its bounded tail")
    second_proc = supervised_adapter._sidecar_proc
    if not isinstance(second_proc, subprocess.Popen) or second_proc is first_proc:
        raise RuntimeError("sidecar restart did not create a fresh real Popen process")
    second_proc.terminate()
    second_proc.wait(timeout=5)
    if second_proc.stdout:
        second_proc.stdout.close()
    if supervised_adapter._sidecar_log_thread:
        supervised_adapter._sidecar_log_thread.join(timeout=1)
    supervised_adapter._sidecar_proc = None

    disconnect_adapter = loaded.module.ArinovaAdapter(
        PlatformConfig(
            enabled=True,
            token="ari_token",
            extra={
                "server_url": "https://arinova.invalid",
                "sidecar_autostart": False,
            },
        )
    )
    disconnect_posts = []

    def fake_disconnect_post(path, payload):
        disconnect_posts.append((path, payload))
        return {"ok": True}


    running_sidecar = RunningSidecarProc()
    disconnect_adapter._post_sidecar = fake_disconnect_post
    disconnect_adapter._sidecar_proc = running_sidecar
    disconnect_adapter._conversation_info_by_id["conv-preserved"] = {"name": "Preserved", "type": "group"}
    disconnect_adapter._conversation_by_task["task-disconnect"] = "conv-disconnect"
    disconnect_adapter._task_by_conversation["conv-disconnect"] = "task-disconnect"
    disconnect_adapter._buffer_by_task["task-disconnect"] = ["partial"]
    disconnect_adapter._mentions_by_task["task-disconnect"] = ["user-disconnect"]
    disconnect_adapter._session_by_task["task-disconnect"] = "arinova:conv-disconnect"
    disconnect_adapter._message_by_task["task-disconnect"] = "msg-disconnect"
    disconnect_adapter._task_started_at["task-disconnect"] = 123.0
    loaded.module.adapter._active_adapter = disconnect_adapter
    asyncio.run(disconnect_adapter.disconnect())
    if disconnect_posts[:1] != [("/shutdown", {})]:
        raise RuntimeError(f"disconnect did not ask sidecar to shut down first: {disconnect_posts}")
    if not running_sidecar.terminated or running_sidecar.killed or running_sidecar.wait_timeout != 5:
        raise RuntimeError(
            "disconnect did not gracefully terminate supervised sidecar: "
            f"terminated={running_sidecar.terminated} killed={running_sidecar.killed} "
            f"wait_timeout={running_sidecar.wait_timeout}"
        )
    if disconnect_adapter._sidecar_proc is not None:
        raise RuntimeError("disconnect did not clear sidecar process handle")
    if loaded.module.adapter._active_adapter is disconnect_adapter:
        raise RuntimeError("disconnect did not clear active adapter singleton")
    if (
        disconnect_adapter._conversation_by_task
        or disconnect_adapter._task_by_conversation
        or disconnect_adapter._buffer_by_task
        or disconnect_adapter._mentions_by_task
        or disconnect_adapter._session_by_task
        or disconnect_adapter._message_by_task
        or disconnect_adapter._task_started_at
    ):
        raise RuntimeError(
            "disconnect left active task state: "
            f"tasks={disconnect_adapter._task_by_conversation} "
            f"conversations={disconnect_adapter._conversation_by_task} "
            f"messages={disconnect_adapter._message_by_task}"
        )
    if disconnect_adapter._conversation_info_by_id.get("conv-preserved", {}).get("name") != "Preserved":
        raise RuntimeError("disconnect cleared conversation info cache")

    shutdown_failure_adapter = loaded.module.ArinovaAdapter(
        PlatformConfig(
            enabled=True,
            token="ari_token",
            extra={
                "server_url": "https://arinova.invalid",
                "sidecar_autostart": False,
            },
        )
    )
    shutdown_failure_proc = RunningSidecarProc()
    shutdown_failure_adapter._sidecar_proc = shutdown_failure_proc

    def failing_shutdown_post(_path, _payload):
        raise RuntimeError("shutdown endpoint unavailable")

    shutdown_failure_adapter._post_sidecar = failing_shutdown_post
    asyncio.run(shutdown_failure_adapter.disconnect())
    if (
        not shutdown_failure_proc.terminated
        or shutdown_failure_proc.killed
        or shutdown_failure_proc.wait_timeout != 5
        or shutdown_failure_adapter._sidecar_proc is not None
    ):
        raise RuntimeError(
            "disconnect did not clean up supervised sidecar after shutdown post failure: "
            f"terminated={shutdown_failure_proc.terminated} killed={shutdown_failure_proc.killed} "
            f"wait_timeout={shutdown_failure_proc.wait_timeout} proc={shutdown_failure_adapter._sidecar_proc}"
        )

    stubborn_adapter = loaded.module.ArinovaAdapter(
        PlatformConfig(
            enabled=True,
            token="ari_token",
            extra={
                "server_url": "https://arinova.invalid",
                "sidecar_autostart": False,
            },
        )
    )
    stubborn_adapter._post_sidecar = lambda _path, _payload: {"ok": True}


    stubborn_proc = StubbornSidecarProc()
    stubborn_adapter._sidecar_proc = stubborn_proc
    asyncio.run(stubborn_adapter.disconnect())
    if not stubborn_proc.terminated or not stubborn_proc.killed or stubborn_proc.wait_calls != [5, 5]:
        raise RuntimeError(
            "disconnect did not kill and reap stubborn supervised sidecar: "
            f"terminated={stubborn_proc.terminated} killed={stubborn_proc.killed} "
            f"wait_calls={stubborn_proc.wait_calls}"
        )
    if stubborn_adapter._sidecar_proc is not None:
        raise RuntimeError("disconnect did not clear stubborn sidecar process handle")

    inbound_adapter = loaded.module.ArinovaAdapter(
        PlatformConfig(
            enabled=True,
            token="ari_token",
            extra={
                "server_url": "https://arinova.invalid",
                "adapter_port": 0,
                "sidecar_autostart": False,
            },
        )
    )
    inbound_loop = asyncio.new_event_loop()
    inbound_loop_thread = threading.Thread(target=inbound_loop.run_forever, daemon=True)
    inbound_loop_thread.start()
    inbound_adapter._loop = inbound_loop
    inbound_adapter._start_inbound_server()
    inbound_port = inbound_adapter._httpd.server_address[1]

    def inbound_request(
        path,
        *,
        body: bytes | None = None,
        token: str | None = None,
        method: str | None = None,
        content_type: str | None = "application/json",
    ):
        url = f"http://{inbound_adapter.bind_host}:{inbound_port}{path}"
        req = urllib.request.Request(url, data=body, method=method)
        if body is not None and content_type is not None:
            req.add_header("Content-Type", content_type)
        if token is not None:
            req.add_header("X-Arinova-Bridge-Token", token)
        try:
            with urllib.request.urlopen(req, timeout=2) as res:
                return res.status, res.read()
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read()

    def raw_inbound_request(path: str, headers: dict[str, str], body: bytes = b"") -> tuple[int, bytes]:
        request_lines = [
            f"POST {path} HTTP/1.1",
            f"Host: {inbound_adapter.bind_host}:{inbound_port}",
            "Connection: close",
        ]
        request_lines.extend(f"{key}: {value}" for key, value in headers.items())
        raw = ("\r\n".join(request_lines) + "\r\n\r\n").encode("ascii") + body
        with socket.create_connection((inbound_adapter.bind_host, inbound_port), timeout=2) as sock:
            sock.settimeout(2)
            sock.sendall(raw)
            chunks = []
            while True:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                chunks.append(chunk)
        response = b"".join(chunks)
        head, _, response_body = response.partition(b"\r\n\r\n")
        status_line = head.splitlines()[0].decode("ascii", errors="replace")
        return int(status_line.split()[1]), response_body

    try:
        status, body = inbound_request("/healthz", method="GET")
        if status != 200 or json.loads(body.decode("utf-8")) != {"ok": True}:
            raise RuntimeError(f"inbound /healthz failed: status={status} body={body!r}")
        status, _body = inbound_request("/task", body=b"{}", token="wrong")
        if status != 401:
            raise RuntimeError(f"inbound server accepted request with wrong bridge token: status={status}")
        inbound_adapter.control_max_body_bytes = 16
        status, body = inbound_request(
            "/task",
            body=b'{"taskId":"task-too-large","content":"oversized"}',
            token=inbound_adapter._shared_token,
        )
        parsed = json.loads(body.decode("utf-8"))
        if status != 413 or parsed.get("ok") is not False or "exceeds 16 bytes" not in str(parsed.get("error")):
            raise RuntimeError(f"inbound server accepted oversized callback body: status={status} body={body!r}")
        inbound_adapter.control_max_body_bytes = loaded.module.adapter.DEFAULT_CONTROL_MAX_BODY_BYTES
        status, body = raw_inbound_request(
            "/connection-status",
            {
                "X-Arinova-Bridge-Token": inbound_adapter._shared_token,
                "Content-Type": "application/json",
                "Content-Length": "not-a-number",
            },
            b'{"connected":true}',
        )
        parsed = json.loads(body.decode("utf-8"))
        if (
            status != 400
            or parsed.get("ok") is not False
            or "Content-Length must be a non-negative integer" not in str(parsed.get("error"))
        ):
            raise RuntimeError(f"inbound server accepted malformed callback Content-Length: status={status} body={body!r}")
        status, body = raw_inbound_request(
            "/connection-status",
            {
                "X-Arinova-Bridge-Token": inbound_adapter._shared_token,
                "Content-Type": "application/json",
            },
            b'{"connected":true,"agentId":"agent-no-length"}',
        )
        parsed = json.loads(body.decode("utf-8"))
        if (
            status != 400
            or parsed.get("ok") is not False
            or "Content-Length is required" not in str(parsed.get("error"))
        ):
            raise RuntimeError(f"inbound server accepted callback without Content-Length: status={status} body={body!r}")
        if inbound_adapter.is_connected is True or inbound_adapter._claimed_agent_id == "agent-no-length":
            raise RuntimeError("inbound callback without Content-Length changed adapter state")
        status, body = inbound_request(
            "/connection-status",
            body=b'{"connected":true}',
            token=inbound_adapter._shared_token,
            content_type="text/plain; charset=utf-8",
        )
        parsed = json.loads(body.decode("utf-8"))
        if status != 415 or parsed.get("ok") is not False or "must use application/json" not in str(parsed.get("error")):
            raise RuntimeError(f"inbound server accepted non-JSON callback content type: status={status} body={body!r}")
        status, body = inbound_request("/task", body=b"{bad-json", token=inbound_adapter._shared_token)
        if status != 400 or json.loads(body.decode("utf-8")).get("ok") is not False:
            raise RuntimeError(f"inbound server did not reject malformed JSON: status={status} body={body!r}")
        status, body = inbound_request("/connection-status", body=b'{"connected":NaN}', token=inbound_adapter._shared_token)
        parsed = json.loads(body.decode("utf-8"))
        if status != 400 or parsed.get("ok") is not False or "non-finite constant" not in str(parsed.get("error")):
            raise RuntimeError(f"inbound server did not reject non-finite JSON callback: status={status} body={body!r}")
        status, body = inbound_request(
            "/connection-status",
            body=b'{"connected":false,"connected":true}',
            token=inbound_adapter._shared_token,
        )
        parsed = json.loads(body.decode("utf-8"))
        if status != 400 or parsed.get("ok") is not False or "duplicate key: connected" not in str(parsed.get("error")):
            raise RuntimeError(f"inbound server did not reject duplicate JSON callback key: status={status} body={body!r}")
        status, body = inbound_request("/connection-status", body=b"[]", token=inbound_adapter._shared_token)
        parsed = json.loads(body.decode("utf-8"))
        if status != 400 or parsed.get("ok") is not False or "JSON object" not in str(parsed.get("error")):
            raise RuntimeError(f"inbound server did not reject non-object JSON payload: status={status} body={body!r}")
        status, body = inbound_request("/task", body=b'{"content":"missing task id"}', token=inbound_adapter._shared_token)
        parsed = json.loads(body.decode("utf-8"))
        if status != 400 or parsed.get("ok") is not False or "missing required field(s): taskId" not in str(parsed.get("error")):
            raise RuntimeError(f"inbound server did not reject task callback without taskId: status={status} body={body!r}")
        status, body = inbound_request("/task", body=b'{"taskId":"task-bad-content","content":0}', token=inbound_adapter._shared_token)
        parsed = json.loads(body.decode("utf-8"))
        if status != 400 or parsed.get("ok") is not False or "content must be a string" not in str(parsed.get("error")):
            raise RuntimeError(f"inbound server did not reject task callback with non-string content: status={status} body={body!r}")
        status, body = inbound_request(
            "/task",
            body=(
                b'{"taskId":"task-bad-attachment","conversationId":"conv-bad-attachment","content":"bad attachment",'
                b'"attachments":[{"id":"att-bad","fileName":"bad.txt","fileType":"text/plain","fileSize":"large",'
                b'"url":"https://files.example/bad.txt"}]}'
            ),
            token=inbound_adapter._shared_token,
        )
        parsed = json.loads(body.decode("utf-8"))
        if (
            status != 400
            or parsed.get("ok") is not False
            or "attachments[0].fileSize must be a finite number" not in str(parsed.get("error"))
        ):
            raise RuntimeError(f"inbound server did not reject task callback with malformed attachment: status={status} body={body!r}")
        status, body = inbound_request(
            "/task",
            body=(
                b'{"taskId":"task-bad-skill","conversationId":"conv-bad-skill","content":"bad skill",'
                b'"availableSkills":[{"slug":"memo","name":"Memo","slashCommand":false,"description":"Use memos"}]}'
            ),
            token=inbound_adapter._shared_token,
        )
        parsed = json.loads(body.decode("utf-8"))
        if (
            status != 400
            or parsed.get("ok") is not False
            or "availableSkills[0].slashCommand must be a string or null" not in str(parsed.get("error"))
        ):
            raise RuntimeError(f"inbound server did not reject task callback with malformed availableSkills: status={status} body={body!r}")
        if (
            "task-bad-attachment" in inbound_adapter._session_by_task
            or "task-bad-skill" in inbound_adapter._session_by_task
            or inbound_adapter._task_by_conversation.get("conv-bad-attachment") == "task-bad-attachment"
            or inbound_adapter._task_by_conversation.get("conv-bad-skill") == "task-bad-skill"
        ):
            raise RuntimeError("inbound server applied callback with malformed nested task context")
        status, body = inbound_request("/cancel", body=b'{"taskId":""}', token=inbound_adapter._shared_token)
        parsed = json.loads(body.decode("utf-8"))
        if status != 400 or parsed.get("ok") is not False or "taskId must be a non-empty string" not in str(parsed.get("error")):
            raise RuntimeError(f"inbound server did not reject cancel callback with blank taskId: status={status} body={body!r}")
        status, body = inbound_request("/connection-status", body=b'{"connected":"true"}', token=inbound_adapter._shared_token)
        parsed = json.loads(body.decode("utf-8"))
        if status != 400 or parsed.get("ok") is not False or "connected must be a boolean" not in str(parsed.get("error")):
            raise RuntimeError(f"inbound server did not reject connection-status callback with non-boolean connected: status={status} body={body!r}")
        status, body = inbound_request(
            "/connection-status",
            body=b'{"connected":true,"agentId":"agent-inbound","extra":true}',
            token=inbound_adapter._shared_token,
        )
        parsed = json.loads(body.decode("utf-8"))
        if status != 400 or parsed.get("ok") is not False or "unsupported field(s): extra" not in str(parsed.get("error")):
            raise RuntimeError(f"inbound server did not reject unknown callback field: status={status} body={body!r}")
        if inbound_adapter.is_connected is True or inbound_adapter._claimed_agent_id == "agent-inbound":
            raise RuntimeError("inbound server applied callback with unknown fields")
        status, body = inbound_request("/missing", body=b"{}", token=inbound_adapter._shared_token)
        if status != 400 or "unsupported callback path" not in body.decode("utf-8"):
            raise RuntimeError(f"inbound server accepted unknown authenticated path: status={status}")
        status, body = inbound_request(
            "/connection-status",
            body=b'{"connected":true,"agentId":"agent-inbound"}',
            token=inbound_adapter._shared_token,
        )
        if status != 202 or json.loads(body.decode("utf-8")) != {"ok": True}:
            raise RuntimeError(f"inbound connection-status callback failed: status={status} body={body!r}")
        if inbound_adapter.is_connected is not True or inbound_adapter._claimed_agent_id != "agent-inbound":
            raise RuntimeError("inbound server did not dispatch authorized connection-status callback")
        status, body = inbound_request(
            "/connection-status",
            body=b'{"connected":"bogus","agentId":"agent-bogus"}',
            token=inbound_adapter._shared_token,
        )
        parsed = json.loads(body.decode("utf-8"))
        if status != 400 or parsed.get("ok") is not False or "connected must be a boolean" not in str(parsed.get("error")):
            raise RuntimeError(f"inbound malformed connection-status callback was not rejected: status={status} body={body!r}")
        if inbound_adapter.is_connected is not True or inbound_adapter._claimed_agent_id != "agent-inbound":
            raise RuntimeError("inbound malformed connection-status callback changed adapter state")
        status, body = inbound_request(
            "/token-claimed",
            body=b'{"agentId":"agent-inbound-token","permanentToken":"ari_inbound_perm"}',
            token=inbound_adapter._shared_token,
        )
        if status != 202 or json.loads(body.decode("utf-8")) != {"ok": True}:
            raise RuntimeError(f"inbound token-claimed callback failed: status={status} body={body!r}")
        if (
            inbound_adapter._claimed_agent_id != "agent-inbound-token"
            or inbound_adapter._claimed_permanent_token != "ari_inbound_perm"
            or inbound_adapter.config.extra.get("bot_token") != "ari_inbound_perm"
        ):
            raise RuntimeError("inbound server did not dispatch authorized token-claimed callback")
        status, body = inbound_request(
            "/token-claimed",
            body=b'{"agentId":"agent-bad-token","permanentToken":{"token":"ari_bad"}}',
            token=inbound_adapter._shared_token,
        )
        parsed = json.loads(body.decode("utf-8"))
        if status != 400 or parsed.get("ok") is not False or "permanentToken must be a non-empty string" not in str(parsed.get("error")):
            raise RuntimeError(f"inbound malformed token-claimed callback was not rejected: status={status} body={body!r}")
        if (
            inbound_adapter._claimed_agent_id != "agent-inbound-token"
            or inbound_adapter._claimed_permanent_token != "ari_inbound_perm"
        ):
            raise RuntimeError("inbound malformed token-claimed callback changed adapter state")
        status, body = inbound_request(
            "/onboarding-seed",
            body=(
                b'{"kind":"first_touch_opening","seedId":"seed-inbound","agentId":"agent-inbound-token",'
                b'"action":"open","prompt":"hello from inbound"}'
            ),
            token=inbound_adapter._shared_token,
        )
        if status != 202 or json.loads(body.decode("utf-8")) != {"ok": True}:
            raise RuntimeError(f"inbound onboarding-seed callback failed: status={status} body={body!r}")
        if (
            inbound_adapter._onboarding_seed is None
            or inbound_adapter._onboarding_seed.get("seedId") != "seed-inbound"
            or inbound_adapter._onboarding_seed.get("prompt") != "hello from inbound"
        ):
            raise RuntimeError("inbound server did not dispatch authorized onboarding-seed callback")
        status, body = inbound_request(
            "/onboarding-seed",
            body=b'{"kind":"first_touch_opening","seedId":"seed-bad"}',
            token=inbound_adapter._shared_token,
        )
        parsed = json.loads(body.decode("utf-8"))
        if status != 400 or parsed.get("ok") is not False or "missing required field(s)" not in str(parsed.get("error")):
            raise RuntimeError(f"inbound malformed onboarding-seed callback was not rejected: status={status} body={body!r}")
        if (
            inbound_adapter._onboarding_seed is None
            or inbound_adapter._onboarding_seed.get("seedId") != "seed-inbound"
        ):
            raise RuntimeError("inbound malformed onboarding-seed callback changed adapter state")
        status, body = inbound_request(
            "/sdk-error",
            body=b'{"error":"inbound parser failed"}',
            token=inbound_adapter._shared_token,
        )
        if status != 202 or json.loads(body.decode("utf-8")) != {"ok": True}:
            raise RuntimeError(f"inbound sdk-error callback failed: status={status} body={body!r}")
        if inbound_adapter._last_sdk_error != "inbound parser failed":
            raise RuntimeError("inbound server did not dispatch authorized sdk-error callback")
        status, body = inbound_request(
            "/auth-failed",
            body=b'{"error":"inbound invalid token","retryable":true}',
            token=inbound_adapter._shared_token,
        )
        if status != 202 or json.loads(body.decode("utf-8")) != {"ok": True}:
            raise RuntimeError(f"inbound auth-failed callback failed: status={status} body={body!r}")
        if (
            inbound_adapter.fatal_error_code != "auth_failed"
            or inbound_adapter.fatal_error_retryable is not True
            or "inbound invalid token" not in (inbound_adapter.fatal_error_message or "")
        ):
            raise RuntimeError("inbound server did not dispatch authorized auth-failed callback")
    finally:
        asyncio.run(inbound_adapter.disconnect())
        inbound_loop.call_soon_threadsafe(inbound_loop.stop)
        inbound_loop_thread.join(timeout=2)
        inbound_loop.close()

    original_urlopen_for_strict_json = loaded.module.adapter.urllib.request.urlopen
    sidecar_urlopen_called = False

    def fail_if_sidecar_urlopen_called(_req, timeout=0):
        nonlocal sidecar_urlopen_called
        sidecar_urlopen_called = True
        raise RuntimeError("sidecar urlopen should not be called for invalid JSON payload")

    loaded.module.adapter.urllib.request.urlopen = fail_if_sidecar_urlopen_called
    try:
        try:
            adapter._post_sidecar("/agent-sdk", {"method": "fetchHistory", "args": ["conv-1", {"limit": float("nan")}]})
        except ValueError as exc:
            if "Out of range float values are not JSON compliant" not in str(exc):
                raise RuntimeError(f"_post_sidecar rejected non-finite JSON with unexpected error: {exc}") from exc
        else:
            raise RuntimeError("_post_sidecar accepted non-finite JSON payload")
        if sidecar_urlopen_called:
            raise RuntimeError("_post_sidecar attempted to send non-finite JSON payload")
    finally:
        loaded.module.adapter.urllib.request.urlopen = original_urlopen_for_strict_json


    def sidecar_response_urlopen(body: bytes, content_type: str | None = "application/json"):
        def fake_urlopen(_req, timeout=0):
            return FakeSidecarResponse(body, content_type=content_type)

        return fake_urlopen

    loaded.module.adapter.urllib.request.urlopen = sidecar_response_urlopen(b'{"ok":true}', content_type="text/plain")
    try:
        try:
            adapter._post_sidecar("/healthz", {})
        except RuntimeError as exc:
            if "/healthz returned non-JSON response content type: text/plain" not in str(exc):
                raise RuntimeError(f"_post_sidecar reported non-JSON response content type with unexpected error: {exc}") from exc
        else:
            raise RuntimeError("_post_sidecar accepted non-JSON sidecar response content type")
    finally:
        loaded.module.adapter.urllib.request.urlopen = original_urlopen_for_strict_json

    loaded.module.adapter.urllib.request.urlopen = sidecar_response_urlopen(b"\xff")
    try:
        try:
            adapter._post_sidecar("/healthz", {})
        except RuntimeError as exc:
            if "/healthz returned non-UTF-8 response body" not in str(exc):
                raise RuntimeError(f"_post_sidecar reported non-UTF-8 response with unexpected error: {exc}") from exc
        else:
            raise RuntimeError("_post_sidecar accepted non-UTF-8 sidecar response")
    finally:
        loaded.module.adapter.urllib.request.urlopen = original_urlopen_for_strict_json

    loaded.module.adapter.urllib.request.urlopen = sidecar_response_urlopen(b"{not-json")
    try:
        try:
            adapter._post_sidecar("/healthz", {})
        except RuntimeError as exc:
            if "/healthz returned malformed JSON" not in str(exc):
                raise RuntimeError(f"_post_sidecar reported invalid JSON with unexpected error: {exc}") from exc
        else:
            raise RuntimeError("_post_sidecar accepted malformed sidecar JSON")
    finally:
        loaded.module.adapter.urllib.request.urlopen = original_urlopen_for_strict_json

    loaded.module.adapter.urllib.request.urlopen = sidecar_response_urlopen(b"")
    try:
        try:
            adapter._post_sidecar("/healthz", {})
        except RuntimeError as exc:
            if "/healthz returned malformed JSON" not in str(exc):
                raise RuntimeError(f"_post_sidecar reported empty JSON response with unexpected error: {exc}") from exc
        else:
            raise RuntimeError("_post_sidecar accepted empty sidecar JSON response")
    finally:
        loaded.module.adapter.urllib.request.urlopen = original_urlopen_for_strict_json

    loaded.module.adapter.urllib.request.urlopen = sidecar_response_urlopen(b'{"ok":true,"connected":NaN}')
    try:
        try:
            adapter._post_sidecar("/healthz", {})
        except RuntimeError as exc:
            if "/healthz returned malformed JSON" not in str(exc):
                raise RuntimeError(f"_post_sidecar reported non-finite JSON with unexpected error: {exc}") from exc
        else:
            raise RuntimeError("_post_sidecar accepted non-finite sidecar JSON response")
    finally:
        loaded.module.adapter.urllib.request.urlopen = original_urlopen_for_strict_json

    loaded.module.adapter.urllib.request.urlopen = sidecar_response_urlopen(b'{"ok":false,"ok":true}')
    try:
        try:
            adapter._post_sidecar("/healthz", {})
        except RuntimeError as exc:
            if "/healthz returned malformed JSON" not in str(exc):
                raise RuntimeError(f"_post_sidecar reported duplicate-key JSON with unexpected error: {exc}") from exc
        else:
            raise RuntimeError("_post_sidecar accepted duplicate-key sidecar JSON response")
    finally:
        loaded.module.adapter.urllib.request.urlopen = original_urlopen_for_strict_json

    loaded.module.adapter.urllib.request.urlopen = sidecar_response_urlopen(b"[]")
    try:
        try:
            adapter._post_sidecar("/healthz", {})
        except RuntimeError as exc:
            if "/healthz returned malformed response: []" not in str(exc):
                raise RuntimeError(f"_post_sidecar reported non-object JSON with unexpected error: {exc}") from exc
        else:
            raise RuntimeError("_post_sidecar accepted non-object sidecar JSON")
    finally:
        loaded.module.adapter.urllib.request.urlopen = original_urlopen_for_strict_json

    def failing_sidecar_urlopen(_req, timeout=0):
        raise loaded.module.adapter.urllib.error.URLError("connection refused")

    loaded.module.adapter.urllib.request.urlopen = failing_sidecar_urlopen
    try:
        try:
            adapter._post_sidecar("/healthz", {})
        except RuntimeError as exc:
            if "/healthz failed: connection refused" not in str(exc):
                raise RuntimeError(f"_post_sidecar reported sidecar transport failure with unexpected error: {exc}") from exc
        else:
            raise RuntimeError("_post_sidecar accepted sidecar transport failure")
    finally:
        loaded.module.adapter.urllib.request.urlopen = original_urlopen_for_strict_json

    def timeout_sidecar_urlopen(_req, timeout=0):
        raise TimeoutError("timed out")

    loaded.module.adapter.urllib.request.urlopen = timeout_sidecar_urlopen
    try:
        try:
            adapter._post_sidecar("/healthz", {})
        except RuntimeError as exc:
            if "/healthz timed out" not in str(exc):
                raise RuntimeError(f"_post_sidecar reported sidecar timeout with unexpected error: {exc}") from exc
        else:
            raise RuntimeError("_post_sidecar accepted sidecar timeout")
    finally:
        loaded.module.adapter.urllib.request.urlopen = original_urlopen_for_strict_json

    posted: list[tuple[str, dict]] = []
    terminal_post_failures: set[tuple[str, str]] = set()

    def fake_post_sidecar(path, payload):
        posted.append((path, payload))
        if (path, str(payload.get("taskId") or "")) in terminal_post_failures:
            raise RuntimeError(f"{path} failed (500): terminal delivery failed")
        if path == "/chunk" and payload.get("taskId") == "task-missing":
            raise RuntimeError("/chunk failed (500): no active task: task-missing")
        if path == "/chunk" and payload.get("taskId") == "task-media-upload-then-missing":
            raise RuntimeError("/chunk failed (500): no active task: task-media-upload-then-missing")
        if path == "/task-sdk" and payload.get("taskId") == "task-media-missing":
            raise RuntimeError("/task-sdk failed (500): no active task: task-media-missing")
        if path == "/agent-sdk" and payload.get("method") == "uploadFile":
            args = payload.get("args") or []
            if str(args[2]) == "missing-url.txt":
                return {"ok": True, "result": {"fileName": "missing-url.txt", "fileType": "text/plain", "fileSize": 7}}
            if str(args[2]) == "missing-file-name.txt":
                return {"ok": True, "result": {"url": "https://files.example/missing-file-name.txt", "fileType": "text/plain", "fileSize": 7}}
            if str(args[2]) == "missing-file-type.txt":
                return {"ok": True, "result": {"url": "https://files.example/missing-file-type.txt", "fileName": "missing-file-type.txt", "fileSize": 7}}
            if str(args[2]) == "missing-file-size.txt":
                return {"ok": True, "result": {"url": "https://files.example/missing-file-size.txt", "fileName": "missing-file-size.txt", "fileType": "text/plain"}}
            if str(args[2]) == "nonfinite-file-size.txt":
                return {
                    "ok": True,
                    "result": {
                        "url": "https://files.example/nonfinite-file-size.txt",
                        "fileName": "nonfinite-file-size.txt",
                        "fileType": "text/plain",
                        "fileSize": float("nan"),
                    },
                }
            return {
                "ok": True,
                "result": {
                    "url": "https://files.example/" + str(args[2]),
                    "fileName": str(args[2]),
                    "fileType": str(args[3]),
                    "fileSize": 7,
                }
            }
        if path == "/task-sdk" and payload.get("method") == "uploadFile":
            args = payload.get("args") or []
            if str(args[1]) == "missing-url.txt":
                return {"ok": True, "result": {"fileName": "missing-url.txt", "fileType": "text/plain", "fileSize": 7}}
            if str(args[1]) == "missing-file-name.txt":
                return {"ok": True, "result": {"url": "https://files.example/missing-file-name.txt", "fileType": "text/plain", "fileSize": 7}}
            if str(args[1]) == "missing-file-type.txt":
                return {"ok": True, "result": {"url": "https://files.example/missing-file-type.txt", "fileName": "missing-file-type.txt", "fileSize": 7}}
            if str(args[1]) == "missing-file-size.txt":
                return {"ok": True, "result": {"url": "https://files.example/missing-file-size.txt", "fileName": "missing-file-size.txt", "fileType": "text/plain"}}
            if str(args[1]) == "nonfinite-file-size.txt":
                return {
                    "ok": True,
                    "result": {
                        "url": "https://files.example/nonfinite-file-size.txt",
                        "fileName": "nonfinite-file-size.txt",
                        "fileType": "text/plain",
                        "fileSize": float("nan"),
                    },
                }
            return {
                "ok": True,
                "result": {
                    "url": "https://files.example/" + str(args[1]),
                    "fileName": str(args[1]),
                    "fileType": str(args[2]),
                    "fileSize": 7,
                }
            }
        if path == "/agent-sdk" and payload.get("method") == "sendTaskUpdate":
            args = payload.get("args") or []
            data = args[1] if len(args) > 1 and isinstance(args[1], dict) else {}
            if data.get("task") == "task update failure":
                raise RuntimeError("/agent-sdk sendTaskUpdate failed (500): task update unavailable")
        if path == "/agent-sdk" and payload.get("method") == "sendTelemetry":
            args = payload.get("args") or []
            data = args[1] if len(args) > 1 and isinstance(args[1], dict) else {}
            if data.get("taskId") == "task-telemetry-fail":
                raise RuntimeError("/agent-sdk sendTelemetry failed (500): telemetry unavailable")
        return {"ok": True, "result": None}

    adapter._post_sidecar = fake_post_sidecar
    proactive = asyncio.run(adapter.send("conv-1", "hello proactive"))
    if not proactive.success:
        raise RuntimeError(f"proactive send failed: {proactive.error}")
    if posted[-1] != ("/agent-sdk", {"method": "sendMessage", "args": ["conv-1", "hello proactive"]}):
        raise RuntimeError(f"proactive send did not use SDK sendMessage: {posted[-1]}")
    asyncio.run(
        adapter.call_agent_sdk(
            "sendTelemetry",
            "json-safe",
            {
                "bytes": b"abc",
                "bytearray": bytearray(b"def"),
                "memoryview": memoryview(b"ghi"),
                "tuple": (b"jkl", {"nested": b"mno"}),
            },
        )
    )
    if posted[-1] != (
        "/agent-sdk",
        {
            "method": "sendTelemetry",
            "args": [
                "json-safe",
                {
                    "bytes": {"base64": "YWJj"},
                    "bytearray": {"base64": "ZGVm"},
                    "memoryview": {"base64": "Z2hp"},
                    "tuple": [{"base64": "amts"}, {"nested": {"base64": "bW5v"}}],
                },
            ],
        },
    ):
        raise RuntimeError(f"agent SDK args were not recursively JSON-safe encoded: {posted[-1]}")
    asyncio.run(adapter.call_task_sdk("task-json-safe", "uploadFile", memoryview(b"task"), "task.txt", "text/plain"))
    if posted[-1] != (
        "/task-sdk",
        {
            "taskId": "task-json-safe",
            "method": "uploadFile",
            "args": [{"base64": "dGFzaw=="}, "task.txt", "text/plain"],
        },
    ):
        raise RuntimeError(f"task SDK args were not recursively JSON-safe encoded: {posted[-1]}")
    asyncio.run(adapter.call_task_sdk("  task-json-safe  ", "fetchHistory"))
    if posted[-1] != (
        "/task-sdk",
        {"taskId": "task-json-safe", "method": "fetchHistory", "args": []},
    ):
        raise RuntimeError(f"direct task SDK call did not trim explicit task id: {posted[-1]}")
    original_fake_post_sidecar = adapter._post_sidecar
    adapter._post_sidecar = lambda path, payload: {"ok": False, "error": f"{path} rejected by fake sidecar"}
    try:
        try:
            asyncio.run(adapter.call_agent_sdk("getAgentId"))
        except RuntimeError as exc:
            if "/agent-sdk rejected by fake sidecar" not in str(exc):
                raise RuntimeError(f"agent SDK ok=false response raised unexpected error: {exc}") from exc
        else:
            raise RuntimeError("agent SDK ok=false response was treated as success")
        try:
            asyncio.run(adapter.call_task_sdk("task-json-safe", "fetchHistory"))
        except RuntimeError as exc:
            if "/task-sdk rejected by fake sidecar" not in str(exc):
                raise RuntimeError(f"task SDK ok=false response raised unexpected error: {exc}") from exc
        else:
            raise RuntimeError("task SDK ok=false response was treated as success")
    finally:
        adapter._post_sidecar = original_fake_post_sidecar

    adapter._post_sidecar = lambda path, payload: {"ok": True}
    try:
        try:
            asyncio.run(adapter.call_agent_sdk("getAgentId"))
        except RuntimeError as exc:
            if "/agent-sdk returned malformed success response" not in str(exc):
                raise RuntimeError(f"agent SDK missing-result response raised unexpected error: {exc}") from exc
        else:
            raise RuntimeError("agent SDK missing-result response was treated as success")
        try:
            asyncio.run(adapter.call_task_sdk("task-json-safe", "fetchHistory"))
        except RuntimeError as exc:
            if "/task-sdk returned malformed success response" not in str(exc):
                raise RuntimeError(f"task SDK missing-result response raised unexpected error: {exc}") from exc
        else:
            raise RuntimeError("task SDK missing-result response was treated as success")
    finally:
        adapter._post_sidecar = original_fake_post_sidecar

    void_method_args = {
        "sendMessage": ("conv-void", "hello void"),
        "sendTelemetry": ("void.event", {"ok": True}),
        "sendHud": ({"status": "ok"},),
        "sendTaskUpdate": ("Hermes", {"status": "completed"}),
        "reportToolCall": (
            {
                "sessionId": "session-void",
                "turnId": "turn-void",
                "seqOrder": 1,
                "toolName": "tool",
                "input": {},
                "success": True,
            },
        ),
        "deleteNote": ("conv-void", "note-void"),
        "archiveBoard": ("board-void",),
        "deleteColumn": ("column-void",),
        "reorderColumns": ("board-void", ["column-1", "column-2"]),
        "linkCardNote": ("card-void", "note-void"),
        "unlinkCardNote": ("card-void", "note-void"),
        "deleteLabel": ("label-void",),
        "addCardLabel": ("card-void", "label-void"),
        "removeCardLabel": ("card-void", "label-void"),
    }
    if set(void_method_args) != loaded.module.adapter.VOID_AGENT_METHODS:
        raise RuntimeError(
            "agent SDK void response regression args do not match VOID_AGENT_METHODS: "
            f"missing={sorted(loaded.module.adapter.VOID_AGENT_METHODS - set(void_method_args))} "
            f"extra={sorted(set(void_method_args) - loaded.module.adapter.VOID_AGENT_METHODS)}"
        )
    for void_method, method_args in void_method_args.items():
        adapter._post_sidecar = lambda path, payload, void_method=void_method: {
            "ok": True,
            "result": {"method": void_method, "unexpected": True},
        }
        try:
            try:
                asyncio.run(adapter.call_agent_sdk(void_method, *method_args))
            except RuntimeError as exc:
                if f"/agent-sdk {void_method} returned non-null void result" not in str(exc):
                    raise RuntimeError(f"agent SDK void response raised unexpected error: {exc}") from exc
            else:
                raise RuntimeError(f"agent SDK {void_method} non-null void result was treated as success")
        finally:
            adapter._post_sidecar = original_fake_post_sidecar

    adapter._post_sidecar = lambda path, payload: {"ok": "yes", "result": "agent-1"}
    try:
        try:
            asyncio.run(adapter.call_agent_sdk("getAgentId"))
        except RuntimeError as exc:
            if "/agent-sdk returned malformed response" not in str(exc):
                raise RuntimeError(f"agent SDK malformed-ok response raised unexpected error: {exc}") from exc
        else:
            raise RuntimeError("agent SDK malformed-ok response was treated as success")
        try:
            asyncio.run(adapter.call_task_sdk("task-json-safe", "fetchHistory"))
        except RuntimeError as exc:
            if "/task-sdk returned malformed response" not in str(exc):
                raise RuntimeError(f"task SDK malformed-ok response raised unexpected error: {exc}") from exc
        else:
            raise RuntimeError("task SDK malformed-ok response was treated as success")
    finally:
        adapter._post_sidecar = original_fake_post_sidecar

    adapter._task_by_conversation["conv-1"] = "task-1"
    streamed = asyncio.run(
        adapter.send(
            "conv-1",
            "hello active",
            metadata={
                "mentions": ["user-1", 42, ""],
                "arinova_mentions": [{"agentId": "agent-1"}, "user-1"],
                "complete_mentions": [{"userId": "user-2"}],
                "arinova": {
                    "mentions": [{"agent_id": "agent-3"}],
                    "complete_mentions": [{"id": "agent-2"}],
                },
            },
        )
    )
    if not streamed.success:
        raise RuntimeError(f"active task stream failed: {streamed.error}")
    if posted[-1] != ("/chunk", {"taskId": "task-1", "content": "hello active"}):
        raise RuntimeError(f"active task send did not stream chunk: {posted[-1]}")
    if adapter._mentions_by_task.get("task-1") != [
        "user-1",
        "42",
        "agent-1",
        "user-2",
        "agent-3",
        "agent-2",
    ]:
        raise RuntimeError(f"active task mentions were not collected from metadata: {adapter._mentions_by_task}")

    adapter._task_by_conversation["conv-missing"] = "task-missing"
    missing_stream = asyncio.run(adapter.send("conv-missing", "late chunk"))
    if missing_stream.success or "no active task" not in (missing_stream.error or ""):
        raise RuntimeError(f"missing active task stream did not fail explicitly: {missing_stream}")
    if (
        adapter._task_by_conversation.get("conv-missing") == "task-missing"
        or adapter._conversation_by_task.get("task-missing") == "conv-missing"
        or "task-missing" in adapter._buffer_by_task
        or "task-missing" in adapter._mentions_by_task
    ):
        raise RuntimeError(
            "missing active task stream left stale state: "
            f"tasks={adapter._task_by_conversation} conversations={adapter._conversation_by_task}"
        )

    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as handle:
        handle.write("example")
        media_path = Path(handle.name)
    try:
        media_sent = asyncio.run(
            adapter.send_document("conv-media-out", str(media_path), caption="see attachment", file_name="example.txt")
        )
    finally:
        media_path.unlink(missing_ok=True)
    if not media_sent.success:
        raise RuntimeError(f"proactive media send failed: {media_sent.error}")
    upload_call, message_call = posted[-2], posted[-1]
    if upload_call[0] != "/agent-sdk" or upload_call[1].get("method") != "uploadFile":
        raise RuntimeError(f"media send did not upload through SDK: {upload_call}")
    if upload_call[1]["args"][:1] != ["conv-media-out"] or upload_call[1]["args"][2:] != [
        "example.txt",
        "text/plain",
    ]:
        raise RuntimeError(f"media upload args mismatch: {upload_call}")
    if upload_call[1]["args"][1] != {"base64": "ZXhhbXBsZQ=="}:
        raise RuntimeError(f"media upload bytes were not base64 encoded for sidecar control API: {upload_call}")
    if message_call != (
        "/agent-sdk",
        {
            "method": "sendMessage",
            "args": [
                "conv-media-out",
                "see attachment\n\nAttachment: example.txt: https://files.example/example.txt",
            ],
        },
    ):
        raise RuntimeError(f"media send did not announce uploaded URL: {message_call}")

    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as handle:
        handle.write("example")
        media_path = Path(handle.name)
    try:
        missing_url_media = asyncio.run(
            adapter.send_document("conv-media-no-url", str(media_path), caption="bad upload", file_name="missing-url.txt")
        )
    finally:
        media_path.unlink(missing_ok=True)
    if missing_url_media.success or "uploadFile response missing url" not in (missing_url_media.error or ""):
        raise RuntimeError(f"proactive media send accepted uploadFile response without url: {missing_url_media}")
    if posted[-1][0] != "/agent-sdk" or posted[-1][1].get("method") != "uploadFile":
        raise RuntimeError(f"malformed proactive media upload was not the final sidecar call: {posted[-1]}")

    def assert_media_upload_metadata_error(
        chat_id: str,
        file_name: str,
        expected_error: str,
        failure_label: str,
        *,
        task_id: str | None = None,
    ) -> None:
        if task_id:
            adapter._task_by_conversation[chat_id] = task_id
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as handle:
            handle.write("example")
            bad_media_path = Path(handle.name)
        try:
            result = asyncio.run(
                adapter.send_document(chat_id, str(bad_media_path), caption="bad upload", file_name=file_name)
            )
        finally:
            bad_media_path.unlink(missing_ok=True)
            if task_id:
                adapter._task_by_conversation.pop(chat_id, None)
        if result.success or expected_error not in (result.error or ""):
            raise RuntimeError(f"{failure_label}: {result}")
        expected_path = "/task-sdk" if task_id else "/agent-sdk"
        if posted[-1][0] != expected_path or posted[-1][1].get("method") != "uploadFile":
            raise RuntimeError(f"{failure_label} was not the final sidecar upload call: {posted[-1]}")
        if task_id and posted[-1][1].get("taskId") != task_id:
            raise RuntimeError(f"{failure_label} used wrong task id: {posted[-1]}")

    assert_media_upload_metadata_error(
        "conv-media-missing-file-name",
        "missing-file-name.txt",
        "uploadFile response missing fileName",
        "proactive media send accepted uploadFile response without fileName",
    )
    assert_media_upload_metadata_error(
        "conv-media-missing-file-type",
        "missing-file-type.txt",
        "uploadFile response missing fileType",
        "proactive media send accepted uploadFile response without fileType",
    )
    assert_media_upload_metadata_error(
        "conv-media-missing-file-size",
        "missing-file-size.txt",
        "uploadFile response missing fileSize",
        "proactive media send accepted uploadFile response without fileSize",
    )
    assert_media_upload_metadata_error(
        "conv-media-nonfinite-file-size",
        "nonfinite-file-size.txt",
        "uploadFile response fileSize must be finite",
        "proactive media send accepted uploadFile response with non-finite fileSize",
    )

    adapter._task_by_conversation["conv-media-active"] = "task-media-active"
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as handle:
        handle.write("example")
        media_path = Path(handle.name)
    try:
        active_media_sent = asyncio.run(
            adapter.send_document("conv-media-active", str(media_path), caption="active attachment")
        )
    finally:
        media_path.unlink(missing_ok=True)
    if not active_media_sent.success:
        raise RuntimeError(f"active task media send failed: {active_media_sent.error}")
    active_upload_call = posted[-2]
    if active_upload_call[0] != "/task-sdk" or active_upload_call[1].get("taskId") != "task-media-active":
        raise RuntimeError(f"active media upload did not use task-scoped SDK helper: {active_upload_call}")
    if active_upload_call[1].get("method") != "uploadFile" or active_upload_call[1].get("args", [])[1:] != [
        media_path.name,
        "text/plain",
    ]:
        raise RuntimeError(f"active media task upload args mismatch: {active_upload_call}")
    if active_upload_call[1].get("args", [])[0] != {"base64": "ZXhhbXBsZQ=="}:
        raise RuntimeError(f"active media task bytes were not base64 encoded for sidecar control API: {active_upload_call}")
    if posted[-1] != (
        "/chunk",
        {
            "taskId": "task-media-active",
            "content": "active attachment\n\nAttachment: " + media_path.name + f": https://files.example/{media_path.name}",
        },
    ):
        raise RuntimeError(f"active media send did not stream uploaded URL: {posted[-1]}")

    adapter._conversation_by_task["task-media-upload-then-missing"] = "conv-media-upload-then-missing"
    adapter._task_by_conversation["conv-media-upload-then-missing"] = "task-media-upload-then-missing"
    adapter._buffer_by_task["task-media-upload-then-missing"] = []
    adapter._mentions_by_task["task-media-upload-then-missing"] = ["agent-upload-mention"]
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as handle:
        handle.write("example")
        media_path = Path(handle.name)
    try:
        upload_then_missing_media = asyncio.run(
            adapter.send_document("conv-media-upload-then-missing", str(media_path), caption="uploaded then missing")
        )
    finally:
        media_path.unlink(missing_ok=True)
    if upload_then_missing_media.success or "no active task" not in (upload_then_missing_media.error or ""):
        raise RuntimeError(f"media upload followed by missing active task did not fail explicitly: {upload_then_missing_media}")
    if posted[-2][0] != "/task-sdk" or posted[-2][1].get("taskId") != "task-media-upload-then-missing":
        raise RuntimeError(f"media upload-then-missing did not upload before failed chunk: {posted[-2:]}")
    if posted[-1][0] != "/chunk" or posted[-1][1].get("taskId") != "task-media-upload-then-missing":
        raise RuntimeError(f"media upload-then-missing did not fail during chunk announcement: {posted[-2:]}")
    if (
        adapter._task_by_conversation.get("conv-media-upload-then-missing") == "task-media-upload-then-missing"
        or adapter._conversation_by_task.get("task-media-upload-then-missing") == "conv-media-upload-then-missing"
        or "task-media-upload-then-missing" in adapter._buffer_by_task
        or "task-media-upload-then-missing" in adapter._mentions_by_task
    ):
        raise RuntimeError(
            "media upload followed by missing active task left stale state: "
            f"tasks={adapter._task_by_conversation} conversations={adapter._conversation_by_task}"
        )

    adapter._task_by_conversation["conv-media-active-no-url"] = "task-media-active-no-url"
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as handle:
        handle.write("example")
        media_path = Path(handle.name)
    try:
        active_missing_url_media = asyncio.run(
            adapter.send_document(
                "conv-media-active-no-url",
                str(media_path),
                caption="bad active upload",
                file_name="missing-url.txt",
            )
        )
    finally:
        media_path.unlink(missing_ok=True)
    if active_missing_url_media.success or "uploadFile response missing url" not in (active_missing_url_media.error or ""):
        raise RuntimeError(f"active media send accepted uploadFile response without url: {active_missing_url_media}")
    if posted[-1][0] != "/task-sdk" or posted[-1][1].get("taskId") != "task-media-active-no-url":
        raise RuntimeError(f"malformed active media upload was not the final sidecar call: {posted[-1]}")

    assert_media_upload_metadata_error(
        "conv-media-active-missing-file-name",
        "missing-file-name.txt",
        "uploadFile response missing fileName",
        "active media send accepted uploadFile response without fileName",
        task_id="task-media-active-missing-file-name",
    )
    assert_media_upload_metadata_error(
        "conv-media-active-missing-file-type",
        "missing-file-type.txt",
        "uploadFile response missing fileType",
        "active media send accepted uploadFile response without fileType",
        task_id="task-media-active-missing-file-type",
    )
    assert_media_upload_metadata_error(
        "conv-media-active-missing-file-size",
        "missing-file-size.txt",
        "uploadFile response missing fileSize",
        "active media send accepted uploadFile response without fileSize",
        task_id="task-media-active-missing-file-size",
    )
    assert_media_upload_metadata_error(
        "conv-media-active-nonfinite-file-size",
        "nonfinite-file-size.txt",
        "uploadFile response fileSize must be finite",
        "active media send accepted uploadFile response with non-finite fileSize",
        task_id="task-media-active-nonfinite-file-size",
    )

    adapter._conversation_by_task["task-media-missing"] = "conv-media-missing"
    adapter._task_by_conversation["conv-media-missing"] = "task-media-missing"
    adapter._buffer_by_task["task-media-missing"] = []
    adapter._mentions_by_task["task-media-missing"] = []
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as handle:
        handle.write("example")
        media_path = Path(handle.name)
    try:
        missing_active_media = asyncio.run(
            adapter.send_document("conv-media-missing", str(media_path), caption="missing attachment")
        )
    finally:
        media_path.unlink(missing_ok=True)
    if missing_active_media.success or "no active task" not in (missing_active_media.error or ""):
        raise RuntimeError(f"missing active media task did not fail explicitly: {missing_active_media}")
    if (
        adapter._task_by_conversation.get("conv-media-missing") == "task-media-missing"
        or adapter._conversation_by_task.get("task-media-missing") == "conv-media-missing"
        or "task-media-missing" in adapter._buffer_by_task
        or "task-media-missing" in adapter._mentions_by_task
    ):
        raise RuntimeError(
            "missing active media task left stale state: "
            f"tasks={adapter._task_by_conversation} conversations={adapter._conversation_by_task}"
        )

    captured_events = []

    async def fake_handle_message(event):
        captured_events.append(event)

    adapter.handle_message = fake_handle_message
    class AttachmentAuthorization:
        def __init__(self):
            self.allowed = {"user-1"}
            self.checked = []

        def _is_user_authorized(self, source):
            self.checked.append(source.user_id)
            return source.user_id in self.allowed

        async def handle(self, _event):
            return None

    attachment_authorization = AttachmentAuthorization()
    adapter._message_handler = attachment_authorization.handle
    original_download_attachment_media = adapter._download_attachment_media
    attachment_downloads: list[dict] = []

    def fake_download_attachment_media(attachment, *, max_bytes, timeout_seconds):
        attachment_downloads.append(dict(attachment))
        return (
            "/tmp/arinova-attachment.txt",
            "text/plain",
            "[document 'a.txt' saved at: /tmp/arinova-attachment.txt]",
            3,
        )

    adapter._download_attachment_media = fake_download_attachment_media
    asyncio.run(
        adapter._handle_arinova_task(
            {
                "conversationId": "conv-missing-id",
                "content": "malformed task",
                "attachments": [
                    {
                        "id": "att-missing-task",
                        "fileName": "missing-task.txt",
                        "fileType": "text/plain",
                        "fileSize": 3,
                        "url": "https://files.example/missing-task.txt",
                    }
                ],
            }
        )
    )
    if attachment_downloads or captured_events:
        raise RuntimeError(
            "task without taskId should not download attachments or dispatch events: "
            f"downloads={attachment_downloads} events={captured_events}"
        )
    asyncio.run(
        adapter._handle_arinova_task(
            {
                "taskId": "task-media-unauthorized",
                "conversationId": "conv-media-unauthorized",
                "conversationType": "direct",
                "content": "unauthorized attachment",
                "senderUserId": "intruder",
                "attachments": [
                    {
                        "id": "att-unauthorized",
                        "fileName": "unauthorized.txt",
                        "fileType": "text/plain",
                        "fileSize": 3,
                        "url": "https://files.example/unauthorized.txt",
                    }
                ],
            }
        )
    )
    if attachment_downloads:
        raise RuntimeError(
            f"unauthorized sender triggered attachment network work: {attachment_downloads}"
        )
    if captured_events[-1].media_urls or captured_events[-1].media_types:
        raise RuntimeError("unauthorized sender received downloaded attachment media")
    asyncio.run(
        adapter._handle_arinova_task(
            {
                "taskId": "task-media",
                "userMessageId": "msg-media",
                "conversationId": "conv-media",
                "conversationName": "Project Memo",
                "conversationType": "direct",
                "content": "see file",
                "senderUserId": "user-1",
                "senderUsername": "User",
                "replyTo": {
                    "id": "reply-msg-1",
                    "role": "assistant",
                    "content": "previous answer",
                    "senderAgentId": "agent-string",
                    "senderAgentName": "Helper",
                },
                "history": [
                    {
                        "role": "user",
                        "content": "earlier question",
                        "senderUsername": "User",
                        "createdAt": "2026-06-29T01:00:00Z",
                    }
                ],
                "members": [{"agentId": "agent-2", "agentName": "Researcher"}],
                "availableSkills": [
                    {
                        "slug": "memo",
                        "name": "Memo",
                        "slashCommand": "/memo",
                        "description": "Use memos",
                    }
                ],
                "attachments": [
                    {
                        "id": "att-1",
                        "fileName": "a.txt",
                        "fileType": "text/plain",
                        "fileSize": 3,
                        "url": "https://files.example/a.txt",
                    }
                ],
            }
        )
    )
    media_event = captured_events[-1]
    if media_event.media_urls != ["/tmp/arinova-attachment.txt"]:
        raise RuntimeError(f"attachment media path was not attached: {media_event.media_urls}")
    if media_event.media_types != ["text/plain"]:
        raise RuntimeError(f"attachment media type was not attached: {media_event.media_types}")
    if media_event.source.chat_type != "dm":
        raise RuntimeError(f"direct Arinova conversation was not normalized to dm: {media_event.source.chat_type}")
    if media_event.source.chat_name != "Project Memo":
        raise RuntimeError(f"Arinova conversation name was not preserved: {media_event.source.chat_name}")
    if media_event.source.thread_id is not None:
        raise RuntimeError(f"default Arinova task unexpectedly split conversation session: {media_event.source.thread_id}")
    cached_chat_info = asyncio.run(adapter.get_chat_info("conv-media"))
    if cached_chat_info != {"chat_id": "conv-media", "name": "Project Memo", "type": "dm"}:
        raise RuntimeError(f"cached Arinova chat info mismatch: {cached_chat_info}")
    fallback_chat_info = asyncio.run(adapter.get_chat_info("conv-unknown"))
    if fallback_chat_info != {"chat_id": "conv-unknown", "name": "Arinova conv-unknown", "type": "dm"}:
        raise RuntimeError(f"fallback Arinova chat info mismatch: {fallback_chat_info}")
    if ":arinova:dm:conv-media" not in adapter._session_by_task.get("task-media", ""):
        raise RuntimeError(f"direct Arinova task used unexpected session key: {adapter._session_by_task}")
    if adapter._message_by_task.get("task-media") != "msg-media":
        raise RuntimeError(f"Arinova task did not preserve userMessageId for tool reports: {adapter._message_by_task}")
    if (
        media_event.reply_to_message_id != "reply-msg-1"
        or media_event.reply_to_text != "previous answer"
        or media_event.reply_to_author_id != "agent-string"
        or media_event.reply_to_author_name != "Helper"
        or media_event.reply_to_is_own_message is not True
    ):
        raise RuntimeError(
            "structured reply context missing: "
            f"id={media_event.reply_to_message_id!r} text={media_event.reply_to_text!r} "
            f"author_id={media_event.reply_to_author_id!r} author={media_event.reply_to_author_name!r} "
            f"own={media_event.reply_to_is_own_message!r}"
        )
    if "Downloaded attachments:" not in media_event.text:
        raise RuntimeError(f"attachment cache note missing from event text: {media_event.text}")
    for expected in [
        "Replying to Helper:",
        "Recent Arinova history:",
        "Arinova conversation agents:",
        "Researcher (agent-2)",
        "Available Arinova skills (use arinova_fetch_skill_prompt with slug for full prompt):",
        "Memo | slug=memo | slash=/memo | Use memos",
        "Arinova task metadata:",
        "taskId: task-media",
        "userMessageId: msg-media",
        "conversationId: conv-media",
        "conversationName: Project Memo",
        "conversationType: direct",
        "senderUserId: user-1",
        "senderUsername: User",
    ]:
        if expected not in media_event.text:
            raise RuntimeError(f"task context {expected!r} missing from event text: {media_event.text}")
    for expected in [
        "role=assistant",
        "User @ 2026-06-29T01:00:00Z (role=user): earlier question",
        "a.txt (text/plain, id=att-1, 3 bytes): https://files.example/a.txt",
    ]:
        if expected not in media_event.text:
            raise RuntimeError(f"nested task context {expected!r} missing from event text: {media_event.text}")

    downloads_before_excess = len(attachment_downloads)
    asyncio.run(
        adapter._handle_arinova_task(
            {
                "taskId": "task-media-excess-count",
                "conversationId": "conv-media-excess-count",
                "conversationType": "direct",
                "content": "too many files",
                "senderUserId": "user-1",
                "attachments": [
                    {
                        "id": f"att-excess-{index}",
                        "fileName": f"excess-{index}.txt",
                        "fileType": "text/plain",
                        "fileSize": 3,
                        "url": f"https://files.example/excess-{index}.txt",
                    }
                    for index in range(adapter.attachment_max_count + 1)
                ],
            }
        )
    )
    if len(attachment_downloads) != downloads_before_excess:
        raise RuntimeError("excessive attachment count triggered network work")
    if captured_events[-1].media_urls or captured_events[-1].media_types:
        raise RuntimeError("excessive attachment count produced downloaded media")

    asyncio.run(
        adapter._handle_arinova_task(
            {
                "taskId": "task-explicit-empty-skills",
                "conversationId": "conv-empty-skills",
                "conversationType": "direct",
                "content": "no task-scoped skills",
                "availableSkills": [],
            }
        )
    )
    empty_skills_event = captured_events[-1]
    if "Available Arinova skills" in empty_skills_event.text:
        raise RuntimeError(f"explicit empty task skills invented a skills section: {empty_skills_event.text}")

    asyncio.run(
        adapter._handle_arinova_task(
            {
                "taskId": "task-empty-conversation-name",
                "conversationId": "conv-empty-conversation-name",
                "conversationName": "",
                "conversationType": "direct",
                "content": "empty conversation name",
            }
        )
    )
    empty_name_event = captured_events[-1]
    if empty_name_event.source.chat_name != "":
        raise RuntimeError(
            f"explicit empty conversationName was not preserved in Hermes source: {empty_name_event.source.chat_name!r}"
        )
    if "conversationName: " not in empty_name_event.text:
        raise RuntimeError(f"explicit empty conversationName was not preserved in task text: {empty_name_event.text}")
    empty_name_chat_info = asyncio.run(adapter.get_chat_info("conv-empty-conversation-name"))
    if empty_name_chat_info != {"chat_id": "conv-empty-conversation-name", "name": "", "type": "dm"}:
        raise RuntimeError(f"explicit empty conversationName was not preserved in chat cache: {empty_name_chat_info}")

    asyncio.run(
        adapter._handle_arinova_task(
            {
                "taskId": "task-cron",
                "taskKind": "cron_wakeup",
                "content": "agent-level wakeup",
            }
        )
    )
    cron_event = captured_events[-1]
    if cron_event.source.chat_id != "task-cron":
        raise RuntimeError(f"no-conversation task did not use task id as Hermes chat fallback: {cron_event.source}")
    if cron_event.raw_message.get("conversationId") is not None:
        raise RuntimeError(f"no-conversation task unexpectedly gained conversationId: {cron_event.raw_message}")
    if ":arinova:dm:task-cron" not in adapter._session_by_task.get("task-cron", ""):
        raise RuntimeError(f"no-conversation task used unexpected session key: {adapter._session_by_task}")
    for expected in [
        "agent-level wakeup",
        "Arinova task kind: cron_wakeup",
        "Arinova task metadata:",
        "taskId: task-cron",
    ]:
        if expected not in cron_event.text:
            raise RuntimeError(f"no-conversation task context {expected!r} missing: {cron_event.text}")
    if "conversationId:" in cron_event.text or "conversationType:" in cron_event.text:
        raise RuntimeError(f"no-conversation task text invented conversation metadata: {cron_event.text}")
    cron_media_posts_before = len(posted)
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as handle:
        handle.write("cron upload")
        cron_media_path = Path(handle.name)
    try:
        cron_media = asyncio.run(adapter.send_document("task-cron", str(cron_media_path), caption="cron file"))
    finally:
        cron_media_path.unlink(missing_ok=True)
    if cron_media.success or "uploadFile is unavailable: this task (taskKind=cron_wakeup) is not bound to a conversation" not in (cron_media.error or ""):
        raise RuntimeError(f"no-conversation task media upload did not fail with SDK-compatible error: {cron_media}")
    if posted[cron_media_posts_before:]:
        raise RuntimeError(f"no-conversation task media upload called sidecar unexpectedly: {posted[cron_media_posts_before:]}")

    adapter.download_attachments = False
    asyncio.run(
        adapter._handle_arinova_task(
            {
                "taskId": "task-media-disabled",
                "conversationId": "conv-media-disabled",
                "conversationType": "direct",
                "content": "see disabled file",
                "senderUserId": "user-1",
                "attachments": [
                    {
                        "id": "att-disabled",
                        "fileName": "disabled.txt",
                        "fileType": "text/plain",
                        "fileSize": 3,
                        "url": "https://files.example/disabled.txt",
                    },
                    {
                        "id": "att-disabled-nonfinite",
                        "fileName": "disabled-nonfinite.txt",
                        "fileType": "text/plain",
                        "fileSize": float("nan"),
                        "url": "https://files.example/disabled-nonfinite.txt",
                    }
                ],
            }
        )
    )
    disabled_event = captured_events[-1]
    if disabled_event.media_urls or disabled_event.media_types:
        raise RuntimeError(
            f"disabled attachment downloads still attached media: "
            f"urls={disabled_event.media_urls} types={disabled_event.media_types}"
        )
    if "Attachments:" not in disabled_event.text or "Downloaded attachments:" in disabled_event.text:
        raise RuntimeError(f"disabled attachment download text was unexpected: {disabled_event.text}")
    if "disabled-nonfinite.txt (text/plain, id=att-disabled-nonfinite): https://files.example/disabled-nonfinite.txt" not in disabled_event.text:
        raise RuntimeError(f"non-finite attachment size was not normalized in task text: {disabled_event.text}")
    if "nan bytes" in disabled_event.text:
        raise RuntimeError(f"non-finite attachment size leaked into task text: {disabled_event.text}")
    adapter.download_attachments = True

    adapter._download_attachment_media = original_download_attachment_media
    # Use a file:// URL that points at a file that really EXISTS so this only
    # passes when the scheme itself is blocked by URL validation, not because
    # the target happens to be missing.
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as handle:
        handle.write("local secret that must never be readable via attachments")
        local_attachment_path = Path(handle.name)
    try:
        local_file_url = local_attachment_path.as_uri()
        try:
            adapter._download_attachment_bytes(local_file_url)
        except ValueError as exc:
            if "must be an absolute http(s) URL" not in str(exc):
                raise RuntimeError(f"file:// attachment URL failed with unexpected error: {exc}") from exc
        else:
            raise RuntimeError("file:// attachment URL pointing at an existing file was accepted")
        asyncio.run(
            adapter._handle_arinova_task(
                {
                    "taskId": "task-media-invalid-url",
                    "conversationId": "conv-media-invalid-url",
                    "conversationType": "direct",
                    "content": "see invalid file",
                    "senderUserId": "user-1",
                    "attachments": [
                        {
                            "id": "att-invalid",
                            "fileName": "invalid.txt",
                            "fileType": "text/plain",
                            "fileSize": 3,
                            "url": local_file_url,
                        }
                    ],
                }
            )
        )
    finally:
        local_attachment_path.unlink(missing_ok=True)
    invalid_event = captured_events[-1]
    if invalid_event.media_urls or invalid_event.media_types or invalid_event.message_type.name != "TEXT":
        raise RuntimeError(
            f"invalid attachment URL produced media event: "
            f"urls={invalid_event.media_urls} types={invalid_event.media_types} type={invalid_event.message_type}"
        )
    if "invalid.txt" not in invalid_event.text or "Downloaded attachments:" in invalid_event.text:
        raise RuntimeError(f"invalid attachment URL text was unexpected: {invalid_event.text}")

    async def failing_handle_message(_event):
        raise RuntimeError("dispatch boom")

    adapter.handle_message = failing_handle_message
    asyncio.run(
        adapter._handle_arinova_task(
            {
                "taskId": "task-dispatch-fail",
                "conversationId": "conv-dispatch-fail",
                "conversationType": "direct",
                "content": "dispatch should fail",
                "senderUserId": "user-1",
            }
        )
    )
    if posted[-1] != (
        "/error",
        {"taskId": "task-dispatch-fail", "error": "Hermes failed to accept the task: dispatch boom"},
    ):
        raise RuntimeError(f"dispatch failure did not report sidecar task error: {posted[-1]}")
    if (
        "task-dispatch-fail" in adapter._session_by_task
        or "task-dispatch-fail" in adapter._buffer_by_task
        or "task-dispatch-fail" in adapter._mentions_by_task
        or adapter._task_by_conversation.get("conv-dispatch-fail") == "task-dispatch-fail"
    ):
        raise RuntimeError(
            "dispatch failure left active task state: "
            f"sessions={adapter._session_by_task} conversations={adapter._task_by_conversation}"
        )
    adapter.handle_message = fake_handle_message


    original_attachment_urlopen = adapter._attachment_urlopen
    original_getaddrinfo = loaded.module.adapter.socket.getaddrinfo
    attachment_requests: list[tuple] = []

    def fake_public_getaddrinfo(host, port, **_kwargs):
        # A genuinely global address: the TEST-NET documentation ranges are
        # rejected by ipaddress.ip_address(...).is_global.
        return [(loaded.module.adapter.socket.AF_INET, loaded.module.adapter.socket.SOCK_STREAM, 6, "", ("93.184.216.34", port))]

    def fake_attachment_urlopen(req, *, timeout=0):
        attachment_requests.append((req, timeout))
        return LimitedAttachmentResponse()

    loaded.module.adapter.socket.getaddrinfo = fake_public_getaddrinfo
    adapter._attachment_urlopen = fake_attachment_urlopen
    data, content_type = adapter._download_attachment_bytes("https://files.example/ok.txt")
    if data != b"abcd" or content_type != "text/plain":
        raise RuntimeError(f"attachment download response normalization failed: data={data!r} type={content_type!r}")
    download_req, download_timeout = attachment_requests[-1]
    if download_timeout != 30 or download_req.full_url != "https://files.example/ok.txt":
        raise RuntimeError(
            f"attachment download used unexpected request target or timeout: "
            f"url={download_req.full_url} timeout={download_timeout}"
        )
    if download_req.headers.get("User-agent") != "Hermes-Arinova-Plugin/0.1":
        raise RuntimeError(f"attachment download missing plugin user agent: {download_req.headers}")
    old_attachment_max = adapter.attachment_max_bytes
    adapter.attachment_max_bytes = 3
    try:
        try:
            adapter._download_attachment_bytes("https://files.example/too-large.txt")
        except ValueError as exc:
            if "attachment exceeds 3 bytes" not in str(exc):
                raise RuntimeError(f"oversized attachment failed with unexpected error: {exc}") from exc
        else:
            raise RuntimeError("oversized attachment did not enforce byte cap")
    finally:
        adapter.attachment_max_bytes = old_attachment_max
        adapter._attachment_urlopen = original_attachment_urlopen
        loaded.module.adapter.socket.getaddrinfo = original_getaddrinfo

    for unsafe_url in (
        "http://127.0.0.1/private",
        "http://10.0.0.1/private",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]/private",
    ):
        try:
            adapter._download_attachment_bytes(unsafe_url)
        except ValueError as exc:
            if "non-public address" not in str(exc):
                raise RuntimeError(f"unsafe attachment URL failed unexpectedly: {unsafe_url}: {exc}") from exc
        else:
            raise RuntimeError(f"unsafe attachment URL was accepted: {unsafe_url}")

    redirect_handler = loaded.module.adapter._AttachmentRedirectHandler()
    try:
        redirect_handler.redirect_request(
            urllib.request.Request("https://files.example/start"),
            None,
            302,
            "Found",
            {},
            "http://127.0.0.1/private",
        )
    except ValueError as exc:
        if "non-public address" not in str(exc):
            raise RuntimeError(f"private redirect failed unexpectedly: {exc}") from exc
    else:
        raise RuntimeError("redirect to private address was accepted")

    for non_http_redirect in ("ftp://files.example/pub.txt", "file:///etc/hosts", "data:text/plain,hi"):
        try:
            redirect_handler.redirect_request(
                urllib.request.Request("https://files.example/start"),
                None,
                302,
                "Found",
                {},
                non_http_redirect,
            )
        except ValueError as exc:
            if "http(s)" not in str(exc):
                raise RuntimeError(f"non-http redirect failed unexpectedly: {non_http_redirect}: {exc}") from exc
        else:
            raise RuntimeError(f"redirect to non-http scheme was accepted: {non_http_redirect}")

    def fake_private_getaddrinfo(host, port, **_kwargs):
        return [(loaded.module.adapter.socket.AF_INET, loaded.module.adapter.socket.SOCK_STREAM, 6, "", ("10.9.8.7", port))]

    loaded.module.adapter.socket.getaddrinfo = fake_private_getaddrinfo
    try:
        redirect_handler.redirect_request(
            urllib.request.Request("https://files.example/start"),
            None,
            302,
            "Found",
            {},
            "https://internal.example/private",
        )
    except ValueError as exc:
        if "non-public address" not in str(exc):
            raise RuntimeError(f"private-hostname redirect failed unexpectedly: {exc}") from exc
    else:
        raise RuntimeError("redirect to hostname resolving to a private address was accepted")
    finally:
        loaded.module.adapter.socket.getaddrinfo = original_getaddrinfo

    loaded.module.adapter.socket.getaddrinfo = fake_public_getaddrinfo
    redirected_request = redirect_handler.redirect_request(
        urllib.request.Request("https://files.example/start"),
        None,
        302,
        "Found",
        {},
        "https://files.example/moved.txt",
    )
    if redirected_request is None or redirected_request.full_url != "https://files.example/moved.txt":
        raise RuntimeError(f"public https redirect was not followed: {redirected_request}")

    # Exercise the real pinned HTTPS handler wiring (not the monkey-patched
    # _attachment_urlopen): https_open must build the pinned connection through
    # an ssl.SSLContext only. Passing the removed check_hostname argument or
    # reading the removed HTTPSHandler._check_hostname attribute fails here.
    pinned_https_handler = loaded.module.adapter._PinnedHTTPSHandler()
    handler_do_open_calls = []

    def fake_handler_do_open(http_class, handler_req, **http_conn_kwargs):
        connection = http_class("files.example", timeout=7, **http_conn_kwargs)
        handler_do_open_calls.append((connection, handler_req, http_conn_kwargs))
        return LimitedAttachmentResponse()

    pinned_https_handler.do_open = fake_handler_do_open
    pinned_https_handler.https_open(urllib.request.Request("https://files.example/pinned.txt"))
    if len(handler_do_open_calls) != 1:
        raise RuntimeError(f"pinned HTTPS handler did not call do_open exactly once: {handler_do_open_calls}")
    pinned_connection, pinned_req, pinned_kwargs = handler_do_open_calls[-1]
    if not isinstance(pinned_connection, loaded.module.adapter._PinnedHTTPSConnection):
        raise RuntimeError(f"pinned HTTPS handler built unexpected connection type: {type(pinned_connection)}")
    if pinned_connection._pinned_ip != "93.184.216.34" or pinned_connection.host != "files.example":
        raise RuntimeError(
            f"pinned HTTPS connection target drifted: ip={pinned_connection._pinned_ip} host={pinned_connection.host}"
        )
    if pinned_req.full_url != "https://files.example/pinned.txt":
        raise RuntimeError(f"pinned HTTPS handler mutated request target: {pinned_req.full_url}")
    if set(pinned_kwargs) != {"context"}:
        raise RuntimeError(
            f"pinned HTTPS handler passed unsupported connection arguments: {sorted(pinned_kwargs)}"
        )
    pinned_context = pinned_kwargs["context"]
    if not isinstance(pinned_context, ssl.SSLContext):
        raise RuntimeError(f"pinned HTTPS handler did not pass an SSLContext: {pinned_context!r}")
    if pinned_context.check_hostname is not True or pinned_context.verify_mode != ssl.CERT_REQUIRED:
        raise RuntimeError(
            "pinned HTTPS handler SSLContext dropped hostname/certificate verification: "
            f"check_hostname={pinned_context.check_hostname} verify_mode={pinned_context.verify_mode}"
        )

    # The real attachment opener must not install file/ftp/data handlers, so
    # non-http(s) schemes die with "unknown url type" even when validation is
    # bypassed.
    for unsafe_scheme_url in ("file:///etc/hosts", "ftp://files.example/pub.txt", "data:text/plain,hi"):
        try:
            adapter._attachment_urlopen(urllib.request.Request(unsafe_scheme_url), timeout=5)
        except urllib.error.URLError as exc:
            if "unknown url type" not in str(exc):
                raise RuntimeError(f"unsafe scheme failed unexpectedly: {unsafe_scheme_url}: {exc}") from exc
        else:
            raise RuntimeError(f"attachment opener accepted unsafe scheme: {unsafe_scheme_url}")

    def assert_attachment_download_error(fake_urlopen_fn, expected_error: str, failure_label: str) -> None:
        adapter._attachment_urlopen = fake_urlopen_fn
        try:
            try:
                adapter._download_attachment_bytes("https://files.example/fail.txt")
            except RuntimeError as exc:
                if expected_error not in str(exc):
                    raise RuntimeError(f"{failure_label} failed with unexpected error: {exc}") from exc
            else:
                raise RuntimeError(failure_label)
        finally:
            adapter._attachment_urlopen = original_attachment_urlopen

    def fake_attachment_http_failure(req, *, timeout=0):
        raise urllib.error.HTTPError(
            req.full_url,
            404,
            "Not Found",
            hdrs=None,
            fp=FakeHttpResponse(b'{"error":"attachment missing"}'),
        )

    assert_attachment_download_error(
        fake_attachment_http_failure,
        'attachment download failed (404): {"error":"attachment missing"}',
        "attachment download accepted HTTP failure",
    )

    def fake_attachment_transport_failure(req, *, timeout=0):
        raise urllib.error.URLError("connection refused")

    assert_attachment_download_error(
        fake_attachment_transport_failure,
        "attachment download failed: connection refused",
        "attachment download accepted transport failure",
    )

    def fake_attachment_timeout(req, *, timeout=0):
        raise TimeoutError()

    assert_attachment_download_error(
        fake_attachment_timeout,
        "attachment download timed out",
        "attachment download accepted timeout",
    )
    loaded.module.adapter.socket.getaddrinfo = original_getaddrinfo

    asyncio.run(adapter.on_processing_start(media_event))
    if posted[-1][0] != "/agent-sdk" or posted[-1][1] != {
        "method": "sendTaskUpdate",
        "args": ["Arinova Chat", {"status": "started", "task": "see file"}],
    }:
        raise RuntimeError(f"processing start did not send task update: {posted[-1]}")
    mention_stream = asyncio.run(
        adapter.send(
            "conv-media",
            "completion mentions",
            metadata={"mentions": ["user-1", {"agentId": "agent-1"}, "user-1"]},
        )
    )
    if not mention_stream.success:
        raise RuntimeError(f"mention stream failed before completion: {mention_stream.error}")
    asyncio.run(adapter.on_processing_complete(media_event, ProcessingOutcome.SUCCESS))
    if posted[-2][0] != "/agent-sdk" or posted[-2][1]["method"] != "sendTaskUpdate":
        raise RuntimeError(f"processing complete did not send task update: {posted[-2]}")
    if posted[-2][1]["args"][0] != "Arinova Chat":
        raise RuntimeError(f"processing complete task update used unexpected agent name: {posted[-2]}")
    complete_update = posted[-2][1]["args"][1]
    if (
        complete_update.get("status") != "completed"
        or not isinstance(complete_update.get("durationMs"), int)
        or complete_update.get("durationMs") < 0
        or set(complete_update) != {"status", "durationMs"}
    ):
        raise RuntimeError(f"processing complete task update mismatch: {posted[-2]}")
    if posted[-1] != (
        "/complete",
        {"taskId": "task-media", "content": "completion mentions", "mentions": ["user-1", "agent-1"]},
    ):
        raise RuntimeError(f"processing complete did not finish task: {posted[-1]}")
    if (
        "task-media" in adapter._session_by_task
        or "task-media" in adapter._buffer_by_task
        or "task-media" in adapter._mentions_by_task
        or "task-media" in adapter._message_by_task
        or "task-media" in adapter._task_started_at
        or adapter._task_by_conversation.get("conv-media") == "task-media"
        or adapter._conversation_by_task.get("task-media") == "conv-media"
    ):
        raise RuntimeError(
            "processing success left active task state: "
            f"sessions={adapter._session_by_task} buffers={adapter._buffer_by_task} "
            f"mentions={adapter._mentions_by_task} messages={adapter._message_by_task} "
            f"starts={adapter._task_started_at}"
        )

    trimmed_lifecycle_event = MessageEvent(
        text="trim lifecycle",
        message_type=media_event.message_type,
        source=media_event.source,
        raw_message={"taskId": "  task-lifecycle-trim  ", "conversationId": "conv-lifecycle-trim", "content": "trim lifecycle"},
        message_id="  task-lifecycle-trim  ",
    )
    adapter._conversation_by_task["task-lifecycle-trim"] = "conv-lifecycle-trim"
    adapter._task_by_conversation["conv-lifecycle-trim"] = "task-lifecycle-trim"
    adapter._buffer_by_task["task-lifecycle-trim"] = ["trimmed lifecycle output"]
    adapter._mentions_by_task["task-lifecycle-trim"] = []
    adapter._session_by_task["task-lifecycle-trim"] = "arinova:conv-lifecycle-trim"
    asyncio.run(adapter.on_processing_start(trimmed_lifecycle_event))
    if posted[-1][0] != "/agent-sdk" or posted[-1][1] != {
        "method": "sendTaskUpdate",
        "args": ["Arinova Chat", {"status": "started", "task": "trim lifecycle"}],
    }:
        raise RuntimeError(f"processing start did not trim event task id: {posted[-1]}")
    asyncio.run(adapter.on_processing_complete(trimmed_lifecycle_event, ProcessingOutcome.SUCCESS))
    if posted[-1] != (
        "/complete",
        {"taskId": "task-lifecycle-trim", "content": "trimmed lifecycle output"},
    ):
        raise RuntimeError(f"processing complete did not trim event task id: {posted[-1]}")
    if "task-lifecycle-trim" in adapter._session_by_task:
        raise RuntimeError("trimmed processing lifecycle left active task state")

    old_concurrency_mode = adapter.concurrency_mode
    adapter.concurrency_mode = "unbounded"
    try:
        asyncio.run(
            adapter._handle_arinova_task(
                {
                    "taskId": "task-parallel-a",
                    "conversationId": "conv-parallel",
                    "conversationType": "direct",
                    "content": "parallel first",
                    "senderUserId": "user-1",
                }
            )
        )
        parallel_a = captured_events[-1]
        asyncio.run(
            adapter._handle_arinova_task(
                {
                    "taskId": "task-parallel-b",
                    "conversationId": "conv-parallel",
                    "conversationType": "direct",
                    "content": "parallel second",
                    "senderUserId": "user-1",
                }
            )
        )
        parallel_b = captured_events[-1]
    finally:
        adapter.concurrency_mode = old_concurrency_mode
    if parallel_a.source.thread_id != "task-parallel-a" or parallel_b.source.thread_id != "task-parallel-b":
        raise RuntimeError(
            "same-conversation Arinova tasks did not get task thread ids: "
            f"a={parallel_a.source.thread_id!r} b={parallel_b.source.thread_id!r}"
        )
    if adapter._session_by_task.get("task-parallel-a") == adapter._session_by_task.get("task-parallel-b"):
        raise RuntimeError(f"same-conversation Arinova tasks shared a Hermes session: {adapter._session_by_task}")
    first_stream = asyncio.run(
        adapter.send("conv-parallel", "first chunk", metadata={"thread_id": "task-parallel-a"})
    )
    second_stream = asyncio.run(
        adapter.send("conv-parallel", "second chunk", metadata={"thread_id": "task-parallel-b"})
    )
    arinova_task_id_stream = asyncio.run(
        adapter.send("conv-parallel", "arinova task id chunk", metadata={"arinova_task_id": "task-parallel-a"})
    )
    snake_task_id_stream = asyncio.run(
        adapter.send("conv-parallel", "snake task id chunk", metadata={"task_id": "task-parallel-b"})
    )
    camel_task_id_stream = asyncio.run(
        adapter.send("conv-parallel", "camel task id chunk", metadata={"taskId": "task-parallel-a"})
    )
    trimmed_task_id_stream = asyncio.run(
        adapter.send("conv-parallel", "trimmed task id chunk", metadata={"taskId": "  task-parallel-a  "})
    )
    nested_task_id_stream = asyncio.run(
        adapter.send("conv-parallel", "nested task id chunk", metadata={"arinova": {"task_id": "  task-parallel-b  "}})
    )
    if not all(
        stream.success
        for stream in (
            first_stream,
            second_stream,
            arinova_task_id_stream,
            snake_task_id_stream,
            camel_task_id_stream,
            trimmed_task_id_stream,
            nested_task_id_stream,
        )
    ):
        raise RuntimeError(
            "parallel streams failed: "
            f"first={first_stream} second={second_stream} arinova={arinova_task_id_stream} "
            f"snake={snake_task_id_stream} camel={camel_task_id_stream} "
            f"trimmed={trimmed_task_id_stream} nested={nested_task_id_stream}"
        )
    if posted[-7:] != [
        ("/chunk", {"taskId": "task-parallel-a", "content": "first chunk"}),
        ("/chunk", {"taskId": "task-parallel-b", "content": "second chunk"}),
        ("/chunk", {"taskId": "task-parallel-a", "content": "arinova task id chunk"}),
        ("/chunk", {"taskId": "task-parallel-b", "content": "snake task id chunk"}),
        ("/chunk", {"taskId": "task-parallel-a", "content": "camel task id chunk"}),
        ("/chunk", {"taskId": "task-parallel-a", "content": "trimmed task id chunk"}),
        ("/chunk", {"taskId": "task-parallel-b", "content": "nested task id chunk"}),
    ]:
        raise RuntimeError(f"trimmed metadata task id did not route active task send: {posted[-7:]}")
    asyncio.run(adapter.on_processing_complete(parallel_a, ProcessingOutcome.SUCCESS))
    if adapter._task_by_conversation.get("conv-parallel") != "task-parallel-b":
        raise RuntimeError(
            "forgetting first same-conversation task removed newer task mapping: "
            f"{adapter._task_by_conversation}"
        )
    if "task-parallel-a" in adapter._session_by_task or "task-parallel-b" not in adapter._session_by_task:
        raise RuntimeError(f"parallel task state after first completion was wrong: {adapter._session_by_task}")
    asyncio.run(adapter.on_processing_complete(parallel_b, ProcessingOutcome.SUCCESS))
    if (
        "task-parallel-a" in adapter._session_by_task
        or "task-parallel-b" in adapter._session_by_task
        or adapter._task_by_conversation.get("conv-parallel")
    ):
        raise RuntimeError(
            "parallel same-conversation completion left active task state: "
            f"sessions={adapter._session_by_task} conversations={adapter._task_by_conversation}"
        )

    asyncio.run(
        adapter._handle_arinova_task(
            {
                "taskId": "task-duplicate-conversation",
                "conversationId": "conv-duplicate-old",
                "conversationType": "direct",
                "content": "duplicate old conversation",
                "senderUserId": "user-1",
            }
        )
    )
    asyncio.run(
        adapter._handle_arinova_task(
            {
                "taskId": "task-duplicate-conversation",
                "conversationId": "conv-duplicate-new",
                "conversationType": "direct",
                "content": "duplicate new conversation",
                "senderUserId": "user-1",
            }
        )
    )
    if (
        adapter._task_by_conversation.get("conv-duplicate-old") == "task-duplicate-conversation"
        or adapter._task_by_conversation.get("conv-duplicate-new") != "task-duplicate-conversation"
        or adapter._conversation_by_task.get("task-duplicate-conversation") != "conv-duplicate-new"
    ):
        raise RuntimeError(
            "duplicate Arinova task id left stale conversation mapping: "
            f"tasks={adapter._task_by_conversation} conversations={adapter._conversation_by_task}"
        )
    adapter._forget_task("task-duplicate-conversation")

    asyncio.run(
        adapter._handle_arinova_task(
            {
                "taskId": "task-agent",
                "conversationId": "conv-agent",
                "conversationType": "private",
                "content": "agent-authored task",
                "senderAgentId": "agent-peer",
                "senderAgentName": "Peer Agent",
                "senderUsername": "Workspace Owner",
            }
        )
    )
    agent_event = captured_events[-1]
    if agent_event.source.chat_type != "dm" or agent_event.source.user_id != "agent-peer":
        raise RuntimeError(f"agent-authored source was not normalized: {agent_event.source}")
    if agent_event.source.user_name != "Peer Agent":
        raise RuntimeError(f"agent-authored source used senderUsername instead of senderAgentName: {agent_event.source}")
    if agent_event.source.is_bot is not True:
        raise RuntimeError(f"agent-authored source did not set is_bot: {agent_event.source}")
    if agent_event.source.role_authorized is True:
        raise RuntimeError(f"agent-authored source bypassed auth without allow_bots: {agent_event.source}")
    for expected in ["senderAgentId: agent-peer", "senderAgentName: Peer Agent"]:
        if expected not in agent_event.text:
            raise RuntimeError(f"agent sender metadata {expected!r} missing from event text: {agent_event.text}")

    adapter.allow_bots = "all"
    asyncio.run(
        adapter._handle_arinova_task(
            {
                "taskId": "task-agent-allowed",
                "conversationId": "conv-agent",
                "conversationType": "private",
                "content": "agent-authored authorized task",
                "senderAgentId": "agent-peer",
                "senderAgentName": "Peer Agent",
            }
        )
    )
    if captured_events[-1].source.role_authorized is not True:
        raise RuntimeError(f"allow_bots did not authorize agent sender: {captured_events[-1].source}")
    adapter.allow_bots = "none"

    asyncio.run(
        adapter._handle_arinova_task(
            {
                "taskId": "  task-inbound-trim  ",
                "conversationId": "conv-inbound-trim",
                "conversationType": "direct",
                "content": "trimmed inbound task",
                "senderUserId": "user-1",
            }
        )
    )
    trimmed_inbound_event = captured_events[-1]
    if trimmed_inbound_event.message_id != "task-inbound-trim":
        raise RuntimeError(f"inbound task did not trim event message id: {trimmed_inbound_event.message_id!r}")
    if "task-inbound-trim" not in adapter._session_by_task or "  task-inbound-trim  " in adapter._session_by_task:
        raise RuntimeError(f"inbound task did not store trimmed task state: {adapter._session_by_task}")
    adapter._forget_task("task-inbound-trim")

    cancelled_sessions = []

    async def fake_cancel_session_processing(session_key, **kwargs):
        cancelled_sessions.append((session_key, kwargs))

    original_cancel_session_processing = adapter.cancel_session_processing
    adapter.cancel_session_processing = fake_cancel_session_processing
    adapter._conversation_by_task["task-inbound-cancel"] = "conv-inbound-cancel"
    adapter._task_by_conversation["conv-inbound-cancel"] = "task-inbound-cancel"
    adapter._buffer_by_task["task-inbound-cancel"] = ["partial"]
    adapter._mentions_by_task["task-inbound-cancel"] = ["user-cancelled-before-complete"]
    adapter._session_by_task["task-inbound-cancel"] = "arinova:conv-inbound-cancel"
    try:
        asyncio.run(adapter._handle_arinova_cancel({"taskId": "  task-inbound-cancel  "}))
    finally:
        adapter.cancel_session_processing = original_cancel_session_processing
    if cancelled_sessions != [
        ("arinova:conv-inbound-cancel", {"release_guard": True, "discard_pending": True})
    ]:
        raise RuntimeError(f"inbound cancel did not cancel Hermes session correctly: {cancelled_sessions}")
    if (
        "task-inbound-cancel" in adapter._session_by_task
        or "  task-inbound-cancel  " in adapter._session_by_task
        or "task-inbound-cancel" in adapter._buffer_by_task
        or "task-inbound-cancel" in adapter._mentions_by_task
        or adapter._task_by_conversation.get("conv-inbound-cancel") == "task-inbound-cancel"
        or adapter._conversation_by_task.get("task-inbound-cancel") == "conv-inbound-cancel"
    ):
        raise RuntimeError(
            "inbound cancel left active task state: "
            f"sessions={adapter._session_by_task} conversations={adapter._task_by_conversation}"
        )

    failure_event = MessageEvent(
        text="fail task",
        message_type=media_event.message_type,
        source=media_event.source,
        raw_message={"taskId": "task-fail", "conversationId": "conv-fail", "content": "fail task"},
        message_id="task-fail",
    )
    adapter._conversation_by_task["task-fail"] = "conv-fail"
    adapter._task_by_conversation["conv-fail"] = "task-fail"
    adapter._buffer_by_task["task-fail"] = []
    adapter._mentions_by_task["task-fail"] = ["user-fail"]
    adapter._session_by_task["task-fail"] = "arinova:conv-fail"
    asyncio.run(adapter.on_processing_start(failure_event))
    failure_posts_before_complete = len(posted)
    asyncio.run(adapter.on_processing_complete(failure_event, ProcessingOutcome.FAILURE))
    failure_posts = posted[failure_posts_before_complete:]
    if any(
        item[0] == "/agent-sdk"
        and item[1].get("method") == "sendTaskUpdate"
        and item[1].get("args", [{}, {}])[1].get("status") == "completed"
        for item in failure_posts
    ):
        raise RuntimeError(f"processing failure emitted a completed task update: {failure_posts}")
    if posted[-2][0] != "/agent-sdk" or posted[-2][1] != {
        "method": "sendTelemetry",
        "args": ["task_terminal", {"taskId": "task-fail", "outcome": "failure"}],
    }:
        raise RuntimeError(f"processing failure did not send telemetry: {posted[-2]}")
    if posted[-1] != ("/error", {"taskId": "task-fail", "error": "Hermes failed while processing the task"}):
        raise RuntimeError(f"processing failure did not send task error: {posted[-1]}")
    if (
        "task-fail" in adapter._session_by_task
        or "task-fail" in adapter._buffer_by_task
        or "task-fail" in adapter._mentions_by_task
        or adapter._task_by_conversation.get("conv-fail") == "task-fail"
        or adapter._conversation_by_task.get("task-fail") == "conv-fail"
    ):
        raise RuntimeError("processing failure left active task state")

    cancel_event = MessageEvent(
        text="cancel task",
        message_type=media_event.message_type,
        source=media_event.source,
        raw_message={"taskId": "task-cancel", "conversationId": "conv-cancel", "content": "cancel task"},
        message_id="task-cancel",
    )
    adapter._conversation_by_task["task-cancel"] = "conv-cancel"
    adapter._task_by_conversation["conv-cancel"] = "task-cancel"
    adapter._buffer_by_task["task-cancel"] = []
    adapter._mentions_by_task["task-cancel"] = ["user-cancel"]
    adapter._session_by_task["task-cancel"] = "arinova:conv-cancel"
    asyncio.run(adapter.on_processing_start(cancel_event))
    cancel_posts_before_complete = len(posted)
    asyncio.run(adapter.on_processing_complete(cancel_event, ProcessingOutcome.CANCELLED))
    cancel_posts = posted[cancel_posts_before_complete:]
    if any(
        item[0] == "/agent-sdk"
        and item[1].get("method") == "sendTaskUpdate"
        and item[1].get("args", [{}, {}])[1].get("status") == "completed"
        for item in cancel_posts
    ):
        raise RuntimeError(f"processing cancellation emitted a completed task update: {cancel_posts}")
    if posted[-2][0] != "/agent-sdk" or posted[-2][1] != {
        "method": "sendTelemetry",
        "args": ["task_terminal", {"taskId": "task-cancel", "outcome": "cancelled"}],
    }:
        raise RuntimeError(f"processing cancellation did not send telemetry: {posted[-2]}")
    if posted[-1] != ("/error", {"taskId": "task-cancel", "error": "cancelled"}):
        raise RuntimeError(f"processing cancellation did not send task error: {posted[-1]}")
    if (
        "task-cancel" in adapter._session_by_task
        or "task-cancel" in adapter._buffer_by_task
        or "task-cancel" in adapter._mentions_by_task
        or adapter._task_by_conversation.get("conv-cancel") == "task-cancel"
        or adapter._conversation_by_task.get("task-cancel") == "conv-cancel"
    ):
        raise RuntimeError("processing cancellation left active task state")

    task_update_failure_event = MessageEvent(
        text="task update failure",
        message_type=media_event.message_type,
        source=media_event.source,
        raw_message={
            "taskId": "task-update-fail",
            "conversationId": "conv-update-fail",
            "content": "task update failure",
        },
        message_id="task-update-fail",
    )
    asyncio.run(adapter.on_processing_start(task_update_failure_event))
    if "task-update-fail" not in adapter._task_started_at:
        raise RuntimeError("task update failure prevented processing start bookkeeping")
    adapter._forget_task("task-update-fail")

    telemetry_failure_event = MessageEvent(
        text="telemetry fail task",
        message_type=media_event.message_type,
        source=media_event.source,
        raw_message={"taskId": "task-telemetry-fail", "conversationId": "conv-telemetry-fail", "content": "telemetry fail"},
        message_id="task-telemetry-fail",
    )
    adapter._conversation_by_task["task-telemetry-fail"] = "conv-telemetry-fail"
    adapter._task_by_conversation["conv-telemetry-fail"] = "task-telemetry-fail"
    adapter._buffer_by_task["task-telemetry-fail"] = []
    adapter._mentions_by_task["task-telemetry-fail"] = []
    adapter._session_by_task["task-telemetry-fail"] = "arinova:conv-telemetry-fail"
    asyncio.run(adapter.on_processing_complete(telemetry_failure_event, ProcessingOutcome.FAILURE))
    if posted[-1] != (
        "/error",
        {"taskId": "task-telemetry-fail", "error": "Hermes failed while processing the task"},
    ):
        raise RuntimeError(f"telemetry failure prevented terminal task error: {posted[-3:]}")
    if (
        "task-telemetry-fail" in adapter._session_by_task
        or adapter._task_by_conversation.get("conv-telemetry-fail") == "task-telemetry-fail"
        or adapter._conversation_by_task.get("task-telemetry-fail") == "conv-telemetry-fail"
    ):
        raise RuntimeError("telemetry failure left active task state")

    terminal_fail_event = MessageEvent(
        text="terminal post fail task",
        message_type=media_event.message_type,
        source=media_event.source,
        raw_message={
            "taskId": "task-terminal-post-fail",
            "conversationId": "conv-terminal-post-fail",
            "content": "terminal post fail task",
        },
        message_id="task-terminal-post-fail",
    )
    adapter._conversation_by_task["task-terminal-post-fail"] = "conv-terminal-post-fail"
    adapter._task_by_conversation["conv-terminal-post-fail"] = "task-terminal-post-fail"
    adapter._buffer_by_task["task-terminal-post-fail"] = ["still buffered"]
    adapter._mentions_by_task["task-terminal-post-fail"] = ["user-terminal"]
    adapter._session_by_task["task-terminal-post-fail"] = "arinova:conv-terminal-post-fail"
    adapter._message_by_task["task-terminal-post-fail"] = "msg-terminal-post-fail"
    adapter._task_started_at["task-terminal-post-fail"] = 123.0
    terminal_post_failures.add(("/complete", "task-terminal-post-fail"))
    try:
        asyncio.run(adapter.on_processing_complete(terminal_fail_event, ProcessingOutcome.SUCCESS))
    finally:
        terminal_post_failures.clear()
    if any(
        "task-terminal-post-fail" in mapping or "conv-terminal-post-fail" in mapping
        for mapping in (
            adapter._session_by_task,
            adapter._buffer_by_task,
            adapter._mentions_by_task,
            adapter._message_by_task,
            adapter._task_started_at,
            adapter._task_by_conversation,
            adapter._conversation_by_task,
        )
    ):
        raise RuntimeError(
            "terminal sidecar failure leaked active task state: "
            f"sessions={adapter._session_by_task} conversations={adapter._task_by_conversation} "
            f"buffers={adapter._buffer_by_task} mentions={adapter._mentions_by_task} "
            f"messages={adapter._message_by_task} started_at={adapter._task_started_at}"
        )
    if sorted(manager._plugin_platform_names) != ["arinova"]:
        raise RuntimeError(f"unexpected platforms: {sorted(manager._plugin_platform_names)}")
    if platform_registry.get("arinova") is None:
        raise RuntimeError("arinova platform entry was not registered")
    platform_entry = platform_registry.get("arinova")
    assert_platform_metadata(platform_entry)
    assert_platform_registry_factory(platform_registry, loaded.module, PlatformConfig)
    if platform_entry.cron_deliver_env_var != "ARINOVA_HOME_CONVERSATION":
        raise RuntimeError("arinova cron home-channel env var was not registered")
    if platform_entry.standalone_sender_fn is None:
        raise RuntimeError("arinova standalone sender was not registered")
    if platform_entry.apply_yaml_config_fn is None:
        raise RuntimeError("arinova YAML config bridge was not registered")
    if platform_entry.validate_config is not loaded.module.validate_config:
        raise RuntimeError("arinova validate_config callback was not registered")
    if platform_entry.is_connected is not loaded.module.is_connected:
        raise RuntimeError("arinova is_connected callback was not registered")

    config_callback_env_keys = [
        "ARINOVA_SERVER_URL",
        "ARINOVA_BOT_TOKEN",
        "ARINOVA_CONCURRENCY_MODE",
        "ARINOVA_AGENT_CONCURRENCY_MODE",
        "ARINOVA_AGENT_SKILLS_JSON",
        "ARINOVA_AGENT_SKILLS",
        "ARINOVA_RECONNECT_INTERVAL_MS",
        "ARINOVA_CONNECT_TIMEOUT_MS",
        "ARINOVA_CONTROL_MAX_BODY_BYTES",
        "ARINOVA_SIDECAR_PORT",
        "ARINOVA_MAX_QUEUED_TASKS",
        "ARINOVA_ATTACHMENT_MAX_BYTES",
        "ARINOVA_ATTACHMENT_MAX_COUNT",
        "ARINOVA_ATTACHMENT_TOTAL_MAX_BYTES",
    ]
    old_config_callback_env = {key: os.environ.get(key) for key in config_callback_env_keys}
    for key in config_callback_env_keys:
        os.environ.pop(key, None)
    try:
        empty_config = PlatformConfig(enabled=True, extra={})
        if loaded.module.validate_config(empty_config) or loaded.module.is_connected(empty_config):
            raise RuntimeError("Arinova config callbacks accepted missing credentials")
        if platform_entry.validate_config(empty_config) or platform_entry.is_connected(empty_config):
            raise RuntimeError("Arinova platform callbacks accepted missing credentials")

        os.environ["ARINOVA_SERVER_URL"] = "   "
        os.environ["ARINOVA_BOT_TOKEN"] = "  "
        if loaded.module.validate_config(empty_config) or loaded.module.is_connected(empty_config):
            raise RuntimeError("Arinova config callbacks accepted blank env credentials")
        if platform_entry.validate_config(empty_config) or platform_entry.is_connected(empty_config):
            raise RuntimeError("Arinova platform callbacks accepted blank env credentials")

        extra_config = PlatformConfig(
            enabled=True,
            extra={"server_url": "wss://extra.example", "bot_token": "ari_extra"},
        )
        if not loaded.module.validate_config(extra_config) or not loaded.module.is_connected(extra_config):
            raise RuntimeError("Arinova module callbacks rejected YAML extra credentials")
        if not platform_entry.validate_config(extra_config) or not platform_entry.is_connected(extra_config):
            raise RuntimeError("Arinova platform callbacks rejected YAML extra credentials")
        blank_env_adapter = loaded.module.ArinovaAdapter(extra_config)
        if blank_env_adapter.server_url != "wss://extra.example" or blank_env_adapter.bot_token != "ari_extra":
            raise RuntimeError("blank env credentials shadowed YAML extra credentials")

        skills_list_config = PlatformConfig(
            enabled=True,
            extra={
                "server_url": "wss://extra.example",
                "bot_token": "ari_extra",
                "agent_skills": [{"id": "memo", "name": "Memo", "description": "Use memos"}],
            },
        )
        if not loaded.module.validate_config(skills_list_config) or not loaded.module.is_connected(skills_list_config):
            raise RuntimeError("Arinova module callbacks rejected YAML agent_skills list")

        bad_skills_json_config = PlatformConfig(
            enabled=True,
            extra={
                "server_url": "wss://extra.example",
                "bot_token": "ari_extra",
                "agent_skills_json": "{}",
            },
        )
        if loaded.module.validate_config(bad_skills_json_config) or loaded.module.is_connected(bad_skills_json_config):
            raise RuntimeError("Arinova module callbacks accepted non-array YAML agent_skills_json")
        if platform_entry.validate_config(bad_skills_json_config) or platform_entry.is_connected(bad_skills_json_config):
            raise RuntimeError("Arinova platform callbacks accepted non-array YAML agent_skills_json")

        duplicate_key_skills_json_config = PlatformConfig(
            enabled=True,
            extra={
                "server_url": "wss://extra.example",
                "bot_token": "ari_extra",
                "agent_skills_json": (
                    '[{"id":"memo","id":"memo-copy","name":"Memo","description":"Use memos"}]'
                ),
            },
        )
        if loaded.module.validate_config(duplicate_key_skills_json_config) or loaded.module.is_connected(
            duplicate_key_skills_json_config
        ):
            raise RuntimeError("Arinova module callbacks accepted duplicate-key YAML agent_skills_json")
        if platform_entry.validate_config(duplicate_key_skills_json_config) or platform_entry.is_connected(
            duplicate_key_skills_json_config
        ):
            raise RuntimeError("Arinova platform callbacks accepted duplicate-key YAML agent_skills_json")

        nonfinite_skills_json_config = PlatformConfig(
            enabled=True,
            extra={
                "server_url": "wss://extra.example",
                "bot_token": "ari_extra",
                "agent_skills_json": (
                    '[{"id":"memo","name":"Memo","description":"Use memos","priority":NaN}]'
                ),
            },
        )
        if loaded.module.validate_config(nonfinite_skills_json_config) or loaded.module.is_connected(
            nonfinite_skills_json_config
        ):
            raise RuntimeError("Arinova module callbacks accepted non-finite YAML agent_skills_json")
        if platform_entry.validate_config(nonfinite_skills_json_config) or platform_entry.is_connected(
            nonfinite_skills_json_config
        ):
            raise RuntimeError("Arinova platform callbacks accepted non-finite YAML agent_skills_json")

        bad_skills_list_config = PlatformConfig(
            enabled=True,
            extra={
                "server_url": "wss://extra.example",
                "bot_token": "ari_extra",
                "agent_skills": [{"id": "memo", "name": "Memo"}],
            },
        )
        if platform_entry.validate_config(bad_skills_list_config) or platform_entry.is_connected(bad_skills_list_config):
            raise RuntimeError("Arinova platform callbacks accepted malformed YAML agent_skills list")

        duplicate_skills_list_config = PlatformConfig(
            enabled=True,
            extra={
                "server_url": "wss://extra.example",
                "bot_token": "ari_extra",
                "agent_skills": [
                    {"id": "memo", "name": "Memo", "description": "Use memos"},
                    {"id": "memo", "name": "Memo Copy", "description": "Duplicate id"},
                ],
            },
        )
        if loaded.module.validate_config(duplicate_skills_list_config) or loaded.module.is_connected(
            duplicate_skills_list_config
        ):
            raise RuntimeError("Arinova module callbacks accepted duplicate YAML agent_skills ids")
        if platform_entry.validate_config(duplicate_skills_list_config) or platform_entry.is_connected(
            duplicate_skills_list_config
        ):
            raise RuntimeError("Arinova platform callbacks accepted duplicate YAML agent_skills ids")

        extra_field_skills_list_config = PlatformConfig(
            enabled=True,
            extra={
                "server_url": "wss://extra.example",
                "bot_token": "ari_extra",
                "agent_skills": [{"id": "memo", "name": "Memo", "description": "Use memos", "icon": "book"}],
            },
        )
        if loaded.module.validate_config(extra_field_skills_list_config) or loaded.module.is_connected(
            extra_field_skills_list_config
        ):
            raise RuntimeError("Arinova module callbacks accepted unsupported YAML agent_skills field")
        if platform_entry.validate_config(extra_field_skills_list_config) or platform_entry.is_connected(
            extra_field_skills_list_config
        ):
            raise RuntimeError("Arinova platform callbacks accepted unsupported YAML agent_skills field")

        blank_skills_list_config = PlatformConfig(
            enabled=True,
            extra={
                "server_url": "wss://extra.example",
                "bot_token": "ari_extra",
                "agent_skills": [{"id": " ", "name": "Blank", "description": "Blank id"}],
            },
        )
        if loaded.module.validate_config(blank_skills_list_config) or loaded.module.is_connected(blank_skills_list_config):
            raise RuntimeError("Arinova module callbacks accepted blank YAML agent_skills id")
        if platform_entry.validate_config(blank_skills_list_config) or platform_entry.is_connected(blank_skills_list_config):
            raise RuntimeError("Arinova platform callbacks accepted blank YAML agent_skills id")

        nonfinite_skills_list_config = PlatformConfig(
            enabled=True,
            extra={
                "server_url": "wss://extra.example",
                "bot_token": "ari_extra",
                "agent_skills": [
                    {
                        "id": "memo",
                        "name": "Memo",
                        "description": "Use memos",
                        "priority": float("nan"),
                    }
                ],
            },
        )
        if loaded.module.validate_config(nonfinite_skills_list_config) or loaded.module.is_connected(
            nonfinite_skills_list_config
        ):
            raise RuntimeError("Arinova module callbacks accepted non-finite YAML agent_skills list")
        if platform_entry.validate_config(nonfinite_skills_list_config) or platform_entry.is_connected(
            nonfinite_skills_list_config
        ):
            raise RuntimeError("Arinova platform callbacks accepted non-finite YAML agent_skills list")

        bad_concurrency_config = PlatformConfig(
            enabled=True,
            extra={
                "server_url": "wss://extra.example",
                "bot_token": "ari_extra",
                "concurrency_mode": "serial",
            },
        )
        if loaded.module.validate_config(bad_concurrency_config) or loaded.module.is_connected(bad_concurrency_config):
            raise RuntimeError("Arinova module callbacks accepted invalid YAML concurrency_mode")
        if platform_entry.validate_config(bad_concurrency_config) or platform_entry.is_connected(bad_concurrency_config):
            raise RuntimeError("Arinova platform callbacks accepted invalid YAML concurrency_mode")

        bad_alias_concurrency_config = PlatformConfig(
            enabled=True,
            extra={
                "server_url": "wss://extra.example",
                "bot_token": "ari_extra",
                "agent_concurrency_mode": "parallel",
            },
        )
        if platform_entry.validate_config(bad_alias_concurrency_config) or platform_entry.is_connected(
            bad_alias_concurrency_config
        ):
            raise RuntimeError("Arinova platform callbacks accepted invalid YAML agent_concurrency_mode")

        bad_numeric_config = PlatformConfig(
            enabled=True,
            extra={
                "server_url": "wss://extra.example",
                "bot_token": "ari_extra",
                "reconnect_interval_ms": "soon",
            },
        )
        if loaded.module.validate_config(bad_numeric_config) or loaded.module.is_connected(bad_numeric_config):
            raise RuntimeError("Arinova module callbacks accepted invalid YAML numeric SDK option")
        if platform_entry.validate_config(bad_numeric_config) or platform_entry.is_connected(bad_numeric_config):
            raise RuntimeError("Arinova platform callbacks accepted invalid YAML numeric SDK option")

        token_config = PlatformConfig(
            enabled=True,
            token="ari_token",
            extra={"server_url": "wss://token.example"},
        )
        if not platform_entry.validate_config(token_config) or not platform_entry.is_connected(token_config):
            raise RuntimeError("Arinova platform callbacks rejected PlatformConfig.token credentials")

        os.environ["ARINOVA_SERVER_URL"] = "wss://env-callback.example"
        os.environ["ARINOVA_BOT_TOKEN"] = "ari_env_callback"
        env_config = PlatformConfig(enabled=True, extra={})
        if not loaded.module.validate_config(env_config) or not loaded.module.is_connected(env_config):
            raise RuntimeError("Arinova module callbacks rejected env credentials")
        if not platform_entry.validate_config(env_config) or not platform_entry.is_connected(env_config):
            raise RuntimeError("Arinova platform callbacks rejected env credentials")

        os.environ["ARINOVA_AGENT_SKILLS"] = '[{"id":"memo","name":"Memo","description":"Use memos"}]'
        if not loaded.module.validate_config(env_config) or not loaded.module.is_connected(env_config):
            raise RuntimeError("Arinova module callbacks rejected ARINOVA_AGENT_SKILLS alias")
        if not platform_entry.validate_config(env_config) or not platform_entry.is_connected(env_config):
            raise RuntimeError("Arinova platform callbacks rejected ARINOVA_AGENT_SKILLS alias")
        os.environ["ARINOVA_AGENT_SKILLS"] = '[{"id":"memo","name":"Memo"}]'
        if loaded.module.validate_config(env_config) or loaded.module.is_connected(env_config):
            raise RuntimeError("Arinova module callbacks accepted malformed ARINOVA_AGENT_SKILLS alias")
        if platform_entry.validate_config(env_config) or platform_entry.is_connected(env_config):
            raise RuntimeError("Arinova platform callbacks accepted malformed ARINOVA_AGENT_SKILLS alias")
        os.environ["ARINOVA_AGENT_SKILLS"] = (
            '[{"id":"memo","name":"Memo","description":"Use memos"},'
            '{"id":"memo","name":"Memo Copy","description":"Duplicate id"}]'
        )
        if loaded.module.validate_config(env_config) or loaded.module.is_connected(env_config):
            raise RuntimeError("Arinova module callbacks accepted duplicate ARINOVA_AGENT_SKILLS alias ids")
        if platform_entry.validate_config(env_config) or platform_entry.is_connected(env_config):
            raise RuntimeError("Arinova platform callbacks accepted duplicate ARINOVA_AGENT_SKILLS alias ids")
        os.environ["ARINOVA_AGENT_SKILLS"] = '[{"id":"memo","name":"Memo","description":"Use memos","icon":"book"}]'
        if loaded.module.validate_config(env_config) or loaded.module.is_connected(env_config):
            raise RuntimeError("Arinova module callbacks accepted unsupported ARINOVA_AGENT_SKILLS alias field")
        if platform_entry.validate_config(env_config) or platform_entry.is_connected(env_config):
            raise RuntimeError("Arinova platform callbacks accepted unsupported ARINOVA_AGENT_SKILLS alias field")
        os.environ.pop("ARINOVA_AGENT_SKILLS", None)

        os.environ["ARINOVA_CONCURRENCY_MODE"] = "serial"
        if loaded.module.validate_config(env_config) or loaded.module.is_connected(env_config):
            raise RuntimeError("Arinova module callbacks accepted invalid env concurrency mode")
        if platform_entry.validate_config(env_config) or platform_entry.is_connected(env_config):
            raise RuntimeError("Arinova platform callbacks accepted invalid env concurrency mode")
        os.environ.pop("ARINOVA_CONCURRENCY_MODE", None)

        os.environ["ARINOVA_CONNECT_TIMEOUT_MS"] = "-1"
        if loaded.module.validate_config(env_config) or loaded.module.is_connected(env_config):
            raise RuntimeError("Arinova module callbacks accepted invalid env numeric option")
        if platform_entry.validate_config(env_config) or platform_entry.is_connected(env_config):
            raise RuntimeError("Arinova platform callbacks accepted invalid env numeric option")
        os.environ.pop("ARINOVA_CONNECT_TIMEOUT_MS", None)

        for strict_zero_env_name in (
            "ARINOVA_CONNECT_TIMEOUT_MS",
            "ARINOVA_CONTROL_MAX_BODY_BYTES",
            "ARINOVA_SIDECAR_PORT",
        ):
            os.environ[strict_zero_env_name] = "0"
            if loaded.module.validate_config(env_config) or loaded.module.is_connected(env_config):
                raise RuntimeError(f"Arinova module callbacks accepted zero for {strict_zero_env_name}")
            if platform_entry.validate_config(env_config) or platform_entry.is_connected(env_config):
                raise RuntimeError(f"Arinova platform callbacks accepted zero for {strict_zero_env_name}")
            os.environ.pop(strict_zero_env_name, None)

        for zero_env_name in (
            "ARINOVA_MAX_QUEUED_TASKS",
            "ARINOVA_ATTACHMENT_MAX_BYTES",
            "ARINOVA_ATTACHMENT_MAX_COUNT",
            "ARINOVA_ATTACHMENT_TOTAL_MAX_BYTES",
        ):
            os.environ[zero_env_name] = "0"
            if not loaded.module.validate_config(env_config) or not loaded.module.is_connected(env_config):
                raise RuntimeError(f"Arinova module callbacks rejected zero for {zero_env_name}")
            if not platform_entry.validate_config(env_config) or not platform_entry.is_connected(env_config):
                raise RuntimeError(f"Arinova platform callbacks rejected zero for {zero_env_name}")
            os.environ.pop(zero_env_name, None)

        zero_meaningful_config = PlatformConfig(
            enabled=True,
            extra={
                "server_url": "wss://extra.example",
                "bot_token": "ari_extra",
                "max_queued_tasks": 0,
                "attachment_max_bytes": 0,
                "attachment_max_count": 0,
                "attachment_total_max_bytes": 0,
            },
        )
        if not loaded.module.validate_config(zero_meaningful_config) or not loaded.module.is_connected(
            zero_meaningful_config
        ):
            raise RuntimeError("Arinova module callbacks rejected YAML zero for zero-meaningful settings")
        if not platform_entry.validate_config(zero_meaningful_config) or not platform_entry.is_connected(
            zero_meaningful_config
        ):
            raise RuntimeError("Arinova platform callbacks rejected YAML zero for zero-meaningful settings")

        zero_strict_config = PlatformConfig(
            enabled=True,
            extra={
                "server_url": "wss://extra.example",
                "bot_token": "ari_extra",
                "connect_timeout_ms": 0,
            },
        )
        if loaded.module.validate_config(zero_strict_config) or loaded.module.is_connected(zero_strict_config):
            raise RuntimeError("Arinova module callbacks accepted YAML zero for a strictly-positive setting")
        if platform_entry.validate_config(zero_strict_config) or platform_entry.is_connected(zero_strict_config):
            raise RuntimeError("Arinova platform callbacks accepted YAML zero for a strictly-positive setting")

        boolean_numeric_config = PlatformConfig(
            enabled=True,
            extra={
                "server_url": "wss://extra.example",
                "bot_token": "ari_extra",
                "connect_timeout_ms": True,
            },
        )
        if loaded.module.validate_config(boolean_numeric_config) or loaded.module.is_connected(boolean_numeric_config):
            raise RuntimeError("Arinova module callbacks accepted boolean YAML numeric option")
        if platform_entry.validate_config(boolean_numeric_config) or platform_entry.is_connected(boolean_numeric_config):
            raise RuntimeError("Arinova platform callbacks accepted boolean YAML numeric option")

        plus_numeric_config = PlatformConfig(
            enabled=True,
            extra={
                "server_url": "wss://extra.example",
                "bot_token": "ari_extra",
                "connect_timeout_ms": "+1",
            },
        )
        if loaded.module.validate_config(plus_numeric_config) or loaded.module.is_connected(plus_numeric_config):
            raise RuntimeError("Arinova module callbacks accepted plus-signed YAML numeric option")
        if platform_entry.validate_config(plus_numeric_config) or platform_entry.is_connected(plus_numeric_config):
            raise RuntimeError("Arinova platform callbacks accepted plus-signed YAML numeric option")

        os.environ["ARINOVA_AGENT_SKILLS_JSON"] = '[{"id":"memo","name":"Memo"}]'
        if loaded.module.validate_config(env_config) or loaded.module.is_connected(env_config):
            raise RuntimeError("Arinova module callbacks accepted malformed env agent skills")
        if platform_entry.validate_config(env_config) or platform_entry.is_connected(env_config):
            raise RuntimeError("Arinova platform callbacks accepted malformed env agent skills")
    finally:
        for key, value in old_config_callback_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    env_enablement_keys = [
        "ARINOVA_SERVER_URL",
        "ARINOVA_BOT_TOKEN",
        "ARINOVA_HOME_CONVERSATION",
        "ARINOVA_HOME_CONVERSATION_NAME",
    ]
    old_enablement_env = {key: os.environ.get(key) for key in env_enablement_keys}
    for key in env_enablement_keys:
        os.environ.pop(key, None)
    try:
        if loaded.module.env_enablement() is not None:
            raise RuntimeError("env_enablement enabled Arinova without required credentials")
        os.environ["ARINOVA_SERVER_URL"] = "wss://env.example"
        os.environ["ARINOVA_BOT_TOKEN"] = "ari_env"
        default_enablement = loaded.module.env_enablement()
        if default_enablement != {
            "server_url": "wss://env.example",
            "bot_token": "ari_env",
            "home_channel": {"chat_id": "arinova", "name": "Arinova Chat"},
        }:
            raise RuntimeError(f"env_enablement did not build default home channel: {default_enablement}")
        os.environ["ARINOVA_HOME_CONVERSATION"] = "conv-env"
        os.environ["ARINOVA_HOME_CONVERSATION_NAME"] = "Env Home"
        named_enablement = loaded.module.env_enablement()
        if named_enablement != {
            "server_url": "wss://env.example",
            "bot_token": "ari_env",
            "home_channel": {"chat_id": "conv-env", "name": "Env Home"},
        }:
            raise RuntimeError(f"env_enablement did not preserve configured home channel: {named_enablement}")
    finally:
        for key, value in old_enablement_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

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
        seeded = platform_entry.apply_yaml_config_fn(
            {},
            {
                "server_url": "wss://yaml.example",
                "bot_token": "ari_yaml",
                "allowed_users": ["user-1", "user-2"],
                "allow_all_users": False,
                "allow_bots": "all",
                "sidecar_bind": "127.0.0.2",
                "adapter_bind": "127.0.0.3",
                "agent_sdk_root": "/tmp/hermes-arinova-agent-sdk-root",
                "home_conversation": {"chat_id": "conv-yaml", "name": "YAML Home"},
                "agent_skills": [
                    {"id": "memo", "name": "Memo", "description": "Use memos"},
                    {"id": "", "name": "  ", "description": ""},
                ],
                "concurrency_mode": "unbounded",
                "reconnect_interval_ms": 1111,
                "ping_interval_ms": 2222,
                "ping_timeout_ms": 3333,
                "max_consecutive_per_conversation": 4,
                "connect_timeout_ms": 4321,
                "adapter_post_timeout_ms": 5432,
                "control_max_body_bytes": 7654,
                "sidecar_post_timeout_ms": 6543,
                "node_bin": "/usr/local/bin/node-custom",
                "download_attachments": False,
                "attachment_max_bytes": 1234,
            },
        )
        if seeded["server_url"] != "wss://yaml.example" or seeded["bot_token"] != "ari_yaml":
            raise RuntimeError(f"YAML bridge did not seed connection config: {seeded}")
        if (
            seeded["concurrency_mode"] != "unbounded"
            or seeded["sidecar_bind"] != "127.0.0.2"
            or seeded["adapter_bind"] != "127.0.0.3"
            or seeded["agent_sdk_root"] != "/tmp/hermes-arinova-agent-sdk-root"
            or seeded["reconnect_interval_ms"] != 1111
            or seeded["ping_interval_ms"] != 2222
            or seeded["ping_timeout_ms"] != 3333
            or seeded["max_consecutive_per_conversation"] != 4
            or seeded["connect_timeout_ms"] != 4321
            or seeded["adapter_post_timeout_ms"] != 5432
            or seeded["control_max_body_bytes"] != 7654
            or seeded["sidecar_post_timeout_ms"] != 6543
            or seeded["node_bin"] != "/usr/local/bin/node-custom"
            or seeded["download_attachments"] is not False
        ):
            raise RuntimeError(f"YAML bridge did not seed SDK/plugin options: {seeded}")
        if json.loads(seeded["agent_skills_json"]) != [
            {"id": "memo", "name": "Memo", "description": "Use memos"},
            {"id": "", "name": "  ", "description": ""},
        ]:
            raise RuntimeError(f"YAML bridge did not JSON-encode agent skills: {seeded}")
        if seeded.get("allowed_users") != ["user-1", "user-2"] or seeded.get("allow_all_users") is not False:
            raise RuntimeError(f"YAML bridge did not preserve allowlist config: {seeded}")
        expected_bridge_env = {
            "ARINOVA_SERVER_URL": "wss://yaml.example",
            "ARINOVA_BOT_TOKEN": "ari_yaml",
            "ARINOVA_ALLOWED_USERS": "user-1,user-2",
            "ARINOVA_ALLOW_ALL_USERS": "False",
            "ARINOVA_ALLOW_BOTS": "all",
            "ARINOVA_NODE_BIN": "/usr/local/bin/node-custom",
            "ARINOVA_HOME_CONVERSATION": "conv-yaml",
            "ARINOVA_HOME_CONVERSATION_NAME": "YAML Home",
            "ARINOVA_AGENT_SKILLS_JSON": None,
            "ARINOVA_AGENT_SKILLS": None,
        }
        bridge_env = {key: os.environ.get(key) for key in env_keys}
        if bridge_env != expected_bridge_env:
            raise RuntimeError(f"YAML bridge did not seed unset env from YAML config: {bridge_env}")

        preset_env = {
            "ARINOVA_SERVER_URL": "wss://preset.example",
            "ARINOVA_BOT_TOKEN": "ari_preset",
            "ARINOVA_ALLOWED_USERS": "preset-user",
            "ARINOVA_ALLOW_ALL_USERS": "true",
            "ARINOVA_ALLOW_BOTS": "none",
            "ARINOVA_NODE_BIN": "/usr/bin/node-preset",
            "ARINOVA_HOME_CONVERSATION": "conv-preset",
            "ARINOVA_HOME_CONVERSATION_NAME": "Preset Home",
        }
        for key in env_keys:
            os.environ.pop(key, None)
        os.environ.update(preset_env)
        platform_entry.apply_yaml_config_fn(
            {},
            {
                "server_url": "wss://yaml.example",
                "bot_token": "ari_yaml",
                "allowed_users": ["user-1", "user-2"],
                "allow_all_users": False,
                "allow_bots": "all",
                "node_bin": "/usr/local/bin/node-custom",
                "home_conversation": {"chat_id": "conv-yaml", "name": "YAML Home"},
            },
        )
        overridden = {key: os.environ.get(key) for key in preset_env if os.environ.get(key) != preset_env[key]}
        if overridden:
            raise RuntimeError(f"YAML bridge overrode pre-set env values: {overridden}")

        for key in env_keys:
            os.environ.pop(key, None)
        token_alias_seeded = platform_entry.apply_yaml_config_fn(
            {},
            {
                "server_url": "wss://yaml-token-alias.example",
                "token": "ari_yaml_token_alias",
            },
        )
        if token_alias_seeded.get("bot_token") != "ari_yaml_token_alias":
            raise RuntimeError(f"YAML bridge did not accept token alias: {token_alias_seeded}")
        if os.environ.get("ARINOVA_BOT_TOKEN") != "ari_yaml_token_alias":
            raise RuntimeError("YAML bridge did not seed ARINOVA_BOT_TOKEN from token alias")

        for key in env_keys:
            os.environ.pop(key, None)
        platform_entry.apply_yaml_config_fn(
            {},
            {
                "server_url": "   ",
                "bot_token": "  ",
                "node_bin": "",
            },
        )
        if os.environ.get("ARINOVA_SERVER_URL") is not None or os.environ.get("ARINOVA_BOT_TOKEN") is not None:
            raise RuntimeError("YAML bridge wrote blank Arinova credentials into env")
        if os.environ.get("ARINOVA_NODE_BIN") is not None:
            raise RuntimeError("YAML bridge wrote blank ARINOVA_NODE_BIN into env")
    finally:
        for key, value in old_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    captured_requests = []
    original_urlopen = loaded.module.adapter.urllib.request.urlopen

    def fake_urlopen(req, timeout=0):
        captured_requests.append((req, timeout))
        if req.full_url.endswith("/api/v1/files/upload"):
            body = req.data.decode("latin1")
            if 'filename="arinova-no-url.txt"' in body:
                return FakeHttpResponse(b'{"fileName":"arinova-no-url.txt","fileType":"text/plain","fileSize":6}')
            if 'filename="arinova-second.txt"' in body:
                return FakeHttpResponse(
                    b'{"url":"https://files.example/arinova-second.txt","fileName":"arinova-second.txt","fileType":"text/plain","fileSize":6}'
                )
            if 'filename="arinova-unknown.blobx"' in body:
                return FakeHttpResponse(
                    b'{"url":"https://files.example/arinova-unknown.blobx","fileName":"arinova-unknown.blobx","fileType":"application/octet-stream","fileSize":7}'
                )
            return FakeHttpResponse(
                b'{"url":"https://files.example/example.txt","fileName":"example.txt","fileType":"text/plain","fileSize":7}'
            )
        return FakeHttpResponse()

    loaded.module.adapter.urllib.request.urlopen = fake_urlopen
    try:
        media_path = Path(tempfile.gettempdir()) / 'arinova-example-"quoted".txt'
        media_path.write_text("example", encoding="utf-8")
        try:
            standalone = asyncio.run(
                platform_entry.standalone_sender_fn(
                    PlatformConfig(
                        enabled=True,
                        token="ari_test",
                        extra={"server_url": "wss://chat.example"},
                    ),
                    "conv-standalone",
                    "hello standalone",
                    thread_id="thread-ignored",
                    media_files=[(str(media_path), True)],
                    force_document=True,
                )
            )
        finally:
            media_path.unlink(missing_ok=True)
    finally:
        loaded.module.adapter.urllib.request.urlopen = original_urlopen
    if standalone.get("success") is not True or standalone.get("message_id") != "msg-1":
        raise RuntimeError(f"standalone send failed: {standalone}")
    if standalone.get("uploads") != [
        {
            "url": "https://files.example/example.txt",
            "fileName": "example.txt",
            "isVoice": True,
            "fileType": "text/plain",
            "fileSize": 7,
        }
    ]:
        raise RuntimeError(f"standalone send did not return upload metadata: {standalone}")
    expected_warnings = {
        "thread_id was ignored for arinova; route by conversation id",
        "force_document was ignored for arinova; files are uploaded as SDK attachments",
        "audio_as_voice was ignored for arinova; files are uploaded as SDK attachments",
    }
    if set(standalone.get("warnings", [])) != expected_warnings:
        raise RuntimeError(f"standalone send did not report ignored options: {standalone}")
    upload_req, upload_timeout = captured_requests[-2]
    if upload_req.full_url != "https://chat.example/api/v1/files/upload" or upload_timeout != 30:
        raise RuntimeError(f"standalone media upload used unexpected URL: {upload_req.full_url} timeout={upload_timeout}")
    if upload_req.headers.get("Authorization") != "Bearer ari_test":
        raise RuntimeError(f"standalone media upload used unexpected auth header: {upload_req.headers}")
    if "multipart/form-data" not in upload_req.headers.get("Content-type", upload_req.headers.get("Content-Type", "")):
        raise RuntimeError(f"standalone media upload did not use multipart: {upload_req.headers}")
    upload_body = upload_req.data.decode("latin1")
    if 'filename="arinova-example-\\"quoted\\".txt"' not in upload_body:
        raise RuntimeError(f"standalone media upload did not escape quoted filename: {upload_body}")
    req, timeout = captured_requests[-1]
    if req.full_url != "https://chat.example/api/v1/messages/send" or timeout != 10:
        raise RuntimeError(f"standalone send used unexpected URL: {req.full_url} timeout={timeout}")
    if req.headers.get("Authorization") != "Bearer ari_test":
        raise RuntimeError(f"standalone send used unexpected auth header: {req.headers}")
    body = json.loads(req.data.decode("utf-8"))
    expected_content = "hello standalone\n\nAttachments:\n- example.txt: https://files.example/example.txt"
    if body != {"conversationId": "conv-standalone", "content": expected_content}:
        raise RuntimeError(f"standalone send used unexpected body: {body}")

    captured_requests.clear()
    loaded.module.adapter.urllib.request.urlopen = fake_urlopen
    try:
        unknown_path = Path(tempfile.gettempdir()) / "arinova-unknown.blobx"
        unknown_path.write_text("unknown", encoding="utf-8")
        try:
            unknown_upload = loaded.module.adapter._upload_file_http(
                "wss://chat.example",
                "ari_test",
                "conv-standalone",
                str(unknown_path),
            )
        finally:
            unknown_path.unlink(missing_ok=True)
    finally:
        loaded.module.adapter.urllib.request.urlopen = original_urlopen
    if unknown_upload.get("fileType") != "application/octet-stream":
        raise RuntimeError(f"standalone unknown-extension upload returned unexpected MIME: {unknown_upload}")
    unknown_upload_req, _unknown_upload_timeout = captured_requests[-1]
    unknown_upload_body = unknown_upload_req.data.decode("latin1")
    if 'filename="arinova-unknown.blobx"' not in unknown_upload_body:
        raise RuntimeError(f"standalone unknown-extension upload used unexpected filename: {unknown_upload_body}")
    if "Content-Type: application/octet-stream" not in unknown_upload_body:
        raise RuntimeError(f"standalone unknown-extension upload did not use SDK MIME fallback: {unknown_upload_body}")

    captured_requests.clear()
    loaded.module.adapter.urllib.request.urlopen = fake_urlopen
    try:
        first_path = Path(tempfile.gettempdir()) / "arinova-first.txt"
        second_path = Path(tempfile.gettempdir()) / "arinova-second.txt"
        first_path.write_text("first", encoding="utf-8")
        second_path.write_text("second", encoding="utf-8")
        try:
            standalone_multi = asyncio.run(
                platform_entry.standalone_sender_fn(
                    PlatformConfig(
                        enabled=True,
                        token="ari_test",
                        extra={"server_url": "wss://chat.example"},
                    ),
                    "conv-standalone",
                    "multi",
                    media_files=[(str(first_path), False), (str(second_path), False)],
                )
            )
        finally:
            first_path.unlink(missing_ok=True)
            second_path.unlink(missing_ok=True)
    finally:
        loaded.module.adapter.urllib.request.urlopen = original_urlopen
    if standalone_multi.get("uploads") != [
        {
            "url": "https://files.example/example.txt",
            "fileName": "example.txt",
            "fileType": "text/plain",
            "fileSize": 7,
        },
        {
            "url": "https://files.example/arinova-second.txt",
            "fileName": "arinova-second.txt",
            "fileType": "text/plain",
            "fileSize": 6,
        },
    ]:
        raise RuntimeError(f"standalone multi-send did not preserve uploads in order: {standalone_multi}")
    if len([req for req, _timeout in captured_requests if req.full_url.endswith("/api/v1/files/upload")]) != 2:
        raise RuntimeError(f"standalone multi-send did not upload both files: {captured_requests}")
    multi_req, _multi_timeout = captured_requests[-1]
    multi_body = json.loads(multi_req.data.decode("utf-8"))
    expected_multi_content = (
        "multi\n\nAttachments:\n"
        "- example.txt: https://files.example/example.txt\n"
        "- arinova-second.txt: https://files.example/arinova-second.txt"
    )
    if multi_body != {"conversationId": "conv-standalone", "content": expected_multi_content}:
        raise RuntimeError(f"standalone multi-send used unexpected body: {multi_body}")

    captured_requests.clear()
    loaded.module.adapter.urllib.request.urlopen = fake_urlopen
    try:
        no_url_path = Path(tempfile.gettempdir()) / "arinova-no-url.txt"
        no_url_path.write_text("no url", encoding="utf-8")
        try:
            standalone_missing_url = asyncio.run(
                platform_entry.standalone_sender_fn(
                    PlatformConfig(
                        enabled=True,
                        token="ari_test",
                        extra={"server_url": "wss://chat.example"},
                    ),
                    "conv-standalone",
                    "missing upload url",
                    media_files=[(str(no_url_path), False)],
                )
            )
        finally:
            no_url_path.unlink(missing_ok=True)
    finally:
        loaded.module.adapter.urllib.request.urlopen = original_urlopen
    if "uploadFile response missing url" not in standalone_missing_url.get("error", ""):
        raise RuntimeError(f"standalone send accepted uploadFile response without url: {standalone_missing_url}")
    if any(req.full_url.endswith("/api/v1/messages/send") for req, _timeout in captured_requests):
        raise RuntimeError(f"standalone send posted message after malformed uploadFile response: {captured_requests}")

    def assert_standalone_upload_error(fake_upload_response, expected_error: str, failure_label: str) -> None:
        captured_upload_requests = []

        def fake_upload_urlopen(req, timeout=0):
            captured_upload_requests.append((req, timeout))
            if req.full_url.endswith("/api/v1/files/upload"):
                return fake_upload_response(req, timeout)
            return FakeHttpResponse()

        loaded.module.adapter.urllib.request.urlopen = fake_upload_urlopen
        try:
            upload_error_path = Path(tempfile.gettempdir()) / "arinova-bad-upload-response.txt"
            upload_error_path.write_text("bad upload", encoding="utf-8")
            try:
                result = asyncio.run(
                    platform_entry.standalone_sender_fn(
                        PlatformConfig(
                            enabled=True,
                            token="ari_test",
                            extra={"server_url": "wss://chat.example"},
                        ),
                        "conv-standalone",
                        "bad upload response",
                        media_files=[(str(upload_error_path), False)],
                    )
                )
            finally:
                upload_error_path.unlink(missing_ok=True)
        finally:
            loaded.module.adapter.urllib.request.urlopen = original_urlopen
        if expected_error not in result.get("error", ""):
            raise RuntimeError(f"{failure_label}: {result}")
        if any(req.full_url.endswith("/api/v1/messages/send") for req, _timeout in captured_upload_requests):
            raise RuntimeError(f"{failure_label} posted message after failed upload: {captured_upload_requests}")

    assert_standalone_upload_error(
        lambda req, timeout=0: FakeHttpResponse(
            b'{"url":"https://files.example/bad-upload.txt","fileName":"bad-upload.txt","fileType":"text/plain","fileSize":10}',
            content_type="text/plain",
        ),
        "uploadFile returned non-JSON response content type: text/plain",
        "standalone upload accepted non-JSON response content type",
    )
    assert_standalone_upload_error(
        lambda req, timeout=0: FakeHttpResponse(b"\xff"),
        "uploadFile returned non-UTF-8 response body",
        "standalone upload accepted non-UTF-8 response",
    )
    assert_standalone_upload_error(
        lambda req, timeout=0: FakeHttpResponse(b"{not-json"),
        "uploadFile returned malformed JSON",
        "standalone upload accepted malformed JSON response",
    )
    assert_standalone_upload_error(
        lambda req, timeout=0: FakeHttpResponse(b""),
        "uploadFile returned malformed JSON",
        "standalone upload accepted empty JSON response",
    )
    assert_standalone_upload_error(
        lambda req, timeout=0: FakeHttpResponse(
            b'{"url":"https://files.example/bad-upload.txt","fileName":"bad-upload.txt","fileType":"text/plain","fileSize":NaN}'
        ),
        "uploadFile returned malformed JSON",
        "standalone upload accepted non-finite JSON response",
    )
    assert_standalone_upload_error(
        lambda req, timeout=0: FakeHttpResponse(
            b'{"url":"https://files.example/bad-upload.txt","url":"https://files.example/second.txt",'
            b'"fileName":"bad-upload.txt","fileType":"text/plain","fileSize":10}'
        ),
        "uploadFile returned malformed JSON",
        "standalone upload accepted duplicate-key JSON response",
    )
    assert_standalone_upload_error(
        lambda req, timeout=0: FakeHttpResponse(b"[]"),
        "uploadFile returned malformed response: []",
        "standalone upload accepted non-object JSON response",
    )
    assert_standalone_upload_error(
        lambda req, timeout=0: FakeHttpResponse(
            b'{"url":"https://files.example/bad-upload.txt","fileType":"text/plain","fileSize":10}'
        ),
        "uploadFile response missing fileName",
        "standalone upload accepted response without fileName",
    )
    assert_standalone_upload_error(
        lambda req, timeout=0: FakeHttpResponse(
            b'{"url":"https://files.example/bad-upload.txt","fileName":"bad-upload.txt","fileSize":10}'
        ),
        "uploadFile response missing fileType",
        "standalone upload accepted response without fileType",
    )
    assert_standalone_upload_error(
        lambda req, timeout=0: FakeHttpResponse(
            b'{"url":"https://files.example/bad-upload.txt","fileName":"bad-upload.txt","fileType":"text/plain"}'
        ),
        "uploadFile response missing fileSize",
        "standalone upload accepted response without fileSize",
    )
    assert_standalone_upload_error(
        lambda req, timeout=0: FakeHttpResponse(
            b'{"url":"https://files.example/bad-upload.txt","fileName":"bad-upload.txt","fileType":"text/plain","fileSize":Infinity}'
        ),
        "uploadFile returned malformed JSON",
        "standalone upload accepted response with non-finite fileSize",
    )

    def fake_upload_transport_failure(req, timeout=0):
        raise urllib.error.URLError("connection refused")

    assert_standalone_upload_error(
        fake_upload_transport_failure,
        "uploadFile failed: connection refused",
        "standalone upload accepted transport failure",
    )

    def fake_upload_timeout(req, timeout=0):
        raise TimeoutError()

    assert_standalone_upload_error(
        fake_upload_timeout,
        "uploadFile timed out",
        "standalone upload accepted timeout",
    )

    empty_tuple_error = asyncio.run(
        platform_entry.standalone_sender_fn(
            PlatformConfig(
                enabled=True,
                token="ari_test",
                extra={"server_url": "wss://chat.example"},
            ),
            "conv-standalone",
            "empty tuple",
            media_files=[()],
        )
    )
    if "media_files entries must include a path" not in empty_tuple_error.get("error", ""):
        raise RuntimeError(f"standalone send did not reject empty media tuple clearly: {empty_tuple_error}")

    def fake_upload_failure_urlopen(req, timeout=0):
        raise urllib.error.HTTPError(
            req.full_url,
            413,
            "Payload Too Large",
            hdrs=None,
            fp=FakeHttpResponse(b'{"error":"file too large"}'),
        )

    loaded.module.adapter.urllib.request.urlopen = fake_upload_failure_urlopen
    try:
        fail_path = Path(tempfile.gettempdir()) / "arinova-too-large.txt"
        fail_path.write_text("too large", encoding="utf-8")
        try:
            upload_failed = asyncio.run(
                platform_entry.standalone_sender_fn(
                    PlatformConfig(
                        enabled=True,
                        token="ari_test",
                        extra={"server_url": "wss://chat.example"},
                    ),
                    "conv-standalone",
                    "upload fail",
                    media_files=[(str(fail_path), False)],
                )
            )
        finally:
            fail_path.unlink(missing_ok=True)
    finally:
        loaded.module.adapter.urllib.request.urlopen = original_urlopen
    if "uploadFile failed (413): {\"error\":\"file too large\"}" not in upload_failed.get("error", ""):
        raise RuntimeError(f"standalone upload failure did not include response body: {upload_failed}")

    def fake_send_failure_urlopen(req, timeout=0):
        if req.full_url.endswith("/api/v1/messages/send"):
            raise urllib.error.HTTPError(
                req.full_url,
                429,
                "Too Many Requests",
                hdrs=None,
                fp=FakeHttpResponse(b'{"error":"rate limited"}'),
            )
        return FakeHttpResponse()

    loaded.module.adapter.urllib.request.urlopen = fake_send_failure_urlopen
    try:
        send_failed = asyncio.run(
            platform_entry.standalone_sender_fn(
                PlatformConfig(
                    enabled=True,
                    token="ari_test",
                    extra={"server_url": "wss://chat.example"},
                ),
                "conv-standalone",
                "send fail",
            )
        )
    finally:
        loaded.module.adapter.urllib.request.urlopen = original_urlopen
    if "sendMessage failed (429): {\"error\":\"rate limited\"}" not in send_failed.get("error", ""):
        raise RuntimeError(f"standalone send failure did not include response body: {send_failed}")

    def assert_standalone_send_error(fake_urlopen_fn, expected_error: str, failure_label: str) -> None:
        loaded.module.adapter.urllib.request.urlopen = fake_urlopen_fn
        try:
            result = asyncio.run(
                platform_entry.standalone_sender_fn(
                    PlatformConfig(
                        enabled=True,
                        token="ari_test",
                        extra={"server_url": "wss://chat.example"},
                    ),
                    "conv-standalone",
                    "bad direct response",
                )
            )
        finally:
            loaded.module.adapter.urllib.request.urlopen = original_urlopen
        if expected_error not in result.get("error", ""):
            raise RuntimeError(f"{failure_label}: {result}")

    assert_standalone_send_error(
        lambda req, timeout=0: FakeHttpResponse(b'{"messageId":"msg-1"}', content_type="text/plain"),
        "sendMessage returned non-JSON response content type: text/plain",
        "standalone send accepted non-JSON response content type",
    )
    assert_standalone_send_error(
        lambda req, timeout=0: FakeHttpResponse(b"\xff"),
        "sendMessage returned non-UTF-8 response body",
        "standalone send accepted non-UTF-8 response",
    )
    assert_standalone_send_error(
        lambda req, timeout=0: FakeHttpResponse(b"{not-json"),
        "sendMessage returned malformed JSON",
        "standalone send accepted malformed JSON response",
    )
    assert_standalone_send_error(
        lambda req, timeout=0: FakeHttpResponse(b""),
        "sendMessage returned malformed JSON",
        "standalone send accepted empty JSON response",
    )
    assert_standalone_send_error(
        lambda req, timeout=0: FakeHttpResponse(b'{"id":NaN}'),
        "sendMessage returned malformed JSON",
        "standalone send accepted non-finite JSON response",
    )
    assert_standalone_send_error(
        lambda req, timeout=0: FakeHttpResponse(b'{"id":"msg-1","id":"msg-2"}'),
        "sendMessage returned malformed JSON",
        "standalone send accepted duplicate-key JSON response",
    )
    assert_standalone_send_error(
        lambda req, timeout=0: FakeHttpResponse(b"[]"),
        "sendMessage returned malformed response: []",
        "standalone send accepted non-object JSON response",
    )

    def fake_transport_failure_urlopen(req, timeout=0):
        raise urllib.error.URLError("connection refused")

    assert_standalone_send_error(
        fake_transport_failure_urlopen,
        "sendMessage failed: connection refused",
        "standalone send accepted transport failure",
    )

    def fake_timeout_urlopen(req, timeout=0):
        raise TimeoutError()

    assert_standalone_send_error(
        fake_timeout_urlopen,
        "sendMessage timed out",
        "standalone send accepted timeout",
    )

    from tools import send_message_tool

    parsed_target = send_message_tool._parse_target_ref("arinova", "conv-explicit")
    if parsed_target != ("conv-explicit", None, True):
        raise RuntimeError(f"Arinova target parser was not patched: {parsed_target}")
    parsed_prefixed_target = send_message_tool._parse_target_ref("arinova", "arinova:conv-explicit")
    if parsed_prefixed_target != ("conv-explicit", None, True):
        raise RuntimeError(f"Arinova prefixed target parser was not patched: {parsed_prefixed_target}")

    captured_requests.clear()
    loaded.module.adapter.urllib.request.urlopen = fake_urlopen
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as handle:
            handle.write("example")
            media_path = Path(handle.name)
        try:
            routed = asyncio.run(
                send_message_tool._send_to_platform(
                    Platform("arinova"),
                    PlatformConfig(
                        enabled=True,
                        token="ari_test",
                        extra={"server_url": "wss://chat.example"},
                    ),
                    "conv-media-only",
                    "",
                    media_files=[(str(media_path), False)],
                )
            )
        finally:
            media_path.unlink(missing_ok=True)
    finally:
        loaded.module.adapter.urllib.request.urlopen = original_urlopen
    if routed.get("success") is not True:
        raise RuntimeError(f"Arinova media-only send_message route failed: {routed}")
    req, _timeout = captured_requests[-1]
    body = json.loads(req.data.decode("utf-8"))
    if body != {
        "conversationId": "conv-media-only",
        "content": "Attachments:\n- example.txt: https://files.example/example.txt",
    }:
        raise RuntimeError(f"Arinova media-only route used unexpected body: {body}")
    if any("MEDIA attachments were omitted" in warning for warning in routed.get("warnings", [])):
        raise RuntimeError(f"Arinova media-only route kept generic media warning: {routed}")

    from gateway.platform_registry import platform_registry as chunk_platform_registry

    chunk_entry = chunk_platform_registry.get("arinova")
    if chunk_entry is None:
        raise RuntimeError("Arinova platform entry missing before chunked send_message check")
    original_max_message_length = chunk_entry.max_message_length
    original_send_via_adapter = send_message_tool._send_via_adapter
    chunked_calls: list[dict] = []

    async def fake_send_via_adapter(platform, pconfig, chat_id, message, **kwargs):
        chunked_calls.append(
            {
                "chat_id": chat_id,
                "message": message,
                "media_files": list(kwargs.get("media_files") or []),
                "force_document": kwargs.get("force_document"),
            }
        )
        return {"success": True, "chunk": len(chunked_calls)}

    chunk_entry.max_message_length = 8
    send_message_tool._send_via_adapter = fake_send_via_adapter
    try:
        chunked = asyncio.run(
            send_message_tool._send_to_platform(
                Platform("arinova"),
                PlatformConfig(
                    enabled=True,
                    token="ari_test",
                    extra={"server_url": "wss://chat.example"},
                ),
                "conv-chunked-media",
                "abcdefghij",
                media_files=[("/tmp/final-only.txt", False)],
                force_document=True,
            )
        )
    finally:
        send_message_tool._send_via_adapter = original_send_via_adapter
        chunk_entry.max_message_length = original_max_message_length
    if chunked.get("success") is not True or chunked.get("chunk") != len(chunked_calls) or len(chunked_calls) < 2:
        raise RuntimeError(f"Arinova chunked send_message route failed: result={chunked} calls={chunked_calls}")
    if any(call["media_files"] for call in chunked_calls[:-1]):
        raise RuntimeError(f"Arinova chunked send attached media before final chunk: {chunked_calls}")
    if chunked_calls[-1]["media_files"] != [("/tmp/final-only.txt", False)]:
        raise RuntimeError(f"Arinova chunked send did not attach media to final chunk: {chunked_calls}")
    if any(call["force_document"] is not True for call in chunked_calls):
        raise RuntimeError(f"Arinova chunked send did not preserve force_document: {chunked_calls}")

    expected_tools = manifest_tools(ROOT / "plugin.yaml")
    registered_tools = set(loaded.tools_registered)
    if registered_tools != expected_tools:
        raise RuntimeError(
            "registered tools did not match manifest: "
            f"missing={sorted(expected_tools - registered_tools)} extra={sorted(registered_tools - expected_tools)}"
        )
    missing = [name for name in loaded.tools_registered if registry.get_entry(name) is None]
    if missing:
        raise RuntimeError(f"registered tools missing from registry: {missing}")

    assert_registry_toolset_index(registry, expected_tools)
    try:
        assert_model_tools_enabled_toolset(loaded.module, expected_tools)
        assert_real_agent_init_enabled_toolset(loaded.module, expected_tools)
    except ImportError as exc:
        print(f"Hermes toolset integration checks skipped for incompatible checkout: {exc}")
    definition_by_name = assert_registry_schemas(registry, loaded.module, expected_tools)
    definition_names = sorted(definition_by_name)
    send_props = definition_by_name["arinova_send_message"]["function"]["parameters"]["properties"]
    if not {"conversation_id", "conversationId", "content", "args"}.issubset(send_props):
        raise RuntimeError(f"named send_message schema fields missing: {send_props}")
    generic_agent_props = definition_by_name["arinova_sdk_call"]["function"]["parameters"]["properties"]
    if not {"method", "args", "conversation_id", "conversationId", "content", "options", "file", "fileName", "fileType"}.issubset(generic_agent_props):
        raise RuntimeError(f"generic SDK schema fields missing: {generic_agent_props}")
    generic_task_props = definition_by_name["arinova_task_call"]["function"]["parameters"]["properties"]
    if not {"method", "task_id", "taskId", "args", "options", "file", "fileName", "fileType", "action", "action_args", "actionArgs"}.issubset(generic_task_props):
        raise RuntimeError(f"generic task SDK schema fields missing: {generic_task_props}")
    expected_upload_schema = loaded.module.arinova_tools.UPLOAD_FILE_SCHEMA
    for tool_name, props in {
        "arinova_sdk_call": generic_agent_props,
        "arinova_task_call": generic_task_props,
        "arinova_upload_file": definition_by_name["arinova_upload_file"]["function"]["parameters"]["properties"],
        "arinova_task_upload_file": definition_by_name["arinova_task_upload_file"]["function"]["parameters"]["properties"],
    }.items():
        upload_schema = props.get("file")
        if upload_schema != expected_upload_schema:
            raise RuntimeError(f"{tool_name} upload file schema drifted: {upload_schema!r}")
        branches = upload_schema.get("oneOf") if isinstance(upload_schema, dict) else None
        if not isinstance(branches, list) or len(branches) != 2:
            raise RuntimeError(f"{tool_name} upload file schema did not expose base64/path alternatives: {upload_schema!r}")
        required_sets = {tuple(branch.get("required", [])) for branch in branches if isinstance(branch, dict)}
        if required_sets != {("base64",), ("path",)}:
            raise RuntimeError(f"{tool_name} upload file schema alternatives drifted: {upload_schema!r}")

    query_entry = registry.get_entry("arinova_query_memory")
    upload_entry = registry.get_entry("arinova_upload_file")
    task_entry = registry.get_entry("arinova_task_fetch_history")
    task_upload_entry = registry.get_entry("arinova_task_upload_file")
    dispatch_adapter = FakeAdapter()
    loaded.module.adapter._active_adapter = dispatch_adapter
    query_result = asyncio.run(query_entry.handler({"args": [{"query": "hello", "limit": 2}]}))
    generic_upload_result = asyncio.run(registry.get_entry("arinova_sdk_call").handler({
        "method": "uploadFile",
        "conversation_id": "conv-1",
        "file": {"base64": "R0E="},
        "file_name": "generic-agent-upload.txt",
        "file_type": "text/plain",
    }))
    upload_result = asyncio.run(upload_entry.handler({
        "conversation_id": "conv-1",
        "file": {"base64": "SGk="},
        "file_name": "hello.txt",
        "file_type": "text/plain",
    }))
    task_result = asyncio.run(task_entry.handler({"args": [{"limit": 1}]}))
    generic_task_upload_result = asyncio.run(registry.get_entry("arinova_task_call").handler({
        "method": "uploadFile",
        "task_id": "task-1",
        "file": {"base64": "R0k="},
        "file_name": "generic-task-upload.txt",
        "file_type": "text/plain",
    }))
    task_upload_result = asyncio.run(task_upload_entry.handler({
        "task_id": "task-1",
        "file": {"base64": "IQ=="},
        "file_name": "task-upload.txt",
        "file_type": "text/plain",
    }))
    no_conversation_task_result = asyncio.run(task_entry.handler({
        "task_id": "task-cron",
        "options": {"limit": 1},
    }))
    non_object_generic_agent_payload = json.loads(asyncio.run(registry.get_entry("arinova_sdk_call").handler([])))
    non_object_named_agent_payload = json.loads(asyncio.run(registry.get_entry("arinova_send_message").handler([])))
    non_object_generic_task_payload = json.loads(asyncio.run(registry.get_entry("arinova_task_call").handler([])))
    non_object_named_task_payload = json.loads(asyncio.run(task_entry.handler([])))
    for label, raw in {
        "query": query_result,
        "generic upload": generic_upload_result,
        "upload": upload_result,
        "task": task_result,
        "generic task upload": generic_task_upload_result,
        "task upload": task_upload_result,
    }.items():
        parsed = json.loads(raw)
        if parsed.get("success") is not True:
            raise RuntimeError(f"{label} handler failed: {raw}")
    no_conversation_task = json.loads(no_conversation_task_result)
    if (
        no_conversation_task.get("success") is not False
        or no_conversation_task.get("task_id") != "task-cron"
        or no_conversation_task.get("method") != "fetchHistory"
        or "taskKind=cron_wakeup" not in str(no_conversation_task.get("error"))
    ):
        raise RuntimeError(
            "Hermes plugin registry dispatch did not preserve no-conversation task guard: "
            f"{no_conversation_task!r}"
        )
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
            "Hermes plugin registry dispatch did not reject non-object tool payloads: "
            f"{non_object_payload_errors!r}"
        )
    expected_dispatch_calls = [
        ("agent", "queryMemory", ({"query": "hello", "limit": 2},)),
        ("agent", "uploadFile", ("conv-1", {"base64": "R0E="}, "generic-agent-upload.txt", "text/plain")),
        ("agent", "uploadFile", ("conv-1", {"base64": "SGk="}, "hello.txt", "text/plain")),
        ("task", "task-1", "fetchHistory", ({"limit": 1},)),
        ("task", "task-1", "uploadFile", ({"base64": "R0k="}, "generic-task-upload.txt", "text/plain")),
        ("task", "task-1", "uploadFile", ({"base64": "IQ=="}, "task-upload.txt", "text/plain")),
    ]
    if dispatch_adapter.calls != expected_dispatch_calls:
        raise RuntimeError(
            "Hermes plugin registry dispatch did not route expected SDK calls: "
            f"{dispatch_adapter.calls!r}"
        )

    sys.modules.setdefault("httpx", types.ModuleType("httpx"))

    from agent import agent_runtime_helpers
    import model_tools

    # Deterministic capability probe, not an exception catch: when the Hermes
    # checkout supports skip_tool_request_middleware the runtime integration
    # below runs unguarded, so a genuine TypeError from a signature bug fails
    # this check instead of being reported as a pass.
    if "skip_tool_request_middleware" not in inspect.signature(agent_runtime_helpers.invoke_tool).parameters:
        print(
            "Hermes plugin load OK: runtime integration skipped for incompatible checkout "
            "(invoke_tool lacks skip_tool_request_middleware); "
            f"platforms={sorted(manager._plugin_platform_names)} tools={len(loaded.tools_registered)}"
        )
        return 0

    class FakeHermesAgent:
        session_id = "arinova-runtime-session"
        valid_tool_names = ["arinova_send_message", "tool_call"]
        enabled_toolsets = ["hermes-arinova"]
        disabled_toolsets = []
        _current_turn_id = "turn-runtime"
        _current_api_request_id = "api-runtime"
        _memory_manager = None

    runtime_adapter = FakeAdapter()
    previous_ra = agent_runtime_helpers._ra
    loaded.module.adapter._active_adapter = runtime_adapter
    agent_runtime_helpers._ra = lambda: model_tools
    try:
        runtime_result = agent_runtime_helpers.invoke_tool(
            FakeHermesAgent(),
            "arinova_send_message",
            {"conversation_id": "conv-runtime", "content": "hello from Hermes agent runtime"},
            "task-runtime",
            tool_call_id="call-runtime",
            messages=[],
            pre_tool_block_checked=True,
            skip_tool_request_middleware=True,
        )
        bridge_runtime_result = agent_runtime_helpers.invoke_tool(
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
        runtime_non_object_result = agent_runtime_helpers.invoke_tool(
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
    parsed_runtime_result = json.loads(runtime_result)
    if parsed_runtime_result.get("success") is not True:
        raise RuntimeError(f"Hermes plugin agent runtime invoke failed: {runtime_result}")
    parsed_bridge_runtime_result = json.loads(bridge_runtime_result)
    if parsed_bridge_runtime_result.get("success") is not True:
        raise RuntimeError(f"Hermes plugin tool_call bridge invoke failed: {bridge_runtime_result}")
    parsed_runtime_non_object_result = json.loads(runtime_non_object_result)
    if parsed_runtime_non_object_result != {
        "success": False,
        "method": "sendMessage",
        "error": "args for sendMessage requires at least 2 item(s)",
    }:
        raise RuntimeError(
            "Hermes plugin agent runtime invoke did not preserve positional argument bound error: "
            f"{parsed_runtime_non_object_result!r}"
        )
    if runtime_adapter.calls != [
        ("agent", "sendMessage", ("conv-runtime", "hello from Hermes agent runtime")),
        ("agent", "sendMessage", ("conv-runtime-bridge", "hello from Hermes tool_call bridge")),
    ]:
        raise RuntimeError(
            "Hermes plugin agent runtime invoke did not route expected SDK call: "
            f"{runtime_adapter.calls!r}"
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

    executor_adapter = FakeAdapter()
    previous_ra = tool_executor._ra
    loaded.module.adapter._active_adapter = executor_adapter
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
    if executor_adapter.calls != [
        ("agent", "sendMessage", ("conv-executor-bridge", "hello from Hermes tool executor bridge")),
    ]:
        raise RuntimeError(
            "Hermes plugin tool_executor did not unwrap tool_call through enabled Arinova toolset: "
            f"{executor_adapter.calls!r}"
        )
    if len(executor_messages) != 2 or executor_messages[0].get("tool_call_id") != "call-executor-bridge":
        raise RuntimeError(f"Hermes plugin tool_executor did not append expected tool result: {executor_messages!r}")
    executor_bad_args = json.loads(executor_messages[1].get("content") or "{}")
    if (
        executor_messages[1].get("tool_call_id") != "call-executor-bridge-bad-args"
        or executor_messages[1].get("name") != "tool_call"
        or executor_bad_args != {"error": "tool_call 'arguments' must be an object"}
    ):
        raise RuntimeError(
            "Hermes plugin tool_executor did not preserve bridge argument object error: "
            f"{executor_messages!r}"
        )

    scoped_adapter = FakeAdapter()
    loaded.module.adapter._active_adapter = scoped_adapter
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
    scoped_error = json.loads(scoped_messages[0].get("content") or "{}") if scoped_messages else {}
    if scoped_adapter.calls or (
        len(scoped_messages) != 1
        or scoped_messages[0].get("tool_call_id") != "call-executor-bridge-out-of-scope"
        or scoped_messages[0].get("name") != "tool_call"
        or "arinova_send_message' is not available in this session" not in str(scoped_error.get("error"))
    ):
        raise RuntimeError(
            "Hermes plugin tool_executor did not block out-of-scope Arinova bridge call: "
            f"calls={scoped_adapter.calls!r} messages={scoped_messages!r}"
        )

    concurrent_adapter = FakeAdapter()
    loaded.module.adapter._active_adapter = concurrent_adapter
    tool_executor._ra = lambda: model_tools
    previous_agent_runtime_ra = agent_runtime_helpers._ra
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
    if concurrent_adapter.calls != [
        ("agent", "sendMessage", ("conv-executor-concurrent", "hello from Hermes concurrent tool executor bridge")),
    ]:
        raise RuntimeError(
            "Hermes plugin concurrent tool_executor did not unwrap tool_call through enabled Arinova toolset: "
            f"{concurrent_adapter.calls!r}"
        )
    if len(concurrent_messages) != 2 or concurrent_messages[0].get("tool_call_id") != "call-executor-concurrent-bridge":
        raise RuntimeError(
            f"Hermes plugin concurrent tool_executor did not append expected tool result: {concurrent_messages!r}"
        )
    concurrent_bad_args = json.loads(concurrent_messages[1].get("content") or "{}")
    if (
        concurrent_messages[1].get("tool_call_id") != "call-executor-concurrent-bridge-bad-args"
        or concurrent_messages[1].get("name") != "tool_call"
        or concurrent_bad_args != {"error": "tool_call 'arguments' must be an object"}
    ):
        raise RuntimeError(
            "Hermes plugin concurrent tool_executor did not preserve bridge argument object error: "
            f"{concurrent_messages!r}"
        )

    concurrent_scoped_adapter = FakeAdapter()
    loaded.module.adapter._active_adapter = concurrent_scoped_adapter
    tool_executor._ra = lambda: model_tools
    previous_agent_runtime_ra = agent_runtime_helpers._ra
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
    concurrent_scoped_error = json.loads(concurrent_scoped_messages[0].get("content") or "{}") if concurrent_scoped_messages else {}
    if concurrent_scoped_adapter.calls or (
        len(concurrent_scoped_messages) != 1
        or concurrent_scoped_messages[0].get("tool_call_id") != "call-executor-concurrent-bridge-out-of-scope"
        or concurrent_scoped_messages[0].get("name") != "tool_call"
        or "arinova_send_message' is not available in this session" not in str(concurrent_scoped_error.get("error"))
    ):
        raise RuntimeError(
            "Hermes plugin concurrent tool_executor did not block out-of-scope Arinova bridge call: "
            f"calls={concurrent_scoped_adapter.calls!r} messages={concurrent_scoped_messages!r}"
        )

    print(
        "Hermes plugin load OK: "
        f"platforms={sorted(manager._plugin_platform_names)} "
        f"tools={len(loaded.tools_registered)} "
        f"definitions={definition_names}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
