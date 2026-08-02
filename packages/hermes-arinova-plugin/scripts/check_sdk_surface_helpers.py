
from __future__ import annotations

import argparse
import re
import sys
import json
import ast
import importlib.util
import subprocess
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SDK_ROOT = Path.home() / ".arinova-bridge/workspace/projects/arinova-packages/packages/agent-sdk"
DEFAULT_SDK_CLIENT = DEFAULT_SDK_ROOT / "src/client.ts"
EXPECTED_SDK_CLIENT_TEST_NAMES = {
    "constructs base URL from options",
    "bearer token format is correct",
    "CLI API key format differs from bot token",
    "token is included in Authorization header",
    "empty token produces valid header",
    "session token from cookie is extracted correctly",
    "parses JSON error response",
    "handles 401 unauthorized",
    "handles 403 forbidden (banned)",
    "handles 429 rate limit",
    "handles network error gracefully",
    "send message requires conversationId and content",
    "create note requires title",
    "kanban card requires title",
    "file upload uses multipart form data",
    "sendMessage falls back to HTTP with auth and JSON body when websocket is closed",
    "sendMessage includes backend error text in failures",
    "uploadFile posts multipart body with conversation id, file, and bearer auth",
    "uploadFile surfaces backend error text",
    "fetchHistory builds paginated request with bearer auth and returns backend metadata",
    "fetchHistory surfaces backend error text",
    "same conversation queues second task instead of executing",
    "forwards agent-sender identity (senderAgentId/senderAgentName) to the task context",
    "different conversations run in parallel",
    "processNextTask dequeues after sendComplete",
    "cancel queued task removes from queue without aborting active",
    "cleanup aborts active tasks and does NOT start queued tasks",
    "full cleanup clears buffered chunks and terminal events",
    "reconnect cleanup preserves active tasks and queued work",
    "task callAction sends attributed action_call and resolves action_result",
    "buffers terminal events while disconnected and flushes after reconnect",
    "buffers chunks while disconnected and flushes them before terminal events",
    "abort emits agent_error with reason:cancelled so rust-server can broadcast stream_end",
    "queue overflow drops oldest queued task",
    "cross-conv second task queues instead of running in parallel",
    "does not starve a third conv when A/B have perpetual backlog",
    "task_queued emitted on queue push with correct queuePosition (and overflow path)",
    "task_queued globalQueueSize spans multiple conversations",
    "does not stop or count server-unreachable auth timeouts after 5 retries",
    "keeps retrying after 5 real auth errors instead of permanently stopping",
    "counts only real auth errors when retryable server errors are mixed in",
    "normal ping/pong does not force close",
    "agent_auth declares action_call runtime capability",
    "server stops pong and next watchdog check closes websocket",
    "first connection without pong uses onopen grace period before timeout",
    "passes undefined conversationId and the taskKind through to ctx",
    "keys scheduler maps on the sentinel, not undefined",
    "serialises concurrent no-conversation tasks under the sentinel queue",
    "drains the sentinel queue after sendComplete",
    "rejects conversation-scoped APIs with a descriptive error",
    "does not interfere with real conversations in per-conversation mode",
    "surfaces a valid onboardingSeed before connect() resolves",
    "returns null when auth_ok carries no seed (e.g. reconnect / old server)",
    "clears a previously-seen seed on a reconnect auth_ok without one",
    "drops a malformed seed (missing fields / unknown kind)",
    "obt_* → claim_ok → re-auth with permanent token → auth_ok carries the seed",
}
EXPECTED_SDK_CLIENT_HTTP_VALIDATION_TEST_NAMES = {
    "constructs base URL from options",
    "bearer token format is correct",
    "CLI API key format differs from bot token",
    "token is included in Authorization header",
    "empty token produces valid header",
    "session token from cookie is extracted correctly",
    "parses JSON error response",
    "handles 401 unauthorized",
    "handles 403 forbidden (banned)",
    "handles 429 rate limit",
    "handles network error gracefully",
    "send message requires conversationId and content",
    "create note requires title",
    "kanban card requires title",
    "file upload uses multipart form data",
    "sendMessage falls back to HTTP with auth and JSON body when websocket is closed",
    "sendMessage includes backend error text in failures",
    "uploadFile posts multipart body with conversation id, file, and bearer auth",
    "uploadFile surfaces backend error text",
    "fetchHistory builds paginated request with bearer auth and returns backend metadata",
    "fetchHistory surfaces backend error text",
}
EXPECTED_SDK_CLIENT_TASK_SCHEDULING_TEST_NAMES = {
    "same conversation queues second task instead of executing",
    "forwards agent-sender identity (senderAgentId/senderAgentName) to the task context",
    "different conversations run in parallel",
    "processNextTask dequeues after sendComplete",
    "cancel queued task removes from queue without aborting active",
    "cleanup aborts active tasks and does NOT start queued tasks",
    "queue overflow drops oldest queued task",
    "cross-conv second task queues instead of running in parallel",
    "does not starve a third conv when A/B have perpetual backlog",
    "task_queued emitted on queue push with correct queuePosition (and overflow path)",
    "task_queued globalQueueSize spans multiple conversations",
}
EXPECTED_SDK_CLIENT_RECONNECT_BUFFER_TEST_NAMES = {
    "full cleanup clears buffered chunks and terminal events",
    "reconnect cleanup preserves active tasks and queued work",
    "buffers terminal events while disconnected and flushes after reconnect",
    "buffers chunks while disconnected and flushes them before terminal events",
    "normal ping/pong does not force close",
    "server stops pong and next watchdog check closes websocket",
    "first connection without pong uses onopen grace period before timeout",
}
EXPECTED_SDK_CLIENT_TASK_ACTION_TEST_NAMES = {
    "task callAction sends attributed action_call and resolves action_result",
    "abort emits agent_error with reason:cancelled so rust-server can broadcast stream_end",
    "agent_auth declares action_call runtime capability",
}
EXPECTED_SDK_CLIENT_NO_CONVERSATION_TEST_NAMES = {
    "passes undefined conversationId and the taskKind through to ctx",
    "keys scheduler maps on the sentinel, not undefined",
    "serialises concurrent no-conversation tasks under the sentinel queue",
    "drains the sentinel queue after sendComplete",
    "rejects conversation-scoped APIs with a descriptive error",
    "does not interfere with real conversations in per-conversation mode",
}
EXPECTED_SDK_CLIENT_AUTH_RETRY_TEST_NAMES = {
    "does not stop or count server-unreachable auth timeouts after 5 retries",
    "keeps retrying after 5 real auth errors instead of permanently stopping",
    "counts only real auth errors when retryable server errors are mixed in",
}
EXPECTED_SDK_CLIENT_ONBOARDING_TEST_NAMES = {
    "surfaces a valid onboardingSeed before connect() resolves",
    "returns null when auth_ok carries no seed (e.g. reconnect / old server)",
    "clears a previously-seen seed on a reconnect auth_ok without one",
    "drops a malformed seed (missing fields / unknown kind)",
    "obt_* → claim_ok → re-auth with permanent token → auth_ok carries the seed",
}
EXPECTED_SDK_TYPES_TEST_NAMES = {
    "supports action call context and file-reference arguments",
    "models action success, error, and confirmation results",
    "exposes upload metadata and inbound attachment shapes",
    "keeps TaskContext upload and action helpers aligned with exported result types",
}
EXPECTED_SDK_TYPES_ACTION_CONTEXT_TEST_NAMES = {
    "supports action call context and file-reference arguments",
}
EXPECTED_SDK_TYPES_ACTION_RESULT_TEST_NAMES = {
    "models action success, error, and confirmation results",
}
EXPECTED_SDK_TYPES_UPLOAD_ATTACHMENT_TEST_NAMES = {
    "exposes upload metadata and inbound attachment shapes",
}
EXPECTED_SDK_TYPES_TASK_CONTEXT_HELPER_TEST_NAMES = {
    "keeps TaskContext upload and action helpers aligned with exported result types",
}
EXPECTED_SDK_README_METHOD_HEADINGS = {
    "agent.onTask",
    "agent.on",
    "agent.connect",
    "agent.disconnect",
    "agent.sendMessage",
    "agent.uploadFile",
    "agent.fetchHistory",
    "agent.listNotes",
    "agent.createNote",
    "agent.updateNote",
    "agent.deleteNote",
    "agent.listBoards",
    "agent.createBoard",
    "agent.updateBoard",
    "agent.archiveBoard",
    "agent.listColumns",
    "agent.createColumn",
    "agent.updateColumn",
    "agent.deleteColumn",
    "agent.reorderColumns",
    "agent.listCards",
    "agent.createCard",
    "agent.updateCard",
    "agent.completeCard",
    "agent.listArchivedCards",
    "agent.addCardCommit",
    "agent.listCardCommits",
    "agent.linkCardNote",
    "agent.unlinkCardNote",
    "agent.listCardNotes",
    "agent.listLabels",
    "agent.createLabel",
    "agent.updateLabel",
    "agent.deleteLabel",
    "agent.addCardLabel",
    "agent.removeCardLabel",
    "agent.queryMemory",
}
EXPECTED_SDK_README_LIFECYCLE_METHOD_HEADINGS = {
    "agent.onTask",
    "agent.on",
    "agent.connect",
    "agent.disconnect",
}
EXPECTED_SDK_README_MESSAGE_FILE_METHOD_HEADINGS = {
    "agent.sendMessage",
    "agent.uploadFile",
    "agent.fetchHistory",
}
EXPECTED_SDK_README_NOTE_METHOD_HEADINGS = {
    "agent.listNotes",
    "agent.createNote",
    "agent.updateNote",
    "agent.deleteNote",
}
EXPECTED_SDK_README_KANBAN_METHOD_HEADINGS = {
    "agent.listBoards",
    "agent.createBoard",
    "agent.updateBoard",
    "agent.archiveBoard",
    "agent.listColumns",
    "agent.createColumn",
    "agent.updateColumn",
    "agent.deleteColumn",
    "agent.reorderColumns",
    "agent.listCards",
    "agent.createCard",
    "agent.updateCard",
    "agent.completeCard",
    "agent.listArchivedCards",
    "agent.addCardCommit",
    "agent.listCardCommits",
    "agent.linkCardNote",
    "agent.unlinkCardNote",
    "agent.listCardNotes",
    "agent.listLabels",
    "agent.createLabel",
    "agent.updateLabel",
    "agent.deleteLabel",
    "agent.addCardLabel",
    "agent.removeCardLabel",
}
EXPECTED_SDK_README_MEMORY_METHOD_HEADINGS = {
    "agent.queryMemory",
}
EXPECTED_SDK_README_TYPE_SYMBOLS = {
    "KanbanBoard",
    "KanbanColumn",
    "KanbanCard",
    "CreateBoardBody",
    "UpdateBoardBody",
    "CreateCardBody",
    "UpdateCardBody",
    "CreateColumnBody",
    "UpdateColumnBody",
    "AddCommitBody",
    "CardCommit",
    "CardNote",
    "KanbanLabel",
    "CreateLabelBody",
    "UpdateLabelBody",
    "ArchivedCardsResult",
    "Note",
    "MemoryOrigin",
    "MemoryEntry",
}
EXPECTED_SDK_README_KANBAN_TYPE_SYMBOLS = {
    "KanbanBoard",
    "KanbanColumn",
    "KanbanCard",
    "CreateBoardBody",
    "UpdateBoardBody",
    "CreateCardBody",
    "UpdateCardBody",
    "CreateColumnBody",
    "UpdateColumnBody",
    "AddCommitBody",
    "CardCommit",
    "CardNote",
    "KanbanLabel",
    "CreateLabelBody",
    "UpdateLabelBody",
    "ArchivedCardsResult",
}
EXPECTED_SDK_README_NOTE_MEMORY_TYPE_SYMBOLS = {
    "Note",
    "MemoryOrigin",
    "MemoryEntry",
}
EXPECTED_SDK_README_OPTION_NAMES = {
    "serverUrl",
    "botToken",
    "reconnectInterval",
    "pingInterval",
}
EXPECTED_SDK_README_AUTH_OPTION_NAMES = {
    "serverUrl",
    "botToken",
}
EXPECTED_SDK_README_TIMING_OPTION_NAMES = {
    "reconnectInterval",
    "pingInterval",
}
EXPECTED_SDK_README_TASK_CONTEXT_ITEMS = {
    "taskId",
    "conversationId",
    "content",
    "sendChunk(chunk)",
    "sendComplete(content)",
    "sendError(error)",
}
EXPECTED_SDK_README_TASK_CONTEXT_FIELD_ITEMS = {
    "taskId",
    "conversationId",
    "content",
}
EXPECTED_SDK_README_TASK_CONTEXT_REPLY_ITEMS = {
    "sendChunk(chunk)",
    "sendComplete(content)",
    "sendError(error)",
}
INTENTIONALLY_LOCAL = {
    "connect",
    "disconnect",
    "on",
    "onTask",
}
EXPECTED_LOCAL_LIFECYCLE_METHODS = {
    "connect",
    "disconnect",
    "on",
    "onTask",
}
INTENTIONALLY_LOCAL_TASK_FIELDS = {
    "conversationName",
}
EXPECTED_MANIFEST_ENV = {
    "ARINOVA_SERVER_URL",
    "ARINOVA_BOT_TOKEN",
    "ARINOVA_ALLOW_ALL_USERS",
    "ARINOVA_ALLOWED_USERS",
    "ARINOVA_ALLOW_BOTS",
    "ARINOVA_HOME_CONVERSATION",
    "ARINOVA_HOME_CONVERSATION_NAME",
    "ARINOVA_NODE_BIN",
    "ARINOVA_AGENT_SDK_ROOT",
    "ARINOVA_SIDECAR_PORT",
    "ARINOVA_ADAPTER_PORT",
    "ARINOVA_SIDECAR_BIND",
    "ARINOVA_ADAPTER_BIND",
    "ARINOVA_SIDECAR_AUTOSTART",
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
    "ARINOVA_DOWNLOAD_ATTACHMENTS",
    "ARINOVA_ATTACHMENT_MAX_BYTES",
}
EXPECTED_CONTROL_ENV = {
    "ARINOVA_ADAPTER_POST_TIMEOUT_MS",
    "ARINOVA_CONTROL_MAX_BODY_BYTES",
}
EXPECTED_SDK_OPTION_CONFIG = {
    "serverUrl": {
        "env": {"ARINOVA_SERVER_URL"},
        "yaml": {"server_url"},
    },
    "botToken": {
        "env": {"ARINOVA_BOT_TOKEN"},
        "yaml": {"bot_token", "token"},
    },
    "skills": {
        "env": {"ARINOVA_AGENT_SKILLS_JSON", "ARINOVA_AGENT_SKILLS"},
        "yaml": {"agent_skills_json", "agent_skills"},
        "readme_yaml": {"agent_skills"},
    },
    "reconnectInterval": {
        "env": {"ARINOVA_RECONNECT_INTERVAL_MS"},
        "yaml": {"reconnect_interval_ms"},
    },
    "pingInterval": {
        "env": {"ARINOVA_PING_INTERVAL_MS"},
        "yaml": {"ping_interval_ms"},
    },
    "pingTimeout": {
        "env": {"ARINOVA_PING_TIMEOUT_MS"},
        "yaml": {"ping_timeout_ms"},
    },
    "concurrencyMode": {
        "env": {"ARINOVA_CONCURRENCY_MODE", "ARINOVA_AGENT_CONCURRENCY_MODE"},
        "yaml": {"concurrency_mode", "agent_concurrency_mode"},
    },
    "maxConsecutivePerConversation": {
        "env": {"ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION"},
        "yaml": {"max_consecutive_per_conversation"},
    },
}
EXPECTED_YAML_SPECIAL_KEYS = {
    "agent_skills",
    "agent_skills_json",
    "allowed_users",
    "allow_all_users",
    "allow_from",
    "home_channel",
    "home_conversation",
}
EXPECTED_SIDECAR_CHECKS = {
    "check-runtime.mjs",
    "check-sdk-e2e.mjs",
    "check-sdk-http.mjs",
}
EXPECTED_README_CHECK_SNIPPETS = {
    "python3 scripts/check_local.py --hermes-root ~/hermes-agent",
    "python3 scripts/check_sdk_surface.py",
    "python3 scripts/check_agent_sdk_source.py",
    "python3 scripts/check_arinova_tools.py",
    "python3 scripts/check_live_connection_gate.py",
    "scripts/check_hermes_plugin_load.py --hermes-root",
    "scripts/check_gateway_config_load.py --hermes-root",
    "scripts/check_user_install.py --hermes-root",
    "python3 -m py_compile",
    "python3.13 scripts/check_clean_install.py --hermes-root ~/hermes-agent",
    "cd sidecar && npm run check",
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
    parser.add_argument(
        "sdk_client",
        nargs="?",
        help="Optional path to agent-sdk src/client.ts. Prefer --sdk-root for full-checkout parity.",
    )
    parser.add_argument("--sdk-root", help="Path to the agent-sdk checkout.")
    return parser.parse_args()


REQUIRED_PLUGIN_FILES = (
    "README.md",
    "__init__.py",
    "adapter.py",
    "arinova_tools.py",
    "plugin.yaml",
    "sidecar/index.mjs",
    "sidecar/runtime.mjs",
    "sidecar/package.json",
    "sidecar/package-lock.json",
    "sidecar/check-runtime.mjs",
    "sidecar/check-sdk-e2e.mjs",
    "sidecar/check-sdk-http.mjs",
    "scripts/check_local.py",
    "scripts/check_sdk_surface.py",
    "scripts/check_agent_sdk_source.py",
    "scripts/check_arinova_tools.py",
    "scripts/check_live_connection.py",
    "scripts/check_live_connection_gate.py",
    "scripts/check_gateway_config_load.py",
    "scripts/check_hermes_plugin_load.py",
    "scripts/check_user_install.py",
    "scripts/check_clean_install.py",
)


def public_agent_methods(source: str) -> set[str]:
    return set(public_agent_method_list(source))


def public_agent_method_list(source: str) -> list[str]:
    try:
        body = source.split("export class ArinovaAgent", 1)[1]
    except IndexError as exc:
        raise ValueError("could not find `export class ArinovaAgent`") from exc

    methods: list[str] = []
    for line in body.splitlines():
        match = re.match(
            r"^  (?!(?:private|protected)\b)(?:async )?([A-Za-z0-9_]+)(?:<[^>]+>)?\(",
            line,
        )
        if match and match.group(1) != "constructor":
            methods.append(match.group(1))
    return methods


def declared_agent_methods(source: str) -> set[str]:
    try:
        body = source.split("export declare class ArinovaAgent", 1)[1]
    except IndexError as exc:
        raise ValueError("could not find `export declare class ArinovaAgent`") from exc

    methods: set[str] = set()
    for line in body.splitlines():
        match = re.match(r"^\s{4}(?!(?:private|protected)\b)([A-Za-z0-9_]+)(?:<[^>]+>)?\(", line)
        if match and match.group(1) != "constructor":
            methods.add(match.group(1))
    return methods


def split_ts_params(params: str) -> list[str]:
    return [part.split(":", 1)[0].strip().rstrip("?") for part in split_ts_param_decls(params)]


def split_ts_param_decls(params: str) -> list[str]:
    names: list[str] = []
    current: list[str] = []
    depth = 0
    for char in params:
        if char in "({[<":
            depth += 1
        elif char in ")}]>":
            depth = max(0, depth - 1)
        if char == "," and depth == 0:
            part = "".join(current).strip()
            if part:
                names.append(part)
            current = []
            continue
        current.append(char)
    part = "".join(current).strip()
    if part:
        names.append(part)
    return names


def required_ts_param_count(params: str) -> int:
    count = 0
    for declaration in split_ts_param_decls(params):
        name = declaration.split(":", 1)[0].strip()
        if not name.endswith("?") and "=" not in declaration:
            count += 1
    return count


def class_method_params(source: str, class_marker: str) -> dict[str, list[str]]:
    try:
        body = source.split(class_marker, 1)[1]
    except IndexError as exc:
        raise ValueError(f"could not find `{class_marker}`") from exc

    params: dict[str, list[str]] = {}
    lines = body.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        match = re.match(
            r"^\s+(?!(?:private|protected)\b)(?:async )?([A-Za-z0-9_]+)(?:<[^>]+>)?\(",
            line,
        )
        if not match or match.group(1) == "constructor":
            index += 1
            continue
        name = match.group(1)
        collected = [line]
        paren_depth = line.count("(") - line.count(")")
        while paren_depth > 0 and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            paren_depth += lines[index].count("(") - lines[index].count(")")
        signature = "\n".join(collected)
        inner = signature.split("(", 1)[1].rsplit(")", 1)[0]
        params[name] = split_ts_params(inner)
        index += 1
    return params


def class_method_bodies(source: str, class_marker: str) -> dict[str, str]:
    try:
        body = source.split(class_marker, 1)[1]
    except IndexError as exc:
        raise ValueError(f"could not find `{class_marker}`") from exc

    methods: dict[str, str] = {}
    lines = body.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        match = re.match(
            r"^\s+(?!(?:private|protected)\b)(?:async )?([A-Za-z0-9_]+)(?:<[^>]+>)?\(",
            line,
        )
        if not match or match.group(1) == "constructor":
            index += 1
            continue
        name = match.group(1)
        collected = [line]
        paren_depth = line.count("(") - line.count(")")
        while paren_depth > 0 and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            paren_depth += lines[index].count("(") - lines[index].count(")")
        signature = "\n".join(collected)
        brace_depth = signature.count("{") - signature.count("}")
        while "{" not in signature and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            signature = "\n".join(collected)
            brace_depth = signature.count("{") - signature.count("}")
        while brace_depth > 0 and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            brace_depth += lines[index].count("{") - lines[index].count("}")
        methods[name] = "\n".join(collected)
        index += 1
    return methods


def class_method_required_param_counts(source: str, class_marker: str) -> dict[str, int]:
    try:
        body = source.split(class_marker, 1)[1]
    except IndexError as exc:
        raise ValueError(f"could not find `{class_marker}`") from exc

    counts: dict[str, int] = {}
    lines = body.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        match = re.match(
            r"^\s+(?!(?:private|protected)\b)(?:async )?([A-Za-z0-9_]+)(?:<[^>]+>)?\(",
            line,
        )
        if not match or match.group(1) == "constructor":
            index += 1
            continue
        name = match.group(1)
        collected = [line]
        paren_depth = line.count("(") - line.count(")")
        while paren_depth > 0 and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            paren_depth += lines[index].count("(") - lines[index].count(")")
        signature = "\n".join(collected)
        inner = signature.split("(", 1)[1].rsplit(")", 1)[0]
        counts[name] = required_ts_param_count(inner)
        index += 1
    return counts


def normalize_ts_type(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().rstrip(";"))


def normalize_ts_alias_body(value: str) -> str:
    normalized = normalize_ts_type(value)
    normalized = re.sub(r"^\|\s*", "", normalized)
    normalized = re.sub(r";\s*}", " }", normalized)
    normalized = re.sub(r"\{\s+", "{ ", normalized)
    normalized = re.sub(r"\s+\}", " }", normalized)
    return normalized


def class_method_returns(source: str, class_marker: str) -> dict[str, str]:
    try:
        body = source.split(class_marker, 1)[1]
    except IndexError as exc:
        raise ValueError(f"could not find `{class_marker}`") from exc

    returns: dict[str, str] = {}
    lines = body.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        match = re.match(
            r"^\s+(?!(?:private|protected)\b)(?:async )?([A-Za-z0-9_]+)(?:<[^>]+>)?\(",
            line,
        )
        if not match or match.group(1) == "constructor":
            index += 1
            continue
        name = match.group(1)
        collected = [line]
        paren_depth = line.count("(") - line.count(")")
        while paren_depth > 0 and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            paren_depth += lines[index].count("(") - lines[index].count(")")
        signature = "\n".join(collected)
        suffix = signature.rsplit(")", 1)[1]
        return_match = re.search(r":\s*(.*?)(?:\s*\{|;|$)", suffix, re.S)
        returns[name] = normalize_ts_type(return_match.group(1)) if return_match else ""
        index += 1
    return returns


def sidecar_agent_methods(source: str) -> set[str]:
    return set(sidecar_agent_method_list(source))


def sidecar_agent_method_list(source: str) -> list[str]:
    try:
        allowlist = source.split("const agentMethods = new Set([", 1)[1].split("]);", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find sidecar `agentMethods` allowlist") from exc
    return re.findall(r'"([A-Za-z0-9_]+)"', allowlist)


def sidecar_task_methods(source: str) -> set[str]:
    return set(sidecar_task_method_list(source))


def sidecar_task_method_list(source: str) -> list[str]:
    try:
        allowlist = source.split("const taskMethods = new Set([", 1)[1].split("]);", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find sidecar `taskMethods` allowlist") from exc
    return re.findall(r'"([A-Za-z0-9_]+)"', allowlist)


def python_agent_methods(source: str) -> set[str]:
    return set(python_agent_method_list(source))


def python_agent_method_list(source: str) -> list[str]:
    tree_match = re.search(r"AGENT_METHODS:\s*tuple\[str, \.\.\.\]\s*=\s*\((.*?)\)", source, re.S)
    if not tree_match:
        raise ValueError("could not find Python `AGENT_METHODS` tuple")
    return re.findall(r'"([A-Za-z0-9_]+)"', tree_match.group(1))


def python_task_methods(source: str) -> set[str]:
    return set(python_task_method_list(source))


def python_task_method_list(source: str) -> list[str]:
    tree_match = re.search(r"TASK_METHODS:\s*tuple\[str, \.\.\.\]\s*=\s*\((.*?)\)", source, re.S)
    if not tree_match:
        raise ValueError("could not find Python `TASK_METHODS` tuple")
    return re.findall(r'"([A-Za-z0-9_]+)"', tree_match.group(1))


def python_string_collection(source: str, name: str) -> set[str]:
    tree = ast.parse(source)
    for node in tree.body:
        value_node: ast.AST | None = None
        if isinstance(node, ast.Assign):
            if any(isinstance(target, ast.Name) and target.id == name for target in node.targets):
                value_node = node.value
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == name:
            value_node = node.value
        if value_node is None:
            continue
        try:
            value = ast.literal_eval(value_node)
        except ValueError as exc:
            raise ValueError(f"could not parse Python `{name}`") from exc
        if not isinstance(value, (set, tuple, list)) or not all(isinstance(item, str) for item in value):
            raise ValueError(f"Python `{name}` must be a string collection")
        return set(value)
    raise ValueError(f"could not find Python `{name}` collection")


def python_function_body(source: str, name: str) -> str:
    tree = ast.parse(source)
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            segment = ast.get_source_segment(source, node)
            if segment is None:
                raise ValueError(f"could not extract Python function `{name}`")
            return segment
    raise ValueError(f"could not find Python function `{name}`")


def python_direct_arg_type_validation_errors(source: str, mapping_name: str) -> set[str]:
    return python_arg_type_validation_errors(source, mapping_name, positional=False)


def python_positional_arg_type_validation_errors(source: str, mapping_name: str) -> set[str]:
    return python_arg_type_validation_errors(source, mapping_name, positional=True)


def python_arg_type_map(source: str, mapping_name: str) -> dict[str, list[str]]:
    value = python_module_value(ROOT / "arinova_tools.py", mapping_name)
    def schema_type(schema: dict[str, Any]) -> str:
        direct_type = schema.get("type")
        if isinstance(direct_type, str):
            return direct_type
        one_of = schema.get("oneOf")
        if isinstance(one_of, list) and one_of:
            branch_types = {
                branch.get("type")
                for branch in one_of
                if isinstance(branch, dict) and isinstance(branch.get("type"), str)
            }
            if len(branch_types) == 1:
                return str(next(iter(branch_types)))
        return ""

    return {
        str(method): [schema_type(schema) for _arg_name, schema in specs]
        for method, specs in value.items()
    }


def sidecar_arg_type_map(source: str, map_name: str) -> dict[str, list[str]]:
    try:
        body = source.split(f"const {map_name} = new Map([", 1)[1].split("]);", 1)[0]
    except IndexError as exc:
        raise ValueError(f"could not find sidecar `{map_name}`") from exc
    result: dict[str, list[str]] = {}
    for method, types_body in re.findall(r'\["([A-Za-z0-9_]+)",\s*\[(.*?)\]\]', body, re.S):
        result[method] = re.findall(r'"([A-Za-z]+)"', types_body)
    return result


def sidecar_arg_name_map(source: str, map_name: str) -> dict[str, list[str]]:
    try:
        body = source.split(f"const {map_name} = new Map([", 1)[1].split("]);", 1)[0]
    except IndexError as exc:
        raise ValueError(f"could not find sidecar `{map_name}`") from exc
    result: dict[str, list[str]] = {}
    for method, names_body in re.findall(r'\["([A-Za-z0-9_]+)",\s*\[(.*?)\]\]', body, re.S):
        result[method] = re.findall(r'"([A-Za-z_]+)"', names_body)
    return result


def camel_schema_name(name: str) -> str:
    parts = name.lower().split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


def python_structured_arg_schema_map(source: str, mapping_name: str) -> dict[str, list[str | None]]:
    tree = ast.parse(source)
    for node in tree.body:
        if not isinstance(node, ast.AnnAssign) or not isinstance(node.target, ast.Name):
            continue
        if node.target.id != mapping_name or not isinstance(node.value, ast.Dict):
            continue
        result: dict[str, list[str | None]] = {}
        for method_node, method_specs in zip(node.value.keys, node.value.values):
            if not isinstance(method_node, ast.Constant) or not isinstance(method_node.value, str):
                continue
            if not isinstance(method_specs, ast.Tuple):
                continue
            schemas: list[str | None] = []
            for arg_spec in method_specs.elts:
                schema_name: str | None = None
                if (
                    isinstance(arg_spec, ast.Tuple)
                    and len(arg_spec.elts) == 2
                    and isinstance(arg_spec.elts[1], ast.Dict)
                ):
                    schema = arg_spec.elts[1]
                    for key, value in zip(schema.keys, schema.values):
                        if key is None and isinstance(value, ast.Name):
                            schema_name = value.id
                    if schema_name is None:
                        for key, value in zip(schema.keys, schema.values):
                            if (
                                isinstance(key, ast.Constant)
                                and key.value in {"additionalProperties", "oneOf", "required"}
                            ):
                                schema_name = "<inline>"
                            if (
                                isinstance(key, ast.Constant)
                                and key.value == "description"
                                and isinstance(value, ast.Constant)
                            ):
                                continue
                elif (
                    isinstance(arg_spec, ast.Tuple)
                    and len(arg_spec.elts) == 2
                    and isinstance(arg_spec.elts[1], ast.Name)
                ):
                    schema_name = arg_spec.elts[1].id
                schemas.append(camel_schema_name(schema_name) if schema_name and schema_name != "<inline>" else None)
            if any(schema is not None for schema in schemas):
                result[method_node.value] = schemas
        return result
    raise ValueError(f"could not find Python `{mapping_name}`")


def sidecar_arg_schema_map(source: str, map_name: str) -> dict[str, list[str | None]]:
    try:
        body = source.split(f"const {map_name} = new Map([", 1)[1].split("]);", 1)[0]
    except IndexError as exc:
        raise ValueError(f"could not find sidecar `{map_name}`") from exc
    result: dict[str, list[str | None]] = {}
    for method, schemas_body in re.findall(r'\["([A-Za-z0-9_]+)",\s*\[(.*?)\]\]', body, re.S):
        schemas: list[str | None] = []
        for token in re.findall(r"\bnull\b|\b[A-Za-z][A-Za-z0-9_]*Schema\b", schemas_body):
            schemas.append(None if token == "null" else token)
        result[method] = schemas
    return result


def python_arg_type_validation_errors(source: str, mapping_name: str, *, positional: bool) -> set[str]:
    tree = ast.parse(source)
    for node in tree.body:
        if not isinstance(node, ast.AnnAssign) or not isinstance(node.target, ast.Name):
            continue
        if node.target.id != mapping_name or not isinstance(node.value, ast.Dict):
            continue
        type_phrases = {
            "array": "an array",
            "boolean": "a boolean",
            "number": "a number",
            "object": "an object",
            "string": "a string",
        }
        errors: set[str] = set()
        for method_specs in node.value.values:
            if not isinstance(method_specs, ast.Tuple):
                continue
            for index, arg_spec in enumerate(method_specs.elts):
                if (
                    not isinstance(arg_spec, ast.Tuple)
                    or len(arg_spec.elts) != 2
                    or not isinstance(arg_spec.elts[0], ast.Constant)
                    or not isinstance(arg_spec.elts[0].value, str)
                    or not isinstance(arg_spec.elts[1], ast.Dict)
                ):
                    continue
                arg_name = arg_spec.elts[0].value
                schema = arg_spec.elts[1]
                arg_label = f"args[{index}]" if positional else arg_name
                for key, value in zip(schema.keys, schema.values):
                    if (
                        isinstance(key, ast.Constant)
                        and key.value == "type"
                        and isinstance(value, ast.Constant)
                        and isinstance(value.value, str)
                        and value.value in type_phrases
                    ):
                        errors.add(f"{arg_label} must be {type_phrases[value.value]}")
        return errors
    raise ValueError(f"could not find Python `{mapping_name}`")


def task_context_helpers(source: str) -> set[str]:
    return set(task_context_helper_list(source))


def task_context_helper_list(source: str) -> list[str]:
    try:
        body = source.split("interface TaskContext", 1)[1].split("\n}", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find `TaskContext` interface") from exc
    helpers: list[str] = []
    for match in re.finditer(r"^\s+([A-Za-z0-9_]+):\s*\(", body, re.M):
        name = match.group(1)
        suffix = body[match.end() :]
        declaration = suffix.split(";", 1)[0]
        if "=> Promise<" in declaration:
            helpers.append(name)
    return helpers


def task_context_helper_params(source: str) -> dict[str, list[str]]:
    try:
        body = source.split("interface TaskContext", 1)[1].split("\n}", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find `TaskContext` interface") from exc
    params: dict[str, list[str]] = {}
    lines = body.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        match = re.match(r"^\s+([A-Za-z0-9_]+):\s*\(", line)
        if not match:
            index += 1
            continue
        name = match.group(1)
        collected = [line]
        declaration = line
        while ";" not in declaration and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            declaration = "\n".join(collected)
        if "=> Promise<" in declaration:
            inner = declaration.split("(", 1)[1].rsplit(")", 1)[0]
            params[name] = split_ts_params(inner)
        index += 1
    return params


def ts_declaration_terminated(declaration: str) -> bool:
    depth = 0
    in_string: str | None = None
    escaped = False
    for char in declaration:
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == in_string:
                in_string = None
            continue
        if char in {"'", '"', "`"}:
            in_string = char
            continue
        if char in "({[<":
            depth += 1
        elif char in ")}]>":
            depth = max(0, depth - 1)
        elif char == ";" and depth == 0:
            return True
    return False


def task_context_callable_declarations(source: str) -> dict[str, str]:
    try:
        body = source.split("interface TaskContext", 1)[1].split("\n}", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find `TaskContext` interface") from exc
    declarations: dict[str, str] = {}
    lines = body.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        match = re.match(r"^\s+([A-Za-z0-9_]+):\s*\(", line)
        if not match:
            index += 1
            continue
        name = match.group(1)
        collected = [line]
        declaration = line
        while not ts_declaration_terminated(declaration) and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            declaration = "\n".join(collected)
        declarations[name] = declaration
        index += 1
    return declarations


def task_context_callable_params(source: str) -> dict[str, list[str]]:
    params: dict[str, list[str]] = {}
    for name, declaration in task_context_callable_declarations(source).items():
        inner = declaration.split("(", 1)[1].rsplit(")", 1)[0]
        params[name] = split_ts_params(inner)
    return params


def task_context_callable_returns(source: str) -> dict[str, str]:
    returns: dict[str, str] = {}
    for name, declaration in task_context_callable_declarations(source).items():
        return_match = re.search(r"=>\s*(.*?);?\s*$", declaration, re.S)
        returns[name] = normalize_ts_type(return_match.group(1)) if return_match else ""
    return returns


def task_context_helper_required_param_counts(source: str) -> dict[str, int]:
    try:
        body = source.split("interface TaskContext", 1)[1].split("\n}", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find `TaskContext` interface") from exc
    counts: dict[str, int] = {}
    lines = body.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        match = re.match(r"^\s+([A-Za-z0-9_]+):\s*\(", line)
        if not match:
            index += 1
            continue
        name = match.group(1)
        collected = [line]
        declaration = line
        while ";" not in declaration and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            declaration = "\n".join(collected)
        if "=> Promise<" in declaration:
            inner = declaration.split("(", 1)[1].rsplit(")", 1)[0]
            counts[name] = required_ts_param_count(inner)
        index += 1
    return counts


def class_method_max_param_counts(source: str, class_marker: str) -> dict[str, int]:
    return {
        method: len(params)
        for method, params in class_method_params(source, class_marker).items()
    }


def class_methods_containing(source: str, class_marker: str, pattern: str) -> set[str]:
    return {
        method
        for method, body in class_method_bodies(source, class_marker).items()
        if pattern in body
    }


def task_context_helper_max_param_counts(source: str) -> dict[str, int]:
    return {
        method: len(params)
        for method, params in task_context_helper_params(source).items()
    }


def task_context_helper_returns(source: str) -> dict[str, str]:
    try:
        body = source.split("interface TaskContext", 1)[1].split("\n}", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find `TaskContext` interface") from exc
    returns: dict[str, str] = {}
    lines = body.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        match = re.match(r"^\s+([A-Za-z0-9_]+):\s*\(", line)
        if not match:
            index += 1
            continue
        name = match.group(1)
        collected = [line]
        declaration = line
        while ";" not in declaration and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            declaration = "\n".join(collected)
        if "=> Promise<" in declaration:
            return_match = re.search(r"=>\s*(.*?);?\s*$", declaration, re.S)
            returns[name] = normalize_ts_type(return_match.group(1)) if return_match else ""
        index += 1
    return returns


def task_context_data_fields(source: str) -> set[str]:
    try:
        body = source.split("interface TaskContext", 1)[1].split("\n}", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find `TaskContext` interface") from exc
    fields: set[str] = set()
    depth = 0
    in_callable_decl = False
    for line in body.splitlines():
        line_depth = depth
        stripped = line.strip()
        depth += stripped.count("{") - stripped.count("}")
        if in_callable_decl:
            if ";" in stripped:
                in_callable_decl = False
            continue
        if line_depth != 1:
            continue
        match = re.match(r"^\s+([A-Za-z0-9_]+)\??:\s*([^;\n]+)", line)
        if not match:
            continue
        name = match.group(1)
        declaration = match.group(2)
        if declaration.strip().startswith("("):
            if ";" not in stripped:
                in_callable_decl = True
            continue
        if "AbortSignal" in declaration:
            continue
        fields.add(name)
    return fields


def task_context_data_shapes(source: str) -> dict[str, str]:
    try:
        body = source.split("interface TaskContext", 1)[1].split("\n}", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find `TaskContext` interface") from exc
    fields: dict[str, str] = {}
    depth = 0
    in_callable_decl = False
    lines = body.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        line_depth = depth
        stripped = line.strip()
        depth += stripped.count("{") - stripped.count("}")
        if in_callable_decl:
            if ";" in stripped:
                in_callable_decl = False
            index += 1
            continue
        if line_depth != 1:
            index += 1
            continue
        match = re.match(r"^\s+([A-Za-z0-9_]+)\??:\s*(.+?);?\s*$", line)
        if not match:
            index += 1
            continue
        name = match.group(1)
        declaration = match.group(2)
        if declaration.lstrip().startswith("("):
            if ";" not in stripped:
                in_callable_decl = True
            index += 1
            continue
        if "AbortSignal" in declaration:
            index += 1
            continue
        collected = [declaration]
        declaration_depth = declaration.count("{") - declaration.count("}")
        while declaration_depth > 0 and index + 1 < len(lines):
            index += 1
            collected.append(lines[index].strip())
            declaration = " ".join(collected)
            declaration_depth += lines[index].count("{") - lines[index].count("}")
            depth += lines[index].strip().count("{") - lines[index].strip().count("}")
        fields[name] = ts_schema_shape(declaration)
        index += 1
    return fields


def interface_body(source: str, interface_name: str) -> str:
    try:
        after_marker = source.split(f"interface {interface_name}", 1)[1]
    except IndexError as exc:
        raise ValueError(f"could not find `{interface_name}` interface") from exc

    start = after_marker.find("{")
    if start < 0:
        raise ValueError(f"could not find `{interface_name}` interface body")
    depth = 0
    for offset, char in enumerate(after_marker[start:], start=start):
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return after_marker[start + 1 : offset]
    raise ValueError(f"could not find end of `{interface_name}` interface body")


def interface_fields(source: str, interface_name: str) -> set[str]:
    body = interface_body(source, interface_name)
    fields: set[str] = set()
    depth = 1
    in_callable_decl = False
    for line in body.splitlines():
        line_depth = depth
        stripped = line.strip()
        depth += stripped.count("{") - stripped.count("}")
        if in_callable_decl:
            if ";" in stripped:
                in_callable_decl = False
            continue
        if line_depth != 1:
            continue
        match = re.match(r"^\s+([A-Za-z0-9_]+)\??:\s*", line)
        if match:
            fields.add(match.group(1))
            if stripped.partition(":")[2].lstrip().startswith("(") and ";" not in stripped:
                in_callable_decl = True
    return fields


def interface_required_fields(source: str, interface_name: str) -> set[str]:
    body = interface_body(source, interface_name)
    fields: set[str] = set()
    depth = 1
    in_callable_decl = False
    for line in body.splitlines():
        line_depth = depth
        stripped = line.strip()
        depth += stripped.count("{") - stripped.count("}")
        if in_callable_decl:
            if ";" in stripped:
                in_callable_decl = False
            continue
        if line_depth != 1:
            continue
        match = re.match(r"^\s+([A-Za-z0-9_]+)(\?)?:\s*", line)
        if match:
            if match.group(2) != "?":
                fields.add(match.group(1))
            if stripped.partition(":")[2].lstrip().startswith("(") and ";" not in stripped:
                in_callable_decl = True
    return fields


def ts_schema_shape(type_text: str, *, preserve_null: bool = False) -> str:
    raw = normalize_ts_type(type_text)
    nullable = bool(re.search(r"(?:^|\|\s*)null(?:\s*\||$)", raw))
    normalized = raw if preserve_null else raw.replace(" | null", "").replace("null | ", "")
    if preserve_null:
        normalized = normalized.replace(" | null", "").replace("null | ", "")
    if normalized.endswith("[]"):
        inner = normalized[:-2].strip()
        if inner == "string":
            shape = "array:string"
            return f"{shape}|null" if preserve_null and nullable else shape
        if inner.startswith("{"):
            shape = "array:object"
            return f"{shape}|null" if preserve_null and nullable else shape
        shape = "array"
        return f"{shape}|null" if preserve_null and nullable else shape
    if normalized == "string" or re.fullmatch(r'"[^"]+"(?:\s*\|\s*"[^"]+")*', normalized):
        shape = "string"
        return f"{shape}|null" if preserve_null and nullable else shape
    if normalized == "number":
        shape = "number"
        return f"{shape}|null" if preserve_null and nullable else shape
    if normalized == "boolean":
        shape = "boolean"
        return f"{shape}|null" if preserve_null and nullable else shape
    if normalized.startswith("Record<") or normalized.startswith("{"):
        shape = "object"
        return f"{shape}|null" if preserve_null and nullable else shape
    shape = "unknown"
    return f"{shape}|null" if preserve_null and nullable else shape


def interface_field_shapes(source: str, interface_name: str) -> dict[str, str]:
    body = interface_body(source, interface_name)
    fields: dict[str, str] = {}
    depth = 1
    in_callable_decl = False
    lines = body.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        line_depth = depth
        stripped = line.strip()
        depth += stripped.count("{") - stripped.count("}")
        if in_callable_decl:
            if ";" in stripped:
                in_callable_decl = False
            index += 1
            continue
        if line_depth != 1:
            index += 1
            continue
        match = re.match(r"^\s+([A-Za-z0-9_]+)\??:\s*(.+?);?\s*$", line)
        if not match:
            index += 1
            continue
        declaration = match.group(2)
        if declaration.lstrip().startswith("("):
            if ";" not in stripped:
                in_callable_decl = True
            index += 1
            continue
        collected = [declaration]
        declaration_depth = declaration.count("{") - declaration.count("}")
        while declaration_depth > 0 and index + 1 < len(lines):
            index += 1
            collected.append(lines[index].strip())
            declaration = " ".join(collected)
            declaration_depth += lines[index].count("{") - lines[index].count("}")
            depth += lines[index].strip().count("{") - lines[index].strip().count("}")
        fields[match.group(1)] = ts_schema_shape(declaration)
        index += 1
    return fields


def interface_inline_array_object_fields(source: str, interface_name: str, field_name: str) -> set[str]:
    body = interface_body(source, interface_name)
    match = re.search(
        rf"^\s+{re.escape(field_name)}\??:\s*\{{(?P<body>.*?)\}}\[\]\s*;",
        body,
        re.M | re.S,
    )
    if not match:
        return set()
    return set(re.findall(r"\b([A-Za-z0-9_]+)\??:\s*", match.group("body")))


def interface_inline_array_object_required_fields(source: str, interface_name: str, field_name: str) -> set[str]:
    body = interface_body(source, interface_name)
    match = re.search(
        rf"^\s+{re.escape(field_name)}\??:\s*\{{(?P<body>.*?)\}}\[\]\s*;",
        body,
        re.M | re.S,
    )
    if not match:
        return set()
    return {
        field
        for field, optional in re.findall(r"\b([A-Za-z0-9_]+)(\?)?:\s*", match.group("body"))
        if optional != "?"
    }


def interface_inline_array_object_shapes(
    source: str,
    interface_name: str,
    field_name: str,
    *,
    preserve_null: bool = False,
) -> dict[str, str]:
    body = interface_body(source, interface_name)
    match = re.search(
        rf"^\s+{re.escape(field_name)}\??:\s*\{{(?P<body>.*?)\}}\[\]\s*;",
        body,
        re.M | re.S,
    )
    if not match:
        return {}
    shapes: dict[str, str] = {}
    for field, declaration in re.findall(r"\b([A-Za-z0-9_]+)\??:\s*([^;\n}]+)", match.group("body")):
        shapes[field] = ts_schema_shape(declaration, preserve_null=preserve_null)
    return shapes


def interface_inline_object_fields(source: str, interface_name: str, field_name: str) -> set[str]:
    body = interface_body(source, interface_name)
    match = re.search(
        rf"^\s+{re.escape(field_name)}\??:\s*\{{(?P<body>.*?)\}}\s*;",
        body,
        re.M | re.S,
    )
    if not match:
        return set()
    return set(re.findall(r"\b([A-Za-z0-9_]+)\??:\s*", match.group("body")))


def interface_inline_object_required_fields(source: str, interface_name: str, field_name: str) -> set[str]:
    body = interface_body(source, interface_name)
    match = re.search(
        rf"^\s+{re.escape(field_name)}\??:\s*\{{(?P<body>.*?)\}}\s*;",
        body,
        re.M | re.S,
    )
    if not match:
        return set()
    return {
        field
        for field, optional in re.findall(r"\b([A-Za-z0-9_]+)(\?)?:\s*", match.group("body"))
        if optional != "?"
    }


def interface_inline_object_shapes(
    source: str,
    interface_name: str,
    field_name: str,
    *,
    preserve_null: bool = False,
) -> dict[str, str]:
    body = interface_body(source, interface_name)
    match = re.search(
        rf"^\s+{re.escape(field_name)}\??:\s*\{{(?P<body>.*?)\}}\s*;",
        body,
        re.M | re.S,
    )
    if not match:
        return {}
    shapes: dict[str, str] = {}
    for field, declaration in re.findall(r"\b([A-Za-z0-9_]+)\??:\s*([^;\n}]+)", match.group("body")):
        shapes[field] = ts_schema_shape(declaration, preserve_null=preserve_null)
    return shapes


def object_literal_body_after(source: str, marker: str) -> str:
    start_marker = source.find(marker)
    if start_marker < 0:
        raise ValueError(f"could not find object marker `{marker}`")
    start = source.find("{", start_marker)
    if start < 0:
        raise ValueError(f"could not find object body after `{marker}`")
    depth = 0
    in_string: str | None = None
    escaped = False
    for index in range(start, len(source)):
        char = source[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == in_string:
                in_string = None
            continue
        if char in {"'", '"', "`"}:
            in_string = char
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[start + 1 : index]
    raise ValueError(f"could not find end of object body after `{marker}`")


def top_level_js_chunks(body: str) -> list[str]:
    chunks: list[str] = []
    start = 0
    depth = 0
    in_string: str | None = None
    escaped = False
    for index, char in enumerate(body):
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == in_string:
                in_string = None
            continue
        if char in {"'", '"', "`"}:
            in_string = char
            continue
        if char in "{[(":
            depth += 1
        elif char in "}])":
            depth -= 1
        elif char == "," and depth == 0:
            chunks.append(body[start:index])
            start = index + 1
    chunks.append(body[start:])
    return chunks


def object_literal_fields_after(source: str, marker: str) -> set[str]:
    body = object_literal_body_after(source, marker)
    fields: set[str] = set()
    for chunk in top_level_js_chunks(body):
        stripped = chunk.strip()
        if not stripped:
            continue
        match = re.match(r"^([A-Za-z0-9_]+)\s*:", stripped)
        if match:
            fields.add(match.group(1))
            continue
        match = re.match(r"^([A-Za-z0-9_]+)$", stripped)
        if match:
            fields.add(match.group(1))
    return fields


def js_literal_shape(raw_value: str) -> str:
    value = raw_value.rstrip(",").strip()
    if re.fullmatch(r'"[^"]*"|\'[^\']*\'|`[^`]*`', value):
        return "string"
    if value in {"true", "false"}:
        return "boolean"
    if value == "null":
        return "null"
    if re.fullmatch(r"-?[0-9][0-9_]*(?:\.[0-9_]+)?", value):
        return "number"
    if value.startswith("["):
        return "array"
    if value.startswith("{"):
        return "object"
    return "unknown"


def merge_js_literal_shapes(shapes: set[str]) -> str:
    non_null_shapes = sorted(shape for shape in shapes if shape != "null")
    if "null" in shapes and len(non_null_shapes) == 1:
        return f"{non_null_shapes[0]}|null"
    if len(shapes) == 1:
        return next(iter(shapes))
    return "|".join(sorted(shapes))


def object_literal_shapes_after(source: str, marker: str) -> dict[str, str]:
    body = object_literal_body_after(source, marker)
    field_shapes: dict[str, set[str]] = {}
    for chunk in top_level_js_chunks(body):
        stripped = chunk.strip()
        if not stripped:
            continue
        match = re.match(r"^([A-Za-z0-9_]+)\s*:\s*(?P<value>.+?)\s*$", stripped, re.S)
        if match:
            field_shapes.setdefault(match.group(1), set()).add(js_literal_shape(match.group("value")))
            continue
        match = re.match(r"^([A-Za-z0-9_]+)$", stripped)
        if match:
            field_shapes.setdefault(match.group(1), set()).add("unknown")
    return {field: merge_js_literal_shapes(shapes) for field, shapes in field_shapes.items()}


def array_literal_body_after(source: str, marker: str) -> str:
    start_marker = source.find(marker)
    if start_marker < 0:
        raise ValueError(f"could not find array marker `{marker}`")
    start = source.find("[", start_marker)
    if start < 0:
        raise ValueError(f"could not find array body after `{marker}`")
    depth = 0
    in_string: str | None = None
    escaped = False
    for index in range(start, len(source)):
        char = source[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == in_string:
                in_string = None
            continue
        if char in {"'", '"', "`"}:
            in_string = char
            continue
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return source[start + 1 : index]
    raise ValueError(f"could not find end of array body after `{marker}`")


def object_literal_array_item_shapes_after(source: str, marker: str) -> dict[str, str]:
    array_body = array_literal_body_after(source, marker)
    field_shapes: dict[str, set[str]] = {}
    for chunk in top_level_js_chunks(array_body):
        stripped = chunk.strip()
        if not stripped.startswith("{"):
            continue
        body = stripped.strip().removeprefix("{").removesuffix("}").strip()
        for item_chunk in top_level_js_chunks(body):
            item_stripped = item_chunk.strip()
            if not item_stripped:
                continue
            match = re.match(r"^([A-Za-z0-9_]+)\s*:\s*(?P<value>.+?)\s*$", item_stripped, re.S)
            if match:
                field_shapes.setdefault(match.group(1), set()).add(js_literal_shape(match.group("value")))
                continue
            match = re.match(r"^([A-Za-z0-9_]+)$", item_stripped)
            if match:
                field_shapes.setdefault(match.group(1), set()).add("unknown")
    return {field: merge_js_literal_shapes(shapes) for field, shapes in field_shapes.items()}


def object_literal_scalar_values_after(
    source: str,
    marker: str,
    constants: dict[str, str] | None = None,
) -> dict[str, Any]:
    body = object_literal_body_after(source, marker)
    constants = constants or {}
    values: dict[str, Any] = {}
    for chunk in top_level_js_chunks(body):
        stripped = chunk.strip()
        if not stripped:
            continue
        match = re.match(r"^([A-Za-z0-9_]+)\s*:\s*(?P<value>.+?)\s*$", stripped, re.S)
        if not match:
            continue
        field = match.group(1)
        raw_value = match.group("value").rstrip(",").strip()
        string_match = re.fullmatch(r'"([^"]*)"|\'([^\']*)\'', raw_value)
        if string_match:
            values[field] = string_match.group(1) if string_match.group(1) is not None else string_match.group(2)
        elif raw_value in {"true", "false"}:
            values[field] = raw_value == "true"
        elif re.fullmatch(r"[0-9][0-9_]*", raw_value):
            values[field] = int(raw_value.replace("_", ""))
        elif raw_value in constants:
            values[field] = constants[raw_value]
    return values


def method_signature(source: str, class_marker: str, method_name: str) -> str:
    try:
        body = source.split(class_marker, 1)[1]
    except IndexError as exc:
        raise ValueError(f"could not find `{class_marker}`") from exc

    lines = body.splitlines()
    for index, line in enumerate(lines):
        if not re.match(
            rf"^\s+(?!(?:private|protected)\b)(?:async )?{re.escape(method_name)}(?:<[^>]+>)?\(",
            line,
        ):
            continue
        collected = [line]
        paren_depth = line.count("(") - line.count(")")
        while paren_depth > 0 and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            paren_depth += lines[index].count("(") - lines[index].count(")")
        return "\n".join(collected)
    raise ValueError(f"could not find `{method_name}` method signature")


def method_inline_object_param_body(source: str, class_marker: str, method_name: str, param_name: str) -> str:
    signature = method_signature(source, class_marker, method_name)
    match = re.search(
        rf"\b{re.escape(param_name)}\??:\s*\{{(?P<body>.*?)\}}",
        signature,
        re.S,
    )
    if not match:
        return ""
    return match.group("body")


def method_inline_object_param_fields(
    source: str,
    class_marker: str,
    method_name: str,
    param_name: str,
) -> set[str]:
    body = method_inline_object_param_body(source, class_marker, method_name, param_name)
    return set(re.findall(r"\b([A-Za-z0-9_]+)\??:\s*", body))


def method_inline_object_param_required_fields(
    source: str,
    class_marker: str,
    method_name: str,
    param_name: str,
) -> set[str]:
    body = method_inline_object_param_body(source, class_marker, method_name, param_name)
    return {
        field
        for field, optional in re.findall(r"\b([A-Za-z0-9_]+)(\?)?:\s*", body)
        if optional != "?"
    }


def method_inline_object_param_shapes(
    source: str,
    class_marker: str,
    method_name: str,
    param_name: str,
) -> dict[str, str]:
    body = method_inline_object_param_body(source, class_marker, method_name, param_name)
    shapes: dict[str, str] = {}
    for field, declaration in re.findall(r"\b([A-Za-z0-9_]+)\??:\s*([^;\n}]+)", body):
        shapes[field] = ts_schema_shape(declaration)
    return shapes


def interface_callable_inline_object_param_body(
    source: str,
    interface_name: str,
    field_name: str,
    param_name: str,
) -> str:
    body = interface_body(source, interface_name)
    match = re.search(
        rf"^\s+{re.escape(field_name)}:\s*\((?P<params>.*?)\)\s*=>",
        body,
        re.M | re.S,
    )
    if not match:
        return ""
    params = match.group("params")
    param_match = re.search(
        rf"\b{re.escape(param_name)}\??:\s*\{{(?P<body>.*?)\}}",
        params,
        re.S,
    )
    if not param_match:
        return ""
    return param_match.group("body")


def interface_callable_inline_object_param_fields(
    source: str,
    interface_name: str,
    field_name: str,
    param_name: str,
) -> set[str]:
    body = interface_callable_inline_object_param_body(source, interface_name, field_name, param_name)
    return set(re.findall(r"\b([A-Za-z0-9_]+)\??:\s*", body))


def interface_callable_inline_object_param_required_fields(
    source: str,
    interface_name: str,
    field_name: str,
    param_name: str,
) -> set[str]:
    body = interface_callable_inline_object_param_body(source, interface_name, field_name, param_name)
    return {
        field
        for field, optional in re.findall(r"\b([A-Za-z0-9_]+)(\?)?:\s*", body)
        if optional != "?"
    }


def interface_callable_inline_object_param_shapes(
    source: str,
    interface_name: str,
    field_name: str,
    param_name: str,
) -> dict[str, str]:
    body = interface_callable_inline_object_param_body(source, interface_name, field_name, param_name)
    shapes: dict[str, str] = {}
    for field, declaration in re.findall(r"\b([A-Za-z0-9_]+)\??:\s*([^;\n}]+)", body):
        shapes[field] = ts_schema_shape(declaration)
    return shapes


def sidecar_complete_option_fields(source: str) -> set[str]:
    return {"mentions"} if re.search(r"\bbody\.mentions\b", source) else set()


def sidecar_complete_option_shapes(source: str) -> dict[str, str]:
    if (
        re.search(r"Array\.isArray\(body\.mentions\)", source)
        and (
            re.search(r'typeof mention === "string"', source)
            or re.search(r'typeof mention !== "string"', source)
        )
    ):
        return {"mentions": "array:string"}
    return {}


def type_alias_body(source: str, alias_name: str) -> str:
    lines = source.splitlines()
    start = None
    for index, line in enumerate(lines):
        if re.search(rf"\b(?:export\s+)?type\s+{re.escape(alias_name)}\b\s*=", line):
            start = index
            break
    if start is None:
        raise ValueError(f"could not find `{alias_name}` type alias")

    collected: list[str] = []
    depth = 0
    for line in lines[start:]:
        collected.append(line)
        depth += line.count("{") - line.count("}")
        if line.strip().endswith(";") and depth <= 0:
            break
    body = "\n".join(collected)
    return body.split("=", 1)[1].rsplit(";", 1)[0]


def type_alias_string_union(source: str, alias_name: str) -> set[str]:
    body = type_alias_body(source, alias_name)
    return set(re.findall(r'"([^"]+)"', body))


def type_alias_template_string_prefixes(source: str, alias_name: str) -> set[str]:
    body = type_alias_body(source, alias_name)
    return set(re.findall(r"`([^`$]+)\$\{string\}`", body))


def interface_string_union_field(source: str, interface_name: str, field_name: str) -> set[str]:
    try:
        body = source.split(f"interface {interface_name}", 1)[1].split("\n}", 1)[0]
    except IndexError as exc:
        raise ValueError(f"could not find `{interface_name}` interface") from exc
    match = re.search(rf"\b{re.escape(field_name)}\??:\s*([^;\n]+)", body)
    if not match:
        raise ValueError(f"could not find `{interface_name}.{field_name}` field")
    return set(re.findall(r'"([^"]+)"', match.group(1)))


def class_method_string_includes(source: str, class_marker: str, method_name: str) -> set[str]:
    try:
        class_body = source.split(class_marker, 1)[1]
    except IndexError as exc:
        raise ValueError(f"could not find `{class_marker}`") from exc
    lines = class_body.splitlines()
    body = ""
    for index, line in enumerate(lines):
        if not re.match(
            rf"^\s+(?:(?:private|protected|public)\s+)?(?:async\s+)?{re.escape(method_name)}(?:<[^>]+>)?\(",
            line,
        ):
            continue
        collected = [line]
        brace_depth = line.count("{") - line.count("}")
        while "{" not in "\n".join(collected) and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            brace_depth = "\n".join(collected).count("{") - "\n".join(collected).count("}")
        while brace_depth > 0 and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            brace_depth += lines[index].count("{") - lines[index].count("}")
        body = "\n".join(collected)
        break
    values: set[str] = set()
    for match in re.finditer(r"\[([^\]]+)\]\.includes\(", body, re.S):
        values.update(re.findall(r'"([^"]+)"', match.group(1)))
        values.update(re.findall(r"'([^']+)'", match.group(1)))
    return values


def class_method_includes_arguments(source: str, class_marker: str, method_name: str) -> set[str]:
    try:
        class_body = source.split(class_marker, 1)[1]
    except IndexError as exc:
        raise ValueError(f"could not find `{class_marker}`") from exc
    lines = class_body.splitlines()
    body = ""
    for index, line in enumerate(lines):
        if not re.match(
            rf"^\s+(?:(?:private|protected|public)\s+)?(?:async\s+)?{re.escape(method_name)}(?:<[^>]+>)?\(",
            line,
        ):
            continue
        collected = [line]
        brace_depth = line.count("{") - line.count("}")
        while "{" not in "\n".join(collected) and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            brace_depth = "\n".join(collected).count("{") - "\n".join(collected).count("}")
        while brace_depth > 0 and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            brace_depth += lines[index].count("{") - lines[index].count("}")
        body = "\n".join(collected)
        break
    return set(re.findall(r"\.includes\(\s*[\"']([^\"']+)[\"']\s*\)", body))


def type_alias_discriminator_values(source: str, alias_name: str, discriminator: str) -> set[str]:
    body = type_alias_body(source, alias_name)
    return set(re.findall(rf"\b{re.escape(discriminator)}:\s*\"([^\"]+)\"", body))


def type_alias_object_variants(source: str, alias_name: str, discriminator: str) -> dict[str, dict[str, Any]]:
    body = type_alias_body(source, alias_name)
    variants: dict[str, dict[str, Any]] = {}
    for match in re.finditer(r"\{(?P<body>[^{}]+)\}", body, re.S):
        variant_body = match.group("body")
        discriminator_match = re.search(
            rf"\b{re.escape(discriminator)}:\s*\"([^\"]+)\"",
            variant_body,
        )
        if not discriminator_match:
            continue
        variant = discriminator_match.group(1)
        fields: set[str] = set()
        required: set[str] = set()
        shapes: dict[str, str] = {}
        for field, optional, declaration in re.findall(
            r"\b([A-Za-z0-9_]+)(\?)?:\s*([^;\n}]+)",
            variant_body,
        ):
            fields.add(field)
            if optional != "?":
                required.add(field)
            shapes[field] = ts_schema_shape(declaration)
        variants[variant] = {
            "fields": fields,
            "required": required,
            "shapes": shapes,
        }
    return variants


def const_string_value(source: str, const_name: str) -> str:
    match = re.search(rf"\bconst\s+{re.escape(const_name)}\s*=\s*[\"']([^\"']+)[\"']", source)
    if not match:
        raise ValueError(f"could not find `{const_name}` string constant")
    return match.group(1)


def exported_type_symbols(source: str) -> set[str]:
    return set(re.findall(r"^export\s+(?:interface|type)\s+([A-Za-z0-9_]+)\b", source, re.M))


def exported_type_alias_bodies(source: str) -> dict[str, str]:
    aliases: dict[str, str] = {}
    for name in re.findall(r"^export\s+type\s+([A-Za-z0-9_]+)\b\s*=", source, re.M):
        aliases[name] = normalize_ts_alias_body(type_alias_body(source, name))
    return aliases


def public_type_exports(source: str) -> set[str]:
    exports: set[str] = set()
    for match in re.finditer(r"export\s+type\s+\{([^}]+)\}", source, re.S):
        exports.update(
            part.strip().rstrip(",")
            for part in match.group(1).split(",")
            if part.strip().rstrip(",")
        )
    return exports


def public_value_exports(source: str) -> set[str]:
    exports: set[str] = set()
    for match in re.finditer(r"export\s+\{([^}]+)\}", source, re.S):
        before = source[: match.start()].rsplit("\n", 1)[-1]
        if before.strip().endswith("type"):
            continue
        exports.update(
            part.strip().rstrip(",")
            for part in match.group(1).split(",")
            if part.strip().rstrip(",")
        )
    return exports


def ts_numeric_const(source: str, name: str) -> int | None:
    match = re.search(rf"\bconst\s+{re.escape(name)}\s*=\s*([0-9][0-9_]*)\s*;", source)
    if not match:
        return None
    return int(match.group(1).replace("_", ""))


def js_numeric_literal(value: int) -> str:
    return f"{value:_}"


def exported_interface_field_map(source: str) -> dict[str, set[str]]:
    fields: dict[str, set[str]] = {}
    for name in re.findall(r"^export\s+interface\s+([A-Za-z0-9_]+)\b", source, re.M):
        fields[name] = interface_fields(source, name)
    return fields


def exported_interface_required_field_map(source: str) -> dict[str, set[str]]:
    fields: dict[str, set[str]] = {}
    for name in re.findall(r"^export\s+interface\s+([A-Za-z0-9_]+)\b", source, re.M):
        fields[name] = interface_required_fields(source, name)
    return fields


def exported_interface_shape_map(source: str) -> dict[str, dict[str, str]]:
    shapes: dict[str, dict[str, str]] = {}
    for name in re.findall(r"^export\s+interface\s+([A-Za-z0-9_]+)\b", source, re.M):
        shapes[name] = interface_field_shapes(source, name)
    return shapes


def sidecar_task_fields(source: str) -> set[str]:
    match = re.search(
        r"export function serializeTask\([^)]*\)\s*\{.*?return\s*\{(?P<body>.*?)\n\s*\};",
        source,
        re.S,
    )
    if not match:
        raise ValueError("could not find sidecar `serializeTask` body")
    body = match.group("body")
    fields = set(re.findall(r"^\s+([A-Za-z0-9_]+):\s*task\.\1", body, re.M))
    fields.update(
        left
        for left, right in re.findall(
            r'\.\.\.\(hasOwn\(task,\s*"([A-Za-z0-9_]+)"\)\s*\?\s*\{\s*([A-Za-z0-9_]+):\s*task\.\2\s*\}',
            body,
        )
        if left == right
    )
    return fields


def sidecar_task_shapes(source: str) -> dict[str, str]:
    fields = sidecar_task_fields(source)
    shapes: dict[str, str] = {}
    for field in fields:
        if field in {"members", "history", "attachments", "availableSkills"}:
            shapes[field] = "array:object" if field != "attachments" else "array"
        elif field == "replyTo":
            shapes[field] = "object"
        else:
            shapes[field] = "string"
    return shapes


def sidecar_skill_fields(source: str) -> set[str]:
    try:
        body = source.split("return parsed.map((skill, index) => {", 1)[1].split("\n  });", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find sidecar `parseSkills` body") from exc
    match = re.search(r"return\s*\{([^}]+)\};", body, re.S)
    if not match:
        raise ValueError("could not find sidecar `parseSkills` returned skill shape")
    return set(re.findall(r"\b([A-Za-z0-9_]+)\b(?=\s*(?:,|$))", match.group(1)))


def sidecar_skill_required_fields(source: str) -> set[str]:
    return sidecar_skill_fields(source)


def sidecar_skill_shapes(source: str) -> dict[str, str]:
    return {field: "string" for field in sidecar_skill_fields(source)}


def sidecar_fallback_available_skill_fields(source: str) -> set[str]:
    try:
        body = source.split("function fallbackAvailableSkills", 1)[1].split("\n}", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find sidecar `fallbackAvailableSkills` body") from exc
    match = re.search(r"return agentSkills\.map\(\(skill\) => \(\{(?P<body>.*?)\}\)\);", body, re.S)
    if not match:
        raise ValueError("could not find sidecar fallback available skill shape")
    return set(re.findall(r"^\s+([A-Za-z0-9_]+):", match.group("body"), re.M))


def sidecar_fallback_available_skill_shapes(source: str) -> dict[str, str]:
    fields = sidecar_fallback_available_skill_fields(source)
    shapes = {field: "string" for field in fields}
    if "slashCommand" in fields:
        shapes["slashCommand"] = "string|null"
    return shapes


def sidecar_agent_option_fields(source: str) -> set[str]:
    try:
        body = source.split("export function buildAgentOptions", 1)[1].split("\n}", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find sidecar `buildAgentOptions` body") from exc
    fields = set(re.findall(r"\boptions\.([A-Za-z0-9_]+)\s*=", body))
    match = re.search(r"const options = \{([^}]+)\}", body)
    if match:
        fields.update(
            name.strip()
            for name in match.group(1).split(",")
            if re.fullmatch(r"\s*[A-Za-z0-9_]+\s*", name)
        )
    return fields


def sidecar_agent_option_required_fields(source: str) -> set[str]:
    fields = sidecar_agent_option_fields(source)
    return {field for field in ("serverUrl", "botToken") if field in fields}


def sidecar_agent_option_shapes(source: str) -> dict[str, str]:
    fields = sidecar_agent_option_fields(source)
    shapes: dict[str, str] = {}
    for field in fields:
        if field in {"serverUrl", "botToken", "concurrencyMode"}:
            shapes[field] = "string"
        elif field == "skills":
            shapes[field] = "array"
        elif field in {"reconnectInterval", "pingInterval", "pingTimeout", "maxConsecutivePerConversation"}:
            shapes[field] = "number"
        else:
            shapes[field] = "unknown"
    return shapes


def sidecar_control_env(source: str) -> set[str]:
    try:
        body = source.split("export function buildControlServerOptions", 1)[1].split("\n}", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find sidecar `buildControlServerOptions` body") from exc
    return set(re.findall(r'\bintEnv\(env,\s*"([^"]+)"\)', body))


def sidecar_control_endpoints(source: str) -> set[str]:
    try:
        body = source.split("const CONTROL_ENDPOINTS = new Set([", 1)[1].split("]);", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find sidecar `CONTROL_ENDPOINTS` body") from exc
    return set(re.findall(r'"(/[^"]+)"', body))


def adapter_sidecar_post_paths(source: str) -> set[str]:
    paths: set[str] = set()
    patterns = (
        r"self\._post_sidecar,\s*\n\s*\"([^\"]+)\"",
        r"self\._post_sidecar\(\s*\"([^\"]+)\"",
        r"\b_post_sidecar,\s*\"([^\"]+)\"",
    )
    for pattern in patterns:
        paths.update(re.findall(pattern, source))
    return paths


def index_uses_control_options(source: str) -> bool:
    imported = re.search(
        r'import\s+\{[^}]*\bbuildControlServerOptions\b[^}]*\}\s+from\s+"\.\/runtime\.mjs"',
        source,
        re.S,
    )
    if not imported:
        return False
    create_call = re.search(r"\bcreateControlServer\(\s*\{(?P<body>.*?)\n\}\)", source, re.S)
    if not create_call:
        return False
    return re.search(r"\.\.\.\s*buildControlServerOptions\(\s*\)", create_call.group("body")) is not None


def index_uses_strict_port_parser(source: str) -> bool:
    imported = re.search(
        r'import\s+\{[^}]*\bintEnv\b[^}]*\}\s+from\s+"\.\/runtime\.mjs"',
        source,
        re.S,
    )
    if not imported:
        return False
    return (
        'intEnv(process.env, "ARINOVA_SIDECAR_PORT") ?? 8793' in source
        and "Number(process.env.ARINOVA_SIDECAR_PORT" not in source
    )


def index_uses_trimmed_required_env(source: str) -> bool:
    imported = re.search(
        r'import\s+\{[^}]*\brequiredEnv\b[^}]*\}\s+from\s+"\.\/runtime\.mjs"',
        source,
        re.S,
    )
    if not imported:
        return False
    return (
        'requiredEnv(process.env, "ARINOVA_SERVER_URL").replace(/\\/+$/, "")' in source
        and 'requiredEnv(process.env, "ARINOVA_BOT_TOKEN")' in source
        and 'requiredEnv(process.env, "ARINOVA_BRIDGE_TOKEN")' in source
    )


def sidecar_agent_events(source: str) -> set[str]:
    return set(re.findall(r'\bagent\.on\("([^"]+)"', source))


def sidecar_check_agent_method_calls(*sources: str) -> set[str]:
    calls: set[str] = set()
    for source in sources:
        calls.update(re.findall(r'\b(?:sdk|sdkError|callAgentSdk)\("([A-Za-z0-9_]+)"', source))
    return calls


def js_string_array(source: str, name: str) -> list[str]:
    match = re.search(
        rf"\bconst\s+{re.escape(name)}\s*=\s*\[(?P<body>.*?)\];",
        source,
        re.S,
    )
    if not match:
        raise ValueError(f"could not find JS string array `{name}`")
    return re.findall(r'"([^"]+)"', match.group("body"))


def js_string_map(source: str, name: str) -> dict[str, str]:
    match = re.search(
        rf"\bconst\s+{re.escape(name)}(?:\s*:\s*[^=]+)?\s*=\s*\{{(?P<body>.*?)\n\}};",
        source,
        re.S,
    )
    if not match:
        raise ValueError(f"could not find JS string map `{name}`")
    result: dict[str, str] = {}
    for key, value in re.findall(r'^\s*([A-Za-z0-9_]+):\s*"([^"]+)"\s*,?\s*$', match.group("body"), re.M):
        result[key] = value
    return result


def python_string_map(source: str, name: str) -> dict[str, str]:
    tree = ast.parse(source)
    for node in tree.body:
        value: ast.AST | None = None
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == name:
            value = node.value
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == name:
                    value = node.value
                    break
        if value is None:
            continue
        parsed = ast.literal_eval(value)
        if not isinstance(parsed, dict):
            raise ValueError(f"Python `{name}` is not a dict")
        return {str(key): str(item) for key, item in parsed.items()}
    raise ValueError(f"could not find Python string map `{name}`")


def sidecar_check_task_method_calls(*sources: str) -> set[str]:
    calls: set[str] = set()
    for source in sources:
        calls.update(re.findall(r'\bcallTaskSdk\([^,\n]+,\s*"([A-Za-z0-9_]+)"', source))
        for match in re.finditer(r'\bpostControl\("/task-sdk",\s*\{(?P<body>.*?)\}\)', source, re.S):
            calls.update(re.findall(r'\bmethod:\s*"([A-Za-z0-9_]+)"', match.group("body")))
    return calls


def snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def manifest_tools(source: str) -> set[str]:
    return set(manifest_tool_list(source))


def manifest_tool_list(source: str) -> list[str]:
    try:
        block = source.split("provides_tools:", 1)[1].split("requires_env:", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find manifest `provides_tools` block") from exc
    return re.findall(r"^\s*-\s*([A-Za-z0-9_]+)\s*$", block, re.M)


def manifest_env(source: str) -> set[str]:
    return set(re.findall(r"^\s*-\s*name:\s*(ARINOVA_[A-Z0-9_]+)\s*$", source, re.M))


def manifest_hooks(source: str) -> set[str]:
    try:
        block = source.split("provides_hooks:", 1)[1].split("provides_tools:", 1)[0]
    except IndexError:
        return set()
    return set(re.findall(r"^\s*-\s*([A-Za-z0-9_]+)\s*$", block, re.M))


def package_version(path: Path) -> str:
    return json.loads(path.read_text())["version"]


def package_public_metadata(path: Path) -> dict:
    package = json.loads(path.read_text())
    return {key: package.get(key) for key in SDK_PACKAGE_PUBLIC_METADATA_KEYS}


def sdk_client_test_name_list(source: str) -> list[str]:
    return re.findall(r'\bit\("([^"]+)"', source)


def sdk_readme_method_heading_list(source: str) -> list[str]:
    return re.findall(r"^#{3,5}\s+`((?:agent|task)\.[A-Za-z0-9_]+)\(", source, flags=re.M)


def sdk_readme_type_symbol_list(source: str) -> list[str]:
    return re.findall(r"^(?:interface|type)\s+([A-Za-z][A-Za-z0-9_]*)\b", source, flags=re.M)


def sdk_readme_option_name_list(source: str) -> list[str]:
    return re.findall(r"^\| `([A-Za-z][A-Za-z0-9_]*)` \| `[^`]+` \| (?:Yes|No) \|", source, flags=re.M)


def sdk_readme_task_context_item_list(source: str) -> list[str]:
    try:
        section = source.split("### `TaskContext`", 1)[1].split("### `agent.sendMessage", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find SDK README `TaskContext` section") from exc
    return re.findall(r"^\| `([^`]+)` \|", section, flags=re.M)


def duplicate_values(items: list[str]) -> list[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for item in items:
        if item in seen:
            duplicates.add(item)
        seen.add(item)
    return sorted(duplicates)


def js_map_number_entries(source: str, name: str) -> dict[str, int]:
    match = re.search(
        rf"const\s+{re.escape(name)}\s*=\s*new Map\(\[(?P<body>.*?)\]\);",
        source,
        re.S,
    )
    if not match:
        raise ValueError(f"could not find sidecar `{name}` map")
    return {
        key: int(value)
        for key, value in re.findall(r'\["([A-Za-z0-9_]+)",\s*(\d+)\]', match.group("body"))
    }


def js_map_duplicate_string_keys(source: str, name: str) -> list[str]:
    match = re.search(
        rf"const\s+{re.escape(name)}\s*=\s*new Map\(\[(?P<body>.*?)\]\);",
        source,
        re.S,
    )
    if not match:
        raise ValueError(f"could not find sidecar `{name}` map")
    return duplicate_values(re.findall(r'^\s*\["([A-Za-z0-9_]+)"\s*,', match.group("body"), flags=re.M))


def python_arg_specs(source: str, name: str) -> dict[str, list[str]]:
    tree = ast.parse(source)
    for node in tree.body:
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == name:
            try:
                value = ast.literal_eval(node.value)
            except ValueError:
                value = python_module_value(ROOT / "arinova_tools.py", name)
            return {str(method): [str(item[0]) for item in specs] for method, specs in value.items()}
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == name:
                    try:
                        value = ast.literal_eval(node.value)
                    except ValueError:
                        value = python_module_value(ROOT / "arinova_tools.py", name)
                    return {str(method): [str(item[0]) for item in specs] for method, specs in value.items()}
    raise ValueError(f"could not find Python `{name}`")


def python_module_value(path: Path, name: str) -> Any:
    spec = importlib.util.spec_from_file_location("_arinova_tools_surface", path)
    if spec is None or spec.loader is None:
        raise ValueError(f"could not import `{path}`")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return getattr(module, name)


def python_method_schema_arg_bounds(path: Path, *, task_scoped: bool = False) -> dict[str, dict[str, int | None]]:
    spec = importlib.util.spec_from_file_location("_arinova_tools_surface", path)
    if spec is None or spec.loader is None:
        raise ValueError(f"could not import `{path}`")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    methods = getattr(module, "TASK_METHODS" if task_scoped else "AGENT_METHODS")
    method_schema = getattr(module, "_method_schema")
    snake = getattr(module, "_snake")
    prefix = "arinova_task_" if task_scoped else "arinova_"
    bounds: dict[str, dict[str, int | None]] = {}
    for method in methods:
        schema = method_schema(f"{prefix}{snake(method)}", method, task_scoped=task_scoped)
        args_schema = schema.get("parameters", {}).get("properties", {}).get("args", {})
        bounds[str(method)] = {
            "minItems": args_schema.get("minItems"),
            "maxItems": args_schema.get("maxItems"),
        }
    return bounds


def python_duplicate_string_literal_keys(source: str) -> list[str]:
    duplicates: list[str] = []
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if not isinstance(node, ast.Dict):
            continue
        seen: set[str] = set()
        reported: set[str] = set()
        for key in node.keys:
            if not isinstance(key, ast.Constant) or not isinstance(key.value, str):
                continue
            if key.value in seen and key.value not in reported:
                duplicates.append(f"{key.value}@{key.lineno}:{key.col_offset}")
                reported.add(key.value)
            seen.add(key.value)
    return sorted(duplicates)


def js_duplicate_string_literal_keys(source: str) -> list[str]:
    duplicates: list[str] = []
    stack: list[dict[str, Any]] = []
    index = 0
    line = 1
    column = 0
    in_string: str | None = None
    escaped = False
    line_comment = False
    block_comment = False
    while index < len(source):
        char = source[index]
        next_char = source[index + 1] if index + 1 < len(source) else ""

        if char == "\n":
            line += 1
            column = 0
            line_comment = False
            index += 1
            continue
        if line_comment:
            index += 1
            column += 1
            continue
        if block_comment:
            if char == "*" and next_char == "/":
                index += 2
                column += 2
                block_comment = False
            else:
                index += 1
                column += 1
            continue
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == in_string:
                in_string = None
            index += 1
            column += 1
            continue
        if char == "/" and next_char == "/":
            line_comment = True
            index += 2
            column += 2
            continue
        if char == "/" and next_char == "*":
            block_comment = True
            index += 2
            column += 2
            continue
        if char == "{":
            stack.append({"seen": set(), "reported": set()})
            index += 1
            column += 1
            continue
        if char == "}":
            if stack:
                stack.pop()
            index += 1
            column += 1
            continue
        if stack:
            match = re.match(r"[A-Za-z_$][A-Za-z0-9_$]*", source[index:])
            key: str | None = None
            key_line = line
            key_column = column
            key_end = index
            if match:
                key = match.group(0)
                key_end = index + len(key)
            elif char in {"'", '"'}:
                quote = char
                cursor = index + 1
                literal = []
                local_escaped = False
                while cursor < len(source):
                    item = source[cursor]
                    if local_escaped:
                        literal.append(item)
                        local_escaped = False
                    elif item == "\\":
                        local_escaped = True
                    elif item == quote:
                        key = "".join(literal)
                        key_end = cursor + 1
                        break
                    else:
                        literal.append(item)
                    cursor += 1
            if key is not None:
                before = source[:index].rstrip()
                after_index = key_end
                while after_index < len(source) and source[after_index].isspace():
                    after_index += 1
                if before.endswith(("{", ",")) and after_index < len(source) and source[after_index] == ":":
                    context = stack[-1]
                    if key in context["seen"] and key not in context["reported"]:
                        duplicates.append(f"{key}@{key_line}:{key_column}")
                        context["reported"].add(key)
                    context["seen"].add(key)
                    consumed = key_end - index
                    index = key_end
                    column += consumed
                    continue
        if char in {"'", '"', "`"}:
            in_string = char
            index += 1
            column += 1
            continue
        index += 1
        column += 1
    return sorted(duplicates)


def python_literal_tuple(source: str, name: str) -> tuple[str, ...]:
    def string_tuple_value(node: ast.AST, constants: dict[str, tuple[str, ...]]) -> tuple[str, ...]:
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            return (node.value,)
        if isinstance(node, ast.Name) and node.id in constants:
            return constants[node.id]
        if isinstance(node, (ast.Tuple, ast.List)):
            items: list[str] = []
            for element in node.elts:
                if isinstance(element, ast.Starred):
                    items.extend(string_tuple_value(element.value, constants))
                else:
                    items.extend(string_tuple_value(element, constants))
            return tuple(items)
        raise ValueError("not a string tuple expression")

    tree = ast.parse(source)
    constants: dict[str, tuple[str, ...]] = {}
    for node in tree.body:
        value: ast.AST | None = None
        assigned_names: list[str] = []
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == name:
            value = node.value
            assigned_names = [node.target.id]
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    assigned_names.append(target.id)
            if name in assigned_names:
                value = node.value
        if value is None:
            for assigned_name in assigned_names:
                if isinstance(node, ast.Assign):
                    try:
                        constants[assigned_name] = string_tuple_value(node.value, constants)
                    except ValueError:
                        pass
            continue
        try:
            parsed = string_tuple_value(value, constants)
        except ValueError as exc:
            raise ValueError(f"Python `{name}` is not a string tuple") from exc
        if not all(isinstance(item, str) for item in parsed):
            raise ValueError(f"Python `{name}` is not a string tuple")
        return parsed
    raise ValueError(f"could not find Python `{name}`")


def python_dict_equality_literal(source: str, left_name: str) -> dict:
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if not isinstance(node, ast.Compare):
            continue
        if not isinstance(node.left, ast.Name) or node.left.id != left_name:
            continue
        if len(node.ops) != 1 or not isinstance(node.ops[0], (ast.Eq, ast.NotEq)) or len(node.comparators) != 1:
            continue
        try:
            parsed = ast.literal_eval(node.comparators[0])
        except (SyntaxError, ValueError):
            continue
        if isinstance(parsed, dict):
            return parsed
    raise ValueError(f"could not find Python dict equality for `{left_name}`")


def python_get_comparison_literal(source: str, object_name: str, key_name: str) -> Any:
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if not isinstance(node, ast.Compare):
            continue
        if len(node.ops) != 1 or not isinstance(node.ops[0], (ast.Eq, ast.NotEq)) or len(node.comparators) != 1:
            continue
        left = node.left
        if not (
            isinstance(left, ast.Call)
            and isinstance(left.func, ast.Attribute)
            and left.func.attr == "get"
            and isinstance(left.func.value, ast.Name)
            and left.func.value.id == object_name
            and len(left.args) >= 1
            and isinstance(left.args[0], ast.Constant)
            and left.args[0].value == key_name
        ):
            continue
        return ast.literal_eval(node.comparators[0])
    raise ValueError(f"could not find Python `{object_name}.get({key_name!r})` comparison")


def python_for_tuple_pair_values(source: str, target_names: tuple[str, str]) -> list[tuple[str, str]]:
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if not isinstance(node, ast.For):
            continue
        if not (
            isinstance(node.target, ast.Tuple)
            and len(node.target.elts) == 2
            and all(isinstance(item, ast.Name) for item in node.target.elts)
            and tuple(item.id for item in node.target.elts if isinstance(item, ast.Name)) == target_names
            and isinstance(node.iter, ast.Tuple)
        ):
            continue
        pairs: list[tuple[str, str]] = []
        for element in node.iter.elts:
            if not isinstance(element, ast.Tuple) or len(element.elts) != 2:
                raise ValueError(f"Python `{target_names}` loop contains a non-pair tuple")
            left, right = element.elts
            if not (
                isinstance(left, ast.Constant)
                and isinstance(left.value, str)
                and isinstance(right, ast.Constant)
                and isinstance(right.value, str)
            ):
                raise ValueError(f"Python `{target_names}` loop contains non-string values")
            pairs.append((left.value, right.value))
        return pairs
    raise ValueError(f"could not find Python `{target_names}` tuple loop")


def python_call_string_args(source: str, function_name: str, arg_index: int = 0) -> set[str]:
    calls: set[str] = set()
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if isinstance(func, ast.Attribute):
            name = func.attr
        elif isinstance(func, ast.Name):
            name = func.id
        else:
            continue
        if name != function_name or len(node.args) <= arg_index:
            continue
        arg = node.args[arg_index]
        if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
            calls.add(arg.value)
    return calls


def python_call_first_string_args(source: str, function_name: str) -> set[str]:
    return python_call_string_args(source, function_name)


def python_schema_fields(path: Path, name: str) -> set[str]:
    value = python_module_value(path, name)
    return schema_fields_value(value, f"Python `{name}`")


def schema_fields_value(value: Any, label: str) -> set[str]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} is not a schema dict")
    properties = value.get("properties")
    if not isinstance(properties, dict):
        raise ValueError(f"{label} has no properties dict")
    return {str(key) for key in properties}


def python_schema_required_fields(path: Path, name: str) -> set[str]:
    value = python_module_value(path, name)
    return schema_required_fields_value(value, f"Python `{name}`")


def schema_required_fields_value(value: Any, label: str) -> set[str]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} is not a schema dict")
    required = value.get("required", [])
    if not isinstance(required, list):
        raise ValueError(f"{label} has non-list required fields")
    return {str(key) for key in required}


def json_schema_property_shape(schema: Any) -> str:
    if not isinstance(schema, dict):
        return "unknown"
    enum_values = schema.get("enum")
    if isinstance(enum_values, list) and enum_values and all(isinstance(item, str) for item in enum_values):
        return "string"
    schema_type = str(schema.get("type") or "unknown")
    if schema_type == "array":
        item_schema = schema.get("items")
        if isinstance(item_schema, dict) and isinstance(item_schema.get("type"), str):
            return f"array:{item_schema['type']}"
        return "array"
    return schema_type


def python_schema_property_shapes(path: Path, name: str) -> dict[str, str]:
    value = python_module_value(path, name)
    return schema_property_shapes_value(value, f"Python `{name}`")


def schema_property_shapes_value(value: Any, label: str) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} is not a schema dict")
    properties = value.get("properties")
    if not isinstance(properties, dict):
        raise ValueError(f"{label} has no properties dict")
    shapes: dict[str, str] = {}
    for key, schema in properties.items():
        shapes[str(key)] = json_schema_property_shape(schema)
    return shapes


def python_oneof_schema_variants(path: Path, name: str, discriminator: str) -> dict[str, dict[str, Any]]:
    value = python_module_value(path, name)
    return oneof_schema_variants_value(value, f"Python `{name}`", discriminator)


def oneof_schema_variants_value(value: Any, label: str, discriminator: str) -> dict[str, dict[str, Any]]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} is not a schema dict")
    one_of = value.get("oneOf")
    if not isinstance(one_of, list):
        raise ValueError(f"{label} has no oneOf list")
    variants: dict[str, dict[str, Any]] = {}
    for branch in one_of:
        if not isinstance(branch, dict):
            continue
        properties = branch.get("properties")
        if not isinstance(properties, dict):
            continue
        discriminator_schema = properties.get(discriminator)
        if not isinstance(discriminator_schema, dict):
            continue
        enum_values = discriminator_schema.get("enum")
        if not isinstance(enum_values, list) or len(enum_values) != 1 or not isinstance(enum_values[0], str):
            continue
        required = branch.get("required", [])
        if not isinstance(required, list):
            raise ValueError(f"{label} branch has non-list required fields")
        variants[enum_values[0]] = {
            "fields": {str(key) for key in properties},
            "required": {str(key) for key in required},
            "shapes": {str(key): json_schema_property_shape(schema) for key, schema in properties.items()},
        }
    return variants


def python_schema_array_item_fields(path: Path, schema_name: str, field_name: str) -> set[str]:
    value = python_module_value(path, schema_name)
    return schema_array_item_fields_value(value, f"Python `{schema_name}`", field_name)


def schema_array_item_fields_value(value: Any, label: str, field_name: str) -> set[str]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} is not a schema dict")
    field_schema = value.get("properties", {}).get(field_name)
    if not isinstance(field_schema, dict):
        return set()
    item_schema = field_schema.get("items")
    if not isinstance(item_schema, dict):
        return set()
    properties = item_schema.get("properties")
    if not isinstance(properties, dict):
        return set()
    return {str(key) for key in properties}


def python_schema_array_item_required_fields(path: Path, schema_name: str, field_name: str) -> set[str]:
    value = python_module_value(path, schema_name)
    return schema_array_item_required_fields_value(value, f"Python `{schema_name}`", field_name)


def python_schema_array_item_shapes(path: Path, schema_name: str, field_name: str) -> dict[str, str]:
    value = python_module_value(path, schema_name)
    return schema_array_item_shapes_value(value, f"Python `{schema_name}`", field_name)


def schema_array_item_shapes_value(value: Any, label: str, field_name: str) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} is not a schema dict")
    field_schema = value.get("properties", {}).get(field_name)
    if not isinstance(field_schema, dict):
        return {}
    item_schema = field_schema.get("items")
    if not isinstance(item_schema, dict):
        return {}
    properties = item_schema.get("properties")
    if not isinstance(properties, dict):
        return {}
    return {str(key): json_schema_property_shape(schema) for key, schema in properties.items()}


def schema_array_item_required_fields_value(value: Any, label: str, field_name: str) -> set[str]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} is not a schema dict")
    field_schema = value.get("properties", {}).get(field_name)
    if not isinstance(field_schema, dict):
        return set()
    item_schema = field_schema.get("items")
    if not isinstance(item_schema, dict):
        return set()
    required = item_schema.get("required", [])
    if not isinstance(required, list):
        raise ValueError(f"{label}.{field_name} item has non-list required fields")
    return {str(key) for key in required}


def sidecar_schema_values(path: Path, names: set[str]) -> dict[str, Any]:
    if not names:
        return {}
    export_list = ", ".join(sorted(names))
    script = f"""
import {{ readFileSync }} from "node:fs";
const source = readFileSync(process.argv[1], "utf8");
const names = process.argv.slice(2);
const moduleSource = `${{source}}\\nexport {{ {export_list} }};`;
const moduleUrl = `data:text/javascript;base64,${{Buffer.from(moduleSource).toString("base64")}}`;
const module = await import(moduleUrl);
const values = Object.fromEntries(names.map((name) => [name, module[name]]));
console.log(JSON.stringify(values));
"""
    process = subprocess.run(
        ["node", "--input-type=module", "-e", script, str(path), *sorted(names)],
        check=True,
        capture_output=True,
        text=True,
        timeout=300,
    )
    parsed = json.loads(process.stdout)
    if not isinstance(parsed, dict):
        raise ValueError("sidecar schema export probe did not return an object")
    return parsed


def python_dict_keys(source: str, name: str) -> set[str]:
    tree = ast.parse(source)
    for node in tree.body:
        value = None
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == name:
            value = node.value
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == name:
                    value = node.value
                    break
        if value is None:
            continue
        parsed = ast.literal_eval(value)
        if not isinstance(parsed, dict):
            raise ValueError(f"Python `{name}` is not a dict")
        return {str(key) for key in parsed}
    raise ValueError(f"could not find Python `{name}`")


def python_function_dict_keys(source: str, function_name: str, dict_name: str) -> set[str]:
    tree = ast.parse(source)
    for node in tree.body:
        if not isinstance(node, ast.FunctionDef) or node.name != function_name:
            continue
        for child in ast.walk(node):
            value = None
            if isinstance(child, ast.Assign):
                for target in child.targets:
                    if isinstance(target, ast.Name) and target.id == dict_name:
                        value = child.value
                        break
            elif isinstance(child, ast.AnnAssign) and isinstance(child.target, ast.Name) and child.target.id == dict_name:
                value = child.value
            if value is None:
                continue
            parsed = ast.literal_eval(value)
            if not isinstance(parsed, dict):
                raise ValueError(f"Python `{function_name}.{dict_name}` is not a dict")
            return {str(key) for key in parsed}
    raise ValueError(f"could not find Python `{function_name}.{dict_name}`")


def python_function_mapping_key_lookups(source: str, function_name: str, mapping_name: str) -> set[str]:
    tree = ast.parse(source)
    for node in tree.body:
        if not isinstance(node, ast.FunctionDef) or node.name != function_name:
            continue
        keys: set[str] = set()
        for child in ast.walk(node):
            if isinstance(child, ast.Call):
                func = child.func
                if (
                    isinstance(func, ast.Attribute)
                    and func.attr == "get"
                    and isinstance(func.value, ast.Name)
                    and func.value.id == mapping_name
                    and child.args
                    and isinstance(child.args[0], ast.Constant)
                    and isinstance(child.args[0].value, str)
                ):
                    keys.add(child.args[0].value)
            elif isinstance(child, ast.Compare):
                if not child.comparators or not isinstance(child.left, ast.Constant):
                    continue
                if not isinstance(child.left.value, str):
                    continue
                if any(isinstance(op, ast.In) for op in child.ops) and any(
                    isinstance(comparator, ast.Name) and comparator.id == mapping_name
                    for comparator in child.comparators
                ):
                    keys.add(child.left.value)
        return keys
    raise ValueError(f"could not find Python `{function_name}`")


def python_call_dict_string_values(source: str, call_name: str, key_name: str) -> set[str]:
    tree = ast.parse(source)
    values: set[str] = set()

    def literal_status_from_dict(node: ast.AST) -> str | None:
        if not isinstance(node, ast.Dict):
            return None
        for key, value in zip(node.keys, node.values):
            if isinstance(key, ast.Constant) and key.value == key_name:
                if isinstance(value, ast.Constant) and isinstance(value.value, str):
                    return value.value
        return None

    for node in ast.walk(tree):
        if not isinstance(node, ast.Await):
            continue
        call = node.value
        if not isinstance(call, ast.Call):
            continue
        func = call.func
        if not isinstance(func, ast.Attribute) or func.attr != call_name:
            continue
        if len(call.args) >= 2:
            value = literal_status_from_dict(call.args[1])
            if value:
                values.add(value)
        for keyword in call.keywords:
            value = literal_status_from_dict(keyword.value)
            if value:
                values.add(value)
    return values


def python_dict_string_values(source: str, key_name: str) -> set[str]:
    tree = ast.parse(source)
    values: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Dict):
            continue
        for key, value in zip(node.keys, node.values):
            if isinstance(key, ast.Constant) and key.value == key_name:
                if isinstance(value, ast.Constant) and isinstance(value.value, str):
                    values.add(value.value)
    return values


def arinova_env_names(source: str) -> set[str]:
    return set(re.findall(r"\b(ARINOVA_[A-Z0-9_]+)\b", source))


def readme_env_names(source: str) -> set[str]:
    return arinova_env_names(source)


def readme_yaml_keys(source: str) -> set[str]:
    try:
        block = source.split("```yaml", 1)[1].split("```", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find README YAML config block") from exc
    return set(re.findall(r"^  ([a-z][a-z0-9_]*):", block, re.M))


def live_validator_shape_missing(
    validator_body: str,
    *,
    field_set_name: str,
    expected_shapes: dict[str, str],
    required_fields: set[str],
) -> dict[str, str]:
    if (
        field_set_name in validator_body
        and set(expected_shapes.values()) == {"string"}
        and "all(isinstance(value.get(field), str) for field in" in validator_body
    ):
        return {}

    missing: dict[str, str] = {}
    for field, shape in sorted(expected_shapes.items()):
        required = field in required_fields
        if shape == "string":
            if (
                f'isinstance(value.get("{field}"), str)' in validator_body
                or f'_sdk_optional_str(value, "{field}")' in validator_body
                or f'_sdk_required_nullable_str(value, "{field}")' in validator_body
                or f'_sdk_optional_nullable_str(value, "{field}")' in validator_body
                or f'value.get("{field}") in ' in validator_body
                or f'value.get("{field}") == ' in validator_body
                or (
                    required
                    and f'"{field}"' in validator_body
                    and "all(isinstance(value.get(field), str)" in validator_body
                )
            ):
                continue
        elif shape == "number":
            if f'_sdk_number(value.get("{field}"))' in validator_body:
                continue
        elif shape == "boolean":
            if f'isinstance(value.get("{field}"), bool)' in validator_body or f'_sdk_optional_bool(value, "{field}")' in validator_body:
                continue
        elif shape == "string|null":
            expected_helper = "_sdk_required_nullable_str" if required else "_sdk_optional_nullable_str"
            if f'{expected_helper}(value, "{field}")' in validator_body:
                continue
        elif shape == "array:string":
            if (
                f'_sdk_optional_str_array(value, "{field}")' in validator_body
                or (
                    f'value.get("{field}")' in validator_body
                    and "isinstance" in validator_body
                    and "list" in validator_body
                    and "str" in validator_body
                )
            ):
                continue
        elif shape in {"array", "array:object"}:
            if f'isinstance(value.get("{field}"), list)' in validator_body or f'_sdk_optional_task_attachment_array(value, "{field}")' in validator_body:
                continue
        elif shape == "object":
            if (
                f'isinstance(value.get("{field}"), dict)' in validator_body
                or f'_sdk_optional_object(value, "{field}")' in validator_body
                or (f'{field} = value.get("{field}")' in validator_body and f"isinstance({field}, dict)" in validator_body)
            ):
                continue
        elif shape == "unknown":
            continue
        missing[field] = shape
    return missing


def tool_param_name(ts_name: str) -> str:
    if ts_name == "args":
        return "action_args"
    return snake(ts_name)

