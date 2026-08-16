"""Hermes platform adapter for Arinova Chat.

The Arinova SDK is TypeScript-only, so this adapter supervises a tiny Node
sidecar. The sidecar owns the @arinova-ai/agent-sdk websocket connection and
bridges tasks over loopback HTTP.
"""

from __future__ import annotations

import asyncio
import base64
from collections import deque
import hmac
import http.client
import inspect
import ipaddress
import json
import logging
import math
import os
import secrets
import shutil
import socket
import ssl
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, Dict, Optional

try:
    from ._runtime_contract import (
        CONCURRENCY_MODES,
        DEFAULT_ADAPTER_PORT,
        DEFAULT_ATTACHMENT_ERROR_BODY_MAX_BYTES,
        DEFAULT_ATTACHMENT_MAX_BYTES,
        DEFAULT_ATTACHMENT_MAX_COUNT,
        DEFAULT_ATTACHMENT_TOTAL_MAX_BYTES,
        DEFAULT_ATTACHMENT_TOTAL_TIMEOUT_MS,
        DEFAULT_BIND,
        DEFAULT_CONNECT_TIMEOUT_MS,
        DEFAULT_CONTROL_MAX_BODY_BYTES,
        DEFAULT_SIDECAR_PORT,
        DEFAULT_SIDECAR_POST_TIMEOUT_MS,
    )
except ImportError:  # Support Hermes loading adapter.py as a top-level module.
    from _runtime_contract import (  # type: ignore[no-redef]
        CONCURRENCY_MODES,
        DEFAULT_ADAPTER_PORT,
        DEFAULT_ATTACHMENT_ERROR_BODY_MAX_BYTES,
        DEFAULT_ATTACHMENT_MAX_BYTES,
        DEFAULT_ATTACHMENT_MAX_COUNT,
        DEFAULT_ATTACHMENT_TOTAL_MAX_BYTES,
        DEFAULT_ATTACHMENT_TOTAL_TIMEOUT_MS,
        DEFAULT_BIND,
        DEFAULT_CONNECT_TIMEOUT_MS,
        DEFAULT_CONTROL_MAX_BODY_BYTES,
        DEFAULT_SIDECAR_PORT,
        DEFAULT_SIDECAR_POST_TIMEOUT_MS,
    )

try:
    from ._attachments import (
        attachment_urlopen as _attachment_urlopen_impl,
        attachments_section as _attachments_section_impl,
        cache_media_bytes,
        collect_attachment_media as _collect_attachment_media_impl,
        download_attachment_bytes as _download_attachment_bytes_impl,
        download_attachment_media as _download_attachment_media_impl,
        history_section as _history_section_impl,
        members_section as _members_section_impl,
        message_type_for_media as _message_type_for_media_impl,
        metadata_section as _metadata_section_impl,
        reply_section as _reply_section_impl,
        skills_section as _skills_section_impl,
        task_text as _task_text_impl,
    )
    from ._http import (
        AttachmentRedirectHandler as _AttachmentRedirectHandler,
        PinnedHTTPConnection as _PinnedHTTPConnection,
        PinnedHTTPHandler as _PinnedHTTPHandler,
        PinnedHTTPSConnection as _PinnedHTTPSConnection,
        PinnedHTTPSHandler as _PinnedHTTPSHandler,
        bridge_tokens_equal as _bridge_tokens_equal,
        callback_content_length as _callback_content_length,
        is_json_content_type as _is_json_content_type,
        json_safe as _json_safe,
        reject_duplicate_json_keys as _reject_duplicate_json_keys,
        reject_json_constant as _reject_json_constant,
        resolve_public_http_url as _resolve_public_http_url,
        urlopen_json as _urlopen_json,
        validate_public_http_url as _validate_public_http_url,
    )
    from ._sidecar import (
        ADAPTER_CALLBACK_FIELDS,
        ADAPTER_CALLBACK_REQUIRED_FIELDS,
        DEFAULT_SDK_ROOT,
        SDK_DIST_FILES,
        SDK_PACKAGE_FILES,
        SDK_PACKAGE_PUBLIC_METADATA_KEYS,
        SIDECAR_DIR,
        SIDECAR_JS_CHECK_FILES,
        drain_sidecar_logs as _drain_sidecar_logs_impl,
        local_sdk_package as _local_sdk_package,
        node_syntax_error as _node_syntax_error_impl,
        node_version_supported as _node_version_supported,
        post_sidecar as _post_sidecar_impl,
        sdk_package_file_drift as _sdk_package_file_drift,
        sdk_public_metadata as _sdk_public_metadata,
        sidecar_dependency_error as _sidecar_dependency_error_impl,
        sidecar_env as _sidecar_env_impl,
        sidecar_exit_error as _sidecar_exit_error_impl,
        sidecar_lockfile_error as _sidecar_lockfile_error_impl,
        sidecar_sdk_package as _sidecar_sdk_package_impl,
        start_inbound_server as _start_inbound_server_impl,
        start_sidecar as _start_sidecar_impl,
        validate_adapter_callback_payload as _validate_adapter_callback_payload,
        wait_for_sidecar as _wait_for_sidecar_impl,
    )
except ImportError:
    from _attachments import (  # type: ignore[no-redef]
        attachment_urlopen as _attachment_urlopen_impl,
        attachments_section as _attachments_section_impl,
        cache_media_bytes,
        collect_attachment_media as _collect_attachment_media_impl,
        download_attachment_bytes as _download_attachment_bytes_impl,
        download_attachment_media as _download_attachment_media_impl,
        history_section as _history_section_impl,
        members_section as _members_section_impl,
        message_type_for_media as _message_type_for_media_impl,
        metadata_section as _metadata_section_impl,
        reply_section as _reply_section_impl,
        skills_section as _skills_section_impl,
        task_text as _task_text_impl,
    )
    from _http import (  # type: ignore[no-redef]
        AttachmentRedirectHandler as _AttachmentRedirectHandler,
        PinnedHTTPConnection as _PinnedHTTPConnection,
        PinnedHTTPHandler as _PinnedHTTPHandler,
        PinnedHTTPSConnection as _PinnedHTTPSConnection,
        PinnedHTTPSHandler as _PinnedHTTPSHandler,
        bridge_tokens_equal as _bridge_tokens_equal,
        callback_content_length as _callback_content_length,
        is_json_content_type as _is_json_content_type,
        json_safe as _json_safe,
        reject_duplicate_json_keys as _reject_duplicate_json_keys,
        reject_json_constant as _reject_json_constant,
        resolve_public_http_url as _resolve_public_http_url,
        urlopen_json as _urlopen_json,
        validate_public_http_url as _validate_public_http_url,
    )
    from _sidecar import (  # type: ignore[no-redef]
        ADAPTER_CALLBACK_FIELDS,
        ADAPTER_CALLBACK_REQUIRED_FIELDS,
        DEFAULT_SDK_ROOT,
        SDK_DIST_FILES,
        SDK_PACKAGE_FILES,
        SDK_PACKAGE_PUBLIC_METADATA_KEYS,
        SIDECAR_DIR,
        SIDECAR_JS_CHECK_FILES,
        drain_sidecar_logs as _drain_sidecar_logs_impl,
        local_sdk_package as _local_sdk_package,
        node_syntax_error as _node_syntax_error_impl,
        node_version_supported as _node_version_supported,
        post_sidecar as _post_sidecar_impl,
        sdk_package_file_drift as _sdk_package_file_drift,
        sdk_public_metadata as _sdk_public_metadata,
        sidecar_dependency_error as _sidecar_dependency_error_impl,
        sidecar_env as _sidecar_env_impl,
        sidecar_exit_error as _sidecar_exit_error_impl,
        sidecar_lockfile_error as _sidecar_lockfile_error_impl,
        sidecar_sdk_package as _sidecar_sdk_package_impl,
        start_inbound_server as _start_inbound_server_impl,
        start_sidecar as _start_sidecar_impl,
        validate_adapter_callback_payload as _validate_adapter_callback_payload,
        wait_for_sidecar as _wait_for_sidecar_impl,
    )

from gateway.config import Platform, PlatformConfig
from gateway.platforms.base import (
    BasePlatformAdapter,
    MessageEvent,
    MessageType,
    ProcessingOutcome,
    SendResult,
)
from gateway.session import build_session_key

logger = logging.getLogger(__name__)

SDK_UPLOAD_MIME_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "pdf": "application/pdf",
    "txt": "text/plain",
    "csv": "text/csv",
    "json": "application/json",
}
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
_active_adapter: "ArinovaAdapter | None" = None
_TRUE_PAYLOAD_VALUES = {"1", "true", "yes", "on"}
_FALSE_PAYLOAD_VALUES = {"0", "false", "no", "off"}
POSITIVE_INT_SETTINGS = (
    ("ARINOVA_SIDECAR_PORT", "sidecar_port"),
    ("ARINOVA_ADAPTER_PORT", "adapter_port"),
    ("ARINOVA_RECONNECT_INTERVAL_MS", "reconnect_interval_ms"),
    ("ARINOVA_PING_INTERVAL_MS", "ping_interval_ms"),
    ("ARINOVA_PING_TIMEOUT_MS", "ping_timeout_ms"),
    ("ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION", "max_consecutive_per_conversation"),
    ("ARINOVA_CONNECT_TIMEOUT_MS", "connect_timeout_ms"),
    ("ARINOVA_ADAPTER_POST_TIMEOUT_MS", "adapter_post_timeout_ms"),
    ("ARINOVA_SIDECAR_POST_TIMEOUT_MS", "sidecar_post_timeout_ms"),
    ("ARINOVA_ATTACHMENT_TOTAL_TIMEOUT_MS", "attachment_total_timeout_ms"),
    ("ARINOVA_CONTROL_MAX_BODY_BYTES", "control_max_body_bytes"),
)
# Settings where 0 has a defined meaning: attachment_max_count=0 and
# attachment_max_bytes=0 (and a 0 aggregate byte budget) disable attachment
# downloads, and the SDK explicitly supports maxQueuedTasks=0 (never queue).
NONNEGATIVE_INT_SETTINGS = (
    ("ARINOVA_MAX_QUEUED_TASKS", "max_queued_tasks"),
    ("ARINOVA_ATTACHMENT_MAX_BYTES", "attachment_max_bytes"),
    ("ARINOVA_ATTACHMENT_MAX_COUNT", "attachment_max_count"),
    ("ARINOVA_ATTACHMENT_TOTAL_MAX_BYTES", "attachment_total_max_bytes"),
)
INT_SETTINGS = POSITIVE_INT_SETTINGS + NONNEGATIVE_INT_SETTINGS
_ZERO_ALLOWED_INT_ENV_NAMES = frozenset(env_name for env_name, _ in NONNEGATIVE_INT_SETTINGS)

def _truthy(value: str | None, default: bool = False) -> bool:
    if value is None or value == "":
        return default
    return value.strip().lower() in _TRUE_PAYLOAD_VALUES


def _truthy_setting(name: str, extra_value: Any, default: bool = False) -> bool:
    if name in os.environ:
        return _truthy(os.getenv(name), default)
    if isinstance(extra_value, bool):
        return extra_value
    if extra_value in (None, ""):
        return default
    return _truthy(str(extra_value), default)


def _payload_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value in (None, ""):
        return default
    return _truthy(str(value), default)


def _payload_bool_or_none(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if value in (None, ""):
        return None
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in _TRUE_PAYLOAD_VALUES:
            return True
        if normalized in _FALSE_PAYLOAD_VALUES:
            return False
    return None


def _nonempty_str(value: Any) -> str:
    if value in (None, ""):
        return ""
    return str(value).strip()


def _first_nonempty_str(*values: Any) -> str:
    for value in values:
        normalized = _nonempty_str(value)
        if normalized:
            return normalized
    return ""


def _parse_nonnegative_int(value: Any) -> int | None:
    if value in (None, "") or isinstance(value, bool) or isinstance(value, float):
        return None
    if isinstance(value, int):
        parsed = value
    elif isinstance(value, str):
        normalized = value.strip()
        if not normalized.isdecimal():
            return None
        parsed = int(normalized)
    else:
        return None
    return parsed if parsed >= 0 else None


def _zero_allowed_for(name: str) -> bool:
    return name in _ZERO_ALLOWED_INT_ENV_NAMES


def _parse_int_setting(value: Any, *, allow_zero: bool) -> int | None:
    parsed = _parse_nonnegative_int(value)
    if parsed is None or (parsed == 0 and not allow_zero):
        return None
    return parsed


def _int_env(name: str, default: int) -> int:
    value = _parse_int_setting(os.getenv(name, ""), allow_zero=_zero_allowed_for(name))
    return default if value is None else value


def _int_setting(name: str, extra_value: Any, default: int) -> int:
    extra_default = _parse_int_setting(extra_value, allow_zero=_zero_allowed_for(name))
    if extra_default is None:
        extra_default = default
    return _int_env(name, extra_default)


def _optional_int_setting(name: str, extra_value: Any) -> int | None:
    raw = os.getenv(name) if name in os.environ else extra_value
    return _parse_int_setting(raw, allow_zero=_zero_allowed_for(name))


def _valid_int_setting_value(value: Any, *, allow_zero: bool) -> bool:
    if value in (None, "") or isinstance(value, bool):
        return value in (None, "")
    return _parse_int_setting(value, allow_zero=allow_zero) is not None


def _valid_int_settings(extra: dict[str, Any]) -> bool:
    for env_name, extra_key in INT_SETTINGS:
        allow_zero = _zero_allowed_for(env_name)
        if env_name in os.environ:
            if not _valid_int_setting_value(os.getenv(env_name), allow_zero=allow_zero):
                return False
            continue
        if extra_key in extra and not _valid_int_setting_value(extra.get(extra_key), allow_zero=allow_zero):
            return False
    return True


def _concurrency_mode_setting(extra: dict[str, Any]) -> str:
    return str(
        os.getenv("ARINOVA_CONCURRENCY_MODE")
        or os.getenv("ARINOVA_AGENT_CONCURRENCY_MODE")
        or extra.get("concurrency_mode")
        or extra.get("agent_concurrency_mode")
        or "per-conversation"
    )


def _agent_skills_raw_setting(extra: dict[str, Any]) -> Any:
    if os.getenv("ARINOVA_AGENT_SKILLS_JSON"):
        return os.getenv("ARINOVA_AGENT_SKILLS_JSON")
    if os.getenv("ARINOVA_AGENT_SKILLS"):
        return os.getenv("ARINOVA_AGENT_SKILLS")
    if extra.get("agent_skills_json") not in (None, ""):
        return extra.get("agent_skills_json")
    return extra.get("agent_skills")


def _agent_skills_json_setting(extra: dict[str, Any]) -> str:
    raw = extra.get("agent_skills_json")
    if raw in (None, "") and extra.get("agent_skills") not in (None, ""):
        skills = extra.get("agent_skills")
        return skills if isinstance(skills, str) else json.dumps(skills, allow_nan=False)
    if isinstance(raw, str):
        return raw
    return json.dumps(raw, allow_nan=False) if raw not in (None, "") else ""


def _valid_agent_skills_setting(extra: dict[str, Any]) -> bool:
    raw = _agent_skills_raw_setting(extra)
    if raw in (None, ""):
        return True
    try:
        skills = (
            json.loads(
                raw,
                parse_constant=_reject_json_constant,
                object_pairs_hook=_reject_duplicate_json_keys,
            )
            if isinstance(raw, str)
            else raw
        )
        json.dumps(skills, allow_nan=False)
    except (TypeError, ValueError, json.JSONDecodeError):
        return False
    if not isinstance(skills, list):
        return False
    skill_ids: set[str] = set()
    for skill in skills:
        if (
            not isinstance(skill, dict)
            or not isinstance(skill.get("id"), str)
            or not isinstance(skill.get("name"), str)
            or not isinstance(skill.get("description"), str)
        ):
            return False
        if set(skill) - {"id", "name", "description"}:
            return False
        skill_id = skill["id"].strip()
        if not skill_id or not skill["name"].strip() or skill_id in skill_ids:
            return False
        skill_ids.add(skill_id)
    return True


def _redact(value: str, keep: int = 6) -> str:
    if not value:
        return ""
    if len(value) <= keep:
        return "***"
    return f"{value[:keep]}..."



def _mention_values(value: Any) -> list[str]:
    mentions: list[str] = []
    if value in (None, ""):
        return mentions
    if isinstance(value, dict):
        for key in ("id", "userId", "agentId", "user_id", "agent_id"):
            if value.get(key):
                mentions.extend(_mention_values(value.get(key)))
                return mentions
        return mentions
    if isinstance(value, (list, tuple, set)):
        for item in value:
            mentions.extend(_mention_values(item))
        return mentions
    mention = str(value).strip()
    if mention:
        mentions.append(mention)
    return mentions


def _metadata_mentions(metadata: Optional[Dict[str, Any]]) -> list[str]:
    if not isinstance(metadata, dict):
        return []
    collected: list[str] = []
    for key in ("mentions", "arinova_mentions", "complete_mentions"):
        collected.extend(_mention_values(metadata.get(key)))
    arinova = metadata.get("arinova")
    if isinstance(arinova, dict):
        for key in ("mentions", "complete_mentions"):
            collected.extend(_mention_values(arinova.get(key)))

    seen: set[str] = set()
    result: list[str] = []
    for mention in collected:
        if mention in seen:
            continue
        seen.add(mention)
        result.append(mention)
    return result


def _first_str(mapping: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = mapping.get(key)
        if value not in (None, ""):
            return str(value)
    return None


def _server_http_url(server_url: str) -> str:
    return server_url.rstrip("/").replace("ws://", "http://", 1).replace("wss://", "https://", 1)


def _multipart_header_value(value: str) -> str:
    return str(value).replace("\\", "\\\\").replace('"', '\\"').replace("\r", "_").replace("\n", "_")


def _sdk_mime_type(file_name: str) -> str:
    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    return SDK_UPLOAD_MIME_TYPES.get(ext, "application/octet-stream")



def _send_message_http(server_url: str, bot_token: str, conversation_id: str, content: str) -> dict:
    url = f"{_server_http_url(server_url)}/api/v1/messages/send"
    payload = json.dumps({"conversationId": conversation_id, "content": content}, allow_nan=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {bot_token}",
            "Content-Type": "application/json",
        },
    )
    return _urlopen_json(req, timeout=10, label="sendMessage")


def _upload_file_http(server_url: str, bot_token: str, conversation_id: str, media_path: str) -> dict:
    path = Path(media_path).expanduser()
    data = path.read_bytes()
    file_name = path.name
    file_type = _sdk_mime_type(file_name)
    boundary = f"----hermes-arinova-{secrets.token_hex(16)}"

    def field(name: str, value: str) -> bytes:
        return (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
            f"{value}\r\n"
        ).encode("utf-8")

    body = b"".join(
        [
            field("conversationId", conversation_id),
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="file"; filename="{_multipart_header_value(file_name)}"\r\n'
                f"Content-Type: {file_type}\r\n\r\n"
            ).encode("utf-8"),
            data,
            f"\r\n--{boundary}--\r\n".encode("utf-8"),
        ]
    )
    req = urllib.request.Request(
        f"{_server_http_url(server_url)}/api/v1/files/upload",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {bot_token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    return _urlopen_json(req, timeout=30, label="uploadFile")


def _sdk_upload_result(upload: dict, *, is_voice: bool = False) -> dict:
    url = upload.get("url")
    if not isinstance(url, str) or not url:
        raise RuntimeError("uploadFile response missing url")
    file_name = upload.get("fileName")
    if not isinstance(file_name, str) or not file_name:
        raise RuntimeError("uploadFile response missing fileName")
    file_type = upload.get("fileType")
    if not isinstance(file_type, str) or not file_type:
        raise RuntimeError("uploadFile response missing fileType")
    file_size = upload.get("fileSize")
    if isinstance(file_size, bool) or not isinstance(file_size, (int, float)):
        raise RuntimeError("uploadFile response missing fileSize")
    if not math.isfinite(file_size):
        raise RuntimeError("uploadFile response fileSize must be finite")
    uploaded_item = {
        "url": url,
        "fileName": file_name,
        "fileType": file_type,
        "fileSize": file_size,
    }
    if is_voice:
        uploaded_item["isVoice"] = True
    return uploaded_item


async def standalone_send(
    pconfig: PlatformConfig,
    chat_id: str,
    message: str,
    *,
    thread_id: str | None = None,
    media_files: list | None = None,
    force_document: bool = False,
) -> dict:
    """Send an Arinova message without a live Hermes gateway adapter."""
    extra = pconfig.extra or {}
    server_url = _first_nonempty_str(os.getenv("ARINOVA_SERVER_URL"), extra.get("server_url"))
    bot_token = _first_nonempty_str(os.getenv("ARINOVA_BOT_TOKEN"), pconfig.token, extra.get("bot_token"))
    if not server_url or not bot_token:
        return {"error": "ARINOVA_SERVER_URL and ARINOVA_BOT_TOKEN must be configured"}

    warnings = []
    if thread_id:
        warnings.append("thread_id was ignored for arinova; route by conversation id")

    try:
        uploaded = []
        for item in media_files or []:
            media_path, is_voice = _standalone_media_item(item)
            upload = await asyncio.to_thread(_upload_file_http, server_url, bot_token, str(chat_id), str(media_path))
            uploaded.append(_sdk_upload_result(upload, is_voice=is_voice))
        content = message
        if uploaded:
            lines = [f"- {item['fileName']}: {item['url']}" for item in uploaded]
            content = "\n\n".join(part for part in [message.strip(), "Attachments:\n" + "\n".join(lines)] if part)
            if force_document:
                warnings.append("force_document was ignored for arinova; files are uploaded as SDK attachments")
            if any(item.get("isVoice") for item in uploaded):
                warnings.append("audio_as_voice was ignored for arinova; files are uploaded as SDK attachments")
        response = await asyncio.to_thread(_send_message_http, server_url, bot_token, str(chat_id), content)
    except Exception as exc:
        return {"error": f"Arinova standalone send failed: {exc}"}

    result: dict[str, Any] = {"success": True}
    message_id = response.get("messageId") or response.get("id")
    if message_id:
        result["message_id"] = message_id
    if uploaded:
        result["uploads"] = uploaded
    if warnings:
        result["warnings"] = warnings
    return result


def _standalone_media_item(item: Any) -> tuple[str, bool]:
    if isinstance(item, (list, tuple)):
        if not item:
            raise ValueError("media_files entries must include a path")
        return str(item[0]), bool(item[1]) if len(item) > 1 else False
    return str(item), False


def check_requirements() -> bool:
    node_bin = os.getenv("ARINOVA_NODE_BIN") or "node"
    if not shutil.which(node_bin):
        return False
    if not _node_version_supported(node_bin):
        return False
    if _sidecar_dependency_error(node_bin):
        return False
    return True


def _sidecar_sdk_package() -> Path:
    return _sidecar_sdk_package_impl(SIDECAR_DIR)


def _sidecar_lockfile_error(
    sidecar_package: dict[str, Any],
    sdk_package: dict[str, Any],
) -> str | None:
    return _sidecar_lockfile_error_impl(
        sidecar_package,
        sdk_package,
        sidecar_dir=SIDECAR_DIR,
    )


def _node_syntax_error(node_bin: str, relative_path: str) -> str | None:
    return _node_syntax_error_impl(
        node_bin,
        relative_path,
        sidecar_dir=SIDECAR_DIR,
    )


def _sidecar_dependency_error(
    node_bin: str | None = None,
    sdk_root: str | Path | None = None,
) -> str | None:
    return _sidecar_dependency_error_impl(
        node_bin,
        sdk_root,
        sidecar_dir=SIDECAR_DIR,
    )



def validate_config(cfg: PlatformConfig) -> bool:
    extra = cfg.extra or {}
    server_url = _first_nonempty_str(os.getenv("ARINOVA_SERVER_URL"), extra.get("server_url"))
    bot_token = _first_nonempty_str(os.getenv("ARINOVA_BOT_TOKEN"), cfg.token, extra.get("bot_token"))
    concurrency_mode = _concurrency_mode_setting(extra)
    return bool(
        server_url
        and bot_token
        and concurrency_mode in CONCURRENCY_MODES
        and _valid_agent_skills_setting(extra)
        and _valid_int_settings(extra)
    )


def is_connected(cfg: PlatformConfig) -> bool:
    return validate_config(cfg)


def env_enablement() -> Optional[dict]:
    server_url = os.getenv("ARINOVA_SERVER_URL", "").strip()
    bot_token = os.getenv("ARINOVA_BOT_TOKEN", "").strip()
    if not server_url or not bot_token:
        return None
    return {
        "server_url": server_url,
        "bot_token": bot_token,
        "home_channel": {
            "chat_id": os.getenv("ARINOVA_HOME_CONVERSATION", "arinova"),
            "name": os.getenv("ARINOVA_HOME_CONVERSATION_NAME", "Arinova Chat"),
        },
    }


def get_active_adapter() -> "ArinovaAdapter | None":
    return _active_adapter


class ArinovaAdapter(BasePlatformAdapter):
    """Bridge Hermes gateway turns to Arinova Chat tasks."""

    supports_code_blocks = True
    supports_async_delivery = False
    splits_long_messages = False

    def __init__(self, config: PlatformConfig):
        super().__init__(config, Platform("arinova"))
        extra = config.extra or {}

        self.server_url = _first_nonempty_str(os.getenv("ARINOVA_SERVER_URL"), extra.get("server_url")).rstrip("/")
        self.bot_token = _first_nonempty_str(os.getenv("ARINOVA_BOT_TOKEN"), config.token, extra.get("bot_token"))
        self.sidecar_port = _int_setting("ARINOVA_SIDECAR_PORT", extra.get("sidecar_port"), DEFAULT_SIDECAR_PORT)
        self.adapter_port = _int_setting("ARINOVA_ADAPTER_PORT", extra.get("adapter_port"), DEFAULT_ADAPTER_PORT)
        self.bind_host = os.getenv("ARINOVA_ADAPTER_BIND") or str(extra.get("adapter_bind") or DEFAULT_BIND)
        self.sidecar_host = os.getenv("ARINOVA_SIDECAR_BIND") or str(extra.get("sidecar_bind") or DEFAULT_BIND)
        self.agent_skills_json = (
            os.getenv("ARINOVA_AGENT_SKILLS_JSON")
            or os.getenv("ARINOVA_AGENT_SKILLS")
            or _agent_skills_json_setting(extra)
        )
        self.concurrency_mode = _concurrency_mode_setting(extra)
        self.reconnect_interval_ms = _optional_int_setting(
            "ARINOVA_RECONNECT_INTERVAL_MS",
            extra.get("reconnect_interval_ms"),
        )
        self.ping_interval_ms = _optional_int_setting("ARINOVA_PING_INTERVAL_MS", extra.get("ping_interval_ms"))
        self.ping_timeout_ms = _optional_int_setting("ARINOVA_PING_TIMEOUT_MS", extra.get("ping_timeout_ms"))
        self.max_consecutive_per_conversation = _optional_int_setting(
            "ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION",
            extra.get("max_consecutive_per_conversation"),
        )
        self.max_queued_tasks = _optional_int_setting(
            "ARINOVA_MAX_QUEUED_TASKS",
            extra.get("max_queued_tasks"),
        )
        self.adapter_post_timeout_ms = _optional_int_setting(
            "ARINOVA_ADAPTER_POST_TIMEOUT_MS",
            extra.get("adapter_post_timeout_ms"),
        )
        self.control_max_body_bytes = _int_setting(
            "ARINOVA_CONTROL_MAX_BODY_BYTES",
            extra.get("control_max_body_bytes"),
            DEFAULT_CONTROL_MAX_BODY_BYTES,
        )
        self.sidecar_post_timeout_ms = _int_setting(
            "ARINOVA_SIDECAR_POST_TIMEOUT_MS",
            extra.get("sidecar_post_timeout_ms"),
            DEFAULT_SIDECAR_POST_TIMEOUT_MS,
        )
        self.connect_timeout_ms = _int_setting(
            "ARINOVA_CONNECT_TIMEOUT_MS",
            extra.get("connect_timeout_ms"),
            DEFAULT_CONNECT_TIMEOUT_MS,
        )
        self.download_attachments = _truthy_setting(
            "ARINOVA_DOWNLOAD_ATTACHMENTS",
            extra.get("download_attachments"),
            True,
        )
        self.allow_bots = (
            os.getenv("ARINOVA_ALLOW_BOTS")
            or extra.get("allow_bots")
            or "none"
        )
        self.attachment_max_bytes = _int_setting(
            "ARINOVA_ATTACHMENT_MAX_BYTES",
            extra.get("attachment_max_bytes"),
            DEFAULT_ATTACHMENT_MAX_BYTES,
        )
        self.attachment_max_count = _int_setting(
            "ARINOVA_ATTACHMENT_MAX_COUNT",
            extra.get("attachment_max_count"),
            DEFAULT_ATTACHMENT_MAX_COUNT,
        )
        self.attachment_total_max_bytes = _int_setting(
            "ARINOVA_ATTACHMENT_TOTAL_MAX_BYTES",
            extra.get("attachment_total_max_bytes"),
            DEFAULT_ATTACHMENT_TOTAL_MAX_BYTES,
        )
        self.attachment_total_timeout_ms = _int_setting(
            "ARINOVA_ATTACHMENT_TOTAL_TIMEOUT_MS",
            extra.get("attachment_total_timeout_ms"),
            DEFAULT_ATTACHMENT_TOTAL_TIMEOUT_MS,
        )
        self.autostart_sidecar = _truthy_setting(
            "ARINOVA_SIDECAR_AUTOSTART",
            extra.get("sidecar_autostart"),
            True,
        )
        self.node_bin = os.getenv("ARINOVA_NODE_BIN") or str(extra.get("node_bin") or "node")
        self.agent_sdk_root = os.getenv("ARINOVA_AGENT_SDK_ROOT") or extra.get("agent_sdk_root")
        self._shared_token = os.getenv("ARINOVA_BRIDGE_TOKEN") or secrets.token_urlsafe(32)

        self._loop: asyncio.AbstractEventLoop | None = None
        self._httpd: ThreadingHTTPServer | None = None
        self._http_thread: threading.Thread | None = None
        self._sidecar_proc: subprocess.Popen | None = None
        self._sidecar_log_tail: deque[str] = deque(maxlen=20)
        self._sidecar_log_thread: threading.Thread | None = None

        self._task_by_conversation: dict[str, str] = {}
        self._conversation_by_task: dict[str, str] = {}
        self._task_context_by_task: dict[str, dict[str, Any]] = {}
        self._conversation_info_by_id: dict[str, dict[str, str]] = {}
        self._buffer_by_task: dict[str, list[str]] = {}
        self._mentions_by_task: dict[str, list[str]] = {}
        self._session_by_task: dict[str, str] = {}
        self._message_by_task: dict[str, str] = {}
        self._task_started_at: dict[str, float] = {}
        self._claimed_agent_id: str | None = None
        self._claimed_permanent_token: str | None = None
        self._onboarding_seed: dict[str, Any] | None = None
        self._last_sdk_error: str | None = None

    @property
    def name(self) -> str:
        return "Arinova Chat"

    async def connect(self, *, is_reconnect: bool = False) -> bool:
        global _active_adapter
        if not self.server_url or not self.bot_token:
            self._set_fatal_error(
                "config_missing",
                "ARINOVA_SERVER_URL and ARINOVA_BOT_TOKEN must be configured",
                retryable=False,
            )
            return False

        self._loop = asyncio.get_running_loop()
        try:
            self._start_inbound_server()
            if self.autostart_sidecar:
                self._start_sidecar()
            await self._wait_for_sidecar()
        except Exception as exc:
            logger.error("Arinova: connect failed: %s", exc, exc_info=True)
            self._set_fatal_error("connect_failed", str(exc), retryable=True)
            await self.disconnect()
            return False

        self._mark_connected()
        _active_adapter = self
        logger.info(
            "Arinova: connected via sidecar on %s:%s, adapter on %s:%s",
            self.sidecar_host,
            self.sidecar_port,
            self.bind_host,
            self.adapter_port,
        )
        return True

    async def disconnect(self) -> None:
        global _active_adapter
        self._mark_disconnected()
        self._loop = None
        self._clear_active_task_state()
        if _active_adapter is self:
            _active_adapter = None
        try:
            await asyncio.to_thread(self._post_sidecar, "/shutdown", {})
        except Exception:
            pass

        if self._sidecar_proc and self._sidecar_proc.poll() is None:
            self._sidecar_proc.terminate()
            try:
                await asyncio.to_thread(self._sidecar_proc.wait, 5)
            except Exception:
                self._sidecar_proc.kill()
                try:
                    await asyncio.to_thread(self._sidecar_proc.wait, 5)
                except Exception:
                    logger.debug("Arinova: sidecar process did not exit after kill", exc_info=True)
        self._sidecar_proc = None

        if self._httpd:
            await asyncio.to_thread(self._httpd.shutdown)
            await asyncio.to_thread(self._httpd.server_close)
        self._httpd = None
        self._http_thread = None

    async def send(
        self,
        chat_id: str,
        content: str,
        reply_to: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> SendResult:
        task_id = self._task_id_for_send(str(chat_id), metadata)
        text = self.format_message(content)
        if not task_id:
            try:
                await self.call_agent_sdk("sendMessage", str(chat_id), text)
                return SendResult(success=True)
            except Exception as exc:
                logger.warning("Arinova: failed to send proactive message to %s: %s", chat_id, exc)
                return SendResult(success=False, error=str(exc), retryable=True)

        self._buffer_by_task.setdefault(task_id, []).append(text)
        mentions = _metadata_mentions(metadata)
        if mentions:
            existing_mentions = self._mentions_by_task.setdefault(task_id, [])
            for mention in mentions:
                if mention not in existing_mentions:
                    existing_mentions.append(mention)

        try:
            await asyncio.to_thread(
                self._post_sidecar,
                "/chunk",
                {"taskId": task_id, "content": text},
            )
            return SendResult(success=True, message_id=task_id)
        except Exception as exc:
            logger.warning("Arinova: failed to stream chunk for %s: %s", task_id, exc)
            if "no active task" in str(exc):
                self._forget_task(task_id)
            return SendResult(success=False, error=str(exc), retryable=True)

    async def _upload_and_send_media(
        self,
        chat_id: str,
        file_path: str,
        *,
        caption: str | None = None,
        file_name: str | None = None,
        file_type: str | None = None,
        reply_to: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> SendResult:
        path = Path(file_path).expanduser()
        task_id = self._task_id_for_send(str(chat_id), metadata)
        try:
            if task_id and not self._task_conversation_id(task_id):
                raise RuntimeError(self._no_conversation_task_error(task_id, "uploadFile"))
            data = await asyncio.to_thread(path.read_bytes)
            resolved_name = file_name or path.name
            resolved_type = file_type or _sdk_mime_type(resolved_name)
            if task_id:
                upload = await self.call_task_sdk(task_id, "uploadFile", data, resolved_name, resolved_type)
            else:
                upload = await self.call_agent_sdk("uploadFile", str(chat_id), data, resolved_name, resolved_type)
        except Exception as exc:
            logger.warning("Arinova: failed to upload media %s to %s: %s", file_path, chat_id, exc)
            if task_id and "no active task" in str(exc):
                self._forget_task(task_id)
            return SendResult(success=False, error=str(exc), retryable=True)

        try:
            uploaded = _sdk_upload_result(upload or {})
        except Exception as exc:
            return SendResult(success=False, error=str(exc), retryable=True)
        url = uploaded["url"]
        name = uploaded["fileName"]
        attachment_line = f"Attachment: {name}: {url}"
        content = "\n\n".join(part for part in [(caption or "").strip(), attachment_line] if part)
        result = await self.send(str(chat_id), content, reply_to=reply_to, metadata=metadata)
        if result.success and url:
            result.raw_response = {"upload": upload}
        return result

    async def send_document(
        self,
        chat_id: str,
        file_path: str,
        caption: Optional[str] = None,
        file_name: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> SendResult:
        return await self._upload_and_send_media(
            chat_id,
            file_path,
            caption=caption,
            file_name=file_name,
            reply_to=reply_to,
            metadata=metadata,
        )

    async def send_image_file(
        self,
        chat_id: str,
        image_path: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> SendResult:
        return await self._upload_and_send_media(
            chat_id,
            image_path,
            caption=caption,
            file_type=_sdk_mime_type(image_path),
            reply_to=reply_to,
            metadata=metadata,
        )

    async def send_video(
        self,
        chat_id: str,
        video_path: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> SendResult:
        return await self._upload_and_send_media(
            chat_id,
            video_path,
            caption=caption,
            file_type=_sdk_mime_type(video_path),
            reply_to=reply_to,
            metadata=metadata,
        )

    async def send_voice(
        self,
        chat_id: str,
        audio_path: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> SendResult:
        return await self._upload_and_send_media(
            chat_id,
            audio_path,
            caption=caption,
            file_type=_sdk_mime_type(audio_path),
            reply_to=reply_to,
            metadata=metadata,
        )

    async def get_chat_info(self, chat_id: str) -> Dict[str, Any]:
        chat_id = str(chat_id)
        info = self._conversation_info_by_id.get(chat_id)
        if info:
            return {"chat_id": chat_id, **info}
        return {"chat_id": chat_id, "name": f"Arinova {chat_id}", "type": "dm"}

    def _task_id_value(self, value: Any) -> str:
        if value in (None, ""):
            return ""
        return str(value).strip()

    def _event_task_id(self, event: MessageEvent) -> str:
        raw = event.raw_message if isinstance(event.raw_message, dict) else {}
        return self._task_id_value(raw.get("taskId") or event.message_id)

    async def _send_task_update(self, task_id: str, data: dict[str, Any]) -> None:
        if not task_id:
            return
        try:
            await self.call_agent_sdk("sendTaskUpdate", self.name, data)
        except Exception as exc:
            logger.debug("Arinova: failed to send task update for %s: %s", task_id, exc)

    async def _send_task_telemetry(self, event: str, data: dict[str, Any]) -> None:
        try:
            await self.call_agent_sdk("sendTelemetry", event, data)
        except Exception as exc:
            logger.debug("Arinova: failed to send telemetry %s: %s", event, exc)

    async def on_processing_start(self, event: MessageEvent) -> None:
        task_id = self._event_task_id(event)
        if not task_id:
            return
        self._task_started_at[task_id] = time.monotonic()
        raw = event.raw_message if isinstance(event.raw_message, dict) else {}
        task_label = str(raw.get("taskKind") or raw.get("content") or task_id)
        await self._send_task_update(task_id, {"status": "started", "task": task_label[:200]})

    async def call_agent_sdk(self, method: str, *args: Any) -> Any:
        """Call an allowed global @arinova-ai/agent-sdk method through the sidecar."""
        response = await asyncio.to_thread(
            self._post_sidecar,
            "/agent-sdk",
            {"method": method, "args": _json_safe(list(args))},
        )
        self._raise_for_sidecar_control_response("/agent-sdk", response)
        result = response["result"]
        if method in VOID_AGENT_METHODS and result is not None:
            raise RuntimeError(f"/agent-sdk {method} returned non-null void result: {result!r}")
        return result

    async def call_task_sdk(self, task_id: str, method: str, *args: Any) -> Any:
        """Call an allowed task-scoped SDK helper for an active Arinova task."""
        task_id = self._task_id_value(task_id) or self.active_task_id() or ""
        response = await asyncio.to_thread(
            self._post_sidecar,
            "/task-sdk",
            {"taskId": task_id, "method": method, "args": _json_safe(list(args))},
        )
        self._raise_for_sidecar_control_response("/task-sdk", response)
        return response["result"]

    def _raise_for_sidecar_control_response(self, path: str, response: Any) -> None:
        if isinstance(response, dict) and response.get("ok") is True:
            if "result" not in response:
                raise RuntimeError(f"{path} returned malformed success response: {response!r}")
            return
        if isinstance(response, dict) and response.get("ok") is False:
            error = response.get("error")
            raise RuntimeError(str(error or f"{path} returned ok=false"))
        raise RuntimeError(f"{path} returned malformed response: {response!r}")

    def active_task_id(self) -> str | None:
        if len(self._session_by_task) == 1:
            return next(iter(self._session_by_task))
        return None

    def _metadata_task_id_value(self, value: Any) -> str:
        return self._task_id_value(value)

    def _task_id_for_send(self, chat_id: str, metadata: Optional[Dict[str, Any]]) -> str | None:
        if isinstance(metadata, dict):
            for key in ("arinova_task_id", "task_id", "taskId", "thread_id"):
                candidate = self._metadata_task_id_value(metadata.get(key))
                if candidate and candidate in self._session_by_task:
                    return candidate
            arinova = metadata.get("arinova")
            if isinstance(arinova, dict):
                candidate = self._metadata_task_id_value(arinova.get("task_id") or arinova.get("taskId"))
                if candidate and candidate in self._session_by_task:
                    return candidate
        return self._task_by_conversation.get(str(chat_id))

    def _task_conversation_id(self, task_id: str) -> str | None:
        context = self._task_context_by_task.get(task_id)
        if not isinstance(context, dict):
            conversation_id = self._conversation_by_task.get(task_id)
            if conversation_id:
                return conversation_id
            for mapped_conversation_id, mapped_task_id in self._task_by_conversation.items():
                if mapped_task_id == task_id:
                    return mapped_conversation_id
            return None
        value = context.get("conversationId")
        return str(value) if value else None

    def _no_conversation_task_error(self, task_id: str, api: str) -> str:
        context = self._task_context_by_task.get(task_id)
        task_kind = context.get("taskKind") if isinstance(context, dict) else None
        return f"{api} is unavailable: this task (taskKind={task_kind or 'unknown'}) is not bound to a conversation"

    def _forget_task(self, task_id: str) -> str | None:
        conversation_id = self._conversation_by_task.pop(task_id, None)
        if conversation_id and self._task_by_conversation.get(conversation_id) == task_id:
            self._task_by_conversation.pop(conversation_id, None)
        stale_conversations = [
            mapped_conversation_id
            for mapped_conversation_id, mapped_task_id in self._task_by_conversation.items()
            if mapped_task_id == task_id
        ]
        for mapped_conversation_id in stale_conversations:
            self._task_by_conversation.pop(mapped_conversation_id, None)
            if conversation_id is None:
                conversation_id = mapped_conversation_id
        self._task_context_by_task.pop(task_id, None)
        self._buffer_by_task.pop(task_id, None)
        self._mentions_by_task.pop(task_id, None)
        self._session_by_task.pop(task_id, None)
        self._message_by_task.pop(task_id, None)
        self._task_started_at.pop(task_id, None)
        return conversation_id

    def _clear_active_task_state(self) -> None:
        self._task_by_conversation.clear()
        self._conversation_by_task.clear()
        self._task_context_by_task.clear()
        self._buffer_by_task.clear()
        self._mentions_by_task.clear()
        self._session_by_task.clear()
        self._message_by_task.clear()
        self._task_started_at.clear()

    async def on_processing_complete(self, event: MessageEvent, outcome: ProcessingOutcome) -> None:
        task_id = self._event_task_id(event)
        if not task_id:
            return

        chunks = self._buffer_by_task.get(task_id, [])
        content = "\n\n".join(part for part in chunks if part)
        mentions = list(self._mentions_by_task.get(task_id, []))
        started_at = self._task_started_at.get(task_id)
        if outcome == ProcessingOutcome.SUCCESS:
            completed_update: dict[str, Any] = {"status": "completed"}
            if started_at is not None:
                completed_update["durationMs"] = max(0, int((time.monotonic() - started_at) * 1000))
            await self._send_task_update(task_id, completed_update)
        if outcome != ProcessingOutcome.SUCCESS:
            await self._send_task_telemetry(
                "task_terminal",
                {"taskId": task_id, "outcome": getattr(outcome, "value", str(outcome))},
            )

        try:
            if outcome == ProcessingOutcome.CANCELLED:
                await asyncio.to_thread(
                    self._post_sidecar,
                    "/error",
                    {"taskId": task_id, "error": "cancelled"},
                )
            elif outcome == ProcessingOutcome.FAILURE:
                await asyncio.to_thread(
                    self._post_sidecar,
                    "/error",
                    {"taskId": task_id, "error": "Hermes failed while processing the task"},
                )
            else:
                complete_payload: dict[str, Any] = {"taskId": task_id, "content": content}
                if mentions:
                    complete_payload["mentions"] = mentions
                await asyncio.to_thread(
                    self._post_sidecar,
                    "/complete",
                    complete_payload,
                )
        except Exception as exc:
            logger.warning("Arinova: failed to finish task %s: %s", task_id, exc)
        finally:
            self._forget_task(task_id)

    def _start_inbound_server(self) -> None:
        _start_inbound_server_impl(self)

    def _start_sidecar(self) -> None:
        _start_sidecar_impl(
            self,
            sidecar_dir=SIDECAR_DIR,
            node_version_check=_node_version_supported,
            dependency_check=_sidecar_dependency_error,
        )

    def _sidecar_env(self) -> dict[str, str]:
        return _sidecar_env_impl(self)

    def _drain_sidecar_logs(self) -> None:
        _drain_sidecar_logs_impl(self)

    def _sidecar_exit_error(self) -> RuntimeError:
        return _sidecar_exit_error_impl(self)

    async def _wait_for_sidecar(self) -> None:
        await _wait_for_sidecar_impl(self)

    def _post_sidecar(self, path: str, payload: dict) -> dict:
        return _post_sidecar_impl(self, path, payload)

    def _schedule_task(self, task: dict) -> None:
        if not self._loop or self._loop.is_closed() or not self._loop.is_running():
            return
        self._loop.call_soon_threadsafe(lambda: asyncio.create_task(self._handle_arinova_task(task)))

    def _schedule_cancel(self, payload: dict) -> None:
        if not self._loop or self._loop.is_closed() or not self._loop.is_running():
            return
        self._loop.call_soon_threadsafe(lambda: asyncio.create_task(self._handle_arinova_cancel(payload)))

    def _schedule_cancel_sessions(self, session_keys: list[str]) -> None:
        if not self._loop or self._loop.is_closed() or not self._loop.is_running():
            return
        for session_key in dict.fromkeys(item for item in session_keys if item):
            self._loop.call_soon_threadsafe(
                lambda key=session_key: asyncio.create_task(
                    self.cancel_session_processing(key, release_guard=True, discard_pending=True)
                )
            )

    def _schedule_callback(self, callback, payload: dict) -> None:
        loop = self._loop
        if not loop or loop.is_closed() or not loop.is_running():
            return
        completed = threading.Event()

        def run_callback() -> None:
            try:
                callback(payload)
            finally:
                completed.set()

        loop.call_soon_threadsafe(run_callback)
        if not completed.wait(timeout=1):
            logger.warning("Arinova: callback dispatch timed out for %s", getattr(callback, "__name__", callback))

    def _handle_token_claimed(self, payload: dict) -> None:
        raw_agent_id = payload.get("agentId")
        raw_permanent_token = payload.get("permanentToken")
        if raw_agent_id is not None and not isinstance(raw_agent_id, str):
            logger.warning("Arinova: ignored malformed token claimed payload")
            return
        if not isinstance(raw_permanent_token, str) or not raw_permanent_token.strip():
            logger.warning("Arinova: ignored malformed token claimed payload")
            return
        agent_id = raw_agent_id or ""
        permanent_token = raw_permanent_token
        if agent_id:
            self._claimed_agent_id = agent_id
        if permanent_token:
            self._claimed_permanent_token = permanent_token
            self.bot_token = permanent_token
            self.config.token = permanent_token
            if isinstance(self.config.extra, dict):
                self.config.extra["bot_token"] = permanent_token
        logger.info(
            "Arinova: token claimed agent_id=%s permanent_token=%s",
            agent_id or "<unknown>",
            _redact(permanent_token),
        )

    def _handle_auth_failed(self, payload: dict) -> None:
        error = str(payload.get("error") or "Arinova authentication failed")
        retryable = _payload_bool(payload.get("retryable"))
        logger.warning("Arinova: authentication failed retryable=%s error=%s", retryable, error)
        self._schedule_cancel_sessions(list(self._session_by_task.values()))
        self._clear_active_task_state()
        self._set_fatal_error("auth_failed", error, retryable=retryable)

    def _handle_sdk_error(self, payload: dict) -> None:
        error = str(payload.get("error") or "Arinova SDK error")
        self._last_sdk_error = error
        logger.warning("Arinova: SDK error: %s", error)

    def _handle_onboarding_seed(self, payload: dict) -> None:
        if (
            payload.get("kind") != "first_touch_opening"
            or not isinstance(payload.get("seedId"), str)
            or not isinstance(payload.get("agentId"), str)
            or not isinstance(payload.get("action"), str)
            or not isinstance(payload.get("prompt"), str)
        ):
            logger.warning("Arinova: ignored malformed onboarding seed")
            return
        self._onboarding_seed = dict(payload)
        logger.info("Arinova: onboarding seed received seed_id=%s", payload.get("seedId"))

    def _handle_connection_status(self, payload: dict) -> None:
        global _active_adapter
        connected = _payload_bool_or_none(payload.get("connected"))
        if connected is None:
            logger.warning("Arinova: ignored malformed connection status: %r", payload.get("connected"))
            return
        if connected:
            agent_id = payload.get("agentId")
            if isinstance(agent_id, str) and agent_id:
                self._claimed_agent_id = agent_id
            self._mark_connected()
            _active_adapter = self
            return
        self._mark_disconnected()
        if _active_adapter is self:
            _active_adapter = None

    def _chat_type(self, value: Any) -> str:
        normalized = str(value or "dm").strip().lower()
        if normalized in {"direct", "private", "one_to_one", "one-to-one", "1:1"}:
            return "dm"
        if normalized in {"group", "channel", "thread", "forum", "dm"}:
            return normalized
        return normalized or "dm"

    def _allow_agent_sender(self) -> bool:
        return str(self.allow_bots or "none").strip().lower() in {"all", "true", "1", "yes", "on"}

    def _task_thread_id(self, task: dict, task_id: str) -> str | None:
        if not task.get("conversationId"):
            return None
        if str(self.concurrency_mode or "").strip().lower() != "unbounded":
            return None
        return task_id

    def _task_conversation_name(self, task: dict) -> str:
        name = task.get("conversationName")
        return name if isinstance(name, str) else "Arinova Chat"

    def _source_authorized_for_attachment_fetch(self, source: Any) -> bool:
        """Use the gateway's real authorization boundary before any network I/O."""
        handler_owner = getattr(self._message_handler, "__self__", None)
        checker = getattr(handler_owner, "_is_user_authorized", None)
        if callable(checker):
            try:
                return bool(checker(source))
            except Exception as exc:
                logger.warning("Arinova: attachment pre-authorization failed closed: %s", exc)
                return False

        # Standalone/test fallback has no pairing store. Preserve explicit
        # allow-all/allowlist behavior, but never infer authorization.
        if getattr(source, "role_authorized", False) is True:
            return True
        if _truthy(os.getenv("ARINOVA_ALLOW_ALL_USERS")) or _truthy(
            os.getenv("GATEWAY_ALLOW_ALL_USERS")
        ):
            return True
        user_id = str(source.user_id or "").strip()
        if not user_id:
            return False
        allowed = {
            entry.strip()
            for raw in (
                os.getenv("ARINOVA_ALLOWED_USERS", ""),
                os.getenv("GATEWAY_ALLOWED_USERS", ""),
            )
            for entry in raw.split(",")
            if entry.strip()
        }
        return "*" in allowed or user_id in allowed

    async def _handle_arinova_task(self, task: dict) -> None:
        task_id = self._task_id_value(task.get("taskId"))
        if not task_id:
            logger.warning("Arinova: received task without taskId")
            return
        conversation_id = str(task.get("conversationId") or task_id)
        conversation_name = self._task_conversation_name(task)

        role_authorized = bool(task.get("senderAgentId")) and self._allow_agent_sender()
        source_args = dict(
            chat_id=conversation_id,
            chat_name=conversation_name,
            chat_type=self._chat_type(task.get("conversationType")),
            user_id=task.get("senderUserId") or task.get("senderAgentId"),
            user_name=(
                task.get("senderAgentName")
                if task.get("senderAgentId")
                else task.get("senderUsername")
            ) or task.get("senderUsername") or task.get("senderAgentName"),
            message_id=task.get("userMessageId") or task_id,
            thread_id=self._task_thread_id(task, task_id),
            is_bot=bool(task.get("senderAgentId")),
        )
        if "role_authorized" in inspect.signature(self.build_source).parameters:
            source_args["role_authorized"] = role_authorized
        source = self.build_source(**source_args)
        if not hasattr(source, "role_authorized"):
            setattr(source, "role_authorized", role_authorized)
        attachment_fetch_authorized = self._source_authorized_for_attachment_fetch(source)
        media_urls, media_types, media_notes = await self._collect_attachment_media(
            task,
            authorized=attachment_fetch_authorized,
        )
        content = self._task_text(task, media_notes=media_notes)
        self._conversation_info_by_id[conversation_id] = {
            "name": conversation_name,
            "type": source.chat_type,
        }
        reply_to = task.get("replyTo") if isinstance(task.get("replyTo"), dict) else {}
        reply_to_text = str(reply_to.get("content") or "").strip() or None
        reply_to_author_name = (
            reply_to.get("senderAgentName")
            or reply_to.get("senderUsername")
            or reply_to.get("role")
        )
        reply_to_message_id = _first_str(reply_to, ("id", "messageId", "message_id", "replyToId", "reply_to_id"))
        reply_to_author_id = _first_str(reply_to, ("senderAgentId", "senderUserId", "agentId", "userId"))
        event_args = dict(
            text=content,
            message_type=self._message_type_for_media(media_types),
            source=source,
            raw_message=task,
            message_id=task_id,
            media_urls=media_urls,
            media_types=media_types,
            reply_to_message_id=reply_to_message_id,
            reply_to_text=reply_to_text,
            reply_to_author_id=reply_to_author_id,
            reply_to_author_name=str(reply_to_author_name) if reply_to_author_name else None,
            reply_to_is_own_message=bool(reply_to.get("senderAgentId") and reply_to.get("senderAgentId") == self._claimed_agent_id),
        )
        supported_event_args = inspect.signature(MessageEvent).parameters
        event = MessageEvent(**{key: value for key, value in event_args.items() if key in supported_event_args})
        for key, value in event_args.items():
            if key not in supported_event_args and not hasattr(event, key):
                setattr(event, key, value)

        session_key = build_session_key(
            source,
            group_sessions_per_user=(self.config.extra or {}).get("group_sessions_per_user", True),
            thread_sessions_per_user=(self.config.extra or {}).get("thread_sessions_per_user", False),
        )
        previous_conversation_id = self._conversation_by_task.get(task_id)
        if (
            previous_conversation_id
            and previous_conversation_id != conversation_id
            and self._task_by_conversation.get(previous_conversation_id) == task_id
        ):
            self._task_by_conversation.pop(previous_conversation_id, None)
        self._task_by_conversation[conversation_id] = task_id
        self._conversation_by_task[task_id] = conversation_id
        self._task_context_by_task[task_id] = {
            "conversationId": task.get("conversationId"),
            "taskKind": task.get("taskKind"),
        }
        self._buffer_by_task[task_id] = []
        self._mentions_by_task[task_id] = []
        self._session_by_task[task_id] = session_key
        if task.get("userMessageId"):
            self._message_by_task[task_id] = str(task.get("userMessageId"))

        logger.info("Arinova: dispatching task %s conversation=%s", task_id, conversation_id)
        try:
            await self.handle_message(event)
        except Exception as exc:
            logger.error("Arinova: failed to dispatch task %s to Hermes: %s", task_id, exc, exc_info=True)
            self._forget_task(task_id)
            try:
                await asyncio.to_thread(
                    self._post_sidecar,
                    "/error",
                    {"taskId": task_id, "error": f"Hermes failed to accept the task: {exc}"},
                )
            except Exception as post_exc:
                logger.warning("Arinova: failed to report dispatch error for %s: %s", task_id, post_exc)
            return

    def _message_type_for_media(self, media_types: list[str]) -> MessageType:
        return _message_type_for_media_impl(media_types)

    async def _collect_attachment_media(
        self,
        task: dict,
        *,
        authorized: bool,
    ) -> tuple[list[str], list[str], list[str]]:
        return await _collect_attachment_media_impl(self, task, authorized=authorized)

    def _download_attachment_media(
        self,
        attachment: dict,
        *,
        max_bytes: int,
        timeout_seconds: float,
        on_bytes: Callable[[int], None] | None = None,
    ) -> tuple[str, str, str, int] | None:
        return _download_attachment_media_impl(
            self,
            attachment,
            max_bytes=max_bytes,
            timeout_seconds=timeout_seconds,
            on_bytes=on_bytes,
        )

    def _attachment_urlopen(self, req: urllib.request.Request, *, timeout: float):
        return _attachment_urlopen_impl(req, timeout=timeout)

    def _download_attachment_bytes(
        self,
        url: str,
        *,
        max_bytes: int | None = None,
        timeout_seconds: float = 30.0,
        on_bytes: Callable[[int], None] | None = None,
    ) -> tuple[bytes, str]:
        return _download_attachment_bytes_impl(
            self,
            url,
            max_bytes=max_bytes,
            timeout_seconds=timeout_seconds,
            on_bytes=on_bytes,
        )

    @staticmethod
    def _reply_section(task: dict) -> str:
        return _reply_section_impl(task)

    @staticmethod
    def _history_section(task: dict) -> str:
        return _history_section_impl(task)

    @staticmethod
    def _members_section(task: dict) -> str:
        return _members_section_impl(task)

    @staticmethod
    def _attachments_section(task: dict) -> str:
        return _attachments_section_impl(task)

    @staticmethod
    def _skills_section(task: dict) -> str:
        return _skills_section_impl(task)

    @staticmethod
    def _metadata_section(task: dict) -> str:
        return _metadata_section_impl(task)

    def _task_text(self, task: dict, *, media_notes: list[str] | None = None) -> str:
        return _task_text_impl(self, task, media_notes=media_notes)

    async def _handle_arinova_cancel(self, payload: dict) -> None:
        task_id = self._task_id_value(payload.get("taskId"))
        session_key = self._session_by_task.get(task_id)
        if not session_key:
            return
        logger.info("Arinova: cancelling task %s", task_id)
        self._forget_task(task_id)
        await self.cancel_session_processing(session_key, release_guard=True, discard_pending=True)
