"""Node sidecar supervision and authenticated callback HTTP server."""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import shutil
import subprocess
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

try:
    from ._http import (
        bridge_tokens_equal,
        callback_content_length,
        is_json_content_type,
        reject_duplicate_json_keys,
        reject_json_constant,
        urlopen_json,
    )
except ImportError:
    from _http import (  # type: ignore[no-redef]
        bridge_tokens_equal,
        callback_content_length,
        is_json_content_type,
        reject_duplicate_json_keys,
        reject_json_constant,
        urlopen_json,
    )


logger = logging.getLogger(__name__)
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

ADAPTER_CALLBACK_FIELDS = {
    "/task": {
        "taskId", "taskKind", "userMessageId", "conversationId",
        "conversationName", "conversationType", "content", "senderUserId",
        "senderUsername", "senderAgentId", "senderAgentName", "members",
        "replyTo", "history", "attachments", "availableSkills",
    },
    "/cancel": {"taskId"},
    "/token-claimed": {"agentId", "permanentToken"},
    "/onboarding-seed": {"kind", "seedId", "agentId", "action", "prompt"},
    "/connection-status": {"connected", "agentId"},
    "/auth-failed": {"error", "retryable"},
    "/sdk-error": {"error"},
}
ADAPTER_CALLBACK_REQUIRED_FIELDS = {
    "/task": {"taskId"},
    "/cancel": {"taskId"},
    "/token-claimed": {"permanentToken"},
    "/onboarding-seed": {"kind", "seedId", "agentId", "action", "prompt"},
    "/connection-status": {"connected"},
    "/auth-failed": {"error", "retryable"},
    "/sdk-error": {"error"},
}
TASK_CONTEXT_STRING_FIELDS = {
    "taskKind", "userMessageId", "conversationId", "conversationName",
    "conversationType", "senderUserId", "senderUsername", "senderAgentId",
    "senderAgentName",
}
TASK_MEMBER_FIELDS = {"agentId", "agentName"}
TASK_REPLY_FIELDS = {"id", "role", "content", "senderAgentId", "senderAgentName", "senderUsername"}
TASK_HISTORY_FIELDS = {"role", "content", "senderAgentName", "senderUsername", "createdAt"}
TASK_ATTACHMENT_FIELDS = {"id", "fileName", "fileType", "fileSize", "url"}
TASK_SKILL_FIELDS = {"slug", "name", "slashCommand", "description"}


def _require_object(value: Any, field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"callback {field} must be an object")
    return value


def _require_object_array(value: Any, field: str) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise ValueError(f"callback {field} must be an array")
    items = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            raise ValueError(f"callback {field}[{index}] must be an object")
        items.append(item)
    return items


def _reject_unknown_fields(value: dict[str, Any], field: str, allowed: set[str]) -> None:
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise ValueError(f"callback {field} has unsupported field(s): {', '.join(unknown)}")


def _require_string_fields(value: dict[str, Any], field: str, keys: tuple[str, ...]) -> None:
    for key in keys:
        if not isinstance(value.get(key), str):
            raise ValueError(f"callback {field}.{key} must be a string")


def _require_optional_string_fields(
    value: dict[str, Any],
    field: str,
    keys: tuple[str, ...],
) -> None:
    for key in keys:
        if key in value and value.get(key) is not None and not isinstance(value.get(key), str):
            raise ValueError(f"callback {field}.{key} must be a string or null")


def _validate_task_context(payload: dict[str, Any]) -> None:
    for key in TASK_CONTEXT_STRING_FIELDS:
        if key in payload and payload.get(key) is not None and not isinstance(payload.get(key), str):
            raise ValueError(f"callback {key} must be a string or null")
    if "members" in payload and payload.get("members") is not None:
        for index, member in enumerate(_require_object_array(payload.get("members"), "members")):
            field = f"members[{index}]"
            _reject_unknown_fields(member, field, TASK_MEMBER_FIELDS)
            _require_string_fields(member, field, ("agentId", "agentName"))
    if "replyTo" in payload and payload.get("replyTo") is not None:
        reply_to = _require_object(payload.get("replyTo"), "replyTo")
        _reject_unknown_fields(reply_to, "replyTo", TASK_REPLY_FIELDS)
        _require_string_fields(reply_to, "replyTo", ("role", "content"))
        _require_optional_string_fields(
            reply_to,
            "replyTo",
            ("id", "senderAgentId", "senderAgentName", "senderUsername"),
        )
    if "history" in payload and payload.get("history") is not None:
        for index, item in enumerate(_require_object_array(payload.get("history"), "history")):
            field = f"history[{index}]"
            _reject_unknown_fields(item, field, TASK_HISTORY_FIELDS)
            _require_string_fields(item, field, ("role", "content", "createdAt"))
            _require_optional_string_fields(item, field, ("senderAgentName", "senderUsername"))
    if "attachments" in payload and payload.get("attachments") is not None:
        for index, attachment in enumerate(
            _require_object_array(payload.get("attachments"), "attachments")
        ):
            field = f"attachments[{index}]"
            _reject_unknown_fields(attachment, field, TASK_ATTACHMENT_FIELDS)
            _require_string_fields(attachment, field, ("id", "fileName", "fileType", "url"))
            size = attachment.get("fileSize")
            if isinstance(size, bool) or not isinstance(size, (int, float)) or not math.isfinite(size):
                raise ValueError(f"callback {field}.fileSize must be a finite number")
    if "availableSkills" in payload and payload.get("availableSkills") is not None:
        for index, skill in enumerate(
            _require_object_array(payload.get("availableSkills"), "availableSkills")
        ):
            field = f"availableSkills[{index}]"
            _reject_unknown_fields(skill, field, TASK_SKILL_FIELDS)
            _require_string_fields(skill, field, ("slug", "name", "description"))
            slash = skill.get("slashCommand")
            if slash is not None and not isinstance(slash, str):
                raise ValueError(f"callback {field}.slashCommand must be a string or null")


def validate_adapter_callback_payload(path: str, payload: dict[str, Any]) -> None:
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
        content_required = payload.get("taskKind") not in {"cron_wakeup", "trigger"}
        if content_required and "content" not in payload:
            raise ValueError("callback request body is missing required field(s): content")
        if "content" in payload and not isinstance(payload.get("content"), str):
            raise ValueError("callback content must be a string")
        _validate_task_context(payload)
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


def _redact(value: str, keep: int = 6) -> str:
    if not value:
        return "<empty>"
    if len(value) <= keep:
        return "***"
    return f"{value[:keep]}..."


def sidecar_sdk_package(sidecar_dir: Path = SIDECAR_DIR) -> Path:
    return sidecar_dir / "node_modules/@arinova-ai/agent-sdk/package.json"


def local_sdk_package(sdk_root: str | Path | None = None) -> Path | None:
    root = Path(
        sdk_root or os.getenv("ARINOVA_AGENT_SDK_ROOT") or DEFAULT_SDK_ROOT
    ).expanduser()
    package_path = root / "package.json"
    return package_path if package_path.is_file() else None


def sdk_public_metadata(package: dict[str, Any]) -> dict[str, Any]:
    return {key: package.get(key) for key in SDK_PACKAGE_PUBLIC_METADATA_KEYS}


def sdk_package_file_drift(installed_sdk_dir: Path, local_sdk_dir: Path) -> list[str]:
    drift = []
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


def sidecar_lockfile_error(
    sidecar_package: dict[str, Any],
    sdk_package: dict[str, Any],
    *,
    sidecar_dir: Path = SIDECAR_DIR,
) -> str | None:
    lockfile_path = sidecar_dir / "package-lock.json"
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


def node_syntax_error(
    node_bin: str,
    relative_path: str,
    *,
    sidecar_dir: Path = SIDECAR_DIR,
) -> str | None:
    path = sidecar_dir / relative_path
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


def sidecar_dependency_error(
    node_bin: str | None = None,
    sdk_root: str | Path | None = None,
    *,
    sidecar_dir: Path = SIDECAR_DIR,
) -> str | None:
    sidecar_package_path = sidecar_dir / "package.json"
    sdk_package_path = sidecar_sdk_package(sidecar_dir)
    if not sdk_package_path.exists():
        return f"sidecar dependencies are missing; run `npm install` in {sidecar_dir}"
    try:
        sidecar_package = json.loads(sidecar_package_path.read_text(encoding="utf-8"))
        sdk_package = json.loads(sdk_package_path.read_text(encoding="utf-8"))
    except Exception as exc:
        return f"sidecar dependency metadata could not be read: {exc}"
    expected_version = sidecar_package.get("dependencies", {}).get("@arinova-ai/agent-sdk")
    actual_version = sdk_package.get("version")
    if not expected_version:
        return "sidecar package.json is missing @arinova-ai/agent-sdk dependency"
    if sdk_package.get("name") != "@arinova-ai/agent-sdk":
        return f"sidecar installed unexpected SDK package: {sdk_package.get('name')!r}"
    if actual_version != expected_version:
        return f"sidecar SDK version mismatch: installed {actual_version!r}, expected {expected_version!r}"
    if sdk_package.get("type") != "module":
        return "sidecar SDK package is not ESM"
    lockfile_error = sidecar_lockfile_error(
        sidecar_package,
        sdk_package,
        sidecar_dir=sidecar_dir,
    )
    if lockfile_error:
        return lockfile_error
    local_sdk_package_path = local_sdk_package(sdk_root)
    if local_sdk_package_path is not None:
        try:
            local_sdk = json.loads(local_sdk_package_path.read_text(encoding="utf-8"))
        except Exception as exc:
            return f"local SDK package metadata could not be read: {exc}"
        installed_metadata = sdk_public_metadata(sdk_package)
        if installed_metadata != sdk_public_metadata(local_sdk):
            return f"sidecar SDK package metadata drifted: {installed_metadata!r}"
    exports = sdk_package.get("exports", {}).get(".")
    if not isinstance(exports, dict) or not exports.get("import") or not exports.get("types"):
        return f"sidecar SDK package exports drifted: {exports!r}"
    sdk_package_dir = sdk_package_path.parent
    missing = [path for path in SDK_PACKAGE_FILES if not (sdk_package_dir / path).is_file()]
    if missing:
        return f"sidecar SDK package files are missing: {', '.join(missing)}"
    if local_sdk_package_path is not None:
        drift = sdk_package_file_drift(sdk_package_dir, local_sdk_package_path.parent)
        if drift:
            return f"sidecar SDK package files drifted: {', '.join(drift)}"
    node = node_bin or os.getenv("ARINOVA_NODE_BIN") or "node"
    for relative_path in SIDECAR_JS_CHECK_FILES:
        error = node_syntax_error(node, relative_path, sidecar_dir=sidecar_dir)
        if error:
            return error
    return None


def node_version_supported(node_bin: str) -> bool:
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
    try:
        major = int((result.stdout or "").strip().lstrip("v").split(".", 1)[0])
    except (TypeError, ValueError):
        return False
    return major >= 22


def start_inbound_server(adapter: Any) -> None:
    if adapter._httpd:
        return

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args: Any) -> None:
            logger.debug("Arinova inbound: " + fmt, *args)

        def _authorized(self) -> bool:
            return bridge_tokens_equal(
                self.headers.get("X-Arinova-Bridge-Token"),
                adapter._shared_token,
            )

        def do_GET(self) -> None:
            if not self._authorized():
                self.send_error(401)
                return
            if self.path != "/healthz":
                self.send_error(404)
                return
            self._send_json(200, {"ok": True})

        def do_POST(self) -> None:
            if not self._authorized():
                self.send_error(401)
                return
            if not is_json_content_type(self.headers.get("Content-Type")):
                self._send_json(415, {
                    "ok": False,
                    "error": "callback request body must use application/json",
                })
                return
            try:
                length = callback_content_length(self.headers.get("Content-Length"))
                if length > adapter.control_max_body_bytes:
                    self._send_json(413, {
                        "ok": False,
                        "error": f"callback request body exceeds {adapter.control_max_body_bytes} bytes",
                    })
                    return
                body = self.rfile.read(length)
                if len(body) > adapter.control_max_body_bytes:
                    self._send_json(413, {
                        "ok": False,
                        "error": f"callback request body exceeds {adapter.control_max_body_bytes} bytes",
                    })
                    return
                payload = json.loads(
                    body.decode("utf-8") or "{}",
                    parse_constant=reject_json_constant,
                    object_pairs_hook=reject_duplicate_json_keys,
                )
                if not isinstance(payload, dict):
                    raise ValueError("request body must be a JSON object")
                validate_adapter_callback_payload(self.path, payload)
            except Exception as exc:
                self._send_json(400, {"ok": False, "error": str(exc)})
                return

            dispatch = {
                "/task": lambda: adapter._schedule_task(payload),
                "/cancel": lambda: adapter._schedule_cancel(payload),
                "/token-claimed": lambda: adapter._schedule_callback(adapter._handle_token_claimed, payload),
                "/onboarding-seed": lambda: adapter._schedule_callback(adapter._handle_onboarding_seed, payload),
                "/connection-status": lambda: adapter._schedule_callback(adapter._handle_connection_status, payload),
                "/auth-failed": lambda: adapter._schedule_callback(adapter._handle_auth_failed, payload),
                "/sdk-error": lambda: adapter._schedule_callback(adapter._handle_sdk_error, payload),
            }.get(self.path)
            if dispatch is None:
                self.send_error(404)
                return
            dispatch()
            self._send_json(202, {"ok": True})

        def _send_json(self, status: int, payload: dict) -> None:
            data = json.dumps(payload, allow_nan=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    adapter._httpd = ThreadingHTTPServer((adapter.bind_host, adapter.adapter_port), Handler)
    adapter._http_thread = threading.Thread(
        target=adapter._httpd.serve_forever,
        name="arinova-adapter-http",
        daemon=True,
    )
    adapter._http_thread.start()


def start_sidecar(
    adapter: Any,
    *,
    sidecar_dir: Path = SIDECAR_DIR,
    node_version_check=node_version_supported,
    dependency_check=None,
) -> None:
    if adapter._sidecar_proc and adapter._sidecar_proc.poll() is None:
        return
    if adapter._sidecar_proc:
        if adapter._sidecar_proc.stdout:
            adapter._sidecar_proc.stdout.close()
        if adapter._sidecar_log_thread and adapter._sidecar_log_thread.is_alive():
            adapter._sidecar_log_thread.join(timeout=1)
        adapter._sidecar_proc = None
        adapter._sidecar_log_thread = None
    if not shutil.which(adapter.node_bin):
        raise RuntimeError(f"Node executable not found for Arinova sidecar: {adapter.node_bin}")
    if not node_version_check(adapter.node_bin):
        raise RuntimeError(f"Arinova sidecar requires Node >=22: {adapter.node_bin}")
    dependency_error = (
        dependency_check(adapter.node_bin, adapter.agent_sdk_root)
        if dependency_check is not None
        else sidecar_dependency_error(
            adapter.node_bin,
            adapter.agent_sdk_root,
            sidecar_dir=sidecar_dir,
        )
    )
    if dependency_error:
        raise RuntimeError(dependency_error)

    logger.info(
        "Arinova: starting sidecar for %s token=%s",
        adapter.server_url,
        _redact(adapter.bot_token),
    )
    adapter._sidecar_proc = subprocess.Popen(
        [adapter.node_bin, str(sidecar_dir / "index.mjs")],
        cwd=str(sidecar_dir),
        env=adapter._sidecar_env(),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    adapter._sidecar_log_thread = threading.Thread(
        target=adapter._drain_sidecar_logs,
        name="arinova-sidecar-logs",
        daemon=True,
    )
    adapter._sidecar_log_thread.start()


def sidecar_env(adapter: Any) -> dict[str, str]:
    env = os.environ.copy()
    env.update({
        "ARINOVA_SERVER_URL": adapter.server_url,
        "ARINOVA_BOT_TOKEN": adapter.bot_token,
        "ARINOVA_SIDECAR_PORT": str(adapter.sidecar_port),
        "ARINOVA_SIDECAR_BIND": adapter.sidecar_host,
        "ARINOVA_ADAPTER_URL": f"http://{adapter.bind_host}:{adapter.adapter_port}",
        "ARINOVA_BRIDGE_TOKEN": adapter._shared_token,
        "ARINOVA_CONCURRENCY_MODE": str(adapter.concurrency_mode),
    })
    optional_env = {
        "ARINOVA_AGENT_SKILLS_JSON": adapter.agent_skills_json,
        "ARINOVA_RECONNECT_INTERVAL_MS": adapter.reconnect_interval_ms,
        "ARINOVA_PING_INTERVAL_MS": adapter.ping_interval_ms,
        "ARINOVA_PING_TIMEOUT_MS": adapter.ping_timeout_ms,
        "ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION": adapter.max_consecutive_per_conversation,
        "ARINOVA_MAX_QUEUED_TASKS": adapter.max_queued_tasks,
        "ARINOVA_ADAPTER_POST_TIMEOUT_MS": adapter.adapter_post_timeout_ms,
        "ARINOVA_CONTROL_MAX_BODY_BYTES": adapter.control_max_body_bytes,
        "ARINOVA_AGENT_SDK_ROOT": adapter.agent_sdk_root,
    }
    env.update({key: str(value) for key, value in optional_env.items() if value not in (None, "")})
    return env


def drain_sidecar_logs(adapter: Any) -> None:
    proc = adapter._sidecar_proc
    if not proc or not proc.stdout:
        return
    for line in proc.stdout:
        message = line.rstrip()
        adapter._sidecar_log_tail.append(message)
        logger.info("[arinova-sidecar] %s", message)


def sidecar_exit_error(adapter: Any) -> RuntimeError:
    code = adapter._sidecar_proc.returncode if adapter._sidecar_proc else None
    detail = f"sidecar exited before SDK authentication (exit {code})"
    if adapter._sidecar_log_tail:
        detail += "; recent sidecar output: " + " | ".join(list(adapter._sidecar_log_tail)[-5:])
    return RuntimeError(detail)


async def wait_for_sidecar(adapter: Any) -> None:
    deadline = time.monotonic() + max(adapter.connect_timeout_ms, 1000) / 1000
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        if adapter._sidecar_proc and adapter._sidecar_proc.poll() is not None:
            raise adapter._sidecar_exit_error()
        try:
            health = await asyncio.to_thread(adapter._post_sidecar, "/healthz", {})
            if health.get("ok") is not True:
                last_error = RuntimeError(f"sidecar control server reported unhealthy state: {health}")
                await asyncio.sleep(0.5)
                continue
            if health.get("connected") is True:
                agent_id = health.get("agentId")
                if isinstance(agent_id, str) and agent_id:
                    adapter._claimed_agent_id = agent_id
                return
            last_error = RuntimeError("sidecar control server is up but SDK is not authenticated yet")
        except Exception as exc:
            last_error = exc
        if adapter.has_fatal_error:
            raise RuntimeError(adapter.fatal_error_message or "sidecar reported a fatal error")
        await asyncio.sleep(0.5)
    raise RuntimeError(f"sidecar did not become healthy: {last_error}")


def post_sidecar(adapter: Any, path: str, payload: dict) -> dict:
    data = json.dumps(payload, allow_nan=False).encode("utf-8")
    req = urllib.request.Request(
        f"http://{adapter.sidecar_host}:{adapter.sidecar_port}{path}",
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Arinova-Bridge-Token": adapter._shared_token,
        },
    )
    return urlopen_json(
        req,
        timeout=max(adapter.sidecar_post_timeout_ms, 1) / 1000,
        label=path,
    )
