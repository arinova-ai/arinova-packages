#!/usr/bin/env python3
"""Credential-aware live smoke test for the Hermes Arinova plugin.

This test intentionally lives in the plugin repo. It does not modify the
hermes-agent checkout; it imports Hermes, loads this plugin through
PluginManager, and uses real ARINOVA_SERVER_URL / ARINOVA_BOT_TOKEN credentials
when they are present.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import tempfile
import os
import socket
import sys
from pathlib import Path

from install_check_helpers import SDK_PACKAGE_FILES, SDK_PACKAGE_PUBLIC_METADATA_KEYS


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SDK_ROOT = ROOT.parent / "agent-sdk"
SKIP_PREFIX = "live Arinova smoke skipped"
DEFAULT_SEND_MESSAGE_CONTENT = "Hermes Arinova live smoke probe"
DEFAULT_SEND_TELEMETRY_EVENT = "hermes_arinova_live_smoke"
DEFAULT_FETCH_HISTORY_LIMIT = 1
DEFAULT_UPLOAD_FILE_TYPE = "text/plain"
DEFAULT_CALL_ACTION_ARGS_JSON = "{}"
DEFAULT_CALL_ACTION_OPTIONS_JSON = "{}"


def _reject_probe_json_constant(value: str) -> None:
    raise ValueError(f"JSON contains non-finite constant: {value}")


def _reject_probe_duplicate_json_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    data: dict[str, object] = {}
    for key, value in pairs:
        if key in data:
            raise ValueError(f"JSON object contains duplicate key: {key}")
        data[key] = value
    return data


def _loads_probe_json(raw: str) -> object:
    return json.loads(
        raw,
        parse_constant=_reject_probe_json_constant,
        object_pairs_hook=_reject_probe_duplicate_json_keys,
    )


def _sdk_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _sdk_nullable_str(value: object) -> bool:
    return value is None or isinstance(value, str)


def _sdk_required_nullable_str(value: dict[str, object], key: str) -> bool:
    return key in value and _sdk_nullable_str(value.get(key))


def _sdk_optional_str(value: dict[str, object], key: str) -> bool:
    return key not in value or isinstance(value.get(key), str)


def _sdk_optional_nullable_str(value: dict[str, object], key: str) -> bool:
    return key not in value or _sdk_nullable_str(value.get(key))


def _sdk_optional_object(value: dict[str, object], key: str) -> bool:
    return key not in value or isinstance(value.get(key), dict)


def _sdk_optional_bool(value: dict[str, object], key: str) -> bool:
    return key not in value or isinstance(value.get(key), bool)


def _sdk_optional_str_array(value: dict[str, object], key: str) -> bool:
    items = value.get(key)
    return key not in value or (
        isinstance(items, list)
        and all(isinstance(item, str) for item in items)
    )


def _sdk_optional_task_attachment_array(value: dict[str, object], key: str) -> bool:
    items = value.get(key)
    return key not in value or (
        isinstance(items, list)
        and all(_sdk_task_attachment(item) for item in items)
    )


def _sdk_memory_origin(value: object) -> bool:
    shared_prefix = "shared-from-"
    return (
        value in {"self", "system"}
        or (
            isinstance(value, str)
            and value.startswith(shared_prefix)
            and len(value) == len(shared_prefix) + 8
            and all(char in "0123456789abcdef" for char in value[len(shared_prefix):])
        )
    )


def _sdk_optional_memory_origin(value: dict[str, object], key: str) -> bool:
    return key not in value or _sdk_memory_origin(value.get(key))


def _sdk_paginated_result(value: object, items_key: str) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        isinstance(value.get(items_key), list)
        and isinstance(value.get("hasMore"), bool)
        and _sdk_optional_str(value, "nextCursor")
    )


KANBAN_BOARD_FIELDS = {"id", "name", "createdAt"}
KANBAN_CARD_FIELDS = {
    "id",
    "columnId",
    "columnName",
    "title",
    "description",
    "priority",
    "dueDate",
    "sortOrder",
    "createdBy",
    "createdAt",
    "updatedAt",
    "archivedAt",
}
KANBAN_COLUMN_FIELDS = {"id", "boardId", "name", "sortOrder"}
KANBAN_LABEL_FIELDS = {"id", "boardId", "name", "color"}
TASK_ATTACHMENT_FIELDS = {"id", "fileName", "fileType", "fileSize", "url"}
UPLOAD_RESULT_FIELDS = {"url", "fileName", "fileType", "fileSize"}
HISTORY_MESSAGE_FIELDS = {
    "id",
    "conversationId",
    "seq",
    "role",
    "content",
    "status",
    "senderAgentId",
    "senderAgentName",
    "senderUserId",
    "senderUsername",
    "replyToId",
    "threadId",
    "createdAt",
    "updatedAt",
    "attachments",
}
MEMORY_ENTRY_FIELDS = {"content", "category", "score", "origin"}
SKILL_PROMPT_FIELDS = {"promptContent", "promptTemplate", "parameters"}
NOTE_FIELDS = {
    "id",
    "conversationId",
    "creatorId",
    "creatorType",
    "creatorName",
    "agentId",
    "agentName",
    "title",
    "content",
    "tags",
    "createdAt",
    "updatedAt",
}
CARD_COMMIT_FIELDS = {"cardId", "commitHash", "message", "createdAt"}
CARD_NOTE_FIELDS = {"id", "title", "tags", "createdAt"}
ONBOARDING_SEED_FIELDS = {"kind", "seedId", "agentId", "action", "prompt"}


def _sdk_kanban_board(value: object) -> bool:
    return (
        isinstance(value, dict)
        and all(isinstance(value.get(field), str) for field in KANBAN_BOARD_FIELDS)
    )


def _sdk_kanban_card(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        isinstance(value.get("id"), str)
        and isinstance(value.get("columnId"), str)
        and _sdk_optional_str(value, "columnName")
        and isinstance(value.get("title"), str)
        and _sdk_required_nullable_str(value, "description")
        and _sdk_required_nullable_str(value, "priority")
        and _sdk_required_nullable_str(value, "dueDate")
        and _sdk_number(value.get("sortOrder"))
        and _sdk_required_nullable_str(value, "createdBy")
        and _sdk_required_nullable_str(value, "createdAt")
        and _sdk_required_nullable_str(value, "updatedAt")
        and _sdk_optional_nullable_str(value, "archivedAt")
    )


def _sdk_kanban_column(value: object) -> bool:
    return (
        isinstance(value, dict)
        and all(isinstance(value.get(field), str) for field in ("id", "boardId", "name"))
        and _sdk_number(value.get("sortOrder"))
    )


def _sdk_kanban_label(value: object) -> bool:
    return (
        isinstance(value, dict)
        and all(isinstance(value.get(field), str) for field in ("id", "boardId", "name"))
        and _sdk_required_nullable_str(value, "color")
    )


def _sdk_task_attachment(value: object) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("id"), str)
        and isinstance(value.get("fileName"), str)
        and isinstance(value.get("fileType"), str)
        and _sdk_number(value.get("fileSize"))
        and isinstance(value.get("url"), str)
    )


def _sdk_upload_result(value: object) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("url"), str)
        and isinstance(value.get("fileName"), str)
        and isinstance(value.get("fileType"), str)
        and _sdk_number(value.get("fileSize"))
    )


def _sdk_history_message(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        isinstance(value.get("id"), str)
        and isinstance(value.get("conversationId"), str)
        and _sdk_number(value.get("seq"))
        and isinstance(value.get("role"), str)
        and isinstance(value.get("content"), str)
        and isinstance(value.get("status"), str)
        and _sdk_optional_str(value, "senderAgentId")
        and _sdk_optional_str(value, "senderAgentName")
        and _sdk_optional_str(value, "senderUserId")
        and _sdk_optional_str(value, "senderUsername")
        and _sdk_optional_str(value, "replyToId")
        and _sdk_optional_str(value, "threadId")
        and isinstance(value.get("createdAt"), str)
        and isinstance(value.get("updatedAt"), str)
        and _sdk_optional_task_attachment_array(value, "attachments")
    )


def _sdk_memory_entry(value: object) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("content"), str)
        and isinstance(value.get("category"), str)
        and _sdk_number(value.get("score"))
        and _sdk_optional_memory_origin(value, "origin")
    )


QUERY_MEMORY_OPTION_FIELDS = {"query", "limit"}


def _sdk_query_memory_options(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        all(key in QUERY_MEMORY_OPTION_FIELDS for key in value)
        and isinstance(value.get("query"), str)
        and ("limit" not in value or _sdk_number(value.get("limit")))
    )


LIST_CARDS_OPTION_FIELDS = {"search", "limit", "offset"}


def _sdk_list_cards_options(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        all(key in LIST_CARDS_OPTION_FIELDS for key in value)
        and _sdk_optional_str(value, "search")
        and ("limit" not in value or _sdk_number(value.get("limit")))
        and ("offset" not in value or _sdk_number(value.get("offset")))
    )


LIST_NOTES_OPTION_FIELDS = {"before", "limit", "offset", "tags", "archived"}


def _sdk_list_notes_options(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        all(key in LIST_NOTES_OPTION_FIELDS for key in value)
        and _sdk_optional_str(value, "before")
        and ("limit" not in value or _sdk_number(value.get("limit")))
        and ("offset" not in value or _sdk_number(value.get("offset")))
        and _sdk_optional_str_array(value, "tags")
        and _sdk_optional_bool(value, "archived")
    )


LIST_ARCHIVED_CARDS_OPTION_FIELDS = {"page", "limit"}


def _sdk_list_archived_cards_options(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        all(key in LIST_ARCHIVED_CARDS_OPTION_FIELDS for key in value)
        and ("page" not in value or _sdk_number(value.get("page")))
        and ("limit" not in value or _sdk_number(value.get("limit")))
    )


FETCH_HISTORY_OPTION_FIELDS = {"before", "after", "around", "limit"}


def _sdk_fetch_history_options(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        all(key in FETCH_HISTORY_OPTION_FIELDS for key in value)
        and _sdk_optional_str(value, "before")
        and _sdk_optional_str(value, "after")
        and _sdk_optional_str(value, "around")
        and ("limit" not in value or _sdk_number(value.get("limit")))
    )


CREATE_NOTE_BODY_FIELDS = {"title", "content", "tags", "notebookId"}


def _sdk_create_note_body(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        all(key in CREATE_NOTE_BODY_FIELDS for key in value)
        and isinstance(value.get("title"), str)
        and _sdk_optional_str(value, "content")
        and _sdk_optional_str_array(value, "tags")
        and _sdk_optional_str(value, "notebookId")
    )


UPDATE_NOTE_BODY_FIELDS = {"title", "content", "tags"}


def _sdk_update_note_body(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        all(key in UPDATE_NOTE_BODY_FIELDS for key in value)
        and _sdk_optional_str(value, "title")
        and _sdk_optional_str(value, "content")
        and _sdk_optional_str_array(value, "tags")
    )


CREATE_BOARD_BODY_FIELDS = {"name", "columns"}
CREATE_BOARD_COLUMN_FIELDS = {"name"}


def _sdk_create_board_body(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    columns = value.get("columns")
    return (
        all(key in CREATE_BOARD_BODY_FIELDS for key in value)
        and isinstance(value.get("name"), str)
        and (
            "columns" not in value
            or (
                isinstance(columns, list)
                and all(
                    isinstance(column, dict)
                    and all(key in CREATE_BOARD_COLUMN_FIELDS for key in column)
                    and isinstance(column.get("name"), str)
                    for column in columns
                )
            )
        )
    )


UPDATE_BOARD_BODY_FIELDS = {"name"}


def _sdk_update_board_body(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        all(key in UPDATE_BOARD_BODY_FIELDS for key in value)
        and isinstance(value.get("name"), str)
    )


CREATE_CARD_BODY_FIELDS = {"title", "description", "priority", "columnName", "columnId", "boardId"}


def _sdk_create_card_body(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        all(key in CREATE_CARD_BODY_FIELDS for key in value)
        and isinstance(value.get("title"), str)
        and _sdk_optional_str(value, "description")
        and _sdk_optional_str(value, "priority")
        and _sdk_optional_str(value, "columnName")
        and _sdk_optional_str(value, "columnId")
        and _sdk_optional_str(value, "boardId")
    )


UPDATE_CARD_BODY_FIELDS = {"title", "description", "priority", "columnId", "sortOrder"}


def _sdk_update_card_body(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        all(key in UPDATE_CARD_BODY_FIELDS for key in value)
        and _sdk_optional_str(value, "title")
        and _sdk_optional_str(value, "description")
        and _sdk_optional_str(value, "priority")
        and _sdk_optional_str(value, "columnId")
        and ("sortOrder" not in value or _sdk_number(value.get("sortOrder")))
    )


CREATE_COLUMN_BODY_FIELDS = {"name", "sortOrder"}


def _sdk_create_column_body(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        all(key in CREATE_COLUMN_BODY_FIELDS for key in value)
        and isinstance(value.get("name"), str)
        and ("sortOrder" not in value or _sdk_number(value.get("sortOrder")))
    )


UPDATE_COLUMN_BODY_FIELDS = {"name", "sortOrder"}


def _sdk_update_column_body(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        all(key in UPDATE_COLUMN_BODY_FIELDS for key in value)
        and _sdk_optional_str(value, "name")
        and ("sortOrder" not in value or _sdk_number(value.get("sortOrder")))
    )


ADD_COMMIT_BODY_FIELDS = {"commitHash", "message"}


def _sdk_add_commit_body(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        all(key in ADD_COMMIT_BODY_FIELDS for key in value)
        and isinstance(value.get("commitHash"), str)
        and _sdk_optional_str(value, "message")
    )


CREATE_LABEL_BODY_FIELDS = {"name", "color"}


def _sdk_create_label_body(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        all(key in CREATE_LABEL_BODY_FIELDS for key in value)
        and isinstance(value.get("name"), str)
        and _sdk_optional_str(value, "color")
    )


UPDATE_LABEL_BODY_FIELDS = {"name", "color"}


def _sdk_update_label_body(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        all(key in UPDATE_LABEL_BODY_FIELDS for key in value)
        and _sdk_optional_str(value, "name")
        and _sdk_optional_str(value, "color")
    )


def _sdk_skill_prompt(value: object) -> bool:
    return (
        isinstance(value, dict)
        and all(isinstance(value.get(field), str) for field in ("promptContent", "promptTemplate"))
        and isinstance(value.get("parameters"), list)
    )


TASK_UPDATE_STARTED_FIELDS = {"status", "task"}
TASK_UPDATE_COMPLETED_FIELDS = {"status", "durationMs", "costUsd", "numTurns"}


def _sdk_task_update_data(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    status = value.get("status")
    if status == "started":
        return (
            all(key in TASK_UPDATE_STARTED_FIELDS for key in value)
            and isinstance(value.get("task"), str)
        )
    if status == "completed":
        return (
            all(key in TASK_UPDATE_COMPLETED_FIELDS for key in value)
            and ("durationMs" not in value or _sdk_number(value.get("durationMs")))
            and ("costUsd" not in value or _sdk_number(value.get("costUsd")))
            and ("numTurns" not in value or _sdk_number(value.get("numTurns")))
        )
    return False


TOOL_CALL_REPORT_FIELDS = {
    "sessionId",
    "turnId",
    "seqOrder",
    "toolName",
    "input",
    "output",
    "durationMs",
    "success",
    "error",
    "messageId",
}


def _sdk_tool_call_report(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    if any(key not in TOOL_CALL_REPORT_FIELDS for key in value):
        return False
    return (
        isinstance(value.get("sessionId"), str)
        and isinstance(value.get("turnId"), str)
        and _sdk_number(value.get("seqOrder"))
        and isinstance(value.get("toolName"), str)
        and isinstance(value.get("input"), dict)
        and isinstance(value.get("success"), bool)
        and ("durationMs" not in value or _sdk_number(value.get("durationMs")))
        and ("error" not in value or isinstance(value.get("error"), str))
        and ("messageId" not in value or isinstance(value.get("messageId"), str))
    )


def _sdk_onboarding_seed(value: object) -> bool:
    return (
        isinstance(value, dict)
        and all(key in ONBOARDING_SEED_FIELDS for key in value)
        and value.get("kind") == "first_touch_opening"
        and isinstance(value.get("seedId"), str)
        and isinstance(value.get("agentId"), str)
        and isinstance(value.get("action"), str)
        and isinstance(value.get("prompt"), str)
    )


async def _expect_sdk_void(adapter: object, method: str, *args: object) -> None:
    result = await adapter.call_agent_sdk(method, *args)
    if result is not None:
        raise RuntimeError(f"SDK {method}() returned non-null void result: {result!r}")


def _expect_sdk_field(value: object, field: str, expected: str, message: str) -> None:
    if not isinstance(value, dict) or value.get(field) != expected:
        raise RuntimeError(f"{message}: expected={expected!r} result={value!r}")


def _expect_sdk_optional_field(value: object, field: str, expected: object, message: str) -> None:
    if isinstance(value, dict) and field not in value:
        return
    if not isinstance(value, dict) or value.get(field) != expected:
        raise RuntimeError(f"{message}: expected={expected!r} result={value!r}")


def _sdk_note(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        isinstance(value.get("id"), str)
        and isinstance(value.get("conversationId"), str)
        and isinstance(value.get("creatorId"), str)
        and value.get("creatorType") in {"user", "agent"}
        and isinstance(value.get("creatorName"), str)
        and _sdk_optional_str(value, "agentId")
        and _sdk_optional_str(value, "agentName")
        and isinstance(value.get("title"), str)
        and isinstance(value.get("content"), str)
        and _sdk_optional_str_array(value, "tags")
        and isinstance(value.get("createdAt"), str)
        and isinstance(value.get("updatedAt"), str)
    )


def _sdk_card_commit(value: object) -> bool:
    return (
        isinstance(value, dict)
        and all(isinstance(value.get(field), str) for field in CARD_COMMIT_FIELDS)
    )


def _sdk_card_note(value: object) -> bool:
    return (
        isinstance(value, dict)
        and all(isinstance(value.get(field), str) for field in ("id", "title", "createdAt"))
        and isinstance(value.get("tags"), list)
        and all(isinstance(tag, str) for tag in value.get("tags"))
    )


ACTION_ERROR_FIELDS = {"code", "message", "details"}
ACTION_CONFIRMATION_FIELDS = {"confirmationId", "title", "summary", "expiresAt"}
ACTION_CALL_RESULT_FIELDS = {
    "callId",
    "action",
    "status",
    "result",
    "error",
    "confirmation",
    "traceId",
    "actionVersion",
    "dryRun",
}
ACTION_STATUSES = {
    "success",
    "error",
    "requires_confirmation",
    "cancelled",
    "processing",
    "received",
    "validating",
}
TERMINAL_ACTION_STATUSES = {
    "success",
    "error",
    "requires_confirmation",
    "cancelled",
}
ACTION_CALL_OPTION_FIELDS = {
    "callId",
    "taskId",
    "conversationId",
    "messageId",
    "parentCallId",
    "reason",
    "metadata",
    "dryRun",
    "timeoutMs",
}
TASK_ACTION_CALL_OPTION_FIELDS = ACTION_CALL_OPTION_FIELDS - {"taskId", "conversationId", "messageId"}


def _sdk_action_error(value: object) -> bool:
    return (
        isinstance(value, dict)
        and all(key in ACTION_ERROR_FIELDS for key in value)
        and all(isinstance(value.get(field), str) for field in ("code", "message"))
        and _sdk_optional_object(value, "details")
    )


def _sdk_action_confirmation(value: object) -> bool:
    return (
        isinstance(value, dict)
        and all(key in ACTION_CONFIRMATION_FIELDS for key in value)
        and all(isinstance(value.get(field), str) for field in ACTION_CONFIRMATION_FIELDS)
    )


def _sdk_action_call_options(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    if any(key not in ACTION_CALL_OPTION_FIELDS for key in value):
        return False
    return (
        _sdk_optional_str(value, "callId")
        and _sdk_optional_str(value, "taskId")
        and _sdk_optional_str(value, "conversationId")
        and _sdk_optional_str(value, "messageId")
        and _sdk_optional_str(value, "parentCallId")
        and _sdk_optional_str(value, "reason")
        and _sdk_optional_object(value, "metadata")
        and _sdk_optional_bool(value, "dryRun")
        and ("timeoutMs" not in value or _sdk_number(value.get("timeoutMs")))
    )


def _sdk_task_action_call_options(value: object) -> bool:
    return (
        _sdk_action_call_options(value)
        and isinstance(value, dict)
        and all(key in TASK_ACTION_CALL_OPTION_FIELDS for key in value)
    )


def _sdk_action_call_result(value: object, action_name: str) -> bool:
    if not isinstance(value, dict):
        return False
    result = value.get("result")
    error = value.get("error")
    confirmation = value.get("confirmation")
    return (
        all(key in ACTION_CALL_RESULT_FIELDS for key in value)
        and isinstance(value.get("callId"), str)
        and value.get("action") == action_name
        and value.get("status") in TERMINAL_ACTION_STATUSES
        and (result is None or isinstance(result, dict))
        and (error is None or _sdk_action_error(error))
        and (confirmation is None or _sdk_action_confirmation(confirmation))
        and _sdk_optional_str(value, "traceId")
        and _sdk_optional_str(value, "actionVersion")
        and _sdk_optional_bool(value, "dryRun")
    )


def _sdk_action_result_status_payload(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    status = value.get("status")
    result = value.get("result")
    error = value.get("error")
    confirmation = value.get("confirmation")
    if status == "success":
        return error is None and confirmation is None and (result is None or isinstance(result, dict))
    if status == "error":
        return _sdk_action_error(error) and result is None and confirmation is None
    if status == "requires_confirmation":
        return _sdk_action_confirmation(confirmation) and result is None and error is None
    if status == "cancelled":
        return error is None and confirmation is None and (result is None or isinstance(result, dict))
    return False


def require_hermes_python() -> None:
    if sys.version_info < (3, 10):
        version = ".".join(str(part) for part in sys.version_info[:3])
        raise SystemExit(
            "Hermes live smoke requires Python 3.10+ when loading ~/hermes-agent; "
            f"current interpreter is Python {version}. Run this check with the "
            "same Python used by Hermes, for example python3.13."
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hermes-root", default=str(Path.home() / "hermes-agent"))
    parser.add_argument("--sdk-root", default=str(DEFAULT_SDK_ROOT), help="Path to the agent-sdk checkout.")
    parser.add_argument("--timeout-ms", type=int, default=15_000)
    parser.add_argument(
        "--send-message-conversation",
        default="",
        help="Optional Arinova conversation id for a real proactive SDK sendMessage() probe.",
    )
    parser.add_argument(
        "--send-message-content",
        default=DEFAULT_SEND_MESSAGE_CONTENT,
        help="Message content used with --send-message-conversation.",
    )
    parser.add_argument(
        "--fetch-history-conversation",
        default="",
        help="Optional Arinova conversation id for a read-only SDK fetchHistory() probe.",
    )
    parser.add_argument(
        "--fetch-history-limit",
        type=int,
        default=DEFAULT_FETCH_HISTORY_LIMIT,
        help="History page size used with --fetch-history-conversation.",
    )
    parser.add_argument(
        "--fetch-history-options-json",
        default="",
        help="Optional JSON object for SDK fetchHistory() pagination options.",
    )
    parser.add_argument(
        "--upload-file-conversation",
        default="",
        help="Optional Arinova conversation id for a real SDK uploadFile() probe.",
    )
    parser.add_argument(
        "--upload-file-path",
        default="",
        help="Optional local file path used with --upload-file-conversation. A tiny probe file is generated when omitted.",
    )
    parser.add_argument(
        "--upload-file-name",
        default="",
        help="Optional file name sent with --upload-file-conversation.",
    )
    parser.add_argument(
        "--upload-file-type",
        default=DEFAULT_UPLOAD_FILE_TYPE,
        help="MIME type sent with --upload-file-conversation.",
    )
    parser.add_argument(
        "--task-fetch-history-task",
        default="",
        help="Optional active Arinova task id for a read-only task-scoped SDK fetchHistory() probe.",
    )
    parser.add_argument(
        "--task-fetch-history-limit",
        type=int,
        default=DEFAULT_FETCH_HISTORY_LIMIT,
        help="History page size used with --task-fetch-history-task.",
    )
    parser.add_argument(
        "--task-fetch-history-options-json",
        default="",
        help="Optional JSON object for task-scoped SDK fetchHistory() pagination options.",
    )
    parser.add_argument(
        "--task-upload-file-task",
        default="",
        help="Optional active Arinova task id for a task-scoped SDK uploadFile() probe.",
    )
    parser.add_argument(
        "--task-upload-file-path",
        default="",
        help="Optional local file path used with --task-upload-file-task. A tiny probe file is generated when omitted.",
    )
    parser.add_argument(
        "--task-upload-file-name",
        default="",
        help="Optional file name sent with --task-upload-file-task.",
    )
    parser.add_argument(
        "--task-upload-file-type",
        default=DEFAULT_UPLOAD_FILE_TYPE,
        help="MIME type sent with --task-upload-file-task.",
    )
    parser.add_argument(
        "--call-action",
        default="",
        help="Optional Arinova backend action name for a dry-run SDK callAction() probe.",
    )
    parser.add_argument(
        "--call-action-args-json",
        default=DEFAULT_CALL_ACTION_ARGS_JSON,
        help="JSON object passed as SDK callAction() arguments.",
    )
    parser.add_argument(
        "--call-action-options-json",
        default=DEFAULT_CALL_ACTION_OPTIONS_JSON,
        help="JSON object merged into SDK callAction() options. dryRun defaults to true when omitted.",
    )
    parser.add_argument(
        "--task-call-action-task",
        default="",
        help="Optional active Arinova task id for a task-scoped SDK callAction() probe.",
    )
    parser.add_argument(
        "--task-call-action",
        default="",
        help="Optional Arinova backend action name for a task-scoped dry-run SDK callAction() probe.",
    )
    parser.add_argument(
        "--task-call-action-args-json",
        default=DEFAULT_CALL_ACTION_ARGS_JSON,
        help="JSON object passed as task-scoped SDK callAction() arguments.",
    )
    parser.add_argument(
        "--task-call-action-options-json",
        default=DEFAULT_CALL_ACTION_OPTIONS_JSON,
        help="JSON object merged into task-scoped SDK callAction() options. dryRun defaults to true when omitted.",
    )
    parser.add_argument(
        "--skip-telemetry",
        action="store_true",
        help="Skip the default low-impact SDK sendTelemetry() outbound probe.",
    )
    parser.add_argument(
        "--send-telemetry-event",
        default=DEFAULT_SEND_TELEMETRY_EVENT,
        help="Event name used for the low-impact SDK sendTelemetry() outbound probe.",
    )
    parser.add_argument(
        "--send-telemetry-json",
        default="",
        help="Optional JSON object for the SDK sendTelemetry() outbound probe data.",
    )
    parser.add_argument(
        "--send-hud-json",
        default="",
        help="Optional JSON object for a low-impact SDK sendHud() probe.",
    )
    parser.add_argument(
        "--send-hud-conversation",
        default="",
        help="Optional conversation id for the SDK sendHud() probe.",
    )
    parser.add_argument(
        "--send-task-update-json",
        default="",
        help="Optional JSON object for a low-impact SDK sendTaskUpdate() probe.",
    )
    parser.add_argument(
        "--report-tool-call-json",
        default="",
        help="Optional JSON object for an SDK reportToolCall() probe.",
    )
    parser.add_argument(
        "--query-memory-json",
        default="",
        help="Optional JSON object for a read-only SDK queryMemory() probe.",
    )
    parser.add_argument(
        "--fetch-skill-prompt",
        default="",
        help="Optional skill slug for a read-only SDK fetchSkillPrompt() probe.",
    )
    parser.add_argument(
        "--list-boards",
        action="store_true",
        help="Run a read-only SDK listBoards() probe.",
    )
    parser.add_argument(
        "--list-cards-json",
        default="",
        help="Optional JSON object for a read-only SDK listCards() probe.",
    )
    parser.add_argument(
        "--list-notes-conversation",
        default="",
        help="Optional conversation id for a read-only SDK listNotes() probe.",
    )
    parser.add_argument(
        "--list-notes-options-json",
        default="{}",
        help="JSON object passed as SDK listNotes() options.",
    )
    parser.add_argument(
        "--list-columns-board",
        default="",
        help="Optional board id for a read-only SDK listColumns() probe.",
    )
    parser.add_argument(
        "--list-labels-board",
        default="",
        help="Optional board id for a read-only SDK listLabels() probe.",
    )
    parser.add_argument(
        "--list-archived-cards-board",
        default="",
        help="Optional board id for a read-only SDK listArchivedCards() probe.",
    )
    parser.add_argument(
        "--list-archived-cards-options-json",
        default="{}",
        help="JSON object passed as SDK listArchivedCards() options.",
    )
    parser.add_argument(
        "--list-card-commits-card",
        default="",
        help="Optional card id for a read-only SDK listCardCommits() probe.",
    )
    parser.add_argument(
        "--list-card-notes-card",
        default="",
        help="Optional card id for a read-only SDK listCardNotes() probe.",
    )
    parser.add_argument(
        "--create-note-conversation",
        default="",
        help="Optional conversation id for an SDK createNote() probe.",
    )
    parser.add_argument(
        "--create-note-body-json",
        default="",
        help="Optional JSON object body for an SDK createNote() probe.",
    )
    parser.add_argument(
        "--update-note-conversation",
        default="",
        help="Optional conversation id for an SDK updateNote() probe.",
    )
    parser.add_argument(
        "--update-note-id",
        default="",
        help="Optional note id for an SDK updateNote() probe.",
    )
    parser.add_argument(
        "--update-note-body-json",
        default="",
        help="Optional JSON object body for an SDK updateNote() probe.",
    )
    parser.add_argument(
        "--delete-note-conversation",
        default="",
        help="Optional conversation id for an SDK deleteNote() probe.",
    )
    parser.add_argument(
        "--delete-note-id",
        default="",
        help="Optional note id for an SDK deleteNote() probe.",
    )
    parser.add_argument(
        "--create-board-body-json",
        default="",
        help="Optional JSON object body for an SDK createBoard() probe.",
    )
    parser.add_argument(
        "--update-board-id",
        default="",
        help="Optional board id for an SDK updateBoard() probe.",
    )
    parser.add_argument(
        "--update-board-body-json",
        default="",
        help="Optional JSON object body for an SDK updateBoard() probe.",
    )
    parser.add_argument(
        "--archive-board-id",
        default="",
        help="Optional board id for an SDK archiveBoard() probe.",
    )
    parser.add_argument(
        "--create-card-body-json",
        default="",
        help="Optional JSON object body for an SDK createCard() probe.",
    )
    parser.add_argument(
        "--update-card-id",
        default="",
        help="Optional card id for an SDK updateCard() probe.",
    )
    parser.add_argument(
        "--update-card-body-json",
        default="",
        help="Optional JSON object body for an SDK updateCard() probe.",
    )
    parser.add_argument(
        "--complete-card-id",
        default="",
        help="Optional card id for an SDK completeCard() probe.",
    )
    parser.add_argument(
        "--create-column-board",
        default="",
        help="Optional board id for an SDK createColumn() probe.",
    )
    parser.add_argument(
        "--create-column-body-json",
        default="",
        help="Optional JSON object body for an SDK createColumn() probe.",
    )
    parser.add_argument(
        "--update-column-id",
        default="",
        help="Optional column id for an SDK updateColumn() probe.",
    )
    parser.add_argument(
        "--update-column-body-json",
        default="",
        help="Optional JSON object body for an SDK updateColumn() probe.",
    )
    parser.add_argument(
        "--delete-column-id",
        default="",
        help="Optional column id for an SDK deleteColumn() probe.",
    )
    parser.add_argument(
        "--reorder-columns-board",
        default="",
        help="Optional board id for an SDK reorderColumns() probe.",
    )
    parser.add_argument(
        "--reorder-columns-json",
        default="",
        help="Optional JSON string array of column ids for an SDK reorderColumns() probe.",
    )
    parser.add_argument(
        "--add-card-commit-card",
        default="",
        help="Optional card id for an SDK addCardCommit() probe.",
    )
    parser.add_argument(
        "--add-card-commit-body-json",
        default="",
        help="Optional JSON object body for an SDK addCardCommit() probe.",
    )
    parser.add_argument(
        "--link-card-note-card",
        default="",
        help="Optional card id for an SDK linkCardNote() probe.",
    )
    parser.add_argument(
        "--link-card-note-note",
        default="",
        help="Optional note id for an SDK linkCardNote() probe.",
    )
    parser.add_argument(
        "--unlink-card-note-card",
        default="",
        help="Optional card id for an SDK unlinkCardNote() probe.",
    )
    parser.add_argument(
        "--unlink-card-note-note",
        default="",
        help="Optional note id for an SDK unlinkCardNote() probe.",
    )
    parser.add_argument("--create-label-board", default="", help="Optional board id for an SDK createLabel() probe.")
    parser.add_argument(
        "--create-label-body-json",
        default="",
        help="Optional JSON object body for an SDK createLabel() probe.",
    )
    parser.add_argument("--update-label-id", default="", help="Optional label id for an SDK updateLabel() probe.")
    parser.add_argument(
        "--update-label-body-json",
        default="",
        help="Optional JSON object body for an SDK updateLabel() probe.",
    )
    parser.add_argument("--delete-label-id", default="", help="Optional label id for an SDK deleteLabel() probe.")
    parser.add_argument("--add-card-label-card", default="", help="Optional card id for an SDK addCardLabel() probe.")
    parser.add_argument("--add-card-label-label", default="", help="Optional label id for an SDK addCardLabel() probe.")
    parser.add_argument(
        "--remove-card-label-card",
        default="",
        help="Optional card id for an SDK removeCardLabel() probe.",
    )
    parser.add_argument(
        "--remove-card-label-label",
        default="",
        help="Optional label id for an SDK removeCardLabel() probe.",
    )
    parser.add_argument(
        "--require-credentials",
        action="store_true",
        help="Fail instead of skipping when ARINOVA_SERVER_URL / ARINOVA_BOT_TOKEN are absent.",
    )
    parser.add_argument(
        "--resolve-credentials-only",
        action="store_true",
        help="Resolve credential sources and exit without loading Hermes or opening the SDK websocket.",
    )
    return parser.parse_args()


def sdk_package_public_metadata(package: dict) -> dict:
    return {key: package.get(key) for key in SDK_PACKAGE_PUBLIC_METADATA_KEYS}


def assert_bundled_sdk_matches_source(sdk_root: Path) -> str:
    bundled_sdk = ROOT / "sidecar/node_modules/@arinova-ai/agent-sdk"
    source_package_path = sdk_root / "package.json"
    bundled_package_path = bundled_sdk / "package.json"
    if not source_package_path.is_file():
        raise RuntimeError(f"selected agent-sdk checkout is missing package.json: {sdk_root}")
    if not bundled_package_path.is_file():
        raise RuntimeError("sidecar is missing bundled @arinova-ai/agent-sdk package.json")
    source_package = json.loads(source_package_path.read_text(encoding="utf-8"))
    bundled_package = json.loads(bundled_package_path.read_text(encoding="utf-8"))
    if source_package.get("version") != bundled_package.get("version"):
        raise RuntimeError(
            "live smoke bundled @arinova-ai/agent-sdk version differs from selected agent-sdk source: "
            f"expected={source_package.get('version')!r} actual={bundled_package.get('version')!r}"
        )
    if sdk_package_public_metadata(source_package) != sdk_package_public_metadata(bundled_package):
        raise RuntimeError(
            "live smoke bundled @arinova-ai/agent-sdk package metadata differs from selected agent-sdk source"
        )
    drift = [
        relative_path
        for relative_path in SDK_PACKAGE_FILES
        if (sdk_root / relative_path).read_text(encoding="utf-8")
        != (bundled_sdk / relative_path).read_text(encoding="utf-8")
    ]
    if drift:
        raise RuntimeError(
            "live smoke bundled @arinova-ai/agent-sdk package files differ from selected agent-sdk source: "
            f"{', '.join(drift)}"
        )
    return str(source_package.get("version"))


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def yaml_config_platform() -> dict:
    config_path = Path(os.getenv("HERMES_HOME") or Path.home() / ".hermes").expanduser() / "config.yaml"
    try:
        import yaml
    except Exception:
        try:
            lines = config_path.read_text().splitlines()
        except OSError:
            return {}
        values: dict[str, str] = {}
        in_arinova = False
        for line in lines:
            if line and not line.startswith((" ", "\t")):
                in_arinova = line.strip() == "arinova:"
                continue
            if not in_arinova or ":" not in line:
                continue
            key, value = line.strip().split(":", 1)
            values[key] = value.strip().strip("'\"")
        return values
    try:
        data = yaml.safe_load(config_path.read_text()) or {}
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    platform = data.get("arinova")
    if not isinstance(platform, dict):
        return {}
    return dict(platform)


def yaml_config_credentials() -> tuple[str, str]:
    platform = yaml_config_platform()
    if not platform:
        return "", ""
    server_url = str(platform.get("server_url") or "").strip()
    bot_token = str(platform.get("bot_token") or platform.get("token") or "").strip()
    return server_url, bot_token


def ensure_hermes_import_path(hermes_root: Path) -> None:
    if str(hermes_root) not in sys.path:
        sys.path.insert(0, str(hermes_root))


def arinova_platform_config(platforms: object) -> object | None:
    if not isinstance(platforms, dict):
        return None
    platform = platforms.get("arinova")
    if platform is not None:
        return platform
    for key, value in platforms.items():
        if str(key) == "arinova" or getattr(key, "value", None) == "arinova" or getattr(key, "name", None) == "arinova":
            return value
    return None


def config_credentials(hermes_root: Path) -> tuple[str, str]:
    ensure_hermes_import_path(hermes_root)
    try:
        from gateway.config import load_gateway_config

        config = load_gateway_config()
    except Exception:
        return yaml_config_credentials()
    platform = arinova_platform_config(getattr(config, "platforms", None))
    if platform is None:
        return yaml_config_credentials()
    extra = platform.extra if isinstance(platform.extra, dict) else {}
    server_url = str(extra.get("server_url") or "").strip()
    bot_token = str(platform.token or extra.get("bot_token") or "").strip()
    if server_url or bot_token:
        return server_url, bot_token
    return yaml_config_credentials()


def config_platform_values(hermes_root: Path, *, load_hermes_config: bool = True) -> tuple[dict, str]:
    if load_hermes_config:
        ensure_hermes_import_path(hermes_root)
        try:
            from gateway.config import load_gateway_config

            config = load_gateway_config()
            platform = arinova_platform_config(getattr(config, "platforms", None))
        except Exception:
            platform = None
        if platform is not None:
            extra = dict(platform.extra) if isinstance(platform.extra, dict) else {}
            token = str(getattr(platform, "token", "") or extra.get("bot_token") or "").strip()
            return extra, token

    platform = yaml_config_platform()
    token = str(platform.get("bot_token") or platform.get("token") or "").strip()
    return platform, token


def resolve_credentials(hermes_root: Path, *, load_hermes_config: bool = True) -> tuple[str, str, str, str]:
    server_url = os.getenv("ARINOVA_SERVER_URL", "").strip()
    bot_token = os.getenv("ARINOVA_BOT_TOKEN", "").strip()
    server_source = "env" if server_url else "missing"
    token_source = "env" if bot_token else "missing"
    if not server_url or not bot_token:
        if load_hermes_config:
            config_server_url, config_bot_token = config_credentials(hermes_root)
        else:
            config_server_url, config_bot_token = yaml_config_credentials()
        if not server_url and config_server_url:
            server_url = config_server_url
            server_source = "config"
        if not bot_token and config_bot_token:
            bot_token = config_bot_token
            token_source = "config"
    return server_url, bot_token, server_source, token_source


async def main() -> int:
    args = parse_args()
    hermes_root = Path(args.hermes_root).expanduser().resolve()
    sdk_root = Path(args.sdk_root).expanduser().resolve()
    server_url, bot_token, server_source, token_source = resolve_credentials(
        hermes_root,
        load_hermes_config=not args.resolve_credentials_only,
    )
    if not server_url or not bot_token:
        if args.resolve_credentials_only and not args.require_credentials:
            print(
                "live Arinova credentials resolved: "
                f"server_url={server_source} bot_token={token_source}"
            )
            return 0
        missing = [
            name
            for name, value in (
                ("ARINOVA_SERVER_URL", server_url),
                ("ARINOVA_BOT_TOKEN", bot_token),
            )
            if not value
        ]
        message = f"{SKIP_PREFIX}: missing {', '.join(missing)} in env or Hermes config"
        if args.require_credentials:
            print(message, file=sys.stderr)
            return 2
        print(message)
        return 0
    if args.resolve_credentials_only:
        print(
            "live Arinova credentials resolved: "
            f"server_url={server_source} bot_token={token_source}"
        )
        return 0
    sdk_version = assert_bundled_sdk_matches_source(sdk_root)

    ensure_hermes_import_path(hermes_root)
    try:
        from gateway.config import PlatformConfig
        from hermes_cli.plugins import PluginManager
    except (SyntaxError, TypeError) as exc:
        if sys.version_info < (3, 10):
            require_hermes_python()
        raise

    manager = PluginManager()
    manifest = manager._parse_manifest(ROOT / "plugin.yaml", ROOT, source="user", prefix="")
    if manifest is None:
        raise RuntimeError("plugin manifest did not parse")
    manager._load_plugin(manifest)
    loaded = manager._plugins.get(manifest.key or manifest.name)
    if loaded is None or not loaded.enabled or loaded.error:
        raise RuntimeError(f"plugin did not load cleanly: {getattr(loaded, 'error', None)}")

    env_overrides = {
        "ARINOVA_SIDECAR_PORT": str(free_port()),
        "ARINOVA_ADAPTER_PORT": str(free_port()),
        "ARINOVA_CONNECT_TIMEOUT_MS": str(args.timeout_ms),
    }
    old_env = {key: os.environ.get(key) for key in env_overrides}
    os.environ.update(env_overrides)
    try:
        platform_extra, config_token = config_platform_values(hermes_root)
        platform_extra.update(
            {
                "server_url": server_url,
                "bot_token": bot_token,
            }
        )
        if not platform_extra.get("concurrency_mode") and not platform_extra.get("agent_concurrency_mode"):
            platform_extra["concurrency_mode"] = os.getenv("ARINOVA_CONCURRENCY_MODE", "per-conversation")
        platform_config = PlatformConfig(
            enabled=True,
            token=bot_token or config_token,
            extra=platform_extra,
        )
        if not loaded.module.validate_config(platform_config):
            raise RuntimeError("resolved Arinova live smoke config did not pass plugin validate_config")

        adapter = loaded.module.ArinovaAdapter(platform_config)

        connected = False
        try:
            connected = await adapter.connect()
            if not connected or not adapter.is_connected:
                raise RuntimeError(adapter.fatal_error_message or "adapter.connect() returned false")
            health = await asyncio.to_thread(adapter._post_sidecar, "/healthz", {})
            if health.get("ok") is not True:
                raise RuntimeError(f"sidecar health did not report healthy control state: {health}")
            if health.get("connected") is not True:
                raise RuntimeError(f"sidecar health did not report authenticated SDK state: {health}")
            sdk_agent_id = await adapter.call_agent_sdk("getAgentId")
            health_agent_id = health.get("agentId")
            claimed_agent_id = getattr(adapter, "_claimed_agent_id", None)
            if not isinstance(sdk_agent_id, str) or not sdk_agent_id.strip():
                raise RuntimeError(f"SDK getAgentId() did not return an authenticated agent id: {sdk_agent_id!r}")
            if health_agent_id != sdk_agent_id:
                raise RuntimeError(
                    f"sidecar health agent id disagreed with SDK getAgentId(): "
                    f"health={health_agent_id!r} sdk={sdk_agent_id!r}"
                )
            if claimed_agent_id and claimed_agent_id != sdk_agent_id:
                raise RuntimeError(
                    f"SDK getAgentId() disagreed with token-claimed agent id: "
                    f"sdk={sdk_agent_id!r} claimed={claimed_agent_id!r}"
                )
            agent_id = sdk_agent_id
            onboarding_seed = await adapter.call_agent_sdk("getOnboardingSeed")
            if onboarding_seed is not None:
                if not isinstance(onboarding_seed, dict) or onboarding_seed.get("kind") != "first_touch_opening":
                    raise RuntimeError(f"SDK getOnboardingSeed() returned unexpected value: {onboarding_seed!r}")
                if not _sdk_onboarding_seed(onboarding_seed):
                    raise RuntimeError(f"SDK getOnboardingSeed() returned malformed seed: {onboarding_seed!r}")
            send_telemetry_event = str(args.send_telemetry_event or "").strip()
            send_telemetry_json = str(args.send_telemetry_json or "").strip()
            if args.skip_telemetry:
                if send_telemetry_event != DEFAULT_SEND_TELEMETRY_EVENT:
                    raise RuntimeError(
                        "SDK sendTelemetry() probe cannot use custom event when telemetry is skipped"
                    )
                if send_telemetry_json:
                    raise RuntimeError(
                        "SDK sendTelemetry() probe cannot use custom data when telemetry is skipped"
                    )
            else:
                if not send_telemetry_event:
                    raise RuntimeError("SDK sendTelemetry() probe event must be a non-empty string")
                if send_telemetry_json:
                    try:
                        send_telemetry_payload = _loads_probe_json(send_telemetry_json)
                    except json.JSONDecodeError as exc:
                        raise RuntimeError(
                            f"SDK sendTelemetry() probe data JSON argument could not be parsed: {exc}"
                        ) from exc
                    if not isinstance(send_telemetry_payload, dict):
                        raise RuntimeError("SDK sendTelemetry() probe data must be a JSON object")
                else:
                    send_telemetry_payload = {"source": "hermes-arinova-plugin", "agentId": agent_id}
                await _expect_sdk_void(
                    adapter,
                    "sendTelemetry",
                    send_telemetry_event,
                    send_telemetry_payload,
                )
            send_hud_json = str(args.send_hud_json or "").strip()
            send_hud_conversation = str(args.send_hud_conversation or "").strip()
            if send_hud_conversation and not send_hud_json:
                raise RuntimeError("SDK sendHud() probe requires HUD JSON when conversation id is provided")
            if send_hud_json:
                try:
                    send_hud_payload = _loads_probe_json(send_hud_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(f"SDK sendHud() probe JSON argument could not be parsed: {exc}") from exc
                if not isinstance(send_hud_payload, dict):
                    raise RuntimeError("SDK sendHud() probe payload must be a JSON object")
                if send_hud_conversation:
                    await _expect_sdk_void(adapter, "sendHud", send_hud_payload, send_hud_conversation)
                else:
                    await _expect_sdk_void(adapter, "sendHud", send_hud_payload)
                print("live Arinova sendHud OK")
            send_task_update_json = str(args.send_task_update_json or "").strip()
            if send_task_update_json:
                try:
                    send_task_update_payload = _loads_probe_json(send_task_update_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"SDK sendTaskUpdate() probe JSON argument could not be parsed: {exc}"
                    ) from exc
                if not isinstance(send_task_update_payload, dict):
                    raise RuntimeError("SDK sendTaskUpdate() probe payload must be a JSON object")
                if not _sdk_task_update_data(send_task_update_payload):
                    raise RuntimeError("SDK sendTaskUpdate() probe payload must match TaskUpdateData")
                await _expect_sdk_void(adapter, "sendTaskUpdate", "Hermes", send_task_update_payload)
                print("live Arinova sendTaskUpdate OK")
            report_tool_call_json = str(args.report_tool_call_json or "").strip()
            if report_tool_call_json:
                try:
                    report_tool_call_payload = _loads_probe_json(report_tool_call_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"SDK reportToolCall() probe JSON argument could not be parsed: {exc}"
                    ) from exc
                if not isinstance(report_tool_call_payload, dict):
                    raise RuntimeError("SDK reportToolCall() probe payload must be a JSON object")
                if not _sdk_tool_call_report(report_tool_call_payload):
                    raise RuntimeError("SDK reportToolCall() probe payload must match ToolCallReport")
                await _expect_sdk_void(adapter, "reportToolCall", report_tool_call_payload)
                print("live Arinova reportToolCall OK")
            query_memory_json = str(args.query_memory_json or "").strip()
            if query_memory_json:
                try:
                    query_memory_payload = _loads_probe_json(query_memory_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"SDK queryMemory() probe JSON argument could not be parsed: {exc}"
                    ) from exc
                if not isinstance(query_memory_payload, dict):
                    raise RuntimeError("SDK queryMemory() probe payload must be a JSON object")
                if not _sdk_query_memory_options(query_memory_payload):
                    raise RuntimeError("SDK queryMemory() probe payload must match QueryMemoryOptions")
                memory_entries = await adapter.call_agent_sdk("queryMemory", query_memory_payload)
                if not isinstance(memory_entries, list) or any(not _sdk_memory_entry(entry) for entry in memory_entries):
                    raise RuntimeError(f"SDK queryMemory() returned malformed memory result: {memory_entries!r}")
                print(f"live Arinova queryMemory OK: entries={len(memory_entries)}")
            skill_slug = str(args.fetch_skill_prompt or "").strip()
            if skill_slug:
                skill_prompt = await adapter.call_agent_sdk("fetchSkillPrompt", skill_slug)
                if (
                    not _sdk_skill_prompt(skill_prompt)
                ):
                    raise RuntimeError(f"SDK fetchSkillPrompt() returned malformed prompt: {skill_prompt!r}")
                print(f"live Arinova fetchSkillPrompt OK: slug={skill_slug}")
            if args.list_boards:
                boards = await adapter.call_agent_sdk("listBoards")
                if not isinstance(boards, list) or any(not _sdk_kanban_board(board) for board in boards):
                    raise RuntimeError(f"SDK listBoards() returned malformed boards result: {boards!r}")
                print(f"live Arinova listBoards OK: boards={len(boards)}")
            list_cards_json = str(args.list_cards_json or "").strip()
            if list_cards_json:
                try:
                    list_cards_options = _loads_probe_json(list_cards_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"SDK listCards() probe JSON argument could not be parsed: {exc}"
                    ) from exc
                if not isinstance(list_cards_options, dict):
                    raise RuntimeError("SDK listCards() probe options must be a JSON object")
                if not _sdk_list_cards_options(list_cards_options):
                    raise RuntimeError("SDK listCards() probe options must match SDK listCards options")
                cards = await adapter.call_agent_sdk("listCards", list_cards_options)
                if not isinstance(cards, list) or any(not _sdk_kanban_card(card) for card in cards):
                    raise RuntimeError(f"SDK listCards() returned malformed cards result: {cards!r}")
                print(f"live Arinova listCards OK: cards={len(cards)}")
            list_notes_conversation = str(args.list_notes_conversation or "").strip()
            list_notes_options_json = str(args.list_notes_options_json or "{}").strip()
            if not list_notes_conversation and list_notes_options_json != "{}":
                raise RuntimeError("SDK listNotes() probe requires conversation id when notes options JSON is provided")
            if list_notes_conversation:
                try:
                    list_notes_options = _loads_probe_json(list_notes_options_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"SDK listNotes() probe JSON argument could not be parsed: {exc}"
                    ) from exc
                if not isinstance(list_notes_options, dict):
                    raise RuntimeError("SDK listNotes() probe options must be a JSON object")
                if not _sdk_list_notes_options(list_notes_options):
                    raise RuntimeError("SDK listNotes() probe options must match ListNotesOptions")
                notes_result = await adapter.call_agent_sdk(
                    "listNotes",
                    list_notes_conversation,
                    list_notes_options,
                )
                if not _sdk_paginated_result(notes_result, "notes"):
                    raise RuntimeError(f"SDK listNotes() returned malformed notes result: {notes_result!r}")
                for note in notes_result["notes"]:
                    if not _sdk_note(note):
                        raise RuntimeError(f"SDK listNotes() returned malformed notes result: {notes_result!r}")
                print(
                    "live Arinova listNotes OK: "
                    f"conversation_id={list_notes_conversation} "
                    f"notes={len(notes_result.get('notes', []))} "
                    f"hasMore={notes_result.get('hasMore')}"
                )
            list_columns_board = str(args.list_columns_board or "").strip()
            if list_columns_board:
                columns = await adapter.call_agent_sdk("listColumns", list_columns_board)
                if not isinstance(columns, list) or any(not _sdk_kanban_column(column) for column in columns):
                    raise RuntimeError(f"SDK listColumns() returned malformed columns result: {columns!r}")
                print(f"live Arinova listColumns OK: board_id={list_columns_board} columns={len(columns)}")
            list_labels_board = str(args.list_labels_board or "").strip()
            if list_labels_board:
                labels = await adapter.call_agent_sdk("listLabels", list_labels_board)
                if not isinstance(labels, list) or any(not _sdk_kanban_label(label) for label in labels):
                    raise RuntimeError(f"SDK listLabels() returned malformed labels result: {labels!r}")
                print(f"live Arinova listLabels OK: board_id={list_labels_board} labels={len(labels)}")
            list_archived_cards_board = str(args.list_archived_cards_board or "").strip()
            list_archived_cards_options_json = str(args.list_archived_cards_options_json or "{}").strip()
            if not list_archived_cards_board and list_archived_cards_options_json != "{}":
                raise RuntimeError(
                    "SDK listArchivedCards() probe requires board id when archived cards options JSON is provided"
                )
            if list_archived_cards_board:
                try:
                    list_archived_cards_options = _loads_probe_json(list_archived_cards_options_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"SDK listArchivedCards() probe JSON argument could not be parsed: {exc}"
                    ) from exc
                if not isinstance(list_archived_cards_options, dict):
                    raise RuntimeError("SDK listArchivedCards() probe options must be a JSON object")
                if not _sdk_list_archived_cards_options(list_archived_cards_options):
                    raise RuntimeError(
                        "SDK listArchivedCards() probe options must match SDK listArchivedCards options"
                    )
                archived_cards = await adapter.call_agent_sdk(
                    "listArchivedCards",
                    list_archived_cards_board,
                    list_archived_cards_options,
                )
                if (
                    not isinstance(archived_cards, dict)
                    or not isinstance(archived_cards.get("cards"), list)
                    or not _sdk_number(archived_cards.get("total"))
                    or not _sdk_number(archived_cards.get("page"))
                    or not _sdk_number(archived_cards.get("limit"))
                    or any(not _sdk_kanban_card(card) for card in archived_cards.get("cards", []))
                ):
                    raise RuntimeError(
                        f"SDK listArchivedCards() returned malformed archived cards result: {archived_cards!r}"
                    )
                print(
                    "live Arinova listArchivedCards OK: "
                    f"board_id={list_archived_cards_board} cards={len(archived_cards.get('cards', []))}"
                )
            list_card_commits_card = str(args.list_card_commits_card or "").strip()
            if list_card_commits_card:
                commits = await adapter.call_agent_sdk("listCardCommits", list_card_commits_card)
                if not isinstance(commits, list):
                    raise RuntimeError(f"SDK listCardCommits() returned malformed commits result: {commits!r}")
                for commit in commits:
                    if not _sdk_card_commit(commit):
                        raise RuntimeError(f"SDK listCardCommits() returned malformed commits result: {commits!r}")
                print(f"live Arinova listCardCommits OK: card_id={list_card_commits_card} commits={len(commits)}")
            list_card_notes_card = str(args.list_card_notes_card or "").strip()
            if list_card_notes_card:
                notes = await adapter.call_agent_sdk("listCardNotes", list_card_notes_card)
                if not isinstance(notes, list):
                    raise RuntimeError(f"SDK listCardNotes() returned malformed card notes result: {notes!r}")
                for note in notes:
                    if not _sdk_card_note(note):
                        raise RuntimeError(f"SDK listCardNotes() returned malformed card notes result: {notes!r}")
                print(f"live Arinova listCardNotes OK: card_id={list_card_notes_card} notes={len(notes)}")
            create_note_conversation = str(args.create_note_conversation or "").strip()
            create_note_body_json = str(args.create_note_body_json or "").strip()
            if create_note_conversation or create_note_body_json:
                if not create_note_conversation or not create_note_body_json:
                    raise RuntimeError("SDK createNote() probe requires both conversation id and note body JSON")
                try:
                    create_note_body = _loads_probe_json(create_note_body_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"SDK createNote() probe JSON argument could not be parsed: {exc}"
                    ) from exc
                if not isinstance(create_note_body, dict):
                    raise RuntimeError("SDK createNote() probe body must be a JSON object")
                if not _sdk_create_note_body(create_note_body):
                    raise RuntimeError("SDK createNote() probe body must match CreateNoteBody")
                created_note = await adapter.call_agent_sdk(
                    "createNote",
                    create_note_conversation,
                    create_note_body,
                )
                if (
                    not _sdk_note(created_note)
                ):
                    raise RuntimeError(f"SDK createNote() returned malformed note result: {created_note!r}")
                print(
                    "live Arinova createNote OK: "
                    f"conversation_id={create_note_conversation} note_id={created_note.get('id')}"
                )
            update_note_conversation = str(args.update_note_conversation or "").strip()
            update_note_id = str(args.update_note_id or "").strip()
            update_note_body_json = str(args.update_note_body_json or "").strip()
            if update_note_conversation or update_note_id or update_note_body_json:
                if not update_note_conversation or not update_note_id or not update_note_body_json:
                    raise RuntimeError("SDK updateNote() probe requires conversation id, note id, and note body JSON")
                try:
                    update_note_body = _loads_probe_json(update_note_body_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"SDK updateNote() probe JSON argument could not be parsed: {exc}"
                    ) from exc
                if not isinstance(update_note_body, dict):
                    raise RuntimeError("SDK updateNote() probe body must be a JSON object")
                if not _sdk_update_note_body(update_note_body):
                    raise RuntimeError("SDK updateNote() probe body must match UpdateNoteBody")
                updated_note = await adapter.call_agent_sdk(
                    "updateNote",
                    update_note_conversation,
                    update_note_id,
                    update_note_body,
                )
                if (
                    not _sdk_note(updated_note)
                ):
                    raise RuntimeError(f"SDK updateNote() returned malformed note result: {updated_note!r}")
                _expect_sdk_field(updated_note, "id", update_note_id, "SDK updateNote() returned mismatched note id")
                _expect_sdk_field(
                    updated_note,
                    "conversationId",
                    update_note_conversation,
                    "SDK updateNote() returned mismatched conversation id",
                )
                print(
                    "live Arinova updateNote OK: "
                    f"conversation_id={update_note_conversation} note_id={updated_note.get('id')}"
                )
            delete_note_conversation = str(args.delete_note_conversation or "").strip()
            delete_note_id = str(args.delete_note_id or "").strip()
            if delete_note_conversation or delete_note_id:
                if not delete_note_conversation or not delete_note_id:
                    raise RuntimeError("SDK deleteNote() probe requires both conversation id and note id")
                await _expect_sdk_void(adapter, "deleteNote", delete_note_conversation, delete_note_id)
                print(
                    "live Arinova deleteNote OK: "
                    f"conversation_id={delete_note_conversation} note_id={delete_note_id}"
                )
            create_board_body_json = str(args.create_board_body_json or "").strip()
            if create_board_body_json:
                try:
                    create_board_body = _loads_probe_json(create_board_body_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"SDK createBoard() probe JSON argument could not be parsed: {exc}"
                    ) from exc
                if not isinstance(create_board_body, dict):
                    raise RuntimeError("SDK createBoard() probe body must be a JSON object")
                if not _sdk_create_board_body(create_board_body):
                    raise RuntimeError("SDK createBoard() probe body must match CreateBoardBody")
                created_board = await adapter.call_agent_sdk("createBoard", create_board_body)
                if (
                    not _sdk_kanban_board(created_board)
                ):
                    raise RuntimeError(f"SDK createBoard() returned malformed board result: {created_board!r}")
                print(f"live Arinova createBoard OK: board_id={created_board.get('id')}")
            update_board_id = str(args.update_board_id or "").strip()
            update_board_body_json = str(args.update_board_body_json or "").strip()
            if update_board_id or update_board_body_json:
                if not update_board_id or not update_board_body_json:
                    raise RuntimeError("SDK updateBoard() probe requires both board id and board body JSON")
                try:
                    update_board_body = _loads_probe_json(update_board_body_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"SDK updateBoard() probe JSON argument could not be parsed: {exc}"
                    ) from exc
                if not isinstance(update_board_body, dict):
                    raise RuntimeError("SDK updateBoard() probe body must be a JSON object")
                if not _sdk_update_board_body(update_board_body):
                    raise RuntimeError("SDK updateBoard() probe body must match UpdateBoardBody")
                updated_board = await adapter.call_agent_sdk("updateBoard", update_board_id, update_board_body)
                if (
                    not _sdk_kanban_board(updated_board)
                ):
                    raise RuntimeError(f"SDK updateBoard() returned malformed board result: {updated_board!r}")
                _expect_sdk_field(updated_board, "id", update_board_id, "SDK updateBoard() returned mismatched board id")
                print(f"live Arinova updateBoard OK: board_id={updated_board.get('id')}")
            archive_board_id = str(args.archive_board_id or "").strip()
            if archive_board_id:
                await _expect_sdk_void(adapter, "archiveBoard", archive_board_id)
                print(f"live Arinova archiveBoard OK: board_id={archive_board_id}")
            create_card_body_json = str(args.create_card_body_json or "").strip()
            if create_card_body_json:
                try:
                    create_card_body = _loads_probe_json(create_card_body_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"SDK createCard() probe JSON argument could not be parsed: {exc}"
                    ) from exc
                if not isinstance(create_card_body, dict):
                    raise RuntimeError("SDK createCard() probe body must be a JSON object")
                if not _sdk_create_card_body(create_card_body):
                    raise RuntimeError("SDK createCard() probe body must match CreateCardBody")
                created_card = await adapter.call_agent_sdk("createCard", create_card_body)
                if (
                    not _sdk_kanban_card(created_card)
                ):
                    raise RuntimeError(f"SDK createCard() returned malformed card result: {created_card!r}")
                print(f"live Arinova createCard OK: card_id={created_card.get('id')}")
            update_card_id = str(args.update_card_id or "").strip()
            update_card_body_json = str(args.update_card_body_json or "").strip()
            if update_card_id or update_card_body_json:
                if not update_card_id or not update_card_body_json:
                    raise RuntimeError("SDK updateCard() probe requires both card id and card body JSON")
                try:
                    update_card_body = _loads_probe_json(update_card_body_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"SDK updateCard() probe JSON argument could not be parsed: {exc}"
                    ) from exc
                if not isinstance(update_card_body, dict):
                    raise RuntimeError("SDK updateCard() probe body must be a JSON object")
                if not _sdk_update_card_body(update_card_body):
                    raise RuntimeError("SDK updateCard() probe body must match UpdateCardBody")
                updated_card = await adapter.call_agent_sdk("updateCard", update_card_id, update_card_body)
                if (
                    not _sdk_kanban_card(updated_card)
                ):
                    raise RuntimeError(f"SDK updateCard() returned malformed card result: {updated_card!r}")
                _expect_sdk_field(updated_card, "id", update_card_id, "SDK updateCard() returned mismatched card id")
                print(f"live Arinova updateCard OK: card_id={updated_card.get('id')}")
            complete_card_id = str(args.complete_card_id or "").strip()
            if complete_card_id:
                completed_card = await adapter.call_agent_sdk("completeCard", complete_card_id)
                if (
                    not _sdk_kanban_card(completed_card)
                ):
                    raise RuntimeError(f"SDK completeCard() returned malformed card result: {completed_card!r}")
                _expect_sdk_field(completed_card, "id", complete_card_id, "SDK completeCard() returned mismatched card id")
                print(f"live Arinova completeCard OK: card_id={completed_card.get('id')}")
            create_column_board = str(args.create_column_board or "").strip()
            create_column_body_json = str(args.create_column_body_json or "").strip()
            if create_column_board or create_column_body_json:
                if not create_column_board or not create_column_body_json:
                    raise RuntimeError("SDK createColumn() probe requires both board id and column body JSON")
                try:
                    create_column_body = _loads_probe_json(create_column_body_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"SDK createColumn() probe JSON argument could not be parsed: {exc}"
                    ) from exc
                if not isinstance(create_column_body, dict):
                    raise RuntimeError("SDK createColumn() probe body must be a JSON object")
                if not _sdk_create_column_body(create_column_body):
                    raise RuntimeError("SDK createColumn() probe body must match CreateColumnBody")
                created_column = await adapter.call_agent_sdk("createColumn", create_column_board, create_column_body)
                if (
                    not _sdk_kanban_column(created_column)
                ):
                    raise RuntimeError(f"SDK createColumn() returned malformed column result: {created_column!r}")
                _expect_sdk_field(
                    created_column,
                    "boardId",
                    create_column_board,
                    "SDK createColumn() returned mismatched board id",
                )
                print(f"live Arinova createColumn OK: column_id={created_column.get('id')}")
            update_column_id = str(args.update_column_id or "").strip()
            update_column_body_json = str(args.update_column_body_json or "").strip()
            if update_column_id or update_column_body_json:
                if not update_column_id or not update_column_body_json:
                    raise RuntimeError("SDK updateColumn() probe requires both column id and column body JSON")
                try:
                    update_column_body = _loads_probe_json(update_column_body_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"SDK updateColumn() probe JSON argument could not be parsed: {exc}"
                    ) from exc
                if not isinstance(update_column_body, dict):
                    raise RuntimeError("SDK updateColumn() probe body must be a JSON object")
                if not _sdk_update_column_body(update_column_body):
                    raise RuntimeError("SDK updateColumn() probe body must match UpdateColumnBody")
                updated_column = await adapter.call_agent_sdk("updateColumn", update_column_id, update_column_body)
                if (
                    not _sdk_kanban_column(updated_column)
                ):
                    raise RuntimeError(f"SDK updateColumn() returned malformed column result: {updated_column!r}")
                _expect_sdk_field(
                    updated_column,
                    "id",
                    update_column_id,
                    "SDK updateColumn() returned mismatched column id",
                )
                print(f"live Arinova updateColumn OK: column_id={updated_column.get('id')}")
            delete_column_id = str(args.delete_column_id or "").strip()
            if delete_column_id:
                await _expect_sdk_void(adapter, "deleteColumn", delete_column_id)
                print(f"live Arinova deleteColumn OK: column_id={delete_column_id}")
            reorder_columns_board = str(args.reorder_columns_board or "").strip()
            reorder_columns_json = str(args.reorder_columns_json or "").strip()
            if reorder_columns_board or reorder_columns_json:
                if not reorder_columns_board or not reorder_columns_json:
                    raise RuntimeError("SDK reorderColumns() probe requires both board id and column ids JSON")
                try:
                    reorder_column_ids = _loads_probe_json(reorder_columns_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"SDK reorderColumns() probe JSON argument could not be parsed: {exc}"
                    ) from exc
                if not isinstance(reorder_column_ids, list) or not all(
                    isinstance(column_id, str) for column_id in reorder_column_ids
                ):
                    raise RuntimeError("SDK reorderColumns() probe column ids must be a JSON string array")
                await _expect_sdk_void(adapter, "reorderColumns", reorder_columns_board, reorder_column_ids)
                print(f"live Arinova reorderColumns OK: board_id={reorder_columns_board}")
            add_card_commit_card = str(args.add_card_commit_card or "").strip()
            add_card_commit_body_json = str(args.add_card_commit_body_json or "").strip()
            if add_card_commit_card or add_card_commit_body_json:
                if not add_card_commit_card or not add_card_commit_body_json:
                    raise RuntimeError("SDK addCardCommit() probe requires both card id and commit body JSON")
                try:
                    add_card_commit_body = _loads_probe_json(add_card_commit_body_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"SDK addCardCommit() probe JSON argument could not be parsed: {exc}"
                    ) from exc
                if not isinstance(add_card_commit_body, dict):
                    raise RuntimeError("SDK addCardCommit() probe body must be a JSON object")
                if not _sdk_add_commit_body(add_card_commit_body):
                    raise RuntimeError("SDK addCardCommit() probe body must match AddCommitBody")
                card_commit = await adapter.call_agent_sdk(
                    "addCardCommit",
                    add_card_commit_card,
                    add_card_commit_body,
                )
                if (
                    not _sdk_card_commit(card_commit)
                ):
                    raise RuntimeError(f"SDK addCardCommit() returned malformed commit result: {card_commit!r}")
                _expect_sdk_field(
                    card_commit,
                    "cardId",
                    add_card_commit_card,
                    "SDK addCardCommit() returned mismatched card id",
                )
                print(f"live Arinova addCardCommit OK: card_id={card_commit.get('cardId')}")
            link_card_note_card = str(args.link_card_note_card or "").strip()
            link_card_note_note = str(args.link_card_note_note or "").strip()
            if link_card_note_card or link_card_note_note:
                if not link_card_note_card or not link_card_note_note:
                    raise RuntimeError("SDK linkCardNote() probe requires both card id and note id")
                await _expect_sdk_void(adapter, "linkCardNote", link_card_note_card, link_card_note_note)
                print(
                    "live Arinova linkCardNote OK: "
                    f"card_id={link_card_note_card} note_id={link_card_note_note}"
                )
            unlink_card_note_card = str(args.unlink_card_note_card or "").strip()
            unlink_card_note_note = str(args.unlink_card_note_note or "").strip()
            if unlink_card_note_card or unlink_card_note_note:
                if not unlink_card_note_card or not unlink_card_note_note:
                    raise RuntimeError("SDK unlinkCardNote() probe requires both card id and note id")
                await _expect_sdk_void(adapter, "unlinkCardNote", unlink_card_note_card, unlink_card_note_note)
                print(
                    "live Arinova unlinkCardNote OK: "
                    f"card_id={unlink_card_note_card} note_id={unlink_card_note_note}"
                )
            create_label_board = str(args.create_label_board or "").strip()
            create_label_body_json = str(args.create_label_body_json or "").strip()
            if create_label_board or create_label_body_json:
                if not create_label_board or not create_label_body_json:
                    raise RuntimeError("SDK createLabel() probe requires both board id and label body JSON")
                try:
                    create_label_body = _loads_probe_json(create_label_body_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(f"SDK createLabel() probe JSON argument could not be parsed: {exc}") from exc
                if not isinstance(create_label_body, dict):
                    raise RuntimeError("SDK createLabel() probe body must be a JSON object")
                if not _sdk_create_label_body(create_label_body):
                    raise RuntimeError("SDK createLabel() probe body must match CreateLabelBody")
                created_label = await adapter.call_agent_sdk("createLabel", create_label_board, create_label_body)
                if (
                    not _sdk_kanban_label(created_label)
                ):
                    raise RuntimeError(f"SDK createLabel() returned malformed label result: {created_label!r}")
                _expect_sdk_field(
                    created_label,
                    "boardId",
                    create_label_board,
                    "SDK createLabel() returned mismatched board id",
                )
                print(f"live Arinova createLabel OK: label_id={created_label.get('id')}")
            update_label_id = str(args.update_label_id or "").strip()
            update_label_body_json = str(args.update_label_body_json or "").strip()
            if update_label_id or update_label_body_json:
                if not update_label_id or not update_label_body_json:
                    raise RuntimeError("SDK updateLabel() probe requires both label id and label body JSON")
                try:
                    update_label_body = _loads_probe_json(update_label_body_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(f"SDK updateLabel() probe JSON argument could not be parsed: {exc}") from exc
                if not isinstance(update_label_body, dict):
                    raise RuntimeError("SDK updateLabel() probe body must be a JSON object")
                if not _sdk_update_label_body(update_label_body):
                    raise RuntimeError("SDK updateLabel() probe body must match UpdateLabelBody")
                updated_label = await adapter.call_agent_sdk("updateLabel", update_label_id, update_label_body)
                if (
                    not _sdk_kanban_label(updated_label)
                ):
                    raise RuntimeError(f"SDK updateLabel() returned malformed label result: {updated_label!r}")
                _expect_sdk_field(updated_label, "id", update_label_id, "SDK updateLabel() returned mismatched label id")
                print(f"live Arinova updateLabel OK: label_id={updated_label.get('id')}")
            delete_label_id = str(args.delete_label_id or "").strip()
            if delete_label_id:
                await _expect_sdk_void(adapter, "deleteLabel", delete_label_id)
                print(f"live Arinova deleteLabel OK: label_id={delete_label_id}")
            add_card_label_card = str(args.add_card_label_card or "").strip()
            add_card_label_label = str(args.add_card_label_label or "").strip()
            if add_card_label_card or add_card_label_label:
                if not add_card_label_card or not add_card_label_label:
                    raise RuntimeError("SDK addCardLabel() probe requires both card id and label id")
                await _expect_sdk_void(adapter, "addCardLabel", add_card_label_card, add_card_label_label)
                print(
                    "live Arinova addCardLabel OK: "
                    f"card_id={add_card_label_card} label_id={add_card_label_label}"
                )
            remove_card_label_card = str(args.remove_card_label_card or "").strip()
            remove_card_label_label = str(args.remove_card_label_label or "").strip()
            if remove_card_label_card or remove_card_label_label:
                if not remove_card_label_card or not remove_card_label_label:
                    raise RuntimeError("SDK removeCardLabel() probe requires both card id and label id")
                await _expect_sdk_void(adapter, "removeCardLabel", remove_card_label_card, remove_card_label_label)
                print(
                    "live Arinova removeCardLabel OK: "
                    f"card_id={remove_card_label_card} label_id={remove_card_label_label}"
                )
            send_conversation = str(args.send_message_conversation or "").strip()
            send_message_content = str(args.send_message_content)
            if not send_conversation and send_message_content != DEFAULT_SEND_MESSAGE_CONTENT:
                raise RuntimeError("SDK sendMessage() probe requires conversation id when message content is provided")
            if send_conversation:
                await _expect_sdk_void(adapter, "sendMessage", send_conversation, send_message_content)
                print(f"live Arinova sendMessage OK: conversation_id={send_conversation}")
            history_conversation = str(args.fetch_history_conversation or "").strip()
            fetch_history_options_json = str(args.fetch_history_options_json or "").strip()
            if not history_conversation:
                if args.fetch_history_limit != DEFAULT_FETCH_HISTORY_LIMIT:
                    raise RuntimeError("SDK fetchHistory() probe requires conversation id when history limit is provided")
                if fetch_history_options_json:
                    raise RuntimeError("SDK fetchHistory() probe requires conversation id when history options JSON is provided")
            if history_conversation:
                fetch_history_options = {"limit": args.fetch_history_limit}
                if fetch_history_options_json:
                    try:
                        fetch_history_options = _loads_probe_json(fetch_history_options_json)
                    except json.JSONDecodeError as exc:
                        raise RuntimeError(
                            f"SDK fetchHistory() probe options JSON argument could not be parsed: {exc}"
                        ) from exc
                    if not isinstance(fetch_history_options, dict):
                        raise RuntimeError("SDK fetchHistory() probe options must be a JSON object")
                if not _sdk_fetch_history_options(fetch_history_options):
                    raise RuntimeError("SDK fetchHistory() probe options must match FetchHistoryOptions")
                history = await adapter.call_agent_sdk(
                    "fetchHistory",
                    history_conversation,
                    fetch_history_options,
                )
                if (
                    not _sdk_paginated_result(history, "messages")
                    or any(not _sdk_history_message(message) for message in history.get("messages", []))
                ):
                    raise RuntimeError(f"SDK fetchHistory() returned malformed history: {history!r}")
                print(
                    "live Arinova fetchHistory OK: "
                    f"conversation_id={history_conversation} messages={len(history.get('messages', []))} "
                    f"hasMore={history.get('hasMore')}"
                )
            upload_conversation = str(args.upload_file_conversation or "").strip()
            upload_file_path_arg = str(args.upload_file_path or "").strip()
            upload_file_name_arg = str(args.upload_file_name or "").strip()
            upload_file_type_arg = str(args.upload_file_type or "").strip()
            if not upload_conversation:
                if upload_file_path_arg:
                    raise RuntimeError("SDK uploadFile() probe requires conversation id when upload file path is provided")
                if upload_file_name_arg:
                    raise RuntimeError("SDK uploadFile() probe requires conversation id when upload file name is provided")
                if upload_file_type_arg and upload_file_type_arg != DEFAULT_UPLOAD_FILE_TYPE:
                    raise RuntimeError("SDK uploadFile() probe requires conversation id when upload file type is provided")
            if upload_conversation:
                created_upload_path: Path | None = None
                try:
                    if upload_file_path_arg:
                        upload_path = Path(upload_file_path_arg).expanduser()
                        if not upload_path.is_file():
                            raise RuntimeError(f"SDK uploadFile() probe file path does not exist: {upload_path}")
                    else:
                        with tempfile.NamedTemporaryFile("wb", suffix=".txt", delete=False) as handle:
                            handle.write(b"Hermes Arinova live smoke upload\n")
                            created_upload_path = Path(handle.name)
                        upload_path = created_upload_path
                    upload_data = upload_path.read_bytes()
                    upload_name = upload_file_name_arg or upload_path.name
                    upload_type = upload_file_type_arg or "application/octet-stream"
                    upload = await adapter.call_agent_sdk(
                        "uploadFile",
                        upload_conversation,
                        upload_data,
                        upload_name,
                        upload_type,
                    )
                    if (
                        not _sdk_upload_result(upload)
                    ):
                        raise RuntimeError(f"SDK uploadFile() returned malformed upload result: {upload!r}")
                    if (
                        upload.get("fileName") != upload_name
                        or upload.get("fileType") != upload_type
                        or upload.get("fileSize") != len(upload_data)
                    ):
                        raise RuntimeError(
                            "SDK uploadFile() returned mismatched upload metadata: "
                            f"expected fileName={upload_name!r} fileType={upload_type!r} fileSize={len(upload_data)!r} "
                            f"got {upload!r}"
                        )
                    print(
                        "live Arinova uploadFile OK: "
                        f"conversation_id={upload_conversation} fileName={upload.get('fileName')} "
                        f"fileType={upload.get('fileType')} fileSize={upload.get('fileSize')}"
                    )
                finally:
                    if created_upload_path is not None:
                        created_upload_path.unlink(missing_ok=True)
            task_history_task = str(args.task_fetch_history_task or "").strip()
            task_fetch_history_options_json = str(args.task_fetch_history_options_json or "").strip()
            if not task_history_task:
                if args.task_fetch_history_limit != DEFAULT_FETCH_HISTORY_LIMIT:
                    raise RuntimeError(
                        "Task SDK fetchHistory() probe requires task id when history limit is provided"
                    )
                if task_fetch_history_options_json:
                    raise RuntimeError(
                        "Task SDK fetchHistory() probe requires task id when history options JSON is provided"
                    )
            if task_history_task:
                task_fetch_history_options = {"limit": args.task_fetch_history_limit}
                if task_fetch_history_options_json:
                    try:
                        task_fetch_history_options = _loads_probe_json(task_fetch_history_options_json)
                    except json.JSONDecodeError as exc:
                        raise RuntimeError(
                            f"Task SDK fetchHistory() probe options JSON argument could not be parsed: {exc}"
                        ) from exc
                    if not isinstance(task_fetch_history_options, dict):
                        raise RuntimeError("Task SDK fetchHistory() probe options must be a JSON object")
                if not _sdk_fetch_history_options(task_fetch_history_options):
                    raise RuntimeError("Task SDK fetchHistory() probe options must match FetchHistoryOptions")
                task_history = await adapter.call_task_sdk(
                    task_history_task,
                    "fetchHistory",
                    task_fetch_history_options,
                )
                if (
                    not _sdk_paginated_result(task_history, "messages")
                    or any(not _sdk_history_message(message) for message in task_history.get("messages", []))
                ):
                    raise RuntimeError(f"Task SDK fetchHistory() returned malformed history: {task_history!r}")
                print(
                    "live Arinova task fetchHistory OK: "
                    f"task_id={task_history_task} messages={len(task_history.get('messages', []))} "
                    f"hasMore={task_history.get('hasMore')}"
                )
            task_upload_task = str(args.task_upload_file_task or "").strip()
            task_upload_file_path_arg = str(args.task_upload_file_path or "").strip()
            task_upload_file_name_arg = str(args.task_upload_file_name or "").strip()
            task_upload_file_type_arg = str(args.task_upload_file_type or "").strip()
            if not task_upload_task:
                if task_upload_file_path_arg:
                    raise RuntimeError("Task SDK uploadFile() probe requires task id when upload file path is provided")
                if task_upload_file_name_arg:
                    raise RuntimeError("Task SDK uploadFile() probe requires task id when upload file name is provided")
                if task_upload_file_type_arg and task_upload_file_type_arg != DEFAULT_UPLOAD_FILE_TYPE:
                    raise RuntimeError("Task SDK uploadFile() probe requires task id when upload file type is provided")
            if task_upload_task:
                created_task_upload_path: Path | None = None
                try:
                    if task_upload_file_path_arg:
                        task_upload_path = Path(task_upload_file_path_arg).expanduser()
                        if not task_upload_path.is_file():
                            raise RuntimeError(
                                f"Task SDK uploadFile() probe file path does not exist: {task_upload_path}"
                            )
                    else:
                        with tempfile.NamedTemporaryFile("wb", suffix=".txt", delete=False) as handle:
                            handle.write(b"Hermes Arinova task live smoke upload\n")
                            created_task_upload_path = Path(handle.name)
                        task_upload_path = created_task_upload_path
                    task_upload_data = task_upload_path.read_bytes()
                    task_upload_name = task_upload_file_name_arg or task_upload_path.name
                    task_upload_type = task_upload_file_type_arg or "application/octet-stream"
                    task_upload = await adapter.call_task_sdk(
                        task_upload_task,
                        "uploadFile",
                        task_upload_data,
                        task_upload_name,
                        task_upload_type,
                    )
                    if not _sdk_upload_result(task_upload):
                        raise RuntimeError(f"Task SDK uploadFile() returned malformed upload result: {task_upload!r}")
                    if (
                        task_upload.get("fileName") != task_upload_name
                        or task_upload.get("fileType") != task_upload_type
                        or task_upload.get("fileSize") != len(task_upload_data)
                    ):
                        raise RuntimeError(
                            "Task SDK uploadFile() returned mismatched upload metadata: "
                            f"expected fileName={task_upload_name!r} fileType={task_upload_type!r} "
                            f"fileSize={len(task_upload_data)!r} got {task_upload!r}"
                        )
                    print(
                        "live Arinova task uploadFile OK: "
                        f"task_id={task_upload_task} fileName={task_upload.get('fileName')} "
                        f"fileType={task_upload.get('fileType')} fileSize={task_upload.get('fileSize')}"
                    )
                finally:
                    if created_task_upload_path is not None:
                        created_task_upload_path.unlink(missing_ok=True)
            call_action_name = str(args.call_action or "").strip()
            call_action_args_json = str(args.call_action_args_json or DEFAULT_CALL_ACTION_ARGS_JSON).strip()
            call_action_options_json = str(args.call_action_options_json or DEFAULT_CALL_ACTION_OPTIONS_JSON).strip()
            if not call_action_name:
                if call_action_args_json != DEFAULT_CALL_ACTION_ARGS_JSON:
                    raise RuntimeError("SDK callAction() probe requires action name when args JSON is provided")
                if call_action_options_json != DEFAULT_CALL_ACTION_OPTIONS_JSON:
                    raise RuntimeError("SDK callAction() probe requires action name when options JSON is provided")
            if call_action_name:
                try:
                    call_action_args = _loads_probe_json(call_action_args_json)
                    call_action_options = _loads_probe_json(call_action_options_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(f"SDK callAction() probe JSON argument could not be parsed: {exc}") from exc
                if not isinstance(call_action_args, dict):
                    raise RuntimeError("SDK callAction() probe args must be a JSON object")
                if not isinstance(call_action_options, dict):
                    raise RuntimeError("SDK callAction() probe options must be a JSON object")
                if not _sdk_action_call_options(call_action_options):
                    raise RuntimeError("SDK callAction() probe options must match ActionCallOptions")
                call_action_options = {
                    "callId": "hermes-arinova-live-smoke-action",
                    "timeoutMs": args.timeout_ms,
                    "dryRun": True,
                    **call_action_options,
                }
                action_result = await adapter.call_agent_sdk(
                    "callAction",
                    call_action_name,
                    call_action_args,
                    call_action_options,
                )
                if (
                    not _sdk_action_call_result(action_result, call_action_name)
                ):
                    raise RuntimeError(f"SDK callAction() returned malformed action result: {action_result!r}")
                if not _sdk_action_result_status_payload(action_result):
                    raise RuntimeError(f"SDK callAction() returned inconsistent action result: {action_result!r}")
                _expect_sdk_field(
                    action_result,
                    "callId",
                    str(call_action_options["callId"]),
                    "SDK callAction() returned mismatched call id",
                )
                _expect_sdk_optional_field(
                    action_result,
                    "dryRun",
                    call_action_options["dryRun"],
                    "SDK callAction() returned mismatched dryRun",
                )
                print(
                    "live Arinova callAction OK: "
                    f"action={call_action_name} status={action_result.get('status')}"
                )
            task_call_action_task = str(args.task_call_action_task or "").strip()
            task_call_action_name = str(args.task_call_action or "").strip()
            task_call_action_args_json = str(args.task_call_action_args_json or DEFAULT_CALL_ACTION_ARGS_JSON).strip()
            task_call_action_options_json = str(
                args.task_call_action_options_json or DEFAULT_CALL_ACTION_OPTIONS_JSON
            ).strip()
            if not task_call_action_task:
                if task_call_action_name:
                    raise RuntimeError("Task SDK callAction() probe requires task id when action name is provided")
                if task_call_action_args_json != DEFAULT_CALL_ACTION_ARGS_JSON:
                    raise RuntimeError("Task SDK callAction() probe requires task id when args JSON is provided")
                if task_call_action_options_json != DEFAULT_CALL_ACTION_OPTIONS_JSON:
                    raise RuntimeError("Task SDK callAction() probe requires task id when options JSON is provided")
            if task_call_action_task:
                if not task_call_action_name:
                    raise RuntimeError("Task SDK callAction() probe requires action name when task id is provided")
                try:
                    task_call_action_args = _loads_probe_json(task_call_action_args_json)
                    task_call_action_options = _loads_probe_json(task_call_action_options_json)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"Task SDK callAction() probe JSON argument could not be parsed: {exc}"
                    ) from exc
                if not isinstance(task_call_action_args, dict):
                    raise RuntimeError("Task SDK callAction() probe args must be a JSON object")
                if not isinstance(task_call_action_options, dict):
                    raise RuntimeError("Task SDK callAction() probe options must be a JSON object")
                if not _sdk_task_action_call_options(task_call_action_options):
                    raise RuntimeError(
                        "Task SDK callAction() probe options must match TaskContext ActionCallOptions"
                    )
                task_call_action_options = {
                    "callId": "hermes-arinova-live-smoke-task-action",
                    "timeoutMs": args.timeout_ms,
                    "dryRun": True,
                    **task_call_action_options,
                }
                task_action_result = await adapter.call_task_sdk(
                    task_call_action_task,
                    "callAction",
                    task_call_action_name,
                    task_call_action_args,
                    task_call_action_options,
                )
                if not _sdk_action_call_result(task_action_result, task_call_action_name):
                    raise RuntimeError(
                        f"Task SDK callAction() returned malformed action result: {task_action_result!r}"
                    )
                if not _sdk_action_result_status_payload(task_action_result):
                    raise RuntimeError(
                        f"Task SDK callAction() returned inconsistent action result: {task_action_result!r}"
                    )
                _expect_sdk_field(
                    task_action_result,
                    "callId",
                    str(task_call_action_options["callId"]),
                    "Task SDK callAction() returned mismatched call id",
                )
                _expect_sdk_optional_field(
                    task_action_result,
                    "dryRun",
                    task_call_action_options["dryRun"],
                    "Task SDK callAction() returned mismatched dryRun",
                )
                print(
                    "live Arinova task callAction OK: "
                    f"task_id={task_call_action_task} "
                    f"action={task_call_action_name} status={task_action_result.get('status')}"
                )
            print(f"live Arinova smoke OK: connected agent_id={agent_id} sdk={sdk_version}")
            return 0
        finally:
            if connected or adapter.is_connected:
                await adapter.disconnect()
    finally:
        for key, value in old_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
