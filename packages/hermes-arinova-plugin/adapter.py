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
from typing import Any, Dict, Optional

from gateway.config import Platform, PlatformConfig
from gateway.platforms.base import (
    BasePlatformAdapter,
    MessageEvent,
    MessageType,
    ProcessingOutcome,
    SendResult,
)
from gateway.session import build_session_key

try:
    from gateway.platforms.base import cache_media_bytes
except ImportError:
    class _CachedMedia:
        def __init__(self, path: str, media_type: str, filename: str):
            self.path = path
            self.media_type = media_type
            self._filename = filename

        def context_note(self) -> str:
            return f"Downloaded attachment: {self._filename} ({self.media_type})"

    def cache_media_bytes(data: bytes, *, filename: str, mime_type: str):
        safe_name = Path(filename).name or "attachment"
        suffix = Path(safe_name).suffix[:16]
        descriptor, path = tempfile.mkstemp(prefix="hermes-arinova-", suffix=suffix)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(data)
        return _CachedMedia(path, mime_type, safe_name)

logger = logging.getLogger(__name__)

DEFAULT_SIDECAR_PORT = 8793
DEFAULT_ADAPTER_PORT = 8794
DEFAULT_BIND = "127.0.0.1"
DEFAULT_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024
DEFAULT_ATTACHMENT_MAX_COUNT = 8
DEFAULT_ATTACHMENT_TOTAL_MAX_BYTES = 64 * 1024 * 1024
DEFAULT_ATTACHMENT_TOTAL_TIMEOUT_MS = 30_000
DEFAULT_CONNECT_TIMEOUT_MS = 30_000
DEFAULT_SIDECAR_POST_TIMEOUT_MS = 10_000
DEFAULT_CONTROL_MAX_BODY_BYTES = 1024 * 1024
SIDECAR_DIR = Path(__file__).parent / "sidecar"
DEFAULT_SDK_ROOT = Path(__file__).resolve().parent.parent / "agent-sdk"
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
SIDECAR_JS_CHECK_FILES = (
    "index.mjs",
    "runtime.mjs",
    "node_modules/@arinova-ai/agent-sdk/dist/client.js",
    "node_modules/@arinova-ai/agent-sdk/dist/index.js",
    "node_modules/@arinova-ai/agent-sdk/dist/types.js",
)
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
CONCURRENCY_MODES = {"per-conversation", "agent-wide", "unbounded"}
ADAPTER_CALLBACK_FIELDS = {
    "/task": {
        "taskId",
        "taskKind",
        "userMessageId",
        "conversationId",
        "conversationName",
        "conversationType",
        "content",
        "senderUserId",
        "senderUsername",
        "senderAgentId",
        "senderAgentName",
        "members",
        "replyTo",
        "history",
        "attachments",
        "availableSkills",
    },
    "/cancel": {"taskId"},
    "/token-claimed": {"agentId", "permanentToken"},
    "/onboarding-seed": {"kind", "seedId", "agentId", "action", "prompt"},
    "/connection-status": {"connected", "agentId"},
    "/auth-failed": {"error", "retryable"},
    "/sdk-error": {"error"},
}
ADAPTER_CALLBACK_REQUIRED_FIELDS = {
    "/task": {"taskId", "content"},
    "/cancel": {"taskId"},
    "/token-claimed": {"permanentToken"},
    "/onboarding-seed": {"kind", "seedId", "agentId", "action", "prompt"},
    "/connection-status": {"connected"},
    "/auth-failed": {"error", "retryable"},
    "/sdk-error": {"error"},
}
TASK_CONTEXT_STRING_FIELDS = {
    "taskKind",
    "userMessageId",
    "conversationId",
    "conversationName",
    "conversationType",
    "senderUserId",
    "senderUsername",
    "senderAgentId",
    "senderAgentName",
}
TASK_MEMBER_FIELDS = {"agentId", "agentName"}
TASK_REPLY_FIELDS = {"id", "role", "content", "senderAgentId", "senderAgentName", "senderUsername"}
TASK_HISTORY_FIELDS = {"role", "content", "senderAgentName", "senderUsername", "createdAt"}
TASK_ATTACHMENT_FIELDS = {"id", "fileName", "fileType", "fileSize", "url"}
TASK_SKILL_FIELDS = {"slug", "name", "slashCommand", "description"}
POSITIVE_INT_SETTINGS = (
    ("ARINOVA_SIDECAR_PORT", "sidecar_port"),
    ("ARINOVA_ADAPTER_PORT", "adapter_port"),
    ("ARINOVA_RECONNECT_INTERVAL_MS", "reconnect_interval_ms"),
    ("ARINOVA_PING_INTERVAL_MS", "ping_interval_ms"),
    ("ARINOVA_PING_TIMEOUT_MS", "ping_timeout_ms"),
    ("ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION", "max_consecutive_per_conversation"),
    ("ARINOVA_MAX_QUEUED_TASKS", "max_queued_tasks"),
    ("ARINOVA_CONNECT_TIMEOUT_MS", "connect_timeout_ms"),
    ("ARINOVA_ADAPTER_POST_TIMEOUT_MS", "adapter_post_timeout_ms"),
    ("ARINOVA_SIDECAR_POST_TIMEOUT_MS", "sidecar_post_timeout_ms"),
    ("ARINOVA_ATTACHMENT_MAX_BYTES", "attachment_max_bytes"),
    ("ARINOVA_ATTACHMENT_MAX_COUNT", "attachment_max_count"),
    ("ARINOVA_ATTACHMENT_TOTAL_MAX_BYTES", "attachment_total_max_bytes"),
    ("ARINOVA_ATTACHMENT_TOTAL_TIMEOUT_MS", "attachment_total_timeout_ms"),
    ("ARINOVA_CONTROL_MAX_BODY_BYTES", "control_max_body_bytes"),
)


def _resolve_public_http_url(url: str) -> tuple[urllib.parse.SplitResult, str, int]:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("attachment URL must be an absolute http(s) URL")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("attachment URL credentials are not allowed")

    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError as exc:
        raise ValueError("attachment URL port is invalid") from exc

    try:
        addresses = socket.getaddrinfo(
            parsed.hostname,
            port,
            type=socket.SOCK_STREAM,
        )
    except socket.gaierror as exc:
        raise ValueError("attachment URL host could not be resolved") from exc
    if not addresses:
        raise ValueError("attachment URL host could not be resolved")

    pinned_ip = ""
    for address in addresses:
        raw_ip = address[4][0]
        try:
            ip = ipaddress.ip_address(raw_ip)
        except ValueError as exc:
            raise ValueError("attachment URL resolved to an invalid address") from exc
        if not ip.is_global:
            raise ValueError("attachment URL resolves to a non-public address")
        if not pinned_ip:
            pinned_ip = raw_ip
    return parsed, pinned_ip, port


def _validate_public_http_url(url: str) -> None:
    _resolve_public_http_url(url)


class _PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, host: str, *, pinned_ip: str, **kwargs: Any):
        self._pinned_ip = pinned_ip
        super().__init__(host, **kwargs)

    def connect(self) -> None:
        self.sock = self._create_connection(
            (self._pinned_ip, self.port),
            self.timeout,
            self.source_address,
        )
        if self._tunnel_host:
            self._tunnel()


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host: str, *, pinned_ip: str, **kwargs: Any):
        self._pinned_ip = pinned_ip
        super().__init__(host, **kwargs)

    def connect(self) -> None:
        self.sock = self._create_connection(
            (self._pinned_ip, self.port),
            self.timeout,
            self.source_address,
        )
        if self._tunnel_host:
            self._tunnel()
        self.sock = self._context.wrap_socket(self.sock, server_hostname=self.host)


class _PinnedHTTPHandler(urllib.request.HTTPHandler):
    handler_order = 100

    def http_open(self, req):
        _, pinned_ip, _ = _resolve_public_http_url(req.full_url)
        return self.do_open(
            lambda host, **kwargs: _PinnedHTTPConnection(host, pinned_ip=pinned_ip, **kwargs),
            req,
        )


class _PinnedHTTPSHandler(urllib.request.HTTPSHandler):
    handler_order = 100

    def https_open(self, req):
        _, pinned_ip, _ = _resolve_public_http_url(req.full_url)
        return self.do_open(
            lambda host, **kwargs: _PinnedHTTPSConnection(host, pinned_ip=pinned_ip, **kwargs),
            req,
            context=self._context,
            check_hostname=self._check_hostname,
        )


class _AttachmentRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urllib.parse.urljoin(req.full_url, newurl)
        hostname = urllib.parse.urlsplit(target).hostname
        try:
            literal_ip = ipaddress.ip_address(hostname or "")
        except ValueError:
            literal_ip = None
        if literal_ip is not None and not literal_ip.is_global:
            raise ValueError("attachment URL resolves to a non-public address")
        return super().redirect_request(req, fp, code, msg, headers, target)


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


def _parse_positive_int(value: Any) -> int | None:
    parsed = _parse_nonnegative_int(value)
    return parsed if parsed is not None and parsed > 0 else None


def _int_env(name: str, default: int) -> int:
    value = _parse_positive_int(os.getenv(name, ""))
    return default if value is None else value


def _int_setting(name: str, extra_value: Any, default: int) -> int:
    extra_default = _parse_positive_int(extra_value)
    if extra_default is None:
        extra_default = default
    return _int_env(name, extra_default)


def _optional_int_setting(name: str, extra_value: Any) -> int | None:
    raw = os.getenv(name) if name in os.environ else extra_value
    return _parse_positive_int(raw)


def _valid_positive_int_value(value: Any) -> bool:
    if value in (None, "") or isinstance(value, bool):
        return value in (None, "")
    return _parse_positive_int(value) is not None


def _valid_positive_int_settings(extra: dict[str, Any]) -> bool:
    for env_name, extra_key in POSITIVE_INT_SETTINGS:
        if env_name in os.environ:
            if not _valid_positive_int_value(os.getenv(env_name)):
                return False
            continue
        if extra_key in extra and not _valid_positive_int_value(extra.get(extra_key)):
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


def _json_safe(value: Any) -> Any:
    if isinstance(value, (bytes, bytearray, memoryview)):
        return {"base64": base64.b64encode(bytes(value)).decode("ascii")}
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return value


def _reject_json_constant(value: str) -> None:
    raise ValueError(f"JSON contains non-finite constant: {value}")


def _reject_duplicate_json_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for key, value in pairs:
        if key in data:
            raise ValueError(f"JSON object contains duplicate key: {key}")
        data[key] = value
    return data


def _is_json_content_type(value: str | None) -> bool:
    content_type = str(value or "").split(";", 1)[0].strip().lower()
    return content_type == "application/json"


def _callback_content_length(value: str | None) -> int:
    if value is None:
        raise ValueError("callback Content-Length is required")
    try:
        length = int(str(value).strip())
    except (TypeError, ValueError) as exc:
        raise ValueError("callback Content-Length must be a non-negative integer") from exc
    if length < 0:
        raise ValueError("callback Content-Length must be a non-negative integer")
    return length


def _require_callback_object(value: Any, field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"callback {field} must be an object")
    return value


def _require_callback_object_array(value: Any, field: str) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise ValueError(f"callback {field} must be an array")
    items: list[dict[str, Any]] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            raise ValueError(f"callback {field}[{index}] must be an object")
        items.append(item)
    return items


def _reject_callback_unknown_fields(value: dict[str, Any], field: str, allowed: set[str]) -> None:
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise ValueError(f"callback {field} has unsupported field(s): {', '.join(unknown)}")


def _require_callback_string_fields(value: dict[str, Any], field: str, keys: tuple[str, ...]) -> None:
    for key in keys:
        if not isinstance(value.get(key), str):
            raise ValueError(f"callback {field}.{key} must be a string")


def _require_callback_optional_string_fields(value: dict[str, Any], field: str, keys: tuple[str, ...]) -> None:
    for key in keys:
        if key in value and value.get(key) is not None and not isinstance(value.get(key), str):
            raise ValueError(f"callback {field}.{key} must be a string or null")


def _validate_task_context_payload(payload: dict[str, Any]) -> None:
    for key in TASK_CONTEXT_STRING_FIELDS:
        if key in payload and payload.get(key) is not None and not isinstance(payload.get(key), str):
            raise ValueError(f"callback {key} must be a string or null")

    if "members" in payload and payload.get("members") is not None:
        for index, member in enumerate(_require_callback_object_array(payload.get("members"), "members")):
            field = f"members[{index}]"
            _reject_callback_unknown_fields(member, field, TASK_MEMBER_FIELDS)
            _require_callback_string_fields(member, field, ("agentId", "agentName"))

    if "replyTo" in payload and payload.get("replyTo") is not None:
        reply_to = _require_callback_object(payload.get("replyTo"), "replyTo")
        _reject_callback_unknown_fields(reply_to, "replyTo", TASK_REPLY_FIELDS)
        _require_callback_string_fields(reply_to, "replyTo", ("role", "content"))
        _require_callback_optional_string_fields(
            reply_to,
            "replyTo",
            ("id", "senderAgentId", "senderAgentName", "senderUsername"),
        )

    if "history" in payload and payload.get("history") is not None:
        for index, item in enumerate(_require_callback_object_array(payload.get("history"), "history")):
            field = f"history[{index}]"
            _reject_callback_unknown_fields(item, field, TASK_HISTORY_FIELDS)
            _require_callback_string_fields(item, field, ("role", "content", "createdAt"))
            _require_callback_optional_string_fields(item, field, ("senderAgentName", "senderUsername"))

    if "attachments" in payload and payload.get("attachments") is not None:
        for index, attachment in enumerate(_require_callback_object_array(payload.get("attachments"), "attachments")):
            field = f"attachments[{index}]"
            _reject_callback_unknown_fields(attachment, field, TASK_ATTACHMENT_FIELDS)
            _require_callback_string_fields(attachment, field, ("id", "fileName", "fileType", "url"))
            size = attachment.get("fileSize")
            if isinstance(size, bool) or not isinstance(size, (int, float)) or not math.isfinite(size):
                raise ValueError(f"callback {field}.fileSize must be a finite number")

    if "availableSkills" in payload and payload.get("availableSkills") is not None:
        for index, skill in enumerate(_require_callback_object_array(payload.get("availableSkills"), "availableSkills")):
            field = f"availableSkills[{index}]"
            _reject_callback_unknown_fields(skill, field, TASK_SKILL_FIELDS)
            _require_callback_string_fields(skill, field, ("slug", "name", "description"))
            slash = skill.get("slashCommand")
            if slash is not None and not isinstance(slash, str):
                raise ValueError(f"callback {field}.slashCommand must be a string or null")


def _validate_adapter_callback_payload(path: str, payload: dict[str, Any]) -> None:
    allowed = ADAPTER_CALLBACK_FIELDS.get(path)
    required = ADAPTER_CALLBACK_REQUIRED_FIELDS.get(path)
    if allowed is None and required is None:
        raise ValueError(f"unsupported callback path: {path}")
    unknown = sorted(set(payload) - (allowed or set()))
    if unknown:
        raise ValueError(f"callback request body has unsupported field(s): {', '.join(unknown)}")
    missing = sorted((required or set()) - set(payload))
    if missing:
        raise ValueError(f"callback request body is missing required field(s): {', '.join(missing)}")
    if path in {"/task", "/cancel"}:
        task_id = payload.get("taskId")
        if not isinstance(task_id, str) or not task_id.strip():
            raise ValueError("callback taskId must be a non-empty string")
    if path == "/task":
        if not isinstance(payload.get("content"), str):
            raise ValueError("callback content must be a string")
        _validate_task_context_payload(payload)
    if path == "/connection-status" and not isinstance(payload.get("connected"), bool):
        raise ValueError("callback connected must be a boolean")
    if path == "/token-claimed":
        agent_id = payload.get("agentId")
        if agent_id is not None and not isinstance(agent_id, str):
            raise ValueError("callback agentId must be a string or null")
        token = payload.get("permanentToken")
        if not isinstance(token, str) or not token.strip():
            raise ValueError("callback permanentToken must be a non-empty string")
    if path == "/onboarding-seed":
        for key in ("kind", "seedId", "agentId", "action", "prompt"):
            if not isinstance(payload.get(key), str):
                raise ValueError(f"callback {key} must be a string")
    if path in {"/auth-failed", "/sdk-error"} and not isinstance(payload.get("error"), str):
        raise ValueError("callback error must be a string")
    if path == "/auth-failed" and not isinstance(payload.get("retryable"), bool):
        raise ValueError("callback retryable must be a boolean")


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


def _urlopen_json(req: urllib.request.Request, *, timeout: float, label: str) -> dict:
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            if not _is_json_content_type(res.headers.get("Content-Type")):
                content_type = res.headers.get("Content-Type") or "<missing>"
                raise RuntimeError(f"{label} returned non-JSON response content type: {content_type}")
            body = res.read()
            try:
                raw = body.decode("utf-8")
            except UnicodeDecodeError as exc:
                raise RuntimeError(f"{label} returned non-UTF-8 response body") from exc
            try:
                parsed = json.loads(
                    raw,
                    parse_constant=_reject_json_constant,
                    object_pairs_hook=_reject_duplicate_json_keys,
                )
            except (json.JSONDecodeError, ValueError) as exc:
                raise RuntimeError(f"{label} returned malformed JSON: {raw!r}") from exc
            if not isinstance(parsed, dict):
                raise RuntimeError(f"{label} returned malformed response: {parsed!r}")
            return parsed
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{label} failed ({exc.code}): {body}") from exc
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise RuntimeError(f"{label} failed: {reason}") from exc
    except TimeoutError as exc:
        raise RuntimeError(f"{label} timed out") from exc


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
    return SIDECAR_DIR / "node_modules/@arinova-ai/agent-sdk/package.json"


def _local_sdk_package(sdk_root: str | Path | None = None) -> Path | None:
    root = Path(sdk_root or os.getenv("ARINOVA_AGENT_SDK_ROOT") or DEFAULT_SDK_ROOT).expanduser()
    package_path = root / "package.json"
    return package_path if package_path.is_file() else None


def _sdk_public_metadata(package: dict[str, Any]) -> dict[str, Any]:
    return {key: package.get(key) for key in SDK_PACKAGE_PUBLIC_METADATA_KEYS}


def _sdk_package_file_drift(installed_sdk_dir: Path, local_sdk_dir: Path) -> list[str]:
    drift: list[str] = []
    for relative_path in SDK_PACKAGE_FILES:
        installed_path = installed_sdk_dir / relative_path
        local_path = local_sdk_dir / relative_path
        try:
            installed_content = installed_path.read_text(encoding="utf-8")
            local_content = local_path.read_text(encoding="utf-8")
        except OSError:
            drift.append(relative_path)
            continue
        if installed_content != local_content:
            drift.append(relative_path)
    return drift


def _sidecar_lockfile_error(sidecar_package: dict[str, Any], sdk_package: dict[str, Any]) -> str | None:
    lockfile_path = SIDECAR_DIR / "package-lock.json"
    try:
        lockfile = json.loads(lockfile_path.read_text(encoding="utf-8"))
    except Exception as exc:
        return f"sidecar package-lock.json could not be read: {exc}"
    if lockfile.get("lockfileVersion") != 3:
        return "sidecar package-lock.json is not an npm v3 lockfile"
    if lockfile.get("requires") is not True:
        return "sidecar package-lock.json does not declare dependency requirements"
    root_package = lockfile.get("packages", {}).get("", {})
    for field in ("name", "version", "dependencies", "engines"):
        if root_package.get(field) != sidecar_package.get(field):
            return f"sidecar package-lock.json root {field} drifted"
    package_name = sdk_package.get("name")
    locked_sdk = lockfile.get("packages", {}).get(f"node_modules/{package_name}", {})
    expected_version = sidecar_package.get("dependencies", {}).get(package_name)
    if locked_sdk.get("version") != expected_version:
        return "sidecar package-lock.json SDK package version drifted"
    expected_resolved = f"https://registry.npmjs.org/{package_name}/-/agent-sdk-{expected_version}.tgz"
    if locked_sdk.get("resolved") != expected_resolved:
        return "sidecar package-lock.json SDK package tarball drifted"
    if locked_sdk.get("license") != sdk_package.get("license"):
        return "sidecar package-lock.json SDK package license drifted"
    if not isinstance(locked_sdk.get("integrity"), str) or not locked_sdk.get("integrity", "").startswith("sha512-"):
        return "sidecar package-lock.json SDK package integrity is missing or not sha512"
    return None


def _node_syntax_error(node_bin: str, relative_path: str) -> str | None:
    path = SIDECAR_DIR / relative_path
    if not path.is_file():
        return f"sidecar JavaScript file is missing: {relative_path}"
    try:
        result = subprocess.run(
            [node_bin, "--check", str(path)],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=10,
        )
    except Exception as exc:
        return f"sidecar JavaScript syntax check failed for {relative_path}: {exc}"
    if result.returncode != 0:
        output = (result.stdout or "").strip()
        suffix = f": {output}" if output else ""
        return f"sidecar JavaScript syntax check failed for {relative_path}{suffix}"
    return None


def _sidecar_dependency_error(node_bin: str | None = None, sdk_root: str | Path | None = None) -> str | None:
    sidecar_package_path = SIDECAR_DIR / "package.json"
    sdk_package_path = _sidecar_sdk_package()
    if not sdk_package_path.exists():
        return f"sidecar dependencies are missing; run `npm install` in {SIDECAR_DIR}"
    try:
        sidecar_package = json.loads(sidecar_package_path.read_text(encoding="utf-8"))
        sdk_package = json.loads(sdk_package_path.read_text(encoding="utf-8"))
    except Exception as exc:
        return f"sidecar dependency metadata could not be read: {exc}"
    expected_version = (
        sidecar_package.get("dependencies", {})
        .get("@arinova-ai/agent-sdk")
    )
    actual_version = sdk_package.get("version")
    if not expected_version:
        return "sidecar package.json is missing @arinova-ai/agent-sdk dependency"
    if sdk_package.get("name") != "@arinova-ai/agent-sdk":
        return f"sidecar installed unexpected SDK package: {sdk_package.get('name')!r}"
    if actual_version != expected_version:
        return f"sidecar SDK version mismatch: installed {actual_version!r}, expected {expected_version!r}"
    if sdk_package.get("type") != "module":
        return "sidecar SDK package is not ESM"
    lockfile_error = _sidecar_lockfile_error(sidecar_package, sdk_package)
    if lockfile_error:
        return lockfile_error
    local_sdk_package_path = _local_sdk_package(sdk_root)
    if local_sdk_package_path is not None:
        try:
            local_sdk_package = json.loads(local_sdk_package_path.read_text(encoding="utf-8"))
        except Exception as exc:
            return f"local SDK package metadata could not be read: {exc}"
        local_metadata = _sdk_public_metadata(local_sdk_package)
        installed_metadata = _sdk_public_metadata(sdk_package)
        if installed_metadata != local_metadata:
            return f"sidecar SDK package metadata drifted: {installed_metadata!r}"
    exports = sdk_package.get("exports", {}).get(".")
    if not isinstance(exports, dict) or not exports.get("import") or not exports.get("types"):
        return f"sidecar SDK package exports drifted: {exports!r}"
    sdk_package_dir = sdk_package_path.parent
    missing_package_files = [
        relative_path
        for relative_path in SDK_PACKAGE_FILES
        if not (sdk_package_dir / relative_path).is_file()
    ]
    if missing_package_files:
        return f"sidecar SDK package files are missing: {', '.join(missing_package_files)}"
    if local_sdk_package_path is not None:
        drifted_package_files = _sdk_package_file_drift(sdk_package_dir, local_sdk_package_path.parent)
        if drifted_package_files:
            return f"sidecar SDK package files drifted: {', '.join(drifted_package_files)}"
    node = node_bin or os.getenv("ARINOVA_NODE_BIN") or "node"
    for relative_path in SIDECAR_JS_CHECK_FILES:
        error = _node_syntax_error(node, relative_path)
        if error:
            return error
    return None


def _node_version_supported(node_bin: str) -> bool:
    try:
        result = subprocess.run(
            [node_bin, "--version"],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=5,
        )
    except Exception:
        return False
    if result.returncode != 0:
        return False
    version = (result.stdout or "").strip().lstrip("v")
    try:
        major = int(version.split(".", 1)[0])
    except (TypeError, ValueError):
        return False
    return major >= 20


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
        and _valid_positive_int_settings(extra)
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
        if self._httpd:
            return

        adapter = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, fmt: str, *args: Any) -> None:
                logger.debug("Arinova inbound: " + fmt, *args)

            def do_GET(self) -> None:
                if self.path != "/healthz":
                    self.send_error(404)
                    return
                self._send_json(200, {"ok": True})

            def do_POST(self) -> None:
                supplied_token = self.headers.get("X-Arinova-Bridge-Token") or ""
                if not hmac.compare_digest(supplied_token, adapter._shared_token):
                    self.send_error(401)
                    return
                if not _is_json_content_type(self.headers.get("Content-Type")):
                    self._send_json(415, {"ok": False, "error": "callback request body must use application/json"})
                    return
                try:
                    length = _callback_content_length(self.headers.get("Content-Length"))
                    if adapter.control_max_body_bytes is not None and length > adapter.control_max_body_bytes:
                        self._send_json(
                            413,
                            {
                                "ok": False,
                                "error": f"callback request body exceeds {adapter.control_max_body_bytes} bytes",
                            },
                        )
                        return
                    body = self.rfile.read(length)
                    if adapter.control_max_body_bytes is not None and len(body) > adapter.control_max_body_bytes:
                        self._send_json(
                            413,
                            {
                                "ok": False,
                                "error": f"callback request body exceeds {adapter.control_max_body_bytes} bytes",
                            },
                        )
                        return
                    payload = json.loads(
                        body.decode("utf-8") or "{}",
                        parse_constant=_reject_json_constant,
                        object_pairs_hook=_reject_duplicate_json_keys,
                    )
                    if not isinstance(payload, dict):
                        raise ValueError("request body must be a JSON object")
                    _validate_adapter_callback_payload(self.path, payload)
                except Exception as exc:
                    self._send_json(400, {"ok": False, "error": str(exc)})
                    return

                if self.path == "/task":
                    adapter._schedule_task(payload)
                    self._send_json(202, {"ok": True})
                    return
                if self.path == "/cancel":
                    adapter._schedule_cancel(payload)
                    self._send_json(202, {"ok": True})
                    return
                if self.path == "/token-claimed":
                    adapter._schedule_callback(adapter._handle_token_claimed, payload)
                    self._send_json(202, {"ok": True})
                    return
                if self.path == "/onboarding-seed":
                    adapter._schedule_callback(adapter._handle_onboarding_seed, payload)
                    self._send_json(202, {"ok": True})
                    return
                if self.path == "/connection-status":
                    adapter._schedule_callback(adapter._handle_connection_status, payload)
                    self._send_json(202, {"ok": True})
                    return
                if self.path == "/auth-failed":
                    adapter._schedule_callback(adapter._handle_auth_failed, payload)
                    self._send_json(202, {"ok": True})
                    return
                if self.path == "/sdk-error":
                    adapter._schedule_callback(adapter._handle_sdk_error, payload)
                    self._send_json(202, {"ok": True})
                    return
                self.send_error(404)

            def _send_json(self, status: int, payload: dict) -> None:
                data = json.dumps(payload, allow_nan=False).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self._httpd = ThreadingHTTPServer((self.bind_host, self.adapter_port), Handler)
        self._http_thread = threading.Thread(
            target=self._httpd.serve_forever,
            name="arinova-adapter-http",
            daemon=True,
        )
        self._http_thread.start()

    def _start_sidecar(self) -> None:
        if self._sidecar_proc and self._sidecar_proc.poll() is None:
            return
        if self._sidecar_proc:
            if self._sidecar_proc.stdout:
                self._sidecar_proc.stdout.close()
            if self._sidecar_log_thread and self._sidecar_log_thread.is_alive():
                self._sidecar_log_thread.join(timeout=1)
            self._sidecar_proc = None
            self._sidecar_log_thread = None
        if not shutil.which(self.node_bin):
            raise RuntimeError(f"Node executable not found for Arinova sidecar: {self.node_bin}")
        if not _node_version_supported(self.node_bin):
            raise RuntimeError(f"Arinova sidecar requires Node >=20: {self.node_bin}")
        dependency_error = _sidecar_dependency_error(self.node_bin, self.agent_sdk_root)
        if dependency_error:
            raise RuntimeError(dependency_error)

        env = self._sidecar_env()
        logger.info("Arinova: starting sidecar for %s token=%s", self.server_url, _redact(self.bot_token))
        self._sidecar_proc = subprocess.Popen(
            [self.node_bin, str(SIDECAR_DIR / "index.mjs")],
            cwd=str(SIDECAR_DIR),
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        self._sidecar_log_thread = threading.Thread(
            target=self._drain_sidecar_logs,
            name="arinova-sidecar-logs",
            daemon=True,
        )
        self._sidecar_log_thread.start()

    def _sidecar_env(self) -> dict[str, str]:
        env = os.environ.copy()
        env.update(
            {
                "ARINOVA_SERVER_URL": self.server_url,
                "ARINOVA_BOT_TOKEN": self.bot_token,
                "ARINOVA_SIDECAR_PORT": str(self.sidecar_port),
                "ARINOVA_SIDECAR_BIND": self.sidecar_host,
                "ARINOVA_ADAPTER_URL": f"http://{self.bind_host}:{self.adapter_port}",
                "ARINOVA_BRIDGE_TOKEN": self._shared_token,
                "ARINOVA_CONCURRENCY_MODE": str(self.concurrency_mode),
            }
        )
        optional_env = {
            "ARINOVA_AGENT_SKILLS_JSON": self.agent_skills_json,
            "ARINOVA_RECONNECT_INTERVAL_MS": self.reconnect_interval_ms,
            "ARINOVA_PING_INTERVAL_MS": self.ping_interval_ms,
            "ARINOVA_PING_TIMEOUT_MS": self.ping_timeout_ms,
            "ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION": self.max_consecutive_per_conversation,
            "ARINOVA_MAX_QUEUED_TASKS": self.max_queued_tasks,
            "ARINOVA_ADAPTER_POST_TIMEOUT_MS": self.adapter_post_timeout_ms,
            "ARINOVA_CONTROL_MAX_BODY_BYTES": self.control_max_body_bytes,
            "ARINOVA_AGENT_SDK_ROOT": self.agent_sdk_root,
        }
        env.update({key: str(value) for key, value in optional_env.items() if value not in (None, "")})
        return env

    def _drain_sidecar_logs(self) -> None:
        proc = self._sidecar_proc
        if not proc or not proc.stdout:
            return
        for line in proc.stdout:
            message = line.rstrip()
            self._sidecar_log_tail.append(message)
            logger.info("[arinova-sidecar] %s", message)

    def _sidecar_exit_error(self) -> RuntimeError:
        code = self._sidecar_proc.returncode if self._sidecar_proc else None
        detail = f"sidecar exited before SDK authentication (exit {code})"
        if self._sidecar_log_tail:
            detail = f"{detail}; recent sidecar output: " + " | ".join(list(self._sidecar_log_tail)[-5:])
        return RuntimeError(detail)

    async def _wait_for_sidecar(self) -> None:
        deadline = time.monotonic() + max(self.connect_timeout_ms, 1000) / 1000
        last_error: Exception | None = None
        while time.monotonic() < deadline:
            if self._sidecar_proc and self._sidecar_proc.poll() is not None:
                raise self._sidecar_exit_error()
            try:
                health = await asyncio.to_thread(self._post_sidecar, "/healthz", {})
                if health.get("ok") is not True:
                    last_error = RuntimeError(f"sidecar control server reported unhealthy state: {health}")
                    await asyncio.sleep(0.5)
                    continue
                if health.get("connected") is True:
                    agent_id = health.get("agentId")
                    if isinstance(agent_id, str) and agent_id:
                        self._claimed_agent_id = agent_id
                    return
                last_error = RuntimeError("sidecar control server is up but SDK is not authenticated yet")
            except Exception as exc:
                last_error = exc
            if self.has_fatal_error:
                raise RuntimeError(self.fatal_error_message or "sidecar reported a fatal error")
            await asyncio.sleep(0.5)
        raise RuntimeError(f"sidecar did not become healthy: {last_error}")

    def _post_sidecar(self, path: str, payload: dict) -> dict:
        url = f"http://{self.sidecar_host}:{self.sidecar_port}{path}"
        data = json.dumps(payload, allow_nan=False).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "X-Arinova-Bridge-Token": self._shared_token,
            },
        )
        return _urlopen_json(
            req,
            timeout=max(self.sidecar_post_timeout_ms, 1) / 1000,
            label=path,
        )

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
        if any(item.startswith("image/") for item in media_types):
            return MessageType.PHOTO
        if any(item.startswith("video/") for item in media_types):
            return MessageType.VIDEO
        if any(item.startswith("audio/") for item in media_types):
            return MessageType.AUDIO
        if media_types:
            return MessageType.DOCUMENT
        return MessageType.TEXT

    async def _collect_attachment_media(
        self,
        task: dict,
        *,
        authorized: bool,
    ) -> tuple[list[str], list[str], list[str]]:
        media_urls: list[str] = []
        media_types: list[str] = []
        media_notes: list[str] = []
        if not self.download_attachments:
            return media_urls, media_types, media_notes

        attachments = task.get("attachments")
        if not isinstance(attachments, list):
            return media_urls, media_types, media_notes
        candidates = [
            attachment
            for attachment in attachments
            if isinstance(attachment, dict) and attachment.get("url")
        ]
        if not candidates:
            return media_urls, media_types, media_notes
        if not authorized:
            logger.warning("Arinova: skipped attachment downloads for unauthorized sender")
            return media_urls, media_types, media_notes
        if len(candidates) > self.attachment_max_count:
            logger.warning(
                "Arinova: rejected %s attachments (maximum %s)",
                len(candidates),
                self.attachment_max_count,
            )
            return media_urls, media_types, media_notes

        deadline = time.monotonic() + (self.attachment_total_timeout_ms / 1000)
        total_bytes = 0
        for attachment in candidates:
            remaining_bytes = self.attachment_total_max_bytes - total_bytes
            remaining_seconds = deadline - time.monotonic()
            if remaining_bytes <= 0 or remaining_seconds <= 0:
                logger.warning("Arinova: attachment aggregate budget exhausted")
                break
            try:
                result = await asyncio.to_thread(
                    self._download_attachment_media,
                    attachment,
                    max_bytes=min(self.attachment_max_bytes, remaining_bytes),
                    timeout_seconds=min(30.0, remaining_seconds),
                )
            except Exception as exc:
                logger.warning(
                    "Arinova: failed to download attachment %s: %s",
                    attachment.get("fileName") or attachment.get("id") or "<unknown>",
                    exc,
                )
                continue
            if not result:
                continue
            path, media_type, note, downloaded_bytes = result
            total_bytes += downloaded_bytes
            media_urls.append(path)
            media_types.append(media_type)
            media_notes.append(note)
        return media_urls, media_types, media_notes

    def _download_attachment_media(
        self,
        attachment: dict,
        *,
        max_bytes: int,
        timeout_seconds: float,
    ) -> tuple[str, str, str, int] | None:
        url = str(attachment.get("url") or "")
        data, response_type = self._download_attachment_bytes(
            url,
            max_bytes=max_bytes,
            timeout_seconds=timeout_seconds,
        )
        filename = str(attachment.get("fileName") or attachment.get("id") or "attachment")
        mime_type = str(attachment.get("fileType") or response_type or "application/octet-stream")
        cached = cache_media_bytes(data, filename=filename, mime_type=mime_type)
        if cached is None:
            return None
        return cached.path, cached.media_type, cached.context_note(), len(data)

    def _attachment_urlopen(self, req: urllib.request.Request, *, timeout: float):
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            _PinnedHTTPHandler(),
            _PinnedHTTPSHandler(context=ssl.create_default_context()),
            _AttachmentRedirectHandler(),
        )
        return opener.open(req, timeout=timeout)

    def _download_attachment_bytes(
        self,
        url: str,
        *,
        max_bytes: int | None = None,
        timeout_seconds: float = 30.0,
    ) -> tuple[bytes, str]:
        byte_limit = self.attachment_max_bytes if max_bytes is None else max_bytes
        if byte_limit <= 0 or timeout_seconds <= 0:
            raise ValueError("attachment download budget exhausted")
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Hermes-Arinova-Plugin/0.1"},
            method="GET",
        )
        try:
            with self._attachment_urlopen(req, timeout=timeout_seconds) as res:
                chunks = []
                total = 0
                deadline = time.monotonic() + timeout_seconds
                while True:
                    if time.monotonic() >= deadline:
                        raise TimeoutError()
                    chunk = res.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > byte_limit:
                        raise ValueError(f"attachment exceeds {byte_limit} bytes")
                    chunks.append(chunk)
                content_type = res.headers.get("Content-Type", "").split(";", 1)[0].strip()
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"attachment download failed ({exc.code}): {body}") from exc
        except urllib.error.URLError as exc:
            reason = getattr(exc, "reason", exc)
            raise RuntimeError(f"attachment download failed: {reason}") from exc
        except TimeoutError as exc:
            raise RuntimeError("attachment download timed out") from exc
        return b"".join(chunks), content_type

    @staticmethod
    def _reply_section(task: dict) -> str:
        reply_to = task.get("replyTo")
        if isinstance(reply_to, dict):
            reply_content = str(reply_to.get("content") or "").strip()
            if reply_content:
                reply_sender = reply_to.get("senderAgentName") or reply_to.get("senderUsername") or reply_to.get("role")
                prefix = f"Replying to {reply_sender}:" if reply_sender else "Replying to:"
                reply_lines = [prefix, reply_content]
                if reply_to.get("role") and reply_to.get("role") != reply_sender:
                    reply_lines.append(f"role={reply_to.get('role')}")
                return "\n".join(reply_lines)
        return ""

    @staticmethod
    def _history_section(task: dict) -> str:
        history = task.get("history")
        if isinstance(history, list) and history:
            lines = []
            for item in history[-5:]:
                if not isinstance(item, dict):
                    continue
                text = str(item.get("content") or "").strip()
                if not text:
                    continue
                sender = (
                    item.get("senderAgentName")
                    or item.get("senderUsername")
                    or item.get("role")
                    or "message"
                )
                created = item.get("createdAt")
                label = str(sender)
                if created:
                    label += f" @ {created}"
                details = []
                if item.get("role") and item.get("role") != sender:
                    details.append(f"role={item.get('role')}")
                suffix = f" ({', '.join(details)})" if details else ""
                lines.append(f"- {label}{suffix}: {text}")
            if lines:
                return "Recent Arinova history:\n" + "\n".join(lines)
        return ""

    @staticmethod
    def _members_section(task: dict) -> str:
        members = task.get("members")
        if isinstance(members, list) and members:
            lines = []
            for member in members:
                if not isinstance(member, dict):
                    continue
                agent_id = member.get("agentId")
                agent_name = member.get("agentName") or agent_id
                if agent_name:
                    detail = str(agent_name)
                    if agent_id and agent_id != agent_name:
                        detail += f" ({agent_id})"
                    lines.append(f"- {detail}")
            if lines:
                return "Arinova conversation agents:\n" + "\n".join(lines)
        return ""

    @staticmethod
    def _attachments_section(task: dict) -> str:
        attachments = task.get("attachments")
        if isinstance(attachments, list) and attachments:
            lines = []
            for attachment in attachments:
                if not isinstance(attachment, dict):
                    continue
                name = attachment.get("fileName") or attachment.get("id") or "attachment"
                attachment_id = attachment.get("id")
                file_type = attachment.get("fileType") or "application/octet-stream"
                size = attachment.get("fileSize")
                url = attachment.get("url")
                detail = f"- {name} ({file_type}"
                if attachment_id and attachment_id != name:
                    detail += f", id={attachment_id}"
                if (
                    size is not None
                    and not isinstance(size, bool)
                    and isinstance(size, (int, float))
                    and math.isfinite(size)
                ):
                    detail += f", {size} bytes"
                detail += ")"
                if url:
                    detail += f": {url}"
                lines.append(detail)
            if lines:
                return "Attachments:\n" + "\n".join(lines)
        return ""

    @staticmethod
    def _skills_section(task: dict) -> str:
        skills = task.get("availableSkills")
        if isinstance(skills, list) and skills:
            lines = []
            for skill in skills:
                if not isinstance(skill, dict):
                    continue
                name = skill.get("name") or skill.get("slug") or "skill"
                slug = skill.get("slug")
                slash = skill.get("slashCommand")
                desc = skill.get("description")
                parts = [str(name)]
                if slug:
                    parts.append(f"slug={slug}")
                if slash:
                    parts.append(f"slash={slash}")
                if desc:
                    parts.append(str(desc))
                lines.append("- " + " | ".join(parts))
            if lines:
                return (
                    "Available Arinova skills (use arinova_fetch_skill_prompt with slug for full prompt):\n"
                    + "\n".join(lines)
                )
        return ""

    @staticmethod
    def _metadata_section(task: dict) -> str:
        metadata_lines = []
        for label, key in (
            ("taskId", "taskId"),
            ("userMessageId", "userMessageId"),
            ("conversationId", "conversationId"),
            ("conversationName", "conversationName"),
            ("conversationType", "conversationType"),
            ("senderUserId", "senderUserId"),
            ("senderUsername", "senderUsername"),
            ("senderAgentId", "senderAgentId"),
            ("senderAgentName", "senderAgentName"),
        ):
            if key not in task or task.get(key) is None:
                continue
            value = task.get(key)
            if isinstance(value, str) or value:
                metadata_lines.append(f"- {label}: {value}")
        if metadata_lines:
            return "Arinova task metadata:\n" + "\n".join(metadata_lines)
        return ""

    def _task_text(self, task: dict, *, media_notes: list[str] | None = None) -> str:
        content = str(task.get("content") or "")
        sections = [
            content,
            self._reply_section(task),
            self._history_section(task),
            self._members_section(task),
            self._attachments_section(task),
            "Downloaded attachments:\n" + "\n".join(media_notes) if media_notes else "",
            self._skills_section(task),
            f"Arinova task kind: {task.get('taskKind')}" if task.get("taskKind") else "",
            self._metadata_section(task),
        ]

        return "\n\n".join(section for section in sections if section).strip()

    async def _handle_arinova_cancel(self, payload: dict) -> None:
        task_id = self._task_id_value(payload.get("taskId"))
        session_key = self._session_by_task.get(task_id)
        if not session_key:
            return
        logger.info("Arinova: cancelling task %s", task_id)
        self._forget_task(task_id)
        await self.cancel_session_processing(session_key, release_guard=True, discard_pending=True)
