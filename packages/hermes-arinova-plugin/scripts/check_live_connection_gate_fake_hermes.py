from __future__ import annotations

import textwrap
from pathlib import Path


def write_fake_hermes_root(hermes_root: Path) -> None:
    (hermes_root / "gateway").mkdir(parents=True)
    (hermes_root / "hermes_cli").mkdir(parents=True)
    (hermes_root / "gateway/__init__.py").write_text("")
    (hermes_root / "hermes_cli/__init__.py").write_text("")
    (hermes_root / "gateway/config.py").write_text(
        textwrap.dedent(
            """
            import os

            class Platform:
                def __init__(self, value):
                    self.value = value
                    self.name = value

                def __str__(self):
                    return self.value

                def __hash__(self):
                    return hash(("Platform", self.value))

                def __eq__(self, other):
                    return isinstance(other, Platform) and self.value == other.value

            class PlatformConfig:
                def __init__(self, *, enabled, token, extra):
                    self.enabled = enabled
                    self.token = token
                    self.extra = extra

            class GatewayConfig:
                def __init__(self):
                    if os.getenv("ARINOVA_FAKE_CONFIG_PLATFORM_KEY") == "platform":
                        self.platforms = {
                            Platform("arinova"): PlatformConfig(
                                enabled=True,
                                token="ari_loaded_config",
                                extra={
                                    "server_url": "wss://loaded-config.example",
                                    "agent_skills_json": '[{"id":"live-smoke-skill","name":"Live Smoke Skill","description":"Live smoke skill"}]',
                                },
                            )
                        }
                    else:
                        self.platforms = {}

            def load_gateway_config():
                return GatewayConfig()
            """
        ).lstrip()
    )
    (hermes_root / "hermes_cli/plugins.py").write_text(
        textwrap.dedent(
            """
            import base64
            import json
            import os

            class Manifest:
                key = "hermes-arinova-plugin"
                name = "hermes-arinova-plugin"

            class FakeArinovaAdapter:
                fatal_error_message = None

                def __init__(self, config):
                    self.config = config
                    self.is_connected = False
                    self._claimed_agent_id = (
                        "claimed-other-agent"
                        if os.getenv("ARINOVA_FAKE_CLAIMED_AGENT_MISMATCH") == "1"
                        else None
                    )
                    marker = os.getenv("ARINOVA_FAKE_CONFIG_MARKER")
                    if marker:
                        with open(marker, "a", encoding="utf-8") as handle:
                            handle.write(json.dumps({
                                "token": config.token,
                                "extra": config.extra,
                            }, sort_keys=True) + "\\n")

                async def connect(self):
                    if os.getenv("ARINOVA_FAKE_CONNECT_FALSE") == "1":
                        self.fatal_error_message = "fake connect returned false"
                        return False
                    self.is_connected = True
                    if os.getenv("ARINOVA_FAKE_CONNECT_WITHOUT_CONNECTED_STATE") == "1":
                        self.is_connected = False
                    return True

                async def disconnect(self):
                    self.is_connected = False
                    marker = os.getenv("ARINOVA_FAKE_DISCONNECT_MARKER")
                    if marker:
                        with open(marker, "a", encoding="utf-8") as handle:
                            handle.write("disconnect\\n")

                def _post_sidecar(self, path, body):
                    if path == "/healthz":
                        if os.getenv("ARINOVA_FAKE_BAD_HEALTH_OK") == "1":
                            return {"ok": False, "connected": True}
                        if os.getenv("ARINOVA_FAKE_BAD_HEALTH") == "1":
                            return {"ok": True, "connected": False}
                        agent_id = (
                            "health-other-agent"
                            if os.getenv("ARINOVA_FAKE_HEALTH_AGENT_MISMATCH") == "1"
                            else "agent-from-fake-hermes-root"
                        )
                        return {"ok": True, "connected": True, "agentId": agent_id}
                    raise RuntimeError(f"unexpected sidecar path: {path}")

                async def call_agent_sdk(self, method, *args):
                    marker = os.getenv("ARINOVA_FAKE_SDK_CALLS_MARKER")
                    if marker:
                        def json_safe(value):
                            if isinstance(value, (bytes, bytearray, memoryview)):
                                return {"base64": base64.b64encode(bytes(value)).decode("ascii")}
                            if isinstance(value, list):
                                return [json_safe(item) for item in value]
                            if isinstance(value, tuple):
                                return [json_safe(item) for item in value]
                            if isinstance(value, dict):
                                return {str(key): json_safe(item) for key, item in value.items()}
                            return value
                        with open(marker, "a", encoding="utf-8") as handle:
                            handle.write(json.dumps({"method": method, "args": json_safe(list(args))}, sort_keys=True) + "\\n")
                    if method == "getAgentId":
                        if os.getenv("ARINOVA_FAKE_EMPTY_AGENT_ID") == "1":
                            return ""
                        return "agent-from-fake-hermes-root"
                    if method == "getOnboardingSeed":
                        if os.getenv("ARINOVA_FAKE_UNEXPECTED_ONBOARDING_SEED") == "1":
                            return "not-a-seed"
                        if os.getenv("ARINOVA_FAKE_BAD_ONBOARDING_SEED") == "1":
                            return {"kind": "first_touch_opening", "seedId": "seed-1"}
                        return None
                    if method == "sendTelemetry" and os.getenv("ARINOVA_FAKE_REJECT_TELEMETRY") == "1":
                        raise RuntimeError("fake telemetry rejected")
                    if method == "sendHud" and os.getenv("ARINOVA_FAKE_REJECT_HUD") == "1":
                        raise RuntimeError("fake hud rejected")
                    if method == "sendTaskUpdate" and os.getenv("ARINOVA_FAKE_REJECT_TASK_UPDATE") == "1":
                        raise RuntimeError("fake task update rejected")
                    if method == "reportToolCall" and os.getenv("ARINOVA_FAKE_REJECT_TOOL_REPORT") == "1":
                        raise RuntimeError("fake tool report rejected")
                    if method == "sendMessage" and os.getenv("ARINOVA_FAKE_REJECT_SEND_MESSAGE") == "1":
                        raise RuntimeError("fake sendMessage rejected")
                    if method == os.getenv("ARINOVA_FAKE_NON_NULL_VOID_METHOD", ""):
                        return {"unexpectedVoidResult": method}
                    if method == "uploadFile":
                        if os.getenv("ARINOVA_FAKE_REJECT_UPLOAD_FILE") == "1":
                            raise RuntimeError("fake uploadFile rejected")
                        if os.getenv("ARINOVA_FAKE_BAD_UPLOAD_FILE") == "1":
                            return {"fileName": "missing-url.txt"}
                        if os.getenv("ARINOVA_FAKE_BAD_UPLOAD_FILE_SIZE") == "1":
                            return {
                                "url": "https://files.example/live-smoke.txt",
                                "fileName": args[2],
                                "fileType": args[3],
                                "fileSize": "1",
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_UPLOAD_FILE_TYPE") == "1":
                            return {
                                "url": "https://files.example/live-smoke.txt",
                                "fileName": args[2],
                                "fileType": "application/octet-stream",
                                "fileSize": len(args[1]),
                            }
                        return {
                            "url": "https://files.example/live-smoke.txt",
                            "fileName": args[2],
                            "fileType": args[3],
                            "fileSize": len(args[1]),
                        }
                    if method == "fetchHistory":
                        if os.getenv("ARINOVA_FAKE_BAD_FETCH_HISTORY") == "1":
                            return {"messages": "not-a-list"}
                        if os.getenv("ARINOVA_FAKE_BAD_FETCH_HISTORY_METADATA") == "1":
                            return {"messages": [], "hasMore": "false", "nextCursor": 123}
                        if os.getenv("ARINOVA_FAKE_BAD_FETCH_HISTORY_NULL_CURSOR") == "1":
                            return {"messages": [], "hasMore": False, "nextCursor": None}
                        if os.getenv("ARINOVA_FAKE_BAD_FETCH_HISTORY_ENTRY") == "1":
                            return {
                                "messages": [
                                    {
                                        "id": "msg-live",
                                        "conversationId": args[0],
                                        "seq": "1",
                                        "role": "assistant",
                                        "content": "hello",
                                        "status": "sent",
                                        "createdAt": "now",
                                        "updatedAt": "now",
                                    }
                                ],
                                "hasMore": False,
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_FETCH_HISTORY_NULL_OPTIONAL") == "1":
                            return {
                                "messages": [
                                    {
                                        "id": "msg-live",
                                        "conversationId": args[0],
                                        "seq": 1,
                                        "role": "assistant",
                                        "content": "hello",
                                        "status": "sent",
                                        "senderAgentId": None,
                                        "createdAt": "now",
                                        "updatedAt": "now",
                                    }
                                ],
                                "hasMore": False,
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_FETCH_HISTORY_NULL_ATTACHMENTS") == "1":
                            return {
                                "messages": [
                                    {
                                        "id": "msg-live",
                                        "conversationId": args[0],
                                        "seq": 1,
                                        "role": "assistant",
                                        "content": "hello",
                                        "status": "sent",
                                        "createdAt": "now",
                                        "updatedAt": "now",
                                        "attachments": None,
                                    }
                                ],
                                "hasMore": False,
                            }
                        return {"messages": [], "hasMore": False}
                    if method == "listNotes":
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_NOTES") == "1":
                            return {"notes": "not-a-list", "hasMore": False}
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_NOTES_METADATA") == "1":
                            return {"notes": [], "hasMore": "false", "nextCursor": 123}
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_NOTES_NULL_CURSOR") == "1":
                            return {"notes": [], "hasMore": False, "nextCursor": None}
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_NOTES_ENTRY") == "1":
                            return {
                                "notes": [
                                    {
                                        "id": "note-1",
                                        "conversationId": "conv-notes",
                                        "creatorId": "agent-1",
                                        "creatorType": "bot",
                                        "creatorName": "Agent",
                                        "title": "Note",
                                        "content": "Body",
                                        "createdAt": "now",
                                        "updatedAt": "now",
                                    }
                                ],
                                "hasMore": False,
                            }
                        return {"notes": [], "hasMore": False}
                    if method == "queryMemory":
                        if os.getenv("ARINOVA_FAKE_BAD_QUERY_MEMORY") == "1":
                            return {"entries": "not-a-list"}
                        if os.getenv("ARINOVA_FAKE_BAD_QUERY_MEMORY_ENTRY") == "1":
                            return [{"content": "memory", "category": "system", "score": "high"}]
                        if os.getenv("ARINOVA_FAKE_BAD_QUERY_MEMORY_SCORE") == "1":
                            return [{"content": "memory", "category": "system", "score": float("nan")}]
                        if os.getenv("ARINOVA_FAKE_BAD_QUERY_MEMORY_ORIGIN") == "1":
                            return [{"content": "memory", "category": "system", "score": 0.9, "origin": "workspace"}]
                        if os.getenv("ARINOVA_FAKE_BAD_QUERY_MEMORY_SHARED_ORIGIN") == "1":
                            return [{"content": "memory", "category": "system", "score": 0.9, "origin": "shared-from-agent"}]
                        if os.getenv("ARINOVA_FAKE_BAD_QUERY_MEMORY_NULL_ORIGIN") == "1":
                            return [{"content": "memory", "category": "system", "score": 0.9, "origin": None}]
                        return []
                    if method == "fetchSkillPrompt":
                        if os.getenv("ARINOVA_FAKE_BAD_SKILL_PROMPT") == "1":
                            return {"promptContent": "missing-template"}
                        if os.getenv("ARINOVA_FAKE_BAD_SKILL_PROMPT_PARAMETERS") == "1":
                            return {"promptContent": "Prompt", "promptTemplate": "Template", "parameters": {"name": "topic"}}
                        return {"promptContent": "Prompt", "promptTemplate": "Template", "parameters": []}
                    if method == "listBoards":
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_BOARDS") == "1":
                            return {"boards": "not-a-list"}
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_BOARDS_ENTRY") == "1":
                            return [{"id": "board-live", "name": "Live", "createdAt": None}]
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_BOARDS_MISSING_FIELD") == "1":
                            return [{"id": "board-live", "createdAt": "now"}]
                        return []
                    if method == "listCards":
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_CARDS") == "1":
                            return {"cards": "not-a-list"}
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_CARDS_ENTRY") == "1":
                            return [
                                {
                                    "id": "card-live",
                                    "columnId": "col-live",
                                    "title": "Live",
                                    "description": None,
                                    "priority": None,
                                    "dueDate": None,
                                    "sortOrder": "1",
                                    "createdBy": None,
                                    "createdAt": None,
                                    "updatedAt": None,
                                }
                            ]
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_CARDS_MISSING_NULLABLE") == "1":
                            return [
                                {
                                    "id": "card-live",
                                    "columnId": "col-live",
                                    "title": "Live",
                                    "priority": None,
                                    "dueDate": None,
                                    "sortOrder": 1,
                                    "createdBy": None,
                                    "createdAt": None,
                                    "updatedAt": None,
                                }
                            ]
                        return []
                    if method == "listColumns":
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_COLUMNS") == "1":
                            return {"columns": "not-a-list"}
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_COLUMNS_ENTRY") == "1":
                            return [{"id": "col-live", "boardId": args[0], "name": "Doing", "sortOrder": "1"}]
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_COLUMNS_MISSING_FIELD") == "1":
                            return [{"id": "col-live", "boardId": args[0], "sortOrder": 1}]
                        return []
                    if method == "listLabels":
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_LABELS") == "1":
                            return {"labels": "not-a-list"}
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_LABELS_ENTRY") == "1":
                            return [{"id": "label-live", "boardId": args[0], "name": "Live", "color": 123}]
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_LABELS_MISSING_FIELD") == "1":
                            return [{"id": "label-live", "boardId": args[0], "name": "Live"}]
                        return []
                    if method == "listArchivedCards":
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_ARCHIVED_CARDS") == "1":
                            return {"cards": "not-a-list", "total": 0, "page": 1, "limit": 20}
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_ARCHIVED_CARDS_METADATA") == "1":
                            return {"cards": [], "total": float("nan"), "page": True, "limit": 20}
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_ARCHIVED_CARDS_ENTRY") == "1":
                            return {
                                "cards": [
                                    {
                                        "id": "card-live",
                                        "columnId": "col-live",
                                        "title": "Live",
                                        "description": None,
                                        "priority": None,
                                        "dueDate": None,
                                        "sortOrder": "1",
                                        "createdBy": None,
                                        "createdAt": None,
                                        "updatedAt": None,
                                    }
                                ],
                                "total": 1,
                                "page": 1,
                                "limit": 1,
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_ARCHIVED_CARDS_MISSING_NULLABLE") == "1":
                            return {
                                "cards": [
                                    {
                                        "id": "card-live",
                                        "columnId": "col-live",
                                        "title": "Live",
                                        "priority": None,
                                        "dueDate": None,
                                        "sortOrder": 1,
                                        "createdBy": None,
                                        "createdAt": None,
                                        "updatedAt": None,
                                    }
                                ],
                                "total": 1,
                                "page": 1,
                                "limit": 1,
                            }
                        return {"cards": [], "total": 0, "page": 1, "limit": 1}
                    if method == "listCardCommits":
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_CARD_COMMITS") == "1":
                            return {"commits": "not-a-list"}
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_CARD_COMMITS_ENTRY") == "1":
                            return [{"cardId": args[0], "commitHash": "abc123", "message": 42, "createdAt": "now"}]
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_CARD_COMMITS_MISSING_FIELD") == "1":
                            return [{"cardId": args[0], "commitHash": "abc123", "createdAt": "now"}]
                        return []
                    if method == "listCardNotes":
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_CARD_NOTES") == "1":
                            return {"notes": "not-a-list"}
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_CARD_NOTES_ENTRY") == "1":
                            return [{"id": "note-live", "title": "Note", "tags": ["live", 1], "createdAt": "now"}]
                        if os.getenv("ARINOVA_FAKE_BAD_LIST_CARD_NOTES_TAGS") == "1":
                            return [{"id": "note-live", "title": "Note", "tags": None, "createdAt": "now"}]
                        return []
                    if method == "createNote":
                        if os.getenv("ARINOVA_FAKE_BAD_CREATE_NOTE") == "1":
                            return {"id": "note-live", "title": "missing-content"}
                        if os.getenv("ARINOVA_FAKE_BAD_CREATE_NOTE_ENTRY") == "1":
                            return {
                                "id": "note-live",
                                "conversationId": args[0],
                                "creatorId": "agent-from-fake-hermes-root",
                                "creatorType": "bot",
                                "creatorName": "Hermes",
                                "title": args[1].get("title", "Untitled"),
                                "content": args[1].get("content", ""),
                                "tags": ["live", 1],
                                "createdAt": "now",
                                "updatedAt": "now",
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_CREATE_NOTE_NULL_OPTIONAL") == "1":
                            return {
                                "id": "note-live",
                                "conversationId": args[0],
                                "creatorId": "agent-from-fake-hermes-root",
                                "creatorType": "agent",
                                "creatorName": "Hermes",
                                "agentId": None,
                                "title": args[1].get("title", "Untitled"),
                                "content": args[1].get("content", ""),
                                "tags": args[1].get("tags", []),
                                "createdAt": "now",
                                "updatedAt": "now",
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_CREATE_NOTE_NULL_TAGS") == "1":
                            return {
                                "id": "note-live",
                                "conversationId": args[0],
                                "creatorId": "agent-from-fake-hermes-root",
                                "creatorType": "agent",
                                "creatorName": "Hermes",
                                "title": args[1].get("title", "Untitled"),
                                "content": args[1].get("content", ""),
                                "tags": None,
                                "createdAt": "now",
                                "updatedAt": "now",
                            }
                        return {
                            "id": "note-live",
                            "conversationId": args[0],
                            "creatorId": "agent-from-fake-hermes-root",
                            "creatorType": "agent",
                            "creatorName": "Hermes",
                            "title": args[1].get("title", "Untitled"),
                            "content": args[1].get("content", ""),
                            "tags": args[1].get("tags", []),
                            "createdAt": "now",
                            "updatedAt": "now",
                        }
                    if method == "updateNote":
                        if os.getenv("ARINOVA_FAKE_BAD_UPDATE_NOTE") == "1":
                            return {"id": args[1], "title": "missing-content"}
                        if os.getenv("ARINOVA_FAKE_MISMATCH_UPDATE_NOTE_ID") == "1":
                            return {
                                "id": "other-note",
                                "conversationId": args[0],
                                "creatorId": "agent-from-fake-hermes-root",
                                "creatorType": "agent",
                                "creatorName": "Hermes",
                                "title": args[2].get("title", "Updated"),
                                "content": args[2].get("content", ""),
                                "tags": args[2].get("tags", []),
                                "createdAt": "before",
                                "updatedAt": "now",
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_UPDATE_NOTE_ENTRY") == "1":
                            return {
                                "id": args[1],
                                "conversationId": args[0],
                                "creatorId": "agent-from-fake-hermes-root",
                                "creatorType": "bot",
                                "creatorName": "Hermes",
                                "title": args[2].get("title", "Updated"),
                                "content": args[2].get("content", ""),
                                "tags": ["live", 1],
                                "createdAt": "before",
                                "updatedAt": "now",
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_UPDATE_NOTE_NULL_TAGS") == "1":
                            return {
                                "id": args[1],
                                "conversationId": args[0],
                                "creatorId": "agent-from-fake-hermes-root",
                                "creatorType": "agent",
                                "creatorName": "Hermes",
                                "title": args[2].get("title", "Updated"),
                                "content": args[2].get("content", ""),
                                "tags": None,
                                "createdAt": "before",
                                "updatedAt": "now",
                            }
                        return {
                            "id": args[1],
                            "conversationId": args[0],
                            "creatorId": "agent-from-fake-hermes-root",
                            "creatorType": "agent",
                            "creatorName": "Hermes",
                            "title": args[2].get("title", "Updated"),
                            "content": args[2].get("content", ""),
                            "tags": args[2].get("tags", []),
                            "createdAt": "before",
                            "updatedAt": "now",
                        }
                    if method == "deleteNote":
                        if os.getenv("ARINOVA_FAKE_REJECT_DELETE_NOTE") == "1":
                            raise RuntimeError("fake deleteNote rejected")
                        return None
                    if method == "createBoard":
                        if os.getenv("ARINOVA_FAKE_BAD_CREATE_BOARD") == "1":
                            return {"id": "board-live"}
                        if os.getenv("ARINOVA_FAKE_BAD_CREATE_BOARD_CREATED_AT") == "1":
                            return {
                                "id": "board-live",
                                "name": args[0].get("name", "Live smoke board"),
                                "createdAt": None,
                            }
                        return {
                            "id": "board-live",
                            "name": args[0].get("name", "Live smoke board"),
                            "createdAt": "now",
                        }
                    if method == "updateBoard":
                        if os.getenv("ARINOVA_FAKE_BAD_UPDATE_BOARD") == "1":
                            return {"id": args[0]}
                        if os.getenv("ARINOVA_FAKE_MISMATCH_UPDATE_BOARD_ID") == "1":
                            return {
                                "id": "other-board",
                                "name": args[1].get("name", "Updated live smoke board"),
                                "createdAt": "before",
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_UPDATE_BOARD_CREATED_AT") == "1":
                            return {
                                "id": args[0],
                                "name": args[1].get("name", "Updated live smoke board"),
                                "createdAt": None,
                            }
                        return {
                            "id": args[0],
                            "name": args[1].get("name", "Updated live smoke board"),
                            "createdAt": "before",
                        }
                    if method == "archiveBoard":
                        if os.getenv("ARINOVA_FAKE_REJECT_ARCHIVE_BOARD") == "1":
                            raise RuntimeError("fake archiveBoard rejected")
                        return None
                    if method == "createCard":
                        if os.getenv("ARINOVA_FAKE_BAD_CREATE_CARD") == "1":
                            return {"id": "card-live"}
                        if os.getenv("ARINOVA_FAKE_BAD_CREATE_CARD_NULL_COLUMN_NAME") == "1":
                            return {
                                "id": "card-live",
                                "columnId": args[0].get("columnId", "column-live"),
                                "columnName": None,
                                "title": args[0].get("title", "Live smoke card"),
                                "description": args[0].get("description"),
                                "priority": args[0].get("priority"),
                                "dueDate": None,
                                "sortOrder": 1,
                                "createdBy": "agent-from-fake-hermes-root",
                                "createdAt": "now",
                                "updatedAt": "now",
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_CREATE_CARD_ARCHIVED_AT") == "1":
                            return {
                                "id": "card-live",
                                "columnId": args[0].get("columnId", "column-live"),
                                "columnName": args[0].get("columnName", "Todo"),
                                "title": args[0].get("title", "Live smoke card"),
                                "description": args[0].get("description"),
                                "priority": args[0].get("priority"),
                                "dueDate": None,
                                "sortOrder": 1,
                                "createdBy": "agent-from-fake-hermes-root",
                                "createdAt": "now",
                                "updatedAt": "now",
                                "archivedAt": False,
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_CREATE_CARD_MISSING_NULLABLE") == "1":
                            return {
                                "id": "card-live",
                                "columnId": args[0].get("columnId", "column-live"),
                                "columnName": args[0].get("columnName", "Todo"),
                                "title": args[0].get("title", "Live smoke card"),
                                "priority": None,
                                "dueDate": None,
                                "sortOrder": 1,
                                "createdBy": None,
                                "createdAt": None,
                                "updatedAt": None,
                            }
                        return {
                            "id": "card-live",
                            "columnId": args[0].get("columnId", "column-live"),
                            "columnName": args[0].get("columnName", "Todo"),
                            "title": args[0].get("title", "Live smoke card"),
                            "description": args[0].get("description"),
                            "priority": args[0].get("priority"),
                            "dueDate": None,
                            "sortOrder": 1,
                            "createdBy": "agent-from-fake-hermes-root",
                            "createdAt": "now",
                            "updatedAt": "now",
                        }
                    if method == "updateCard":
                        if os.getenv("ARINOVA_FAKE_BAD_UPDATE_CARD") == "1":
                            return {"id": args[0]}
                        if os.getenv("ARINOVA_FAKE_MISMATCH_UPDATE_CARD_ID") == "1":
                            return {
                                "id": "other-card",
                                "columnId": args[1].get("columnId", "column-live"),
                                "columnName": "Todo",
                                "title": args[1].get("title", "Updated live smoke card"),
                                "description": args[1].get("description"),
                                "priority": args[1].get("priority"),
                                "dueDate": None,
                                "sortOrder": args[1].get("sortOrder", 2),
                                "createdBy": "agent-from-fake-hermes-root",
                                "createdAt": "before",
                                "updatedAt": "now",
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_UPDATE_CARD_MISSING_NULLABLE") == "1":
                            return {
                                "id": args[0],
                                "columnId": args[1].get("columnId", "column-live"),
                                "columnName": "Todo",
                                "title": args[1].get("title", "Updated live smoke card"),
                                "priority": args[1].get("priority"),
                                "dueDate": None,
                                "sortOrder": args[1].get("sortOrder", 2),
                                "createdBy": "agent-from-fake-hermes-root",
                                "createdAt": "before",
                                "updatedAt": "now",
                            }
                        return {
                            "id": args[0],
                            "columnId": args[1].get("columnId", "column-live"),
                            "columnName": "Todo",
                            "title": args[1].get("title", "Updated live smoke card"),
                            "description": args[1].get("description"),
                            "priority": args[1].get("priority"),
                            "dueDate": None,
                            "sortOrder": args[1].get("sortOrder", 2),
                            "createdBy": "agent-from-fake-hermes-root",
                            "createdAt": "before",
                            "updatedAt": "now",
                        }
                    if method == "completeCard":
                        if os.getenv("ARINOVA_FAKE_BAD_COMPLETE_CARD") == "1":
                            return {"id": args[0]}
                        if os.getenv("ARINOVA_FAKE_MISMATCH_COMPLETE_CARD_ID") == "1":
                            return {
                                "id": "other-card",
                                "columnId": "done-column",
                                "columnName": "Done",
                                "title": "Updated live smoke card",
                                "description": "Updated by hermes-arinova-plugin live smoke",
                                "priority": "urgent",
                                "dueDate": None,
                                "sortOrder": 3,
                                "createdBy": "agent-from-fake-hermes-root",
                                "createdAt": "before",
                                "updatedAt": "now",
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_COMPLETE_CARD_SORT_ORDER") == "1":
                            return {
                                "id": args[0],
                                "columnId": "done-column",
                                "columnName": "Done",
                                "title": "Updated live smoke card",
                                "description": "Updated by hermes-arinova-plugin live smoke",
                                "priority": "urgent",
                                "dueDate": None,
                                "sortOrder": "3",
                                "createdBy": "agent-from-fake-hermes-root",
                                "createdAt": "before",
                                "updatedAt": "now",
                            }
                        return {
                            "id": args[0],
                            "columnId": "done-column",
                            "columnName": "Done",
                            "title": "Updated live smoke card",
                            "description": "Updated by hermes-arinova-plugin live smoke",
                            "priority": "urgent",
                            "dueDate": None,
                            "sortOrder": 3,
                            "createdBy": "agent-from-fake-hermes-root",
                            "createdAt": "before",
                            "updatedAt": "now",
                        }
                    if method == "createColumn":
                        if os.getenv("ARINOVA_FAKE_BAD_CREATE_COLUMN") == "1":
                            return {"id": "column-live"}
                        if os.getenv("ARINOVA_FAKE_MISMATCH_CREATE_COLUMN_BOARD_ID") == "1":
                            return {
                                "id": "column-live",
                                "boardId": "other-board",
                                "name": args[1].get("name", "Live smoke column"),
                                "sortOrder": args[1].get("sortOrder", 4),
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_CREATE_COLUMN_SORT_ORDER") == "1":
                            return {
                                "id": "column-live",
                                "boardId": args[0],
                                "name": args[1].get("name", "Live smoke column"),
                                "sortOrder": "4",
                            }
                        return {
                            "id": "column-live",
                            "boardId": args[0],
                            "name": args[1].get("name", "Live smoke column"),
                            "sortOrder": args[1].get("sortOrder", 4),
                        }
                    if method == "updateColumn":
                        if os.getenv("ARINOVA_FAKE_BAD_UPDATE_COLUMN") == "1":
                            return {"id": args[0]}
                        if os.getenv("ARINOVA_FAKE_MISMATCH_UPDATE_COLUMN_ID") == "1":
                            return {
                                "id": "other-column",
                                "boardId": "board-live",
                                "name": args[1].get("name", "Updated live smoke column"),
                                "sortOrder": args[1].get("sortOrder", 5),
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_UPDATE_COLUMN_SORT_ORDER") == "1":
                            return {
                                "id": args[0],
                                "boardId": "board-live",
                                "name": args[1].get("name", "Updated live smoke column"),
                                "sortOrder": "5",
                            }
                        return {
                            "id": args[0],
                            "boardId": "board-live",
                            "name": args[1].get("name", "Updated live smoke column"),
                            "sortOrder": args[1].get("sortOrder", 5),
                        }
                    if method == "deleteColumn":
                        if os.getenv("ARINOVA_FAKE_REJECT_DELETE_COLUMN") == "1":
                            raise RuntimeError("fake deleteColumn rejected")
                        return None
                    if method == "reorderColumns":
                        if os.getenv("ARINOVA_FAKE_REJECT_REORDER_COLUMNS") == "1":
                            raise RuntimeError("fake reorderColumns rejected")
                        return None
                    if method == "addCardCommit":
                        if os.getenv("ARINOVA_FAKE_BAD_ADD_CARD_COMMIT") == "1":
                            return {"cardId": args[0]}
                        if os.getenv("ARINOVA_FAKE_MISMATCH_ADD_CARD_COMMIT_CARD_ID") == "1":
                            return {
                                "cardId": "other-card",
                                "commitHash": args[1].get("commitHash", "abc123"),
                                "message": args[1].get("message", ""),
                                "createdAt": "now",
                            }
                        return {
                            "cardId": args[0],
                            "commitHash": args[1].get("commitHash", "abc123"),
                            "message": args[1].get("message", ""),
                            "createdAt": "now",
                        }
                    if method == "linkCardNote":
                        if os.getenv("ARINOVA_FAKE_REJECT_LINK_CARD_NOTE") == "1":
                            raise RuntimeError("fake linkCardNote rejected")
                        return None
                    if method == "unlinkCardNote":
                        if os.getenv("ARINOVA_FAKE_REJECT_UNLINK_CARD_NOTE") == "1":
                            raise RuntimeError("fake unlinkCardNote rejected")
                        return None
                    if method == "createLabel":
                        if os.getenv("ARINOVA_FAKE_BAD_CREATE_LABEL") == "1":
                            return {"id": "label-live"}
                        if os.getenv("ARINOVA_FAKE_MISMATCH_CREATE_LABEL_BOARD_ID") == "1":
                            return {
                                "id": "label-live",
                                "boardId": "other-board",
                                "name": args[1].get("name", "Live smoke label"),
                                "color": args[1].get("color"),
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_CREATE_LABEL_MISSING_NULLABLE") == "1":
                            return {
                                "id": "label-live",
                                "boardId": args[0],
                                "name": args[1].get("name", "Live smoke label"),
                            }
                        return {
                            "id": "label-live",
                            "boardId": args[0],
                            "name": args[1].get("name", "Live smoke label"),
                            "color": args[1].get("color"),
                        }
                    if method == "updateLabel":
                        if os.getenv("ARINOVA_FAKE_BAD_UPDATE_LABEL") == "1":
                            return {"id": args[0]}
                        if os.getenv("ARINOVA_FAKE_MISMATCH_UPDATE_LABEL_ID") == "1":
                            return {
                                "id": "other-label",
                                "boardId": "board-live",
                                "name": args[1].get("name", "Updated live smoke label"),
                                "color": args[1].get("color"),
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_UPDATE_LABEL_MISSING_NULLABLE") == "1":
                            return {
                                "id": args[0],
                                "boardId": "board-live",
                                "name": args[1].get("name", "Updated live smoke label"),
                            }
                        return {
                            "id": args[0],
                            "boardId": "board-live",
                            "name": args[1].get("name", "Updated live smoke label"),
                            "color": args[1].get("color"),
                        }
                    if method == "deleteLabel":
                        if os.getenv("ARINOVA_FAKE_REJECT_DELETE_LABEL") == "1":
                            raise RuntimeError("fake deleteLabel rejected")
                        return None
                    if method == "addCardLabel":
                        if os.getenv("ARINOVA_FAKE_REJECT_ADD_CARD_LABEL") == "1":
                            raise RuntimeError("fake addCardLabel rejected")
                        return None
                    if method == "removeCardLabel":
                        if os.getenv("ARINOVA_FAKE_REJECT_REMOVE_CARD_LABEL") == "1":
                            raise RuntimeError("fake removeCardLabel rejected")
                        return None
                    if method == "callAction":
                        if os.getenv("ARINOVA_FAKE_REJECT_CALL_ACTION") == "1":
                            raise RuntimeError("fake callAction rejected")
                        if os.getenv("ARINOVA_FAKE_MISMATCH_CALL_ACTION_CALL_ID") == "1":
                            return {
                                "callId": "other-call",
                                "action": args[0],
                                "status": "success",
                                "result": {"dryRun": args[2].get("dryRun")},
                                "error": None,
                                "confirmation": None,
                                "dryRun": args[2].get("dryRun"),
                            }
                        if os.getenv("ARINOVA_FAKE_MISMATCH_CALL_ACTION_DRY_RUN") == "1":
                            return {
                                "callId": args[2].get("callId", "fake-call"),
                                "action": args[0],
                                "status": "success",
                                "result": {"dryRun": args[2].get("dryRun")},
                                "error": None,
                                "confirmation": None,
                                "dryRun": not args[2].get("dryRun"),
                            }
                        if os.getenv("ARINOVA_FAKE_INCONSISTENT_SUCCESS_CALL_ACTION") == "1":
                            return {
                                "callId": args[2].get("callId", "fake-call"),
                                "action": args[0],
                                "status": "success",
                                "result": {},
                                "error": {"code": "unexpected_error", "message": "unexpected"},
                                "confirmation": None,
                            }
                        if os.getenv("ARINOVA_FAKE_INCONSISTENT_ERROR_CALL_ACTION") == "1":
                            return {
                                "callId": args[2].get("callId", "fake-call"),
                                "action": args[0],
                                "status": "error",
                                "result": None,
                                "error": None,
                                "confirmation": None,
                            }
                        if os.getenv("ARINOVA_FAKE_INCONSISTENT_CONFIRMATION_CALL_ACTION") == "1":
                            return {
                                "callId": args[2].get("callId", "fake-call"),
                                "action": args[0],
                                "status": "requires_confirmation",
                                "result": None,
                                "error": None,
                                "confirmation": None,
                            }
                        if os.getenv("ARINOVA_FAKE_INCONSISTENT_CANCELLED_CALL_ACTION") == "1":
                            return {
                                "callId": args[2].get("callId", "fake-call"),
                                "action": args[0],
                                "status": "cancelled",
                                "result": None,
                                "error": {"code": "cancelled", "message": "cancelled"},
                                "confirmation": None,
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_CALL_ACTION") == "1":
                            return {"callId": "missing-status", "action": args[0]}
                        if os.getenv("ARINOVA_FAKE_BAD_CALL_ACTION_OPTIONAL") == "1":
                            return {
                                "callId": args[2].get("callId", "fake-call"),
                                "action": args[0],
                                "status": "success",
                                "result": "not-an-object",
                                "error": {"code": "bad", "message": 123},
                                "confirmation": {"confirmationId": "confirm-1", "title": "Confirm"},
                                "traceId": 123,
                                "actionVersion": 1,
                                "dryRun": "true",
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_CALL_ACTION_NULL_METADATA") == "1":
                            return {
                                "callId": args[2].get("callId", "fake-call"),
                                "action": args[0],
                                "status": "success",
                                "traceId": None,
                                "actionVersion": None,
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_CALL_ACTION_NULL_DRY_RUN") == "1":
                            return {
                                "callId": args[2].get("callId", "fake-call"),
                                "action": args[0],
                                "status": "success",
                                "result": {},
                                "error": None,
                                "confirmation": None,
                                "dryRun": None,
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_CALL_ACTION_NULL_DETAILS") == "1":
                            return {
                                "callId": args[2].get("callId", "fake-call"),
                                "action": args[0],
                                "status": "error",
                                "result": None,
                                "error": {
                                    "code": "live_error",
                                    "message": "Live action failed",
                                    "details": None,
                                },
                                "confirmation": None,
                            }
                        if os.getenv("ARINOVA_FAKE_NONTERMINAL_CALL_ACTION"):
                            return {
                                "callId": args[2].get("callId", "fake-call"),
                                "action": args[0],
                                "status": (
                                    os.getenv("ARINOVA_FAKE_NONTERMINAL_CALL_ACTION")
                                    if os.getenv("ARINOVA_FAKE_NONTERMINAL_CALL_ACTION") != "1"
                                    else "processing"
                                ),
                                "result": None,
                                "error": None,
                                "confirmation": None,
                            }
                        if os.getenv("ARINOVA_FAKE_CONFIRMATION_CALL_ACTION") == "1":
                            return {
                                "callId": args[2].get("callId", "fake-call"),
                                "action": args[0],
                                "status": "requires_confirmation",
                                "result": None,
                                "error": None,
                                "confirmation": {
                                    "confirmationId": "confirm-live",
                                    "title": "Confirm live action",
                                    "summary": "Confirm the live smoke action",
                                    "expiresAt": "2026-06-30T00:00:00Z",
                                },
                                "traceId": "trace-confirm-live",
                                "actionVersion": "v-confirm-live",
                                "dryRun": args[2].get("dryRun"),
                            }
                        if os.getenv("ARINOVA_FAKE_ERROR_CALL_ACTION") == "1":
                            return {
                                "callId": args[2].get("callId", "fake-call"),
                                "action": args[0],
                                "status": "error",
                                "result": None,
                                "error": {
                                    "code": "live_error",
                                    "message": "Live action failed",
                                    "details": {"retryable": False},
                                },
                                "confirmation": None,
                                "traceId": "trace-error-live",
                                "actionVersion": "v-error-live",
                                "dryRun": args[2].get("dryRun"),
                            }
                        if os.getenv("ARINOVA_FAKE_CANCELLED_CALL_ACTION") == "1":
                            return {
                                "callId": args[2].get("callId", "fake-call"),
                                "action": args[0],
                                "status": "cancelled",
                                "result": {"reason": "user_cancelled"},
                                "error": None,
                                "confirmation": None,
                                "traceId": "trace-cancelled-live",
                                "actionVersion": "v-cancelled-live",
                                "dryRun": args[2].get("dryRun"),
                            }
                        return {
                            "callId": args[2].get("callId", "fake-call"),
                            "action": args[0],
                            "status": "success",
                            "result": {"dryRun": args[2].get("dryRun")},
                            "error": None,
                            "confirmation": None,
                            "dryRun": args[2].get("dryRun"),
                        }
                    if method in {"sendTelemetry", "sendHud", "sendTaskUpdate", "reportToolCall", "sendMessage"}:
                        return None
                    raise RuntimeError(f"unexpected SDK method: {method}")

                async def call_task_sdk(self, task_id, method, *args):
                    marker = os.getenv("ARINOVA_FAKE_SDK_CALLS_MARKER")
                    if marker:
                        def json_safe(value):
                            if isinstance(value, (bytes, bytearray, memoryview)):
                                return {"base64": base64.b64encode(bytes(value)).decode("ascii")}
                            if isinstance(value, list):
                                return [json_safe(item) for item in value]
                            if isinstance(value, tuple):
                                return [json_safe(item) for item in value]
                            if isinstance(value, dict):
                                return {str(key): json_safe(item) for key, item in value.items()}
                            return value
                        with open(marker, "a", encoding="utf-8") as handle:
                            handle.write(json.dumps({
                                "taskId": task_id,
                                "method": method,
                                "args": json_safe(list(args)),
                            }, sort_keys=True) + "\\n")
                    if method == "fetchHistory":
                        if os.getenv("ARINOVA_FAKE_BAD_TASK_FETCH_HISTORY") == "1":
                            return {"messages": "not-a-list", "hasMore": "false"}
                        if os.getenv("ARINOVA_FAKE_BAD_TASK_FETCH_HISTORY_METADATA") == "1":
                            return {"messages": [], "hasMore": "false", "nextCursor": 123}
                        if os.getenv("ARINOVA_FAKE_BAD_TASK_FETCH_HISTORY_NULL_CURSOR") == "1":
                            return {"messages": [], "hasMore": False, "nextCursor": None}
                        if os.getenv("ARINOVA_FAKE_BAD_TASK_FETCH_HISTORY_ENTRY") == "1":
                            return {
                                "messages": [
                                    {
                                        "id": "task-msg-live",
                                        "conversationId": "conv-task-live",
                                        "seq": "1",
                                        "role": "assistant",
                                        "content": "hello",
                                        "status": "sent",
                                        "createdAt": "now",
                                        "updatedAt": "now",
                                    }
                                ],
                                "hasMore": False,
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_TASK_FETCH_HISTORY_NULL_OPTIONAL") == "1":
                            return {
                                "messages": [
                                    {
                                        "id": "task-msg-live",
                                        "conversationId": "conv-task-live",
                                        "seq": 1,
                                        "role": "assistant",
                                        "content": "hello",
                                        "status": "sent",
                                        "senderAgentId": None,
                                        "createdAt": "now",
                                        "updatedAt": "now",
                                    }
                                ],
                                "hasMore": False,
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_TASK_FETCH_HISTORY_NULL_ATTACHMENTS") == "1":
                            return {
                                "messages": [
                                    {
                                        "id": "task-msg-live",
                                        "conversationId": "conv-task-live",
                                        "seq": 1,
                                        "role": "assistant",
                                        "content": "hello",
                                        "status": "sent",
                                        "createdAt": "now",
                                        "updatedAt": "now",
                                        "attachments": None,
                                    }
                                ],
                                "hasMore": False,
                            }
                        return {
                            "messages": [],
                            "hasMore": False,
                            "nextCursor": "task-next-live",
                        }
                    if method == "uploadFile":
                        if os.getenv("ARINOVA_FAKE_BAD_TASK_UPLOAD_FILE") == "1":
                            return {"url": "https://files.example/task-live-smoke.txt"}
                        if os.getenv("ARINOVA_FAKE_BAD_TASK_UPLOAD_FILE_SIZE") == "1":
                            return {
                                "url": "https://files.example/task-live-smoke.txt",
                                "fileName": args[1],
                                "fileType": args[2],
                                "fileSize": "1",
                            }
                        if os.getenv("ARINOVA_FAKE_BAD_TASK_UPLOAD_FILE_TYPE") == "1":
                            return {
                                "url": "https://files.example/task-live-smoke.txt",
                                "fileName": args[1],
                                "fileType": "application/octet-stream",
                                "fileSize": len(args[0]),
                            }
                        return {
                            "url": "https://files.example/task-live-smoke.txt",
                            "fileName": args[1],
                            "fileType": args[2],
                            "fileSize": len(args[0]),
                        }
                    if method != "callAction":
                        raise RuntimeError(f"unexpected task SDK method: {method}")
                    if os.getenv("ARINOVA_FAKE_REJECT_TASK_CALL_ACTION") == "1":
                        raise RuntimeError("fake task callAction rejected")
                    if os.getenv("ARINOVA_FAKE_MISMATCH_TASK_CALL_ACTION_CALL_ID") == "1":
                        return {
                            "callId": "other-task-call",
                            "action": args[0],
                            "status": "success",
                            "result": {"taskId": task_id, "dryRun": args[2].get("dryRun")},
                            "error": None,
                            "confirmation": None,
                            "dryRun": args[2].get("dryRun"),
                        }
                    if os.getenv("ARINOVA_FAKE_MISMATCH_TASK_CALL_ACTION_DRY_RUN") == "1":
                        return {
                            "callId": args[2].get("callId", "fake-task-call"),
                            "action": args[0],
                            "status": "success",
                            "result": {"taskId": task_id, "dryRun": args[2].get("dryRun")},
                            "error": None,
                            "confirmation": None,
                            "dryRun": not args[2].get("dryRun"),
                        }
                    if os.getenv("ARINOVA_FAKE_INCONSISTENT_TASK_SUCCESS_CALL_ACTION") == "1":
                        return {
                            "callId": args[2].get("callId", "fake-task-call"),
                            "action": args[0],
                            "status": "success",
                            "result": {"taskId": task_id},
                            "error": {"code": "unexpected_error", "message": "unexpected"},
                            "confirmation": None,
                        }
                    if os.getenv("ARINOVA_FAKE_INCONSISTENT_TASK_ERROR_CALL_ACTION") == "1":
                        return {
                            "callId": args[2].get("callId", "fake-task-call"),
                            "action": args[0],
                            "status": "error",
                            "result": None,
                            "error": None,
                            "confirmation": None,
                        }
                    if os.getenv("ARINOVA_FAKE_INCONSISTENT_TASK_CONFIRMATION_CALL_ACTION") == "1":
                        return {
                            "callId": args[2].get("callId", "fake-task-call"),
                            "action": args[0],
                            "status": "requires_confirmation",
                            "result": None,
                            "error": None,
                            "confirmation": None,
                        }
                    if os.getenv("ARINOVA_FAKE_INCONSISTENT_TASK_CANCELLED_CALL_ACTION") == "1":
                        return {
                            "callId": args[2].get("callId", "fake-task-call"),
                            "action": args[0],
                            "status": "cancelled",
                            "result": None,
                            "error": {"code": "cancelled", "message": "cancelled"},
                            "confirmation": None,
                        }
                    if os.getenv("ARINOVA_FAKE_BAD_TASK_CALL_ACTION") == "1":
                        return {"callId": "missing-status", "action": args[0]}
                    if os.getenv("ARINOVA_FAKE_BAD_TASK_CALL_ACTION_OPTIONAL") == "1":
                        return {
                            "callId": args[2].get("callId", "fake-task-call"),
                            "action": args[0],
                            "status": "success",
                            "result": "not-an-object",
                            "error": {"code": "bad", "message": 123},
                            "confirmation": {"confirmationId": "confirm-task", "title": "Confirm"},
                            "traceId": 123,
                            "actionVersion": 1,
                            "dryRun": "true",
                        }
                    if os.getenv("ARINOVA_FAKE_BAD_TASK_CALL_ACTION_NULL_DETAILS") == "1":
                        return {
                            "callId": args[2].get("callId", "fake-task-call"),
                            "action": args[0],
                            "status": "error",
                            "result": None,
                            "error": {
                                "code": "task_live_error",
                                "message": "Task action failed",
                                "details": None,
                            },
                            "confirmation": None,
                        }
                    if os.getenv("ARINOVA_FAKE_BAD_TASK_CALL_ACTION_NULL_DRY_RUN") == "1":
                        return {
                            "callId": args[2].get("callId", "fake-task-call"),
                            "action": args[0],
                            "status": "success",
                            "result": {},
                            "error": None,
                            "confirmation": None,
                            "dryRun": None,
                        }
                    if os.getenv("ARINOVA_FAKE_BAD_TASK_CALL_ACTION_NULL_METADATA") == "1":
                        return {
                            "callId": args[2].get("callId", "fake-task-call"),
                            "action": args[0],
                            "status": "success",
                            "traceId": None,
                            "actionVersion": None,
                        }
                    return {
                        "callId": args[2].get("callId", "fake-task-call"),
                        "action": args[0],
                        "status": "success",
                        "result": {"taskId": task_id, "dryRun": args[2].get("dryRun")},
                        "error": None,
                        "confirmation": None,
                        "dryRun": args[2].get("dryRun"),
                    }

            class Module:
                ArinovaAdapter = FakeArinovaAdapter

                @staticmethod
                def validate_config(config):
                    marker = os.getenv("ARINOVA_FAKE_VALIDATE_CONFIG_MARKER")
                    if marker:
                        with open(marker, "a", encoding="utf-8") as handle:
                            handle.write(json.dumps({
                                "token": config.token,
                                "extra": config.extra,
                            }, sort_keys=True) + "\\n")
                    if os.getenv("ARINOVA_FAKE_VALIDATE_CONFIG_FALSE") == "1":
                        return False
                    return bool(config.enabled and (config.token or config.extra.get("bot_token")) and config.extra.get("server_url"))

            class Loaded:
                enabled = True
                error = None
                module = Module()

            class PluginManager:
                def __init__(self):
                    self._plugins = {}

                def _parse_manifest(self, path, root, source, prefix):
                    return Manifest()

                def _load_plugin(self, manifest):
                    self._plugins[manifest.key] = Loaded()
            """
        ).lstrip()
    )


