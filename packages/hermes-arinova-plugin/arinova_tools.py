"""Hermes tools for the Arinova Chat SDK bridge."""

from __future__ import annotations

import base64
import json
import math
import os
import re
from pathlib import Path
from typing import Any, Callable, Iterable


TOOLSET = "hermes-arinova"
BASE64_PATTERN = re.compile(r"^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$")
DEFAULT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024

AGENT_METHODS: tuple[str, ...] = (
    "getAgentId",
    "getOnboardingSeed",
    "sendMessage",
    "sendTelemetry",
    "sendHud",
    "sendTaskUpdate",
    "reportToolCall",
    "callAction",
    "uploadFile",
    "fetchHistory",
    "listNotes",
    "createNote",
    "updateNote",
    "deleteNote",
    "listBoards",
    "createCard",
    "updateCard",
    "createBoard",
    "updateBoard",
    "archiveBoard",
    "listColumns",
    "createColumn",
    "updateColumn",
    "deleteColumn",
    "reorderColumns",
    "listCards",
    "completeCard",
    "listArchivedCards",
    "addCardCommit",
    "listCardCommits",
    "linkCardNote",
    "unlinkCardNote",
    "listCardNotes",
    "listLabels",
    "createLabel",
    "updateLabel",
    "deleteLabel",
    "addCardLabel",
    "removeCardLabel",
    "queryMemory",
    "fetchSkillPrompt",
    "shareNote",
)

# The bridge keeps the full SDK surface for trusted integration code, but model
# tools must not expose global callAction: its attribution identifiers are
# security-sensitive and must come from an active task context.
MODEL_AGENT_METHODS: tuple[str, ...] = tuple(
    method for method in AGENT_METHODS if method != "callAction"
)
TASK_METHODS: tuple[str, ...] = ("uploadFile", "fetchHistory", "callAction")
CONVERSATION_SCOPED_TASK_METHODS: frozenset[str] = frozenset(("uploadFile", "fetchHistory"))
VOID_AGENT_METHODS: frozenset[str] = frozenset(
    (
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
    )
)

METHOD_DESCRIPTIONS: dict[str, str] = {
    "sendMessage": "Send a proactive Arinova Chat message to a conversation.",
    "sendTelemetry": "Send an Arinova agent telemetry event.",
    "sendHud": "Update the Arinova office HUD.",
    "sendTaskUpdate": "Send an Arinova task lifecycle update.",
    "reportToolCall": "Report one completed Hermes tool call to Arinova.",
    "getAgentId": "Return the Arinova agent id assigned after auth.",
    "getOnboardingSeed": "Return the server-authored Arinova onboarding seed, if any.",
    "callAction": "Execute an Arinova backend action_call.",
    "uploadFile": "Upload a file to Arinova storage.",
    "listNotes": "List Arinova notes.",
    "createNote": "Create an Arinova note.",
    "updateNote": "Update an Arinova note.",
    "deleteNote": "Delete an Arinova note.",
    "listBoards": "List Arinova kanban boards.",
    "createCard": "Create an Arinova kanban card.",
    "updateCard": "Update an Arinova kanban card.",
    "createBoard": "Create an Arinova kanban board.",
    "updateBoard": "Update an Arinova kanban board.",
    "archiveBoard": "Archive an Arinova kanban board.",
    "listColumns": "List Arinova kanban columns.",
    "createColumn": "Create an Arinova kanban column.",
    "updateColumn": "Update an Arinova kanban column.",
    "deleteColumn": "Delete an Arinova kanban column.",
    "reorderColumns": "Reorder Arinova kanban columns.",
    "listCards": "List Arinova kanban cards.",
    "completeCard": "Complete an Arinova kanban card.",
    "listArchivedCards": "List archived Arinova kanban cards.",
    "addCardCommit": "Link a commit to an Arinova kanban card.",
    "listCardCommits": "List commits linked to an Arinova kanban card.",
    "linkCardNote": "Link an Arinova note to a kanban card.",
    "unlinkCardNote": "Unlink an Arinova note from a kanban card.",
    "listCardNotes": "List notes linked to an Arinova kanban card.",
    "listLabels": "List Arinova kanban labels.",
    "createLabel": "Create an Arinova kanban label.",
    "updateLabel": "Update an Arinova kanban label.",
    "deleteLabel": "Delete an Arinova kanban label.",
    "addCardLabel": "Add a label to an Arinova kanban card.",
    "removeCardLabel": "Remove a label from an Arinova kanban card.",
    "queryMemory": "Search Arinova agent memories.",
    "fetchSkillPrompt": "Fetch an installed Arinova skill prompt.",
    "shareNote": "Share an Arinova note into a conversation.",
}

STRING_ARRAY_SCHEMA = {"type": "array", "items": {"type": "string"}}
UPLOAD_FILE_SCHEMA = {
    "x-arinova-file": True,
    "type": "object",
    "description": "File bytes as {'base64':'...'} or an explicitly enabled workspace-relative local path.",
    "oneOf": [
        {
            "type": "object",
            "properties": {
                "base64": {"type": "string", "description": "Base64-encoded file bytes."},
            },
            "required": ["base64"],
            "additionalProperties": False,
        },
        {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Workspace-relative local file path (requires ARINOVA_ALLOW_LOCAL_UPLOADS and ARINOVA_UPLOAD_ROOT)."},
            },
            "required": ["path"],
            "additionalProperties": False,
        },
    ],
    "properties": {
        "base64": {"type": "string", "description": "Base64-encoded file bytes."},
        "path": {"type": "string", "description": "Workspace-relative local file path."},
    },
    "additionalProperties": False,
}
FETCH_HISTORY_OPTIONS_SCHEMA = {
    "type": "object",
    "properties": {
        "before": {"type": "string"},
        "after": {"type": "string"},
        "around": {"type": "string"},
        "limit": {"type": "number"},
    },
    "additionalProperties": False,
}
LIST_NOTES_OPTIONS_SCHEMA = {
    "type": "object",
    "properties": {
        "before": {"type": "string"},
        "limit": {"type": "number"},
        "offset": {"type": "number"},
        "tags": {"type": "array", "items": {"type": "string"}},
        "archived": {"type": "boolean"},
    },
    "additionalProperties": False,
}
CREATE_NOTE_BODY_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "content": {"type": "string"},
        "tags": {"type": "array", "items": {"type": "string"}},
        "notebookId": {"type": "string"},
    },
    "required": ["title"],
    "additionalProperties": False,
}
UPDATE_NOTE_BODY_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "content": {"type": "string"},
        "tags": {"type": "array", "items": {"type": "string"}},
    },
    "additionalProperties": False,
}
CREATE_CARD_BODY_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "description": {"type": "string"},
        "priority": {"type": "string"},
        "columnName": {"type": "string"},
        "columnId": {"type": "string"},
        "boardId": {"type": "string"},
    },
    "required": ["title"],
    "additionalProperties": False,
}
UPDATE_CARD_BODY_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "description": {"type": "string"},
        "priority": {"type": "string"},
        "columnId": {"type": "string"},
        "sortOrder": {"type": "number"},
    },
    "additionalProperties": False,
}
CREATE_BOARD_BODY_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "columns": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"name": {"type": "string"}},
                "required": ["name"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["name"],
    "additionalProperties": False,
}
UPDATE_BOARD_BODY_SCHEMA = {
    "type": "object",
    "properties": {"name": {"type": "string"}},
    "required": ["name"],
    "additionalProperties": False,
}
COLUMN_BODY_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "sortOrder": {"type": "number"},
    },
    "additionalProperties": False,
}
CREATE_COLUMN_BODY_SCHEMA = {
    **COLUMN_BODY_SCHEMA,
    "required": ["name"],
}
ADD_COMMIT_BODY_SCHEMA = {
    "type": "object",
    "properties": {
        "commitHash": {"type": "string"},
        "message": {"type": "string"},
    },
    "required": ["commitHash"],
    "additionalProperties": False,
}
LABEL_BODY_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "color": {"type": "string"},
    },
    "additionalProperties": False,
}
CREATE_LABEL_BODY_SCHEMA = {
    **LABEL_BODY_SCHEMA,
    "required": ["name"],
}
LIST_CARDS_OPTIONS_SCHEMA = {
    "type": "object",
    "properties": {
        "search": {"type": "string"},
        "limit": {"type": "number"},
        "offset": {"type": "number"},
    },
    "additionalProperties": False,
}
LIST_ARCHIVED_CARDS_OPTIONS_SCHEMA = {
    "type": "object",
    "properties": {
        "page": {"type": "number"},
        "limit": {"type": "number"},
    },
    "additionalProperties": False,
}
QUERY_MEMORY_OPTIONS_SCHEMA = {
    "type": "object",
    "properties": {
        "query": {"type": "string"},
        "limit": {"type": "number"},
    },
    "required": ["query"],
    "additionalProperties": False,
}
TASK_UPDATE_DATA_SCHEMA = {
    "oneOf": [
        {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["started"]},
                "task": {"type": "string"},
            },
            "required": ["status", "task"],
            "additionalProperties": False,
        },
        {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["completed"]},
                "durationMs": {"type": "number"},
                "costUsd": {"type": "number"},
                "numTurns": {"type": "number"},
            },
            "required": ["status"],
            "additionalProperties": False,
        },
    ]
}
ACTION_OPTIONS_SCHEMA = {
    "type": "object",
    "properties": {
        "callId": {"type": "string"},
        "taskId": {"type": "string"},
        "conversationId": {"type": "string"},
        "messageId": {"type": "string"},
        "parentCallId": {"type": "string"},
        "reason": {"type": "string"},
        "metadata": {"type": "object"},
        "dryRun": {"type": "boolean"},
        "timeoutMs": {"type": "number"},
    },
    "additionalProperties": False,
}
TOOL_CALL_REPORT_SCHEMA = {
    "type": "object",
    "properties": {
        "sessionId": {"type": "string"},
        "turnId": {"type": "string"},
        "seqOrder": {"type": "number"},
        "toolName": {"type": "string"},
        "input": {"type": "object"},
        "output": {},
        "durationMs": {"type": "number"},
        "success": {"type": "boolean"},
        "error": {"type": "string"},
        "messageId": {"type": "string"},
    },
    "required": ["sessionId", "turnId", "seqOrder", "toolName", "input", "success"],
    "additionalProperties": False,
}
TASK_ACTION_OPTIONS_SCHEMA = {
    "type": "object",
    "properties": {
        "callId": {"type": "string"},
        "parentCallId": {"type": "string"},
        "reason": {"type": "string"},
        "metadata": {"type": "object"},
        "dryRun": {"type": "boolean"},
        "timeoutMs": {"type": "number"},
    },
    "additionalProperties": False,
}

ARG_SPECS: dict[str, tuple[tuple[str, dict[str, Any]], ...]] = {
    "sendMessage": (
        ("conversation_id", {"type": "string", "description": "Arinova conversation id."}),
        ("content", {"type": "string", "description": "Message content."}),
    ),
    "sendTelemetry": (
        ("event", {"type": "string", "description": "Telemetry event name."}),
        ("data", {"type": "object", "description": "Telemetry payload."}),
    ),
    "sendHud": (
        ("data", {"type": "object", "description": "HUD payload."}),
        ("conversation_id", {"type": "string", "description": "Optional conversation id."}),
    ),
    "sendTaskUpdate": (
        ("agent_name", {"type": "string", "description": "Agent display name."}),
        ("data", {**TASK_UPDATE_DATA_SCHEMA, "description": "Task update payload."}),
    ),
    "reportToolCall": (("report", {**TOOL_CALL_REPORT_SCHEMA, "description": "Tool call report payload."}),),
    "callAction": (
        ("action", {"type": "string", "description": "Action name."}),
        ("action_args", {"type": "object", "description": "Action arguments."}),
        ("options", {**ACTION_OPTIONS_SCHEMA, "description": "Optional action call options."}),
    ),
    "uploadFile": (
        ("conversation_id", {"type": "string", "description": "Arinova conversation id."}),
        ("file", UPLOAD_FILE_SCHEMA),
        ("file_name", {"type": "string", "description": "Original file name."}),
        ("file_type", {"type": "string", "description": "Optional MIME type."}),
    ),
    "fetchHistory": (
        ("conversation_id", {"type": "string"}),
        ("options", {**FETCH_HISTORY_OPTIONS_SCHEMA, "description": "Optional history pagination options."}),
    ),
    "listNotes": (
        ("options", {**LIST_NOTES_OPTIONS_SCHEMA, "description": "Optional notes pagination/filter options."}),
    ),
    "createNote": (
        ("body", {**CREATE_NOTE_BODY_SCHEMA, "description": "Note title/content/tags payload."}),
    ),
    "updateNote": (
        ("note_id", {"type": "string"}),
        ("body", {**UPDATE_NOTE_BODY_SCHEMA, "description": "Note fields to update."}),
    ),
    "deleteNote": (("note_id", {"type": "string"}),),
    "createCard": (("body", {**CREATE_CARD_BODY_SCHEMA, "description": "Card creation payload."}),),
    "updateCard": (("card_id", {"type": "string"}), ("body", UPDATE_CARD_BODY_SCHEMA)),
    "createBoard": (("body", {**CREATE_BOARD_BODY_SCHEMA, "description": "Board creation payload."}),),
    "updateBoard": (("board_id", {"type": "string"}), ("body", UPDATE_BOARD_BODY_SCHEMA)),
    "archiveBoard": (("board_id", {"type": "string"}),),
    "listColumns": (("board_id", {"type": "string"}),),
    "createColumn": (("board_id", {"type": "string"}), ("body", CREATE_COLUMN_BODY_SCHEMA)),
    "updateColumn": (("column_id", {"type": "string"}), ("body", COLUMN_BODY_SCHEMA)),
    "deleteColumn": (("column_id", {"type": "string"}),),
    "reorderColumns": (
        ("board_id", {"type": "string"}),
        ("column_ids", STRING_ARRAY_SCHEMA),
    ),
    "listCards": (("options", {**LIST_CARDS_OPTIONS_SCHEMA, "description": "Optional search/limit/offset options."}),),
    "completeCard": (("card_id", {"type": "string"}),),
    "listArchivedCards": (("board_id", {"type": "string"}), ("options", LIST_ARCHIVED_CARDS_OPTIONS_SCHEMA)),
    "addCardCommit": (("card_id", {"type": "string"}), ("body", ADD_COMMIT_BODY_SCHEMA)),
    "listCardCommits": (("card_id", {"type": "string"}),),
    "linkCardNote": (("card_id", {"type": "string"}), ("note_id", {"type": "string"})),
    "unlinkCardNote": (("card_id", {"type": "string"}), ("note_id", {"type": "string"})),
    "listCardNotes": (("card_id", {"type": "string"}),),
    "listLabels": (("board_id", {"type": "string"}),),
    "createLabel": (("board_id", {"type": "string"}), ("body", CREATE_LABEL_BODY_SCHEMA)),
    "updateLabel": (("label_id", {"type": "string"}), ("body", LABEL_BODY_SCHEMA)),
    "deleteLabel": (("label_id", {"type": "string"}),),
    "addCardLabel": (("card_id", {"type": "string"}), ("label_id", {"type": "string"})),
    "removeCardLabel": (("card_id", {"type": "string"}), ("label_id", {"type": "string"})),
    "queryMemory": (("options", {**QUERY_MEMORY_OPTIONS_SCHEMA, "description": "Memory query options."}),),
    "fetchSkillPrompt": (("skill_slug", {"type": "string"}),),
    "shareNote": (("conversation_id", {"type": "string"}), ("note_id", {"type": "string"})),
}

TASK_ARG_SPECS: dict[str, tuple[tuple[str, dict[str, Any]], ...]] = {
    "uploadFile": (
        ("file", UPLOAD_FILE_SCHEMA),
        ("file_name", {"type": "string"}),
        ("file_type", {"type": "string"}),
    ),
    "fetchHistory": (("options", {**FETCH_HISTORY_OPTIONS_SCHEMA, "description": "Optional history pagination options."}),),
    "callAction": (
        ("action", {"type": "string"}),
        ("action_args", {"type": "object"}),
        ("options", {**TASK_ACTION_OPTIONS_SCHEMA, "description": "Optional action call options."}),
    ),
}

TRIMMED_STRING_ARGUMENTS = {
    "action",
    "board_id",
    "card_id",
    "column_id",
    "conversation_id",
    "label_id",
    "note_id",
    "skill_slug",
}

TRIMMED_STRING_FIELDS = {
    "callId",
    "conversationId",
    "messageId",
    "parentCallId",
    "taskId",
}

TRIMMED_STRING_FIELDS_BY_ARGUMENT = {
    "body": {
        "boardId",
        "columnId",
        "notebookId",
    },
    "options": TRIMMED_STRING_FIELDS
    | {
        "after",
        "around",
        "before",
    },
    "report": {
        "sessionId",
        "turnId",
        "messageId",
    },
}

TRIMMED_STRING_ARRAY_ARGUMENTS = {
    "column_ids",
}

REQUIRED_ARG_COUNTS: dict[str, int] = {
    "sendMessage": 2,
    "sendTelemetry": 2,
    "sendHud": 1,
    "sendTaskUpdate": 2,
    "reportToolCall": 1,
    "callAction": 2,
    "uploadFile": 3,
    "fetchHistory": 1,
    "listNotes": 0,
    "createNote": 1,
    "updateNote": 2,
    "deleteNote": 1,
    "createCard": 1,
    "updateCard": 2,
    "createBoard": 1,
    "updateBoard": 2,
    "archiveBoard": 1,
    "listColumns": 1,
    "createColumn": 2,
    "updateColumn": 2,
    "deleteColumn": 1,
    "reorderColumns": 2,
    "completeCard": 1,
    "listArchivedCards": 1,
    "addCardCommit": 2,
    "listCardCommits": 1,
    "linkCardNote": 2,
    "unlinkCardNote": 2,
    "listCardNotes": 1,
    "listLabels": 1,
    "createLabel": 2,
    "updateLabel": 2,
    "deleteLabel": 1,
    "addCardLabel": 2,
    "removeCardLabel": 2,
    "queryMemory": 1,
    "fetchSkillPrompt": 1,
    "shareNote": 2,
}
TASK_REQUIRED_ARG_COUNTS: dict[str, int] = {
    "uploadFile": 2,
    "callAction": 2,
}


def _load_sdk_contract() -> None:
    global AGENT_METHODS, MODEL_AGENT_METHODS, TASK_METHODS
    global ARG_SPECS, TASK_ARG_SPECS, REQUIRED_ARG_COUNTS, TASK_REQUIRED_ARG_COUNTS
    contract = json.loads(Path(__file__).with_name("sdk-contract.json").read_text(encoding="utf-8"))

    def scope(name: str):
        definitions = contract[name]
        methods = tuple(definitions)
        specs = {
            method: tuple((argument["name"], argument["schema"]) for argument in definition["args"])
            for method, definition in definitions.items()
        }
        required = {method: definition["required"] for method, definition in definitions.items()}
        return methods, specs, required

    AGENT_METHODS, ARG_SPECS, REQUIRED_ARG_COUNTS = scope("agent")
    TASK_METHODS, TASK_ARG_SPECS, TASK_REQUIRED_ARG_COUNTS = scope("task")
    MODEL_AGENT_METHODS = tuple(method for method in AGENT_METHODS if method != "callAction")


_load_sdk_contract()


def _snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def _camel(name: str) -> str:
    parts = name.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


def _aliases_for(name: str) -> tuple[str, ...]:
    if name == "action_args":
        return ("actionArgs",)
    camel = _camel(name)
    return (camel,) if camel != name else ()


def _payload_has(payload: dict[str, Any], name: str) -> bool:
    return name in payload or any(alias in payload for alias in _aliases_for(name))


def _require_payload_object(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("tool payload must be a JSON object")
    return payload


def _provided_payload_keys(payload: dict[str, Any], name: str) -> list[str]:
    return [key for key in (name, *_aliases_for(name)) if key in payload]


def _payload_value(payload: dict[str, Any], name: str) -> Any:
    keys = _provided_payload_keys(payload, name)
    if len(keys) > 1:
        raise ValueError(f"{name} was provided more than once: {', '.join(keys)}")
    if keys:
        return payload[keys[0]]
    return None


def _required_string(payload: dict[str, Any], name: str) -> str:
    value = _payload_value(payload, name)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{_aliases_for(name)[0] if _aliases_for(name) and name not in payload else name} must be a non-empty string")
    return value.strip()


def _optional_string(payload: dict[str, Any], name: str) -> str | None:
    if not _payload_has(payload, name):
        return None
    value = _payload_value(payload, name)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{_aliases_for(name)[0] if _aliases_for(name) and name not in payload else name} must be a non-empty string")
    return value.strip()


def _validate_json_compliant(name: str, value: Any, seen: set[int] | None = None) -> None:
    if value is None or isinstance(value, str) or isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        if not math.isfinite(value):
            raise ValueError(f"{name} contains a non-finite number")
        return
    if seen is None:
        seen = set()
    if isinstance(value, list):
        value_id = id(value)
        if value_id in seen:
            raise ValueError(f"{name} contains a circular reference")
        seen.add(value_id)
        for index, item in enumerate(value):
            _validate_json_compliant(f"{name}[{index}]", item, seen)
        seen.remove(value_id)
        return
    if isinstance(value, dict):
        value_id = id(value)
        if value_id in seen:
            raise ValueError(f"{name} contains a circular reference")
        seen.add(value_id)
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValueError(f"{name} contains a non-string object key")
            _validate_json_compliant(f"{name}.{key}", item, seen)
        seen.remove(value_id)
        return
    raise ValueError(f"{name} contains a non-JSON value")


def _validate_named_value(name: str, schema: dict[str, Any], value: Any) -> Any:
    if not schema:
        _validate_json_compliant(name, value)
        return value
    if schema.get("x-arinova-file") is True:
        if not isinstance(value, dict):
            raise ValueError(f"{name} must be an object")
        return value
    one_of = schema.get("oneOf")
    if isinstance(one_of, list) and one_of:
        if isinstance(value, dict) and "status" in value:
            allowed_statuses: list[str] = []
            for branch in one_of:
                if not isinstance(branch, dict):
                    continue
                status_schema = branch.get("properties", {}).get("status") if isinstance(branch.get("properties"), dict) else None
                enum_values = status_schema.get("enum") if isinstance(status_schema, dict) else None
                if not isinstance(enum_values, list):
                    continue
                allowed_statuses.extend(str(item) for item in enum_values)
                if value.get("status") in enum_values:
                    _validate_named_value(name, branch, value)
                    return value
            if allowed_statuses:
                raise ValueError(f"{name}.status must be one of: {', '.join(allowed_statuses)}")
        first_error: ValueError | None = None
        for branch in one_of:
            if not isinstance(branch, dict):
                continue
            try:
                _validate_named_value(name, branch, value)
                return value
            except ValueError as exc:
                if first_error is None:
                    first_error = exc
        if first_error is not None:
            raise first_error
        raise ValueError(f"{name} did not match any allowed schema")
    schema_type = schema.get("type")
    if schema_type == "object" and not isinstance(value, dict):
        raise ValueError(f"{name} must be an object")
    if schema_type == "object" and isinstance(value, dict):
        if schema.get("x-arinova-file") is True:
            return value
        properties = schema.get("properties")
        if isinstance(properties, dict):
            unknown = sorted(set(value) - set(properties))
            if schema.get("additionalProperties") is False and unknown:
                raise ValueError(f"{name} has unsupported field(s): {', '.join(unknown)}")
            for required in schema.get("required", []):
                if required not in value:
                    raise ValueError(f"{name}.{required} is required")
            for key, item in value.items():
                if key in properties and isinstance(properties[key], dict):
                    _validate_named_value(f"{name}.{key}", properties[key], item)
        _validate_json_compliant(name, value)
    if schema_type == "array" and not isinstance(value, list):
        raise ValueError(f"{name} must be an array")
    if schema_type == "array" and isinstance(value, list):
        item_schema = schema.get("items") if isinstance(schema.get("items"), dict) else {}
        item_type = item_schema.get("type")
        if item_type == "string" and any(not isinstance(item, str) for item in value):
            raise ValueError(f"{name} items must be strings")
        if item_type == "object":
            for index, item in enumerate(value):
                _validate_named_value(f"{name}[{index}]", item_schema, item)
        _validate_json_compliant(name, value)
    if schema_type == "string" and not isinstance(value, str):
        raise ValueError(f"{name} must be a string")
    if schema_type == "number" and (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
    ):
        raise ValueError(f"{name} must be a number")
    if schema_type == "boolean" and not isinstance(value, bool):
        raise ValueError(f"{name} must be a boolean")
    enum_values = schema.get("enum")
    if isinstance(enum_values, list) and value not in enum_values:
        allowed = ", ".join(str(item) for item in enum_values)
        raise ValueError(f"{name} must be one of: {allowed}")
    return value


def _normalize_named_argument(name: str, value: Any) -> Any:
    if name in TRIMMED_STRING_ARGUMENTS and isinstance(value, str):
        return value.strip()
    if name in TRIMMED_STRING_ARRAY_ARGUMENTS and isinstance(value, list):
        return [item.strip() if isinstance(item, str) else item for item in value]
    if isinstance(value, dict):
        trimmed_fields = TRIMMED_STRING_FIELDS_BY_ARGUMENT.get(name, set())
        return {
            key: item.strip() if key in trimmed_fields and isinstance(item, str) else item
            for key, item in value.items()
        }
    return value


def _allowed_payload_keys(specs: tuple[tuple[str, dict[str, Any]], ...], *, task_scoped: bool, generic: bool) -> set[str]:
    keys = {"args"}
    if generic:
        keys.add("method")
    if task_scoped:
        keys.update({"task_id", "taskId"})
    for name, _schema in specs:
        keys.add(name)
        keys.update(_aliases_for(name))
    return keys


def _reject_unknown_payload_keys(
    payload: dict[str, Any],
    specs: tuple[tuple[str, dict[str, Any]], ...],
    *,
    task_scoped: bool,
    generic: bool,
) -> None:
    unknown = sorted(set(payload) - _allowed_payload_keys(specs, task_scoped=task_scoped, generic=generic))
    if unknown:
        raise ValueError(f"unsupported argument(s): {', '.join(unknown)}")


def _active_adapter():
    try:
        from .adapter import get_active_adapter
    except ImportError:
        from adapter import get_active_adapter
    return get_active_adapter()


def _adapter_available(adapter: Any) -> bool:
    if adapter is None:
        return False
    is_running = getattr(adapter, "is_running", None)
    if callable(is_running):
        if not bool(is_running()):
            return False
    is_connected = getattr(adapter, "is_connected", None)
    if callable(is_connected):
        if not bool(is_connected()):
            return False
    elif is_connected is not None:
        if not bool(is_connected):
            return False
    return True


def check_arinova_available() -> bool:
    adapter = _active_adapter()
    return _adapter_available(adapter)


def _json_result(payload: Any) -> str:
    try:
        return json.dumps(payload, ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError) as exc:
        fallback: dict[str, Any] = {
            "success": False,
            "error": f"Arinova tool result is not JSON-compliant: {exc}",
        }
        if isinstance(payload, dict):
            for key in ("method", "task_id"):
                if key in payload:
                    fallback[key] = payload[key]
        return json.dumps(fallback, ensure_ascii=False, allow_nan=False)


def _file_arg(value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    if "path" in value and "base64" in value:
        raise ValueError("upload file must provide only one of path or base64")
    if "path" not in value and "base64" not in value:
        raise ValueError("upload file must be {'base64':'...'} or {'path':'...'}")
    unknown = sorted(set(value) - {"path", "base64"})
    if unknown:
        raise ValueError(f"upload file has unsupported field(s): {', '.join(unknown)}")
    if "path" in value:
        if not isinstance(value.get("path"), str) or not str(value.get("path")).strip():
            raise ValueError("upload file path must be a non-empty string")
        if os.getenv("ARINOVA_ALLOW_LOCAL_UPLOADS", "").strip().lower() not in {"1", "true", "yes", "on"}:
            raise PermissionError("local path uploads are disabled")
        root_value = os.getenv("ARINOVA_UPLOAD_ROOT", "").strip()
        if not root_value:
            raise PermissionError("ARINOVA_UPLOAD_ROOT is required for local path uploads")
        raw_path = Path(str(value["path"]))
        if raw_path.is_absolute():
            raise ValueError("upload file path must be relative to ARINOVA_UPLOAD_ROOT")
        root = Path(root_value).expanduser().resolve(strict=True)
        path = (root / raw_path).resolve(strict=True)
        try:
            path.relative_to(root)
        except ValueError as exc:
            raise ValueError("upload file path escapes ARINOVA_UPLOAD_ROOT") from exc
        if not path.is_file():
            raise IsADirectoryError(f"upload file path is not a file: {path}")
        data = path.read_bytes()
        max_bytes = _upload_max_bytes()
        if len(data) > max_bytes:
            raise ValueError(f"upload file exceeds {max_bytes} bytes")
        return data
    raw = value.get("base64")
    if not isinstance(raw, str):
        raise ValueError("upload file base64 data must be a string")
    if not BASE64_PATTERN.fullmatch(raw):
        raise ValueError("upload file base64 data is invalid")
    data = base64.b64decode(raw, validate=True)
    max_bytes = _upload_max_bytes()
    if len(data) > max_bytes:
        raise ValueError(f"upload file exceeds {max_bytes} bytes")
    return data


def _upload_max_bytes() -> int:
    raw = os.getenv("ARINOVA_UPLOAD_MAX_BYTES", "").strip()
    if not raw:
        return DEFAULT_UPLOAD_MAX_BYTES
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_UPLOAD_MAX_BYTES
    return value if value > 0 else DEFAULT_UPLOAD_MAX_BYTES


def _prepare_args(method: str, args: list[Any], *, task_scoped: bool) -> list[Any]:
    prepared = list(args)
    if method == "uploadFile":
        file_index = 0 if task_scoped else 1
        if len(prepared) > file_index:
            data = _file_arg(prepared[file_index])
            if isinstance(data, bytes):
                prepared[file_index] = {"base64": base64.b64encode(data).decode("ascii")}
            else:
                prepared[file_index] = data
    return prepared


def _validate_positional_args(method: str, args: list[Any], *, task_scoped: bool) -> list[Any]:
    known_methods = TASK_METHODS if task_scoped else AGENT_METHODS
    if method not in known_methods:
        return args
    specs = TASK_ARG_SPECS if task_scoped else ARG_SPECS
    method_specs = specs.get(method, ())
    required_counts = TASK_REQUIRED_ARG_COUNTS if task_scoped else REQUIRED_ARG_COUNTS
    required_count = required_counts.get(method, 0)
    max_count = len(method_specs)
    if len(args) < required_count:
        raise ValueError(f"args for {method} requires at least {required_count} item(s)")
    if len(args) > max_count:
        raise ValueError(f"args for {method} accepts at most {max_count} item(s)")
    prepared = []
    for index, value in enumerate(args):
        name, schema = method_specs[index]
        prepared.append(_normalize_named_argument(name, _validate_named_value(f"args[{index}]", schema, value)))
    return prepared


def _method_args_from_payload(method: str, payload: dict[str, Any], *, task_scoped: bool) -> list[Any]:
    specs = TASK_ARG_SPECS if task_scoped else ARG_SPECS
    has_args = "args" in payload
    if "args" in payload:
        if not isinstance(payload["args"], list):
            raise ValueError("args must be an array when provided")
        positional = list(payload["args"])
    else:
        positional = []
    method_specs = specs.get(method, ())
    named_keys = [
        key
        for name, _schema in method_specs
        for key in _provided_payload_keys(payload, name)
    ]
    if has_args:
        if named_keys:
            raise ValueError(f"args cannot be combined with named arguments: {', '.join(named_keys)}")
        return _validate_positional_args(method, positional, task_scoped=task_scoped)
    if not any(_payload_has(payload, name) for name, _schema in method_specs):
        return _validate_positional_args(method, positional, task_scoped=task_scoped)
    prepared = []
    last_index = -1
    for index, (name, _schema) in enumerate(method_specs):
        if _payload_has(payload, name):
            last_index = index
    required_counts = TASK_REQUIRED_ARG_COUNTS if task_scoped else REQUIRED_ARG_COUNTS
    required_last_index = required_counts.get(method, 0) - 1
    target_index = max(last_index, required_last_index)
    for index, (name, _schema) in enumerate(method_specs):
        if index > target_index:
            break
        if _payload_has(payload, name):
            prepared.append(_normalize_named_argument(name, _validate_named_value(name, _schema, _payload_value(payload, name))))
            continue
        raise ValueError(f"{name} is required when using later named arguments")
    return prepared


async def call_agent_method(method: str, args: list[Any]) -> dict[str, Any]:
    if method not in AGENT_METHODS:
        return {"success": False, "error": f"Unsupported Arinova SDK method: {method}"}
    adapter = _active_adapter()
    if not _adapter_available(adapter):
        return {"success": False, "error": "Arinova adapter is not connected"}
    try:
        validated_args = _validate_positional_args(method, args, task_scoped=False)
        result = await adapter.call_agent_sdk(method, *_prepare_args(method, validated_args, task_scoped=False))
        if method in VOID_AGENT_METHODS and result is not None:
            raise RuntimeError(f"Arinova SDK method {method} returned non-null void result: {result!r}")
    except Exception as exc:
        return {"success": False, "method": method, "error": str(exc)}
    return {"success": True, "method": method, "result": result}


def _task_conversation_scoped_error(adapter: Any, task_id: str, method: str) -> str | None:
    if method not in CONVERSATION_SCOPED_TASK_METHODS:
        return None
    conversation_id_fn = getattr(adapter, "_task_conversation_id", None)
    if not callable(conversation_id_fn):
        return None
    if conversation_id_fn(task_id):
        return None
    error_fn = getattr(adapter, "_no_conversation_task_error", None)
    if callable(error_fn):
        return str(error_fn(task_id, method))
    return f"{method} is unavailable: this task is not bound to a conversation"


def _adapter_active_task_id(adapter: Any) -> str:
    active_task_id_fn = getattr(adapter, "active_task_id", None)
    if not callable(active_task_id_fn):
        return ""
    task_id = active_task_id_fn()
    if not isinstance(task_id, str):
        return ""
    return task_id.strip()


def _normalize_task_id(task_id: str | None) -> str:
    if task_id is None:
        return ""
    return task_id.strip()


async def call_task_method(task_id: str | None, method: str, args: list[Any]) -> dict[str, Any]:
    if method not in TASK_METHODS:
        return {"success": False, "error": f"Unsupported Arinova task SDK method: {method}"}
    adapter = _active_adapter()
    if not _adapter_available(adapter):
        return {"success": False, "error": "Arinova adapter is not connected"}
    resolved_task_id = _normalize_task_id(task_id) or _adapter_active_task_id(adapter)
    if not resolved_task_id:
        return {
            "success": False,
            "error": "No active Arinova task; provide task_id or call this while handling one task.",
        }
    conversation_scoped_error = _task_conversation_scoped_error(adapter, resolved_task_id, method)
    if conversation_scoped_error:
        return {
            "success": False,
            "task_id": resolved_task_id,
            "method": method,
            "error": conversation_scoped_error,
        }
    try:
        validated_args = _validate_positional_args(method, args, task_scoped=True)
        result = await adapter.call_task_sdk(
            resolved_task_id,
            method,
            *_prepare_args(method, validated_args, task_scoped=True),
        )
    except Exception as exc:
        return {"success": False, "task_id": resolved_task_id, "method": method, "error": str(exc)}
    return {"success": True, "task_id": resolved_task_id, "method": method, "result": result}


async def _handle_sdk_call(args: dict[str, Any], **_: Any) -> str:
    method = ""
    try:
        args = _require_payload_object(args)
        method = _required_string(args, "method")
        if method not in MODEL_AGENT_METHODS:
            return _json_result({"success": False, "error": f"Unsupported Arinova SDK method: {method}"})
        _reject_unknown_payload_keys(args, ARG_SPECS.get(method, ()), task_scoped=False, generic=True)
        method_args = _method_args_from_payload(method, args, task_scoped=False)
    except ValueError as exc:
        payload = {"success": False, "error": str(exc)}
        if method:
            payload["method"] = method
        return _json_result(payload)
    result = await call_agent_method(method, method_args)
    return _json_result(result)


async def _handle_task_call(args: dict[str, Any], **_: Any) -> str:
    method = ""
    try:
        args = _require_payload_object(args)
        method = _required_string(args, "method")
        if method not in TASK_METHODS:
            return _json_result({"success": False, "error": f"Unsupported Arinova task SDK method: {method}"})
        _reject_unknown_payload_keys(args, TASK_ARG_SPECS.get(method, ()), task_scoped=True, generic=True)
        task_id = _optional_string(args, "task_id")
        method_args = _method_args_from_payload(method, args, task_scoped=True)
    except ValueError as exc:
        payload = {"success": False, "error": str(exc)}
        if method:
            payload["method"] = method
        return _json_result(payload)
    result = await call_task_method(
        task_id,
        method,
        method_args,
    )
    return _json_result(result)


def _agent_handler(method: str) -> Callable[..., Any]:
    async def handler(args: dict[str, Any], **_: Any) -> str:
        if method not in AGENT_METHODS:
            return _json_result({"success": False, "error": f"Unsupported Arinova SDK method: {method}"})
        try:
            args = _require_payload_object(args)
            _reject_unknown_payload_keys(args, ARG_SPECS.get(method, ()), task_scoped=False, generic=False)
            method_args = _method_args_from_payload(method, args, task_scoped=False)
        except ValueError as exc:
            return _json_result({"success": False, "method": method, "error": str(exc)})
        result = await call_agent_method(method, method_args)
        return _json_result(result)

    return handler


def _task_handler(method: str) -> Callable[..., Any]:
    async def handler(args: dict[str, Any], **_: Any) -> str:
        if method not in TASK_METHODS:
            return _json_result({"success": False, "error": f"Unsupported Arinova task SDK method: {method}"})
        try:
            args = _require_payload_object(args)
            _reject_unknown_payload_keys(args, TASK_ARG_SPECS.get(method, ()), task_scoped=True, generic=False)
            task_id = _optional_string(args, "task_id")
            method_args = _method_args_from_payload(method, args, task_scoped=True)
        except ValueError as exc:
            return _json_result({"success": False, "method": method, "error": str(exc)})
        result = await call_task_method(
            task_id,
            method,
            method_args,
        )
        return _json_result(result)

    return handler


def _args_property(
    method: str,
    *,
    task_scoped: bool = False,
    min_items: int | None = None,
    max_items: int | None = None,
) -> dict[str, Any]:
    upload_hint = (
        " For uploadFile, pass file bytes as {'base64':'...'} or an enabled workspace-relative local path."
        if method == "uploadFile"
        else ""
    )
    scope_hint = " task-scoped" if task_scoped else ""
    schema = {
        "type": "array",
        "description": (
            f"Positional arguments for the{scope_hint} Arinova SDK `{method}` method."
            f"{upload_hint}"
        ),
        "items": {},
    }
    if min_items is not None:
        schema["minItems"] = min_items
    if max_items is not None:
        schema["maxItems"] = max_items
    return schema


def _schema_properties_with_aliases(specs: tuple[tuple[str, dict[str, Any]], ...]) -> dict[str, Any]:
    properties: dict[str, Any] = {}
    for name, schema in specs:
        properties[name] = schema
        for alias in _aliases_for(name):
            alias_schema = dict(schema)
            alias_schema["description"] = (
                (str(schema.get("description") or "").rstrip() + " " if schema.get("description") else "")
                + f"Alias for `{name}`."
            )
            properties[alias] = alias_schema
    return properties


def _schema_type(schema: dict[str, Any]) -> str | None:
    schema_type = schema.get("type")
    if isinstance(schema_type, str):
        return schema_type
    one_of = schema.get("oneOf")
    if not isinstance(one_of, list):
        return None
    branch_types = {
        branch.get("type")
        for branch in one_of
        if isinstance(branch, dict) and isinstance(branch.get("type"), str)
    }
    return branch_types.pop() if len(branch_types) == 1 else None


def _merge_generic_property_schema(name: str, existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    if existing == incoming:
        return existing
    existing_type = _schema_type(existing)
    incoming_type = _schema_type(incoming)
    if existing_type and existing_type == incoming_type:
        merged: dict[str, Any] = {"type": existing_type}
    else:
        merged = {}
    merged["description"] = f"Named `{name}` parameter for the selected SDK method."
    return merged


def _generic_schema_properties_with_aliases(
    spec_groups: Iterable[tuple[tuple[str, dict[str, Any]], ...]],
) -> dict[str, Any]:
    properties: dict[str, Any] = {}
    for specs in spec_groups:
        for name, schema in _schema_properties_with_aliases(specs).items():
            if name in properties:
                properties[name] = _merge_generic_property_schema(name, properties[name], schema)
            else:
                properties[name] = schema
    return properties


def _generic_agent_schema() -> dict[str, Any]:
    properties = {
        "method": {"type": "string", "enum": list(MODEL_AGENT_METHODS)},
        "args": _args_property("selected method"),
    }
    properties.update(
        _generic_schema_properties_with_aliases(
            ARG_SPECS.get(method, ()) for method in MODEL_AGENT_METHODS
        )
    )
    return {
        "name": "arinova_sdk_call",
        "description": (
            "Call an allowed ArinovaAgent SDK method through the connected Arinova bridge. "
            "Pass either positional `args` or the named parameters for the selected method."
        ),
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": ["method"],
            "additionalProperties": False,
        },
    }


def _generic_task_schema() -> dict[str, Any]:
    properties = {
        "task_id": {
            "type": "string",
            "description": "Optional Arinova task id. Omit when exactly one Arinova task is active.",
        },
        "taskId": {
            "type": "string",
            "description": "Alias for `task_id`.",
        },
        "method": {"type": "string", "enum": list(TASK_METHODS)},
        "args": _args_property("selected method", task_scoped=True),
    }
    properties.update(_generic_schema_properties_with_aliases(TASK_ARG_SPECS.values()))
    return {
        "name": "arinova_task_call",
        "description": (
            "Call a task-scoped Arinova SDK helper for the active Arinova task. "
            "Pass either positional `args` or the named parameters for the selected helper."
        ),
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": ["method"],
            "additionalProperties": False,
        },
    }


def _method_schema(tool_name: str, method: str, *, task_scoped: bool = False) -> dict[str, Any]:
    specs = TASK_ARG_SPECS if task_scoped else ARG_SPECS
    required_counts = TASK_REQUIRED_ARG_COUNTS if task_scoped else REQUIRED_ARG_COUNTS
    properties: dict[str, Any] = {
        "args": _args_property(
            method,
            task_scoped=task_scoped,
            min_items=required_counts.get(method, 0),
            max_items=len(specs.get(method, ())),
        )
    }
    if task_scoped:
        properties["task_id"] = {
            "type": "string",
            "description": "Optional Arinova task id. Omit when exactly one Arinova task is active.",
        }
        properties["taskId"] = {"type": "string", "description": "Alias for `task_id`."}
    properties.update(_schema_properties_with_aliases(specs.get(method, ())))
    return {
        "name": tool_name,
        "description": (
            METHOD_DESCRIPTIONS.get(method, f"Call Arinova SDK `{method}`.")
            + " Pass either positional `args` or the named parameters shown here."
        ),
        "parameters": {
            "type": "object",
            "properties": properties,
            "additionalProperties": False,
        },
    }


def register_tools(ctx: Any) -> None:
    ctx.register_tool(
        name="arinova_sdk_call",
        toolset=TOOLSET,
        schema=_generic_agent_schema(),
        handler=_handle_sdk_call,
        check_fn=check_arinova_available,
        is_async=True,
        emoji="A",
    )
    ctx.register_tool(
        name="arinova_task_call",
        toolset=TOOLSET,
        schema=_generic_task_schema(),
        handler=_handle_task_call,
        check_fn=check_arinova_available,
        is_async=True,
        emoji="A",
    )

    for method in MODEL_AGENT_METHODS:
        tool_name = f"arinova_{_snake(method)}"
        ctx.register_tool(
            name=tool_name,
            toolset=TOOLSET,
            schema=_method_schema(tool_name, method),
            handler=_agent_handler(method),
            check_fn=check_arinova_available,
            is_async=True,
            emoji="A",
        )

    for method in TASK_METHODS:
        tool_name = f"arinova_task_{_snake(method)}"
        ctx.register_tool(
            name=tool_name,
            toolset=TOOLSET,
            schema=_method_schema(tool_name, method, task_scoped=True),
            handler=_task_handler(method),
            check_fn=check_arinova_available,
            is_async=True,
            emoji="A",
        )
