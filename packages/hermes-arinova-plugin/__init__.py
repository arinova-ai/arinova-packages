"""Arinova Chat platform plugin for Hermes Agent."""

import asyncio
import json
import logging
import os
import threading
from functools import wraps
from typing import Any

from .adapter import (
    ArinovaAdapter,
    check_requirements,
    env_enablement,
    get_active_adapter,
    is_connected,
    standalone_send,
    validate_config,
)
from .arinova_tools import register_tools


logger = logging.getLogger(__name__)
_tool_report_lock = threading.Lock()
_tool_report_turn_counts: dict[str, int] = {}


def _csv(value):
    if isinstance(value, (list, tuple, set)):
        return ",".join(str(item) for item in value if str(item).strip())
    return str(value)


def _env_if_unset(name: str, value) -> None:
    if value is None or os.getenv(name):
        return
    normalized = _csv(value).strip()
    if not normalized:
        return
    os.environ[name] = normalized


def _apply_yaml_config(yaml_cfg: dict, platform_cfg: dict) -> dict | None:
    extra = {}
    key_map = {
        "server_url": "server_url",
        "token": "bot_token",
        "bot_token": "bot_token",
        "sidecar_port": "sidecar_port",
        "adapter_port": "adapter_port",
        "adapter_bind": "adapter_bind",
        "sidecar_bind": "sidecar_bind",
        "sidecar_autostart": "sidecar_autostart",
        "node_bin": "node_bin",
        "agent_sdk_root": "agent_sdk_root",
        "concurrency_mode": "concurrency_mode",
        "agent_concurrency_mode": "agent_concurrency_mode",
        "reconnect_interval_ms": "reconnect_interval_ms",
        "ping_interval_ms": "ping_interval_ms",
        "ping_timeout_ms": "ping_timeout_ms",
        "connect_timeout_ms": "connect_timeout_ms",
        "adapter_post_timeout_ms": "adapter_post_timeout_ms",
        "control_max_body_bytes": "control_max_body_bytes",
        "sidecar_post_timeout_ms": "sidecar_post_timeout_ms",
        "max_consecutive_per_conversation": "max_consecutive_per_conversation",
        "download_attachments": "download_attachments",
        "attachment_max_bytes": "attachment_max_bytes",
        "attachment_max_count": "attachment_max_count",
        "attachment_total_max_bytes": "attachment_total_max_bytes",
        "attachment_total_timeout_ms": "attachment_total_timeout_ms",
        "allow_bots": "allow_bots",
    }
    for yaml_key, extra_key in key_map.items():
        if yaml_key in platform_cfg:
            extra[extra_key] = platform_cfg[yaml_key]

    yaml_token = platform_cfg.get("bot_token") or platform_cfg.get("token")
    _env_if_unset("ARINOVA_SERVER_URL", platform_cfg.get("server_url"))
    _env_if_unset("ARINOVA_BOT_TOKEN", yaml_token)
    _env_if_unset("ARINOVA_NODE_BIN", platform_cfg.get("node_bin"))

    if "agent_skills_json" in platform_cfg:
        extra["agent_skills_json"] = platform_cfg["agent_skills_json"]
    elif "agent_skills" in platform_cfg:
        skills = platform_cfg["agent_skills"]
        extra["agent_skills_json"] = skills if isinstance(skills, str) else json.dumps(skills)

    home = platform_cfg.get("home_conversation") or platform_cfg.get("home_channel")
    if isinstance(home, dict):
        chat_id = home.get("chat_id") or home.get("id")
        name = home.get("name")
        if chat_id:
            extra["home_channel"] = {"chat_id": str(chat_id), "name": str(name or "Arinova Chat")}
            _env_if_unset("ARINOVA_HOME_CONVERSATION", chat_id)
        if name:
            _env_if_unset("ARINOVA_HOME_CONVERSATION_NAME", name)
    elif home:
        extra["home_channel"] = {"chat_id": str(home), "name": "Arinova Chat"}
        _env_if_unset("ARINOVA_HOME_CONVERSATION", home)

    _env_if_unset("ARINOVA_ALLOWED_USERS", platform_cfg.get("allowed_users") or platform_cfg.get("allow_from"))
    _env_if_unset("ARINOVA_ALLOW_ALL_USERS", platform_cfg.get("allow_all_users"))
    _env_if_unset("ARINOVA_ALLOW_BOTS", platform_cfg.get("allow_bots"))

    return extra or None


def _install_send_message_compat() -> None:
    """Patch Hermes send_message routing for Arinova plugin-platform semantics."""
    try:
        from tools import send_message_tool
    except Exception:
        return

    if not getattr(send_message_tool._parse_target_ref, "_arinova_compat", False):
        original_parse_target_ref = send_message_tool._parse_target_ref

        @wraps(original_parse_target_ref)
        def parse_target_ref(platform_name: str, target_ref: str):
            if platform_name == "arinova":
                target = str(target_ref or "").strip()
                if target.lower().startswith("arinova:"):
                    target = target.split(":", 1)[1].strip()
                if target:
                    return target, None, True
                return None, None, False
            return original_parse_target_ref(platform_name, target_ref)

        parse_target_ref._arinova_compat = True
        send_message_tool._parse_target_ref = parse_target_ref

    if not getattr(send_message_tool._send_to_platform, "_arinova_compat", False):
        original_send_to_platform = send_message_tool._send_to_platform

        @wraps(original_send_to_platform)
        async def send_to_platform(
            platform,
            pconfig,
            chat_id,
            message,
            thread_id=None,
            media_files=None,
            force_document=False,
        ):
            platform_name = platform.value if hasattr(platform, "value") else str(platform)
            if platform_name != "arinova":
                return await original_send_to_platform(
                    platform,
                    pconfig,
                    chat_id,
                    message,
                    thread_id=thread_id,
                    media_files=media_files,
                    force_document=force_document,
                )

            from gateway.platforms.base import BasePlatformAdapter
            from gateway.platform_registry import platform_registry

            media_files = media_files or []
            max_len = 0
            entry = platform_registry.get("arinova")
            if entry and entry.max_message_length > 0:
                max_len = entry.max_message_length
            chunks = BasePlatformAdapter.truncate_message(message, max_len) if max_len else [message]
            if not chunks:
                chunks = [""]

            last_result = None
            for index, chunk in enumerate(chunks):
                result = await send_message_tool._send_via_adapter(
                    platform,
                    pconfig,
                    chat_id,
                    chunk,
                    thread_id=thread_id,
                    media_files=media_files if index == len(chunks) - 1 else [],
                    force_document=force_document,
                )
                if isinstance(result, dict) and result.get("error"):
                    return result
                last_result = result
            return last_result

        send_to_platform._arinova_compat = True
        send_message_tool._send_to_platform = send_to_platform


def _tool_report_value_summary(value: Any) -> dict[str, Any]:
    """Return an allowlisted shape summary without serializing tool content."""
    if value is None:
        return {"type": "null"}
    if isinstance(value, dict):
        return {"type": "object", "fieldCount": len(value)}
    if isinstance(value, (list, tuple)):
        return {"type": "array", "itemCount": len(value)}
    if isinstance(value, str):
        return {"type": "string", "charCount": len(value)}
    if isinstance(value, bool):
        return {"type": "boolean"}
    if isinstance(value, (int, float)):
        return {"type": "number"}
    return {"type": "other"}


def _tool_report_duration_ms(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _tool_report_success(status: str, error_message: Any, error_type: Any = None) -> bool:
    if error_message or error_type:
        return False
    normalized = status.strip().lower()
    if not normalized:
        return True
    return normalized in {"ok", "success", "succeeded"}


def _tool_report_seq(session_id: str, turn_id: str) -> int:
    key = f"{session_id or 'unknown-session'}:{turn_id or 'unknown-turn'}"
    with _tool_report_lock:
        seq = _tool_report_turn_counts.get(key, 0)
        _tool_report_turn_counts[key] = seq + 1
        if len(_tool_report_turn_counts) > 512:
            for stale_key in list(_tool_report_turn_counts)[:256]:
                _tool_report_turn_counts.pop(stale_key, None)
        return seq


def _active_report_context(adapter: Any, *, session_id: str, task_id: str) -> tuple[str, str] | None:
    session_by_task = getattr(adapter, "_session_by_task", {})
    if not isinstance(session_by_task, dict) or not session_by_task:
        return None
    session_id = session_id.strip()
    task_id = task_id.strip()
    if task_id and task_id in session_by_task:
        return task_id, str(session_by_task.get(task_id) or session_id)
    if session_id:
        for candidate_task_id, candidate_session_id in session_by_task.items():
            if str(candidate_session_id).strip() == session_id:
                return str(candidate_task_id), session_id
    return None


def _on_post_tool_call(**kwargs: Any) -> None:
    adapter = get_active_adapter()
    if adapter is None:
        return
    is_running = getattr(adapter, "is_running", None)
    if callable(is_running) and not is_running():
        return
    is_connected_value = getattr(adapter, "is_connected", None)
    if callable(is_connected_value):
        if not is_connected_value():
            return
    elif is_connected_value is not None and not is_connected_value:
        return

    loop = getattr(adapter, "_loop", None)
    if loop is None or not loop.is_running():
        return

    session_id = str(kwargs.get("session_id") or "").strip()
    hook_task_id = str(kwargs.get("task_id") or "").strip()
    active_context = _active_report_context(adapter, session_id=session_id, task_id=hook_task_id)
    if not active_context:
        return
    active_task_id, active_session_id = active_context

    tool_name = str(kwargs.get("tool_name") or kwargs.get("function_name") or "")
    raw_args = kwargs.get("args")
    if raw_args is None:
        raw_args = kwargs.get("function_args")
    turn_id = str(kwargs.get("turn_id") or "")
    status = str(kwargs.get("status") or "")
    error_message = kwargs.get("error_message")
    error_type = kwargs.get("error_type")
    success = _tool_report_success(status, error_message, error_type)
    report = {
        "sessionId": active_session_id,
        "turnId": turn_id,
        "seqOrder": _tool_report_seq(active_session_id, turn_id),
        "toolName": tool_name,
        "input": _tool_report_value_summary(raw_args if isinstance(raw_args, dict) else {}),
        "durationMs": _tool_report_duration_ms(kwargs.get("duration_ms")),
        "success": success,
    }
    if not success:
        report["error"] = "tool_failed"
    if success:
        report["output"] = _tool_report_value_summary(kwargs.get("result"))
    message_by_task = getattr(adapter, "_message_by_task", {})
    if isinstance(message_by_task, dict):
        report["messageId"] = str(message_by_task.get(active_task_id) or active_task_id)
    else:
        report["messageId"] = active_task_id

    future = asyncio.run_coroutine_threadsafe(adapter.call_agent_sdk("reportToolCall", report), loop)

    def _log_failure(done):
        try:
            done.result()
        except Exception as exc:
            logger.debug("Arinova: failed to report Hermes tool call %s: %s", tool_name, exc)

    future.add_done_callback(_log_failure)


def register(ctx):
    _install_send_message_compat()
    ctx.register_platform(
        name="arinova",
        label="Arinova Chat",
        adapter_factory=lambda cfg: ArinovaAdapter(cfg),
        check_fn=check_requirements,
        validate_config=validate_config,
        is_connected=is_connected,
        required_env=["ARINOVA_SERVER_URL", "ARINOVA_BOT_TOKEN"],
        install_hint="Run `npm install` inside the plugin sidecar directory.",
        env_enablement_fn=env_enablement,
        allowed_users_env="ARINOVA_ALLOWED_USERS",
        allow_all_env="ARINOVA_ALLOW_ALL_USERS",
        cron_deliver_env_var="ARINOVA_HOME_CONVERSATION",
        standalone_sender_fn=standalone_send,
        apply_yaml_config_fn=_apply_yaml_config,
        platform_hint=(
            "You are responding inside Arinova Chat. Keep replies concise, "
            "use Markdown when useful, and assume the user can see streamed progress."
        ),
    )
    ctx.register_hook("post_tool_call", _on_post_tool_call)
    register_tools(ctx)
