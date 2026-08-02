#!/usr/bin/env python3
"""Smoke-test Hermes load_gateway_config() with this plugin installed.

This creates an isolated temporary HERMES_HOME, symlinks the current checkout
under plugins/, writes config.yaml, and lets Hermes' normal config loader
discover and enable the plugin. It does not modify ~/hermes-agent or the user's
real ~/.hermes profile.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import inspect
import os
import shutil
import sys
import tempfile
import types
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def assert_gateway_runner_toolset_contract(hermes_root: Path) -> None:
    source_path = hermes_root / "gateway" / "run.py"
    source = source_path.read_text(encoding="utf-8")

    resolver = "enabled_toolsets = sorted(_get_platform_tools(user_config, platform_key))"
    handoff = "enabled_toolsets=enabled_toolsets"
    if "from hermes_cli.tools_config import _get_platform_tools" not in source:
        raise RuntimeError("Gateway runner does not import _get_platform_tools")
    if source.count(resolver) < 2:
        raise RuntimeError(
            "Gateway runner does not resolve platform enabled_toolsets through _get_platform_tools "
            "for both interactive and background Arinova agent paths"
        )
    if source.count(handoff) < 2:
        raise RuntimeError(
            "Gateway runner does not pass resolved enabled_toolsets into both AIAgent paths"
        )
    if 'disabled_toolsets = agent_cfg.get("disabled_toolsets") or None' not in source:
        raise RuntimeError("Gateway background agent path does not preserve disabled_toolsets")
    if 'disabled_toolsets = agent_cfg_local.get("disabled_toolsets") or None' not in source:
        raise RuntimeError("Gateway interactive agent path does not preserve disabled_toolsets")


def assert_conversation_loop_tool_validation_contract(hermes_root: Path) -> None:
    source_path = hermes_root / "agent" / "conversation_loop.py"
    source = source_path.read_text(encoding="utf-8")

    required = [
        "if assistant_message.tool_calls:",
        "if tc.function.name not in agent.valid_tool_names:",
        "repaired = agent._repair_tool_call(tc.function.name)",
        "tc.function.name = repaired",
        "invalid_tool_calls = [",
        "if invalid_tool_calls:",
        "available = \", \".join(sorted(agent.valid_tool_names))",
        "agent._execute_tool_calls(assistant_message, messages, effective_task_id, api_call_count)",
    ]
    missing = [item for item in required if item not in source]
    if missing:
        raise RuntimeError(
            "Hermes conversation loop no longer validates model tool calls against "
            f"agent.valid_tool_names before execution: missing {missing}"
        )


def assert_agent_init_toolset_contract(hermes_root: Path) -> None:
    source_path = hermes_root / "agent" / "agent_init.py"
    source = source_path.read_text(encoding="utf-8")

    required = [
        "agent.enabled_toolsets = enabled_toolsets",
        "agent.disabled_toolsets = disabled_toolsets",
        "agent.tools = _ra().get_tool_definitions(",
        "enabled_toolsets=enabled_toolsets",
        "disabled_toolsets=disabled_toolsets",
        'agent.valid_tool_names = {tool["function"]["name"] for tool in agent.tools}',
        'print(f"   ✅ Enabled toolsets: {\', \'.join(enabled_toolsets)}")',
        'print(f"   ❌ Disabled toolsets: {\', \'.join(disabled_toolsets)}")',
    ]
    missing = [item for item in required if item not in source]
    if missing:
        raise RuntimeError(
            "Hermes agent init no longer derives valid_tool_names from "
            f"get_tool_definitions(enabled_toolsets=...): missing {missing}"
        )


def require_hermes_python() -> None:
    if sys.version_info < (3, 10):
        version = ".".join(str(part) for part in sys.version_info[:3])
        raise SystemExit(
            "Hermes checks require Python 3.10+ because ~/hermes-agent uses "
            f"modern type syntax; current interpreter is Python {version}. "
            "Run this check with the same Python used by Hermes, for example python3.13."
        )


def install_gateway_run_import_shims() -> None:
    """Avoid unrelated optional Hermes deps when importing gateway.run."""
    account_usage = types.ModuleType("agent.account_usage")
    account_usage.fetch_account_usage = lambda *args, **kwargs: None
    account_usage.render_account_usage_lines = lambda *args, **kwargs: []
    sys.modules.setdefault("agent.account_usage", account_usage)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hermes-root", default=str(Path.home() / "hermes-agent"))
    return parser.parse_args()


def main() -> int:
    require_hermes_python()
    args = parse_args()
    hermes_root = Path(args.hermes_root).expanduser().resolve()
    assert_gateway_runner_toolset_contract(hermes_root)
    assert_conversation_loop_tool_validation_contract(hermes_root)
    assert_agent_init_toolset_contract(hermes_root)
    sys.path.insert(0, str(hermes_root))
    sys.path.insert(0, str(ROOT))

    from adapter import ArinovaAdapter
    from adapter import validate_config
    from gateway.config import Platform
    from gateway.config import load_gateway_config
    install_gateway_run_import_shims()
    from gateway.run import GatewayRunner
    from hermes_constants import reset_hermes_home_override, set_hermes_home_override

    env_keys = [
        "ARINOVA_SERVER_URL",
        "ARINOVA_BOT_TOKEN",
        "ARINOVA_ALLOWED_USERS",
        "ARINOVA_ALLOW_ALL_USERS",
        "ARINOVA_ALLOW_BOTS",
        "ARINOVA_NODE_BIN",
        "ARINOVA_AGENT_SDK_ROOT",
        "ARINOVA_HOME_CONVERSATION",
        "ARINOVA_HOME_CONVERSATION_NAME",
        "ARINOVA_AGENT_SKILLS_JSON",
        "ARINOVA_AGENT_SKILLS",
        "ARINOVA_CONCURRENCY_MODE",
        "ARINOVA_AGENT_CONCURRENCY_MODE",
        "ARINOVA_RECONNECT_INTERVAL_MS",
        "ARINOVA_PING_INTERVAL_MS",
        "ARINOVA_PING_TIMEOUT_MS",
        "ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION",
        "ARINOVA_CONNECT_TIMEOUT_MS",
        "ARINOVA_ADAPTER_POST_TIMEOUT_MS",
        "ARINOVA_CONTROL_MAX_BODY_BYTES",
        "ARINOVA_SIDECAR_POST_TIMEOUT_MS",
        "ARINOVA_SIDECAR_AUTOSTART",
        "ARINOVA_DOWNLOAD_ATTACHMENTS",
        "ARINOVA_ATTACHMENT_MAX_BYTES",
    ]
    old_env = {key: os.environ.get(key) for key in env_keys}
    for key in env_keys:
        os.environ.pop(key, None)
    node_bin = shutil.which("node") or "node"

    with tempfile.TemporaryDirectory(prefix="hermes-arinova-config-") as tmp:
        hermes_home = Path(tmp)
        plugins_dir = hermes_home / "plugins"
        plugins_dir.mkdir(parents=True)
        (plugins_dir / "hermes-arinova-plugin").symlink_to(ROOT, target_is_directory=True)
        (hermes_home / "config.yaml").write_text(
            f"""
plugins:
  enabled:
    - hermes-arinova-plugin
arinova:
  enabled: true
  server_url: wss://yaml.example
  token: ari_yaml
  allowed_users: [user-1, user-2]
  allow_all_users: false
  allow_bots: all
  sidecar_bind: 127.0.0.2
  adapter_bind: 127.0.0.3
  agent_sdk_root: /tmp/hermes-arinova-agent-sdk-root
  home_conversation:
    chat_id: conv-yaml
    name: YAML Home
  agent_skills:
    - id: memo
      name: Memo
      description: Use memos
    - id: chat
      name: Chat
      description: ""
  concurrency_mode: unbounded
  reconnect_interval_ms: 1111
  ping_interval_ms: 2222
  ping_timeout_ms: 3333
  max_consecutive_per_conversation: 4
  connect_timeout_ms: 4321
  adapter_post_timeout_ms: 5432
  control_max_body_bytes: 7654
  sidecar_post_timeout_ms: 6543
  sidecar_autostart: false
  node_bin: {node_bin}
  download_attachments: false
  attachment_max_bytes: 1234
""".lstrip(),
            encoding="utf-8",
        )

        token = set_hermes_home_override(hermes_home)
        try:
            config = load_gateway_config()
            runner_arinova = config.platforms.get(Platform("arinova"))
            if runner_arinova is None or not runner_arinova.enabled:
                raise RuntimeError("Arinova platform was not enabled before GatewayRunner adapter creation")
            runner = GatewayRunner.__new__(GatewayRunner)
            runner.config = config
            created_adapter = runner._create_adapter(Platform("arinova"), runner_arinova)
            if created_adapter.__class__.__name__ != "ArinovaAdapter":
                raise RuntimeError(f"GatewayRunner._create_adapter did not create ArinovaAdapter: {created_adapter!r}")
            if created_adapter.config is not runner_arinova:
                raise RuntimeError("GatewayRunner._create_adapter did not preserve Arinova PlatformConfig object")
            if created_adapter.server_url != "wss://yaml.example" or created_adapter.bot_token != "ari_yaml":
                raise RuntimeError(
                    "GatewayRunner._create_adapter did not hydrate Arinova credentials: "
                    f"server_url={created_adapter.server_url!r} bot_token={created_adapter.bot_token!r}"
                )
            if (
                created_adapter.concurrency_mode != "unbounded"
                or created_adapter.sidecar_post_timeout_ms != 6543
                or created_adapter.autostart_sidecar is not False
                or created_adapter.download_attachments is not False
                or created_adapter.attachment_max_bytes != 1234
                or created_adapter.allow_bots != "all"
            ):
                raise RuntimeError(
                    "GatewayRunner._create_adapter did not preserve Arinova runtime config: "
                    f"concurrency={created_adapter.concurrency_mode!r} "
                    f"sidecar_post={created_adapter.sidecar_post_timeout_ms} "
                    f"autostart={created_adapter.autostart_sidecar} "
                    f"download={created_adapter.download_attachments} "
                    f"attachment_max={created_adapter.attachment_max_bytes} "
                    f"allow_bots={created_adapter.allow_bots!r}"
                )
            if (runner_arinova.extra or {}).get("group_sessions_per_user") != config.group_sessions_per_user:
                raise RuntimeError("GatewayRunner._create_adapter did not inject group_sessions_per_user")
            if (runner_arinova.extra or {}).get("thread_sessions_per_user") != config.thread_sessions_per_user:
                raise RuntimeError("GatewayRunner._create_adapter did not inject thread_sessions_per_user")

            async def fake_message_handler(_event):
                return None

            async def fake_fatal_handler(_adapter):
                return None

            async def fake_busy_handler(_event, _session_key):
                return False

            fake_session_store = object()
            created_adapter.set_message_handler(fake_message_handler)
            created_adapter.set_fatal_error_handler(fake_fatal_handler)
            created_adapter.set_session_store(fake_session_store)
            created_adapter.set_busy_session_handler(fake_busy_handler)
            created_adapter._busy_text_mode = "queue"
            if (
                created_adapter._message_handler is not fake_message_handler
                or created_adapter._fatal_error_handler is not fake_fatal_handler
                or created_adapter._session_store is not fake_session_store
                or created_adapter._busy_session_handler is not fake_busy_handler
                or created_adapter._busy_text_mode != "queue"
            ):
                raise RuntimeError("GatewayRunner handler wiring did not attach to Arinova adapter")
            if "is_reconnect" not in inspect.signature(runner._connect_adapter_with_timeout).parameters:
                print("Hermes gateway config load OK; reconnect integration skipped for incompatible checkout")
                return 0
            connect_calls = []

            async def fake_connect(*, is_reconnect: bool = False) -> bool:
                connect_calls.append(is_reconnect)
                return True

            created_adapter.connect = fake_connect
            old_connect_timeout = os.environ.get("HERMES_GATEWAY_PLATFORM_CONNECT_TIMEOUT")
            os.environ["HERMES_GATEWAY_PLATFORM_CONNECT_TIMEOUT"] = "0"
            try:
                connected = asyncio.run(
                    runner._connect_adapter_with_timeout(
                        created_adapter,
                        Platform("arinova"),
                        is_reconnect=True,
                    )
                )
            finally:
                if old_connect_timeout is None:
                    os.environ.pop("HERMES_GATEWAY_PLATFORM_CONNECT_TIMEOUT", None)
                else:
                    os.environ["HERMES_GATEWAY_PLATFORM_CONNECT_TIMEOUT"] = old_connect_timeout
            if connected is not True or connect_calls != [True]:
                raise RuntimeError(
                    "GatewayRunner._connect_adapter_with_timeout did not drive Arinova adapter connect: "
                    f"connected={connected!r} calls={connect_calls!r}"
                )
        finally:
            reset_hermes_home_override(token)
            for key, value in old_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    arinova = config.platforms.get(Platform("arinova"))
    if arinova is None or not arinova.enabled:
        raise RuntimeError("Arinova platform was not enabled by load_gateway_config()")
    extra = arinova.extra or {}
    expected = {
        "server_url": "wss://yaml.example",
        "bot_token": "ari_yaml",
        "concurrency_mode": "unbounded",
        "reconnect_interval_ms": 1111,
        "ping_interval_ms": 2222,
        "ping_timeout_ms": 3333,
        "max_consecutive_per_conversation": 4,
        "connect_timeout_ms": 4321,
        "adapter_post_timeout_ms": 5432,
        "control_max_body_bytes": 7654,
        "sidecar_post_timeout_ms": 6543,
        "sidecar_autostart": False,
        "node_bin": node_bin,
        "agent_sdk_root": "/tmp/hermes-arinova-agent-sdk-root",
        "download_attachments": False,
        "attachment_max_bytes": 1234,
        "allow_bots": "all",
        "sidecar_bind": "127.0.0.2",
        "adapter_bind": "127.0.0.3",
    }
    for key, value in expected.items():
        if extra.get(key) != value:
            raise RuntimeError(f"Arinova extra {key!r} mismatch: {extra}")
    agent_skills = json.loads(extra.get("agent_skills_json", "[]"))
    if agent_skills != [
        {"id": "memo", "name": "Memo", "description": "Use memos"},
        {"id": "chat", "name": "Chat", "description": ""},
    ]:
        raise RuntimeError(f"Arinova agent skills were not loaded from YAML: {extra}")
    if arinova.home_channel is None or arinova.home_channel.chat_id != "conv-yaml":
        raise RuntimeError(f"Arinova home_channel was not loaded: {arinova.home_channel}")
    if arinova.home_channel.name != "YAML Home":
        raise RuntimeError(f"Arinova home_channel name mismatch: {arinova.home_channel}")

    old_env = {key: os.environ.get(key) for key in env_keys}
    for key in env_keys:
        os.environ.pop(key, None)
    with tempfile.TemporaryDirectory(prefix="hermes-arinova-config-bot-token-") as tmp:
        hermes_home = Path(tmp)
        plugins_dir = hermes_home / "plugins"
        plugins_dir.mkdir(parents=True)
        (plugins_dir / "hermes-arinova-plugin").symlink_to(ROOT, target_is_directory=True)
        (hermes_home / "config.yaml").write_text(
            """
plugins:
  enabled:
    - hermes-arinova-plugin
arinova:
  enabled: true
  server_url: wss://yaml-bot-token.example
  bot_token: ari_yaml_bot_token
""".lstrip(),
            encoding="utf-8",
        )

        token = set_hermes_home_override(hermes_home)
        try:
            alias_config = load_gateway_config()
        finally:
            reset_hermes_home_override(token)
            for key, value in old_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    alias_arinova = alias_config.platforms.get(Platform("arinova"))
    if alias_arinova is None or not alias_arinova.enabled:
        raise RuntimeError("Arinova platform was not enabled by bot_token YAML config")
    alias_extra = alias_arinova.extra or {}
    if alias_extra.get("server_url") != "wss://yaml-bot-token.example":
        raise RuntimeError(f"Arinova bot_token YAML server_url mismatch: {alias_extra}")
    if alias_extra.get("bot_token") != "ari_yaml_bot_token":
        raise RuntimeError(f"Arinova bot_token YAML alias was not loaded: {alias_extra}")

    old_env = {key: os.environ.get(key) for key in env_keys}
    for key in env_keys:
        os.environ.pop(key, None)
    with tempfile.TemporaryDirectory(prefix="hermes-arinova-config-home-channel-") as tmp:
        hermes_home = Path(tmp)
        plugins_dir = hermes_home / "plugins"
        plugins_dir.mkdir(parents=True)
        (plugins_dir / "hermes-arinova-plugin").symlink_to(ROOT, target_is_directory=True)
        (hermes_home / "config.yaml").write_text(
            """
plugins:
  enabled:
    - hermes-arinova-plugin
arinova:
  enabled: true
  server_url: wss://yaml-home-channel.example
  token: ari_yaml_home_channel
  home_channel:
    chat_id: conv-home-channel
    name: Home Channel Alias
""".lstrip(),
            encoding="utf-8",
        )

        token = set_hermes_home_override(hermes_home)
        try:
            home_alias_config = load_gateway_config()
        finally:
            reset_hermes_home_override(token)
            for key, value in old_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    home_alias_arinova = home_alias_config.platforms.get(Platform("arinova"))
    if home_alias_arinova is None or not home_alias_arinova.enabled:
        raise RuntimeError("Arinova platform was not enabled by home_channel YAML config")
    home_alias_extra = home_alias_arinova.extra or {}
    if home_alias_extra.get("home_channel") != {"chat_id": "conv-home-channel", "name": "Home Channel Alias"}:
        raise RuntimeError(f"Arinova home_channel YAML alias was not preserved in extra: {home_alias_extra}")

    old_env = {key: os.environ.get(key) for key in env_keys}
    for key in env_keys:
        os.environ.pop(key, None)
    with tempfile.TemporaryDirectory(prefix="hermes-arinova-config-duplicate-skills-") as tmp:
        hermes_home = Path(tmp)
        plugins_dir = hermes_home / "plugins"
        plugins_dir.mkdir(parents=True)
        (plugins_dir / "hermes-arinova-plugin").symlink_to(ROOT, target_is_directory=True)
        (hermes_home / "config.yaml").write_text(
            """
plugins:
  enabled:
    - hermes-arinova-plugin
arinova:
  enabled: true
  server_url: wss://yaml-duplicate-skills.example
  token: ari_yaml_duplicate_skills
  agent_skills:
    - id: memo
      name: Memo
      description: Use memos
    - id: memo
      name: Memo Copy
      description: Duplicate id
""".lstrip(),
            encoding="utf-8",
        )

        token = set_hermes_home_override(hermes_home)
        try:
            duplicate_skills_config = load_gateway_config()
        finally:
            reset_hermes_home_override(token)
            for key, value in old_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    duplicate_skills_arinova = duplicate_skills_config.platforms.get(Platform("arinova"))
    if duplicate_skills_arinova is None or not duplicate_skills_arinova.enabled:
        raise RuntimeError("Arinova platform was not enabled by duplicate YAML skills config")
    duplicate_skills = json.loads((duplicate_skills_arinova.extra or {}).get("agent_skills_json", "[]"))
    if [skill.get("id") for skill in duplicate_skills] != ["memo", "memo"]:
        raise RuntimeError(f"Arinova duplicate YAML agent_skills were not preserved for validation: {duplicate_skills_arinova.extra}")
    if validate_config(duplicate_skills_arinova):
        raise RuntimeError("Arinova validate_config accepted duplicate YAML agent_skills ids from load_gateway_config()")

    old_env = {key: os.environ.get(key) for key in env_keys}
    for key in env_keys:
        os.environ.pop(key, None)
    with tempfile.TemporaryDirectory(prefix="hermes-arinova-config-blank-skill-") as tmp:
        hermes_home = Path(tmp)
        plugins_dir = hermes_home / "plugins"
        plugins_dir.mkdir(parents=True)
        (plugins_dir / "hermes-arinova-plugin").symlink_to(ROOT, target_is_directory=True)
        (hermes_home / "config.yaml").write_text(
            """
plugins:
  enabled:
    - hermes-arinova-plugin
arinova:
  enabled: true
  server_url: wss://yaml-blank-skill.example
  token: ari_yaml_blank_skill
  agent_skills:
    - id: " "
      name: Blank
      description: Blank id
""".lstrip(),
            encoding="utf-8",
        )

        token = set_hermes_home_override(hermes_home)
        try:
            blank_skill_config = load_gateway_config()
        finally:
            reset_hermes_home_override(token)
            for key, value in old_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    blank_skill_arinova = blank_skill_config.platforms.get(Platform("arinova"))
    if blank_skill_arinova is None or not blank_skill_arinova.enabled:
        raise RuntimeError("Arinova platform was not enabled by blank YAML skill config")
    blank_skills = json.loads((blank_skill_arinova.extra or {}).get("agent_skills_json", "[]"))
    if blank_skills != [{"id": " ", "name": "Blank", "description": "Blank id"}]:
        raise RuntimeError(f"Arinova blank YAML agent_skills were not preserved for validation: {blank_skill_arinova.extra}")
    if validate_config(blank_skill_arinova):
        raise RuntimeError("Arinova validate_config accepted blank YAML agent_skills id from load_gateway_config()")

    print("Hermes gateway config load OK: arinova enabled with YAML bridge")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
