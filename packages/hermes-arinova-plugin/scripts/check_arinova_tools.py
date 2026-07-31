#!/usr/bin/env python3
"""Smoke-test Arinova Hermes tool wrappers without a live sidecar."""

from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import arinova_tools
from check_arinova_tools_helpers import (
    FakeAdapter,
    FakeToolContext,
    VOID_AGENT_METHODS,
    assert_success,
    named_payload_for,
    schema_rejects_unknown_fields,
    with_unknown_field,
)


async def main() -> int:
    original_active_adapter = arinova_tools._active_adapter
    fake = FakeAdapter()
    arinova_tools._active_adapter = lambda: fake
    try:
        sample_agent_args = {
            "getAgentId": [],
            "getOnboardingSeed": [],
            "sendMessage": ["conv-all", "hello all"],
            "sendTelemetry": ["tool.all", {"ok": True}],
            "sendHud": [{"summary": "ok"}, "conv-hud-all"],
            "sendTaskUpdate": ["Hermes", {"status": "completed"}],
            "reportToolCall": [
                {
                    "sessionId": "session-all",
                    "turnId": "turn-all",
                    "seqOrder": 1,
                    "toolName": "all-tools",
                    "input": {},
                    "success": True,
                }
            ],
            "callAction": ["arinova.all", {}, {"dryRun": True}],
            "uploadFile": ["conv-all", {"base64": "SGk="}, "all.txt", "text/plain"],
            "listNotes": ["conv-all", {"limit": 1}],
            "createNote": ["conv-all", {"title": "Note"}],
            "updateNote": ["conv-all", "note-all", {"title": "Note 2"}],
            "deleteNote": ["conv-all", "note-all"],
            "listBoards": [],
            "createCard": [{"title": "Card"}],
            "updateCard": ["card-all", {"title": "Card 2"}],
            "createBoard": [{"name": "Board"}],
            "updateBoard": ["board-all", {"name": "Board 2"}],
            "archiveBoard": ["board-all"],
            "listColumns": ["board-all"],
            "createColumn": ["board-all", {"name": "Todo"}],
            "updateColumn": ["col-all", {"name": "Doing"}],
            "deleteColumn": ["col-all"],
            "reorderColumns": ["board-all", ["col-1", "col-2"]],
            "listCards": [{"search": "Card"}],
            "completeCard": ["card-all"],
            "listArchivedCards": ["board-all", {"page": 1}],
            "addCardCommit": ["card-all", {"commitHash": "abc"}],
            "listCardCommits": ["card-all"],
            "linkCardNote": ["card-all", "note-all"],
            "unlinkCardNote": ["card-all", "note-all"],
            "listCardNotes": ["card-all"],
            "listLabels": ["board-all"],
            "createLabel": ["board-all", {"name": "Bug"}],
            "updateLabel": ["label-all", {"name": "Feature"}],
            "deleteLabel": ["label-all"],
            "addCardLabel": ["card-all", "label-all"],
            "removeCardLabel": ["card-all", "label-all"],
            "queryMemory": [{"query": "all"}],
            "fetchSkillPrompt": ["memo"],
            "shareNote": ["conv-all", "note-all"],
        }
        assert set(sample_agent_args) == set(arinova_tools.AGENT_METHODS)
        assert set(arinova_tools.MODEL_AGENT_METHODS) == set(arinova_tools.AGENT_METHODS) - {"callAction"}
        assert VOID_AGENT_METHODS.issubset(set(arinova_tools.AGENT_METHODS))
        assert VOID_AGENT_METHODS == set(arinova_tools.VOID_AGENT_METHODS)

        tool_ctx = FakeToolContext()
        arinova_tools.register_tools(tool_ctx)
        expected_registered_tools = ["arinova_sdk_call", "arinova_task_call"]
        expected_registered_tools.extend(
            f"arinova_{arinova_tools._snake(method)}" for method in arinova_tools.MODEL_AGENT_METHODS
        )
        expected_registered_tools.extend(
            f"arinova_task_{arinova_tools._snake(method)}" for method in arinova_tools.TASK_METHODS
        )
        expected_registered_schemas = {
            "arinova_sdk_call": arinova_tools._generic_agent_schema(),
            "arinova_task_call": arinova_tools._generic_task_schema(),
        }
        expected_registered_schemas.update(
            {
                f"arinova_{arinova_tools._snake(method)}": arinova_tools._method_schema(
                    f"arinova_{arinova_tools._snake(method)}",
                    method,
                )
                for method in arinova_tools.MODEL_AGENT_METHODS
            }
        )
        expected_registered_schemas.update(
            {
                f"arinova_task_{arinova_tools._snake(method)}": arinova_tools._method_schema(
                    f"arinova_task_{arinova_tools._snake(method)}",
                    method,
                    task_scoped=True,
                )
                for method in arinova_tools.TASK_METHODS
            }
        )
        registered_by_name = {tool["name"]: tool for tool in tool_ctx.tools}
        assert [tool["name"] for tool in tool_ctx.tools] == expected_registered_tools
        assert set(registered_by_name) == set(expected_registered_tools)
        assert set(expected_registered_schemas) == set(expected_registered_tools)
        for name, tool in registered_by_name.items():
            assert tool["toolset"] == arinova_tools.TOOLSET, name
            assert tool["check_fn"] is arinova_tools.check_arinova_available, name
            assert tool["is_async"] is True, name
            assert tool["emoji"] == "A", name
            assert tool["schema"]["name"] == name, name
            assert tool["schema"] == expected_registered_schemas[name], name
            assert callable(tool["handler"]), name

        assert "arinova_call_action" not in registered_by_name
        for method in arinova_tools.MODEL_AGENT_METHODS:
            sample_args = sample_agent_args[method]
            fake.return_void_agent_results = method in VOID_AGENT_METHODS
            try:
                named_result = assert_success(await arinova_tools._agent_handler(method)({"args": list(sample_args)}))
                generic_result = assert_success(
                    await arinova_tools._handle_sdk_call({"method": method, "args": list(sample_args)})
                )
            finally:
                fake.return_void_agent_results = False
            assert named_result["method"] == method
            assert generic_result["method"] == method
            if method == "getAgentId":
                assert named_result["result"] == "agent-1"
                assert generic_result["result"] == "agent-1"
            elif method == "getOnboardingSeed":
                assert named_result["result"]["kind"] == "first_touch_opening"
                assert named_result["result"]["agentId"] == "agent-1"
                assert named_result["result"]["action"] == "open"
                assert generic_result["result"]["kind"] == "first_touch_opening"
                assert generic_result["result"]["agentId"] == "agent-1"
                assert generic_result["result"]["action"] == "open"
            elif method in VOID_AGENT_METHODS:
                assert named_result["result"] is None, method
                assert generic_result["result"] is None, method
            else:
                assert named_result["result"]["args"] == sample_args, method
                assert generic_result["result"]["args"] == sample_args, method

        model_call_count = len(fake.calls)
        global_action_result = json.loads(
            await arinova_tools._handle_sdk_call(
                {"method": "callAction", "action": "arinova.all", "action_args": {}}
            )
        )
        assert global_action_result == {
            "success": False,
            "error": "Unsupported Arinova SDK method: callAction",
        }
        assert len(fake.calls) == model_call_count

        direct_agent_call_count = len(fake.calls)
        direct_bad_agent_args = await arinova_tools.call_agent_method("sendMessage", ["conv-direct-only"])
        assert direct_bad_agent_args == {
            "success": False,
            "method": "sendMessage",
            "error": "args for sendMessage requires at least 2 item(s)",
        }
        assert len(fake.calls) == direct_agent_call_count
        direct_bad_agent_shape = await arinova_tools.call_agent_method("createCard", ["not-an-object"])
        assert direct_bad_agent_shape == {
            "success": False,
            "method": "createCard",
            "error": "args[0] must be an object",
        }
        assert len(fake.calls) == direct_agent_call_count

        void_method_args = {
            "sendMessage": ["conv-void", "hello void"],
            "sendTelemetry": ["void.event", {"ok": True}],
            "sendHud": [{"status": "void"}],
            "sendTaskUpdate": ["Hermes", {"status": "completed"}],
            "reportToolCall": [
                {
                    "sessionId": "session-void",
                    "turnId": "turn-void",
                    "seqOrder": 0,
                    "toolName": "arinova_sdk_call",
                    "input": {},
                    "success": True,
                }
            ],
            "deleteNote": ["conv-void", "note-void"],
            "archiveBoard": ["board-void"],
            "deleteColumn": ["col-void"],
            "reorderColumns": ["board-void", ["col-a", "col-b"]],
            "linkCardNote": ["card-void", "note-void"],
            "unlinkCardNote": ["card-void", "note-void"],
            "deleteLabel": ["label-void"],
            "addCardLabel": ["card-void", "label-void"],
            "removeCardLabel": ["card-void", "label-void"],
        }
        assert set(void_method_args) == VOID_AGENT_METHODS
        for method, sample_args in void_method_args.items():
            named_non_null_void = json.loads(await arinova_tools._agent_handler(method)({"args": list(sample_args)}))
            generic_non_null_void = json.loads(
                await arinova_tools._handle_sdk_call({"method": method, "args": list(sample_args)})
            )
            for result in (named_non_null_void, generic_non_null_void):
                assert result["success"] is False, (method, result)
                assert result["method"] == method, result
                assert f"Arinova SDK method {method} returned non-null void result" in result["error"], result

        for method, specs in arinova_tools.ARG_SPECS.items():
            for index, (name, schema) in enumerate(specs):
                if not schema_rejects_unknown_fields(schema):
                    continue
                sample_args = list(sample_agent_args[method])
                sample_args[index] = with_unknown_field(sample_args[index])
                if method in arinova_tools.MODEL_AGENT_METHODS:
                    strict_positional_unknown = json.loads(
                        await arinova_tools._handle_sdk_call({"method": method, "args": sample_args})
                    )
                    assert strict_positional_unknown["success"] is False, (method, name, strict_positional_unknown)
                    assert "has unsupported field(s): __unknown_field__" in strict_positional_unknown["error"], (
                        method,
                        name,
                        strict_positional_unknown,
                    )
                named_payload = named_payload_for(
                    specs,
                    sample_agent_args[method],
                    index,
                    arinova_tools.REQUIRED_ARG_COUNTS.get(method, 0),
                )
                named_payload[name] = with_unknown_field(sample_agent_args[method][index])
                strict_named_unknown = json.loads(await arinova_tools._agent_handler(method)(named_payload))
                assert strict_named_unknown["success"] is False, (method, name, strict_named_unknown)
                assert "has unsupported field(s): __unknown_field__" in strict_named_unknown["error"], (
                    method,
                    name,
                    strict_named_unknown,
                )

        fake.return_void_agent_results = True
        try:
            for method, sample_args in void_method_args.items():
                named_void = assert_success(await arinova_tools._agent_handler(method)({"args": list(sample_args)}))
                generic_void = assert_success(
                    await arinova_tools._handle_sdk_call({"method": method, "args": list(sample_args)})
                )
                assert named_void["method"] == method
                assert generic_void["method"] == method
                assert named_void["result"] is None, method
                assert generic_void["result"] is None, method
        finally:
            fake.return_void_agent_results = False

        sample_task_args = {
            "uploadFile": [{"base64": "IQ=="}, "task-all.txt", "text/plain"],
            "fetchHistory": [{"limit": 1}],
            "callAction": ["arinova.task.all", {}, {"dryRun": True}],
        }
        assert set(sample_task_args) == set(arinova_tools.TASK_METHODS)
        for method in arinova_tools.TASK_METHODS:
            sample_args = sample_task_args[method]
            named_result = assert_success(
                await arinova_tools._task_handler(method)({"task_id": "task-all", "args": list(sample_args)})
            )
            generic_result = assert_success(
                await arinova_tools._handle_task_call(
                    {"task_id": "task-all", "method": method, "args": list(sample_args)}
                )
            )
            assert named_result["task_id"] == "task-all"
            assert generic_result["task_id"] == "task-all"
            assert named_result["method"] == method
            assert generic_result["method"] == method
            assert named_result["result"]["args"] == sample_args, method
            assert generic_result["result"]["args"] == sample_args, method

        direct_task_call_count = len(fake.calls)
        direct_bad_task_args = await arinova_tools.call_task_method("task-1", "callAction", ["task.action"])
        assert direct_bad_task_args == {
            "success": False,
            "task_id": "task-1",
            "method": "callAction",
            "error": "args for callAction requires at least 2 item(s)",
        }
        assert len(fake.calls) == direct_task_call_count
        direct_bad_task_shape = await arinova_tools.call_task_method("task-1", "fetchHistory", ["not-an-object"])
        assert direct_bad_task_shape == {
            "success": False,
            "task_id": "task-1",
            "method": "fetchHistory",
            "error": "args[0] must be an object",
        }
        assert len(fake.calls) == direct_task_call_count

        for method, specs in arinova_tools.TASK_ARG_SPECS.items():
            for index, (name, schema) in enumerate(specs):
                if not schema_rejects_unknown_fields(schema):
                    continue
                sample_args = list(sample_task_args[method])
                sample_args[index] = with_unknown_field(sample_args[index])
                strict_task_positional_unknown = json.loads(
                    await arinova_tools._handle_task_call(
                        {"task_id": "task-unknown", "method": method, "args": sample_args}
                    )
                )
                assert strict_task_positional_unknown["success"] is False, (
                    method,
                    name,
                    strict_task_positional_unknown,
                )
                assert "has unsupported field(s): __unknown_field__" in strict_task_positional_unknown["error"], (
                    method,
                    name,
                    strict_task_positional_unknown,
                )
                task_named_payload = {"task_id": "task-unknown"} | named_payload_for(
                    specs,
                    sample_task_args[method],
                    index,
                    arinova_tools.TASK_REQUIRED_ARG_COUNTS.get(method, 0),
                )
                task_named_payload[name] = with_unknown_field(sample_task_args[method][index])
                strict_task_named_unknown = json.loads(await arinova_tools._task_handler(method)(task_named_payload))
                assert strict_task_named_unknown["success"] is False, (
                    method,
                    name,
                    strict_task_named_unknown,
                )
                assert "has unsupported field(s): __unknown_field__" in strict_task_named_unknown["error"], (
                    method,
                    name,
                    strict_task_named_unknown,
                )

        query = assert_success(await arinova_tools._agent_handler("queryMemory")({"args": [{"query": "q"}]}))
        assert query["method"] == "queryMemory"

        with tempfile.TemporaryDirectory() as tmpdir:
            upload_path = Path(tmpdir) / "upload.txt"
            upload_path.write_text("Hi", encoding="utf-8")

            disabled_path_upload = json.loads(
                await arinova_tools._agent_handler("uploadFile")(
                    {
                        "conversation_id": "conv-path",
                        "file": {"path": "upload.txt"},
                        "file_name": "path.txt",
                    }
                )
            )
            assert disabled_path_upload["success"] is False
            assert disabled_path_upload["error"] == "local path uploads are disabled"

            old_allow_uploads = os.environ.get("ARINOVA_ALLOW_LOCAL_UPLOADS")
            old_upload_root = os.environ.get("ARINOVA_UPLOAD_ROOT")
            os.environ["ARINOVA_ALLOW_LOCAL_UPLOADS"] = "true"
            os.environ["ARINOVA_UPLOAD_ROOT"] = tmpdir
            try:
                path_upload_global = assert_success(
                    await arinova_tools._agent_handler("uploadFile")(
                        {
                            "conversation_id": "conv-path",
                            "file": {"path": "upload.txt"},
                            "file_name": "path.txt",
                        }
                    )
                )
                assert path_upload_global["result"]["args"] == ["conv-path", "Hi", "path.txt"]

                path_upload_task = assert_success(
                    await arinova_tools._handle_task_call(
                        {
                            "task_id": "task-path",
                            "method": "uploadFile",
                            "file": {"path": "upload.txt"},
                            "file_name": "task-path.txt",
                            "file_type": "text/plain",
                        }
                    )
                )
                assert path_upload_task["result"]["args"] == ["Hi", "task-path.txt", "text/plain"]

                for unsafe_path in (str(upload_path), "../upload.txt"):
                    unsafe_upload = json.loads(
                        await arinova_tools._agent_handler("uploadFile")(
                            {
                                "conversation_id": "conv-path",
                                "file": {"path": unsafe_path},
                                "file_name": "unsafe.txt",
                            }
                        )
                    )
                    assert unsafe_upload["success"] is False, unsafe_upload

                with tempfile.TemporaryDirectory() as outside_dir:
                    outside_file = Path(outside_dir) / "secret.txt"
                    outside_file.write_text("secret", encoding="utf-8")
                    (Path(tmpdir) / "escape.txt").symlink_to(outside_file)
                    symlink_upload = json.loads(
                        await arinova_tools._agent_handler("uploadFile")(
                            {
                                "conversation_id": "conv-path",
                                "file": {"path": "escape.txt"},
                                "file_name": "escape.txt",
                            }
                        )
                    )
                    assert symlink_upload["success"] is False, symlink_upload
                    assert "escapes ARINOVA_UPLOAD_ROOT" in symlink_upload["error"]

                old_upload_max = os.environ.get("ARINOVA_UPLOAD_MAX_BYTES")
                os.environ["ARINOVA_UPLOAD_MAX_BYTES"] = "1"
                try:
                    oversized_upload = json.loads(
                        await arinova_tools._agent_handler("uploadFile")(
                            {
                                "conversation_id": "conv-path",
                                "file": {"path": "upload.txt"},
                                "file_name": "large.txt",
                            }
                        )
                    )
                    assert oversized_upload["success"] is False, oversized_upload
                    assert "exceeds 1 bytes" in oversized_upload["error"]
                finally:
                    if old_upload_max is None:
                        os.environ.pop("ARINOVA_UPLOAD_MAX_BYTES", None)
                    else:
                        os.environ["ARINOVA_UPLOAD_MAX_BYTES"] = old_upload_max
            finally:
                if old_allow_uploads is None:
                    os.environ.pop("ARINOVA_ALLOW_LOCAL_UPLOADS", None)
                else:
                    os.environ["ARINOVA_ALLOW_LOCAL_UPLOADS"] = old_allow_uploads
                if old_upload_root is None:
                    os.environ.pop("ARINOVA_UPLOAD_ROOT", None)
                else:
                    os.environ["ARINOVA_UPLOAD_ROOT"] = old_upload_root

        generic_agent_props = arinova_tools._generic_agent_schema()["parameters"]["properties"]
        assert arinova_tools._generic_agent_schema()["parameters"]["additionalProperties"] is False
        assert generic_agent_props["method"]["enum"] == list(arinova_tools.MODEL_AGENT_METHODS)
        assert {"task_id", "taskId", "message_id", "messageId"}.isdisjoint(generic_agent_props)
        assert {"conversation_id", "content", "options", "file", "file_name", "file_type"}.issubset(
            generic_agent_props
        )
        assert {"conversationId", "fileName", "fileType"}.issubset(generic_agent_props)
        assert {"action", "action_args", "actionArgs"}.isdisjoint(generic_agent_props)
        expected_upload_schema = arinova_tools.UPLOAD_FILE_SCHEMA
        assert generic_agent_props["file"] == expected_upload_schema
        assert generic_agent_props["data"] == {
            "type": "object",
            "description": "Named `data` parameter for the selected SDK method.",
        }
        assert generic_agent_props["body"] == {
            "type": "object",
            "description": "Named `body` parameter for the selected SDK method.",
        }
        assert generic_agent_props["options"] == {
            "type": "object",
            "description": "Named `options` parameter for the selected SDK method.",
        }
        generic_task_props = arinova_tools._generic_task_schema()["parameters"]["properties"]
        assert arinova_tools._generic_task_schema()["parameters"]["additionalProperties"] is False
        assert generic_task_props["method"]["enum"] == list(arinova_tools.TASK_METHODS)
        assert {"task_id", "options", "file", "file_name", "file_type", "action", "action_args"}.issubset(
            generic_task_props
        )
        assert {"taskId", "fileName", "fileType", "actionArgs"}.issubset(generic_task_props)
        assert generic_task_props["file"] == expected_upload_schema
        assert generic_task_props["options"] == {
            "type": "object",
            "description": "Named `options` parameter for the selected SDK method.",
        }
        upload_schema = arinova_tools._method_schema("arinova_upload_file", "uploadFile")
        assert upload_schema["parameters"]["properties"]["file"] == expected_upload_schema
        task_upload_schema = arinova_tools._method_schema(
            "arinova_task_upload_file",
            "uploadFile",
            task_scoped=True,
        )
        assert task_upload_schema["parameters"]["properties"]["file"] == expected_upload_schema
        for method, specs in arinova_tools.ARG_SPECS.items():
            schema = arinova_tools._method_schema(f"arinova_{arinova_tools._snake(method)}", method)
            assert schema["parameters"]["additionalProperties"] is False
            props = schema["parameters"]["properties"]
            expected_props = {"args"} | {name for name, _schema in specs}
            expected_alias_props = {
                alias
                for name, _schema in specs
                for alias in arinova_tools._aliases_for(name)
            }
            assert expected_props.issubset(props), f"{method} schema missing {expected_props - set(props)}"
            assert expected_alias_props.issubset(props), (
                f"{method} schema missing aliases {expected_alias_props - set(props)}"
            )
            assert props["args"]["minItems"] == arinova_tools.REQUIRED_ARG_COUNTS.get(method, 0), method
            assert props["args"]["maxItems"] == len(specs), method
        for method, specs in arinova_tools.TASK_ARG_SPECS.items():
            schema = arinova_tools._method_schema(
                f"arinova_task_{arinova_tools._snake(method)}",
                method,
                task_scoped=True,
            )
            assert schema["parameters"]["additionalProperties"] is False
            props = schema["parameters"]["properties"]
            expected_props = {"args", "task_id"} | {name for name, _schema in specs}
            expected_alias_props = {
                "taskId",
                *(
                    alias
                    for name, _schema in specs
                    for alias in arinova_tools._aliases_for(name)
                ),
            }
            assert expected_props.issubset(props), f"task {method} schema missing {expected_props - set(props)}"
            assert expected_alias_props.issubset(props), (
                f"task {method} schema missing aliases {expected_alias_props - set(props)}"
            )
            assert props["args"]["minItems"] == arinova_tools.TASK_REQUIRED_ARG_COUNTS.get(method, 0), method
            assert props["args"]["maxItems"] == len(specs), method

        fake.return_void_agent_results = True

        named_message = assert_success(
            await arinova_tools._agent_handler("sendMessage")(
                {"conversation_id": "conv-1", "content": "hello named"}
            )
        )
        assert named_message["result"] is None
        named_message_empty_content = assert_success(
            await arinova_tools._agent_handler("sendMessage")({"conversation_id": "conv-empty", "content": ""})
        )
        assert named_message_empty_content["result"] is None

        named_message_with_empty_args = json.loads(
            await arinova_tools._agent_handler("sendMessage")(
                {"args": [], "conversation_id": "conv-1", "content": "hello named fallback"}
            )
        )
        assert named_message_with_empty_args == {
            "success": False,
            "method": "sendMessage",
            "error": "args cannot be combined with named arguments: conversation_id, content",
        }

        named_memory = assert_success(
            await arinova_tools._agent_handler("queryMemory")({"options": {"query": "named", "limit": 3}})
        )
        assert named_memory["result"]["args"] == [{"query": "named", "limit": 3}]
        named_skill_prompt = assert_success(
            await arinova_tools._agent_handler("fetchSkillPrompt")({"skill_slug": "memo"})
        )
        assert named_skill_prompt["result"]["args"] == ["memo"]
        named_share_note = assert_success(
            await arinova_tools._agent_handler("shareNote")(
                {"conversation_id": "conv-1", "note_id": "note-1"}
            )
        )
        assert named_share_note["result"]["args"] == ["conv-1", "note-1"]
        query_schema = arinova_tools._method_schema("arinova_query_memory", "queryMemory")
        query_options_schema = query_schema["parameters"]["properties"]["options"]
        assert query_options_schema["required"] == ["query"]
        assert query_options_schema["additionalProperties"] is False

        report_schema = arinova_tools._method_schema("arinova_report_tool_call", "reportToolCall")
        report_payload_schema = report_schema["parameters"]["properties"]["report"]
        assert report_payload_schema["required"] == [
            "sessionId",
            "turnId",
            "seqOrder",
            "toolName",
            "input",
            "success",
        ]
        assert report_payload_schema["additionalProperties"] is False
        assert {"output", "durationMs", "error", "messageId"}.issubset(report_payload_schema["properties"])

        report = {
            "sessionId": "session-1",
            "turnId": "turn-1",
            "seqOrder": 0,
            "toolName": "bash",
            "input": {"cmd": "true"},
            "output": ["ok"],
            "durationMs": 12,
            "success": True,
            "messageId": "msg-1",
        }
        reported = assert_success(await arinova_tools._agent_handler("reportToolCall")({"report": report}))
        assert reported["result"] is None
        trimmed_report_identity_fields = assert_success(
            await arinova_tools._agent_handler("reportToolCall")(
                {
                    "report": {
                        "sessionId": "  session-report-trim  ",
                        "turnId": " turn-report-trim ",
                        "seqOrder": 2,
                        "toolName": " keep tool name padding ",
                        "input": {},
                        "success": True,
                        "messageId": " msg-report-trim ",
                    }
                }
            )
        )
        assert trimmed_report_identity_fields["result"] is None
        assert fake.calls[-1] == (
            "agent",
            "reportToolCall",
            (
                {
                    "sessionId": "session-report-trim",
                    "turnId": "turn-report-trim",
                    "seqOrder": 2,
                    "toolName": " keep tool name padding ",
                    "input": {},
                    "success": True,
                    "messageId": "msg-report-trim",
                },
            ),
        )
        failed_report = {
            "sessionId": "session-1",
            "turnId": "turn-1",
            "seqOrder": 1,
            "toolName": "arinova_sdk_call",
            "input": {"method": "queryMemory"},
            "durationMs": 7,
            "success": False,
            "error": "tool failed",
            "messageId": "msg-2",
        }
        failed_reported = assert_success(
            await arinova_tools._agent_handler("reportToolCall")({"report": failed_report})
        )
        assert failed_reported["result"] is None

        bad_report_missing_required = json.loads(
            await arinova_tools._agent_handler("reportToolCall")({"report": {"sessionId": "session-1"}})
        )
        assert bad_report_missing_required == {
            "success": False,
            "method": "reportToolCall",
            "error": "report.turnId is required",
        }
        bad_report_unknown_field = json.loads(
            await arinova_tools._agent_handler("reportToolCall")({**{"report": report | {"extra": True}}})
        )
        assert bad_report_unknown_field == {
            "success": False,
            "method": "reportToolCall",
            "error": "report has unsupported field(s): extra",
        }
        bad_report_input_type = json.loads(
            await arinova_tools._agent_handler("reportToolCall")({"report": report | {"input": "raw"}})
        )
        assert bad_report_input_type == {
            "success": False,
            "method": "reportToolCall",
            "error": "report.input must be an object",
        }
        bad_report_success_type = json.loads(
            await arinova_tools._agent_handler("reportToolCall")({"report": report | {"success": "yes"}})
        )
        assert bad_report_success_type == {
            "success": False,
            "method": "reportToolCall",
            "error": "report.success must be a boolean",
        }
        bad_report_seq_order_type = json.loads(
            await arinova_tools._agent_handler("reportToolCall")({"report": report | {"seqOrder": True}})
        )
        assert bad_report_seq_order_type == {
            "success": False,
            "method": "reportToolCall",
            "error": "report.seqOrder must be a number",
        }
        bad_report_session_id_type = json.loads(
            await arinova_tools._agent_handler("reportToolCall")({"report": report | {"sessionId": 123}})
        )
        assert bad_report_session_id_type == {
            "success": False,
            "method": "reportToolCall",
            "error": "report.sessionId must be a string",
        }
        bad_report_tool_name_type = json.loads(
            await arinova_tools._agent_handler("reportToolCall")({"report": report | {"toolName": 123}})
        )
        assert bad_report_tool_name_type == {
            "success": False,
            "method": "reportToolCall",
            "error": "report.toolName must be a string",
        }
        bad_report_duration_type = json.loads(
            await arinova_tools._agent_handler("reportToolCall")({"report": report | {"durationMs": "slow"}})
        )
        assert bad_report_duration_type == {
            "success": False,
            "method": "reportToolCall",
            "error": "report.durationMs must be a number",
        }
        bad_report_duration_infinite = json.loads(
            await arinova_tools._agent_handler("reportToolCall")({"report": report | {"durationMs": float("inf")}})
        )
        assert bad_report_duration_infinite == {
            "success": False,
            "method": "reportToolCall",
            "error": "report.durationMs must be a number",
        }
        bad_report_output_nonfinite = json.loads(
            await arinova_tools._agent_handler("reportToolCall")(
                {"report": report | {"output": {"value": float("nan")}}}
            )
        )
        assert bad_report_output_nonfinite == {
            "success": False,
            "method": "reportToolCall",
            "error": "report.output.value contains a non-finite number",
        }
        bad_report_message_id_type = json.loads(
            await arinova_tools._agent_handler("reportToolCall")({"report": report | {"messageId": 123}})
        )
        assert bad_report_message_id_type == {
            "success": False,
            "method": "reportToolCall",
            "error": "report.messageId must be a string",
        }

        telemetry = assert_success(
            await arinova_tools._agent_handler("sendTelemetry")({"event": "tool.test", "data": {}})
        )
        assert telemetry["result"] is None

        telemetry_with_data = assert_success(
            await arinova_tools._agent_handler("sendTelemetry")({"event": "tool.test", "data": {"ok": True}})
        )
        assert telemetry_with_data["result"] is None
        bad_telemetry_missing_data = json.loads(
            await arinova_tools._agent_handler("sendTelemetry")({"event": "tool.test"})
        )
        assert bad_telemetry_missing_data == {
            "success": False,
            "method": "sendTelemetry",
            "error": "data is required when using later named arguments",
        }
        bad_telemetry_event_type = json.loads(
            await arinova_tools._agent_handler("sendTelemetry")({"event": 123, "data": {}})
        )
        assert bad_telemetry_event_type == {
            "success": False,
            "method": "sendTelemetry",
            "error": "event must be a string",
        }

        task_update_schema = arinova_tools._method_schema("arinova_send_task_update", "sendTaskUpdate")
        task_update_data_schema = task_update_schema["parameters"]["properties"]["data"]
        assert "oneOf" not in generic_agent_props["data"]
        assert [branch["required"] for branch in task_update_data_schema["oneOf"]] == [
            ["status", "task"],
            ["status"],
        ]
        started_update = assert_success(
            await arinova_tools._agent_handler("sendTaskUpdate")(
                {"agent_name": "Hermes", "data": {"status": "started", "task": "smoke"}}
            )
        )
        assert started_update["result"] is None
        completed_update = assert_success(
            await arinova_tools._agent_handler("sendTaskUpdate")(
                {
                    "agent_name": "Hermes",
                    "data": {"status": "completed", "durationMs": 42, "costUsd": 0.01, "numTurns": 2},
                }
            )
        )
        assert completed_update["result"] is None
        bad_task_update_missing_task = json.loads(
            await arinova_tools._agent_handler("sendTaskUpdate")(
                {"agent_name": "Hermes", "data": {"status": "started"}}
            )
        )
        assert bad_task_update_missing_task == {
            "success": False,
            "method": "sendTaskUpdate",
            "error": "data.task is required",
        }
        bad_task_update_status = json.loads(
            await arinova_tools._agent_handler("sendTaskUpdate")(
                {"agent_name": "Hermes", "data": {"status": "paused"}}
            )
        )
        assert bad_task_update_status == {
            "success": False,
            "method": "sendTaskUpdate",
            "error": "data.status must be one of: started, completed",
        }
        bad_task_update_extra = json.loads(
            await arinova_tools._agent_handler("sendTaskUpdate")(
                {"agent_name": "Hermes", "data": {"status": "completed", "task": "extra"}}
            )
        )
        assert bad_task_update_extra == {
            "success": False,
            "method": "sendTaskUpdate",
            "error": "data has unsupported field(s): task",
        }
        bad_task_update_duration_type = json.loads(
            await arinova_tools._agent_handler("sendTaskUpdate")(
                {"agent_name": "Hermes", "data": {"status": "completed", "durationMs": "slow"}}
            )
        )
        assert bad_task_update_duration_type == {
            "success": False,
            "method": "sendTaskUpdate",
            "error": "data.durationMs must be a number",
        }
        bad_task_update_cost_type = json.loads(
            await arinova_tools._agent_handler("sendTaskUpdate")(
                {"agent_name": "Hermes", "data": {"status": "completed", "costUsd": "free"}}
            )
        )
        assert bad_task_update_cost_type == {
            "success": False,
            "method": "sendTaskUpdate",
            "error": "data.costUsd must be a number",
        }
        bad_task_update_turns_type = json.loads(
            await arinova_tools._agent_handler("sendTaskUpdate")(
                {"agent_name": "Hermes", "data": {"status": "completed", "numTurns": "two"}}
            )
        )
        assert bad_task_update_turns_type == {
            "success": False,
            "method": "sendTaskUpdate",
            "error": "data.numTurns must be a number",
        }
        bad_task_update_agent_name_type = json.loads(
            await arinova_tools._agent_handler("sendTaskUpdate")(
                {"agent_name": 123, "data": {"status": "completed"}}
            )
        )
        assert bad_task_update_agent_name_type == {
            "success": False,
            "method": "sendTaskUpdate",
            "error": "agent_name must be a string",
        }

        hud = assert_success(await arinova_tools._agent_handler("sendHud")({"data": {}, "conversation_id": "conv-hud"}))
        assert hud["result"] is None
        global_hud = assert_success(await arinova_tools._agent_handler("sendHud")({"data": {"status": "global"}}))
        assert global_hud["result"] is None

        generic_named_message = assert_success(
            await arinova_tools._handle_sdk_call(
                {"method": "sendMessage", "conversation_id": "conv-generic", "content": "hello generic"}
            )
        )
        assert generic_named_message["result"] is None
        generic_trimmed_method_message = assert_success(
            await arinova_tools._handle_sdk_call(
                {"method": "  sendMessage  ", "conversation_id": "conv-generic-trim", "content": "hello trimmed"}
            )
        )
        assert generic_trimmed_method_message["method"] == "sendMessage"
        assert fake.calls[-1] == ("agent", "sendMessage", ("conv-generic-trim", "hello trimmed"))
        generic_trimmed_named_message_arg = assert_success(
            await arinova_tools._handle_sdk_call(
                {
                    "method": "sendMessage",
                    "conversation_id": "  conv-generic-trim-arg  ",
                    "content": " hello id trim ",
                }
            )
        )
        assert generic_trimmed_named_message_arg["result"] is None
        assert fake.calls[-1] == ("agent", "sendMessage", ("conv-generic-trim-arg", " hello id trim "))
        generic_trimmed_positional_message_arg = assert_success(
            await arinova_tools._handle_sdk_call(
                {"method": "sendMessage", "args": ["  conv-generic-pos-trim  ", " hello positional id trim "]}
            )
        )
        assert generic_trimmed_positional_message_arg["result"] is None
        assert fake.calls[-1] == (
            "agent",
            "sendMessage",
            ("conv-generic-pos-trim", " hello positional id trim "),
        )
        generic_camel_message = assert_success(
            await arinova_tools._handle_sdk_call(
                {"method": "sendMessage", "conversationId": "conv-camel", "content": "hello camel"}
            )
        )
        assert generic_camel_message["result"] is None
        generic_named_message_empty_content = assert_success(
            await arinova_tools._handle_sdk_call(
                {"method": "sendMessage", "conversation_id": "conv-generic-empty", "content": ""}
            )
        )
        assert generic_named_message_empty_content["result"] is None
        fake.return_void_agent_results = False

        generic_named_message_with_empty_args = json.loads(
            await arinova_tools._handle_sdk_call(
                {
                    "method": "sendMessage",
                    "args": [],
                    "conversation_id": "conv-generic",
                    "content": "hello generic fallback",
                }
            )
        )
        assert generic_named_message_with_empty_args == {
            "success": False,
            "method": "sendMessage",
            "error": "args cannot be combined with named arguments: conversation_id, content",
        }
        generic_named_share_note = assert_success(
            await arinova_tools._handle_sdk_call(
                {"method": "shareNote", "conversationId": "conv-camel", "noteId": "note-camel"}
            )
        )
        assert generic_named_share_note["result"]["args"] == ["conv-camel", "note-camel"]
        generic_trimmed_share_note_arg = assert_success(
            await arinova_tools._handle_sdk_call(
                {"method": "shareNote", "conversationId": "  conv-camel-trim  ", "noteId": "  note-camel-trim  "}
            )
        )
        assert generic_trimmed_share_note_arg["result"]["args"] == ["conv-camel-trim", "note-camel-trim"]
        generic_trimmed_positional_share_note_arg = assert_success(
            await arinova_tools._handle_sdk_call(
                {"method": "shareNote", "args": ["  conv-pos-trim  ", "  note-pos-trim  "]}
            )
        )
        assert generic_trimmed_positional_share_note_arg["result"]["args"] == ["conv-pos-trim", "note-pos-trim"]

        agent_id = assert_success(await arinova_tools._agent_handler("getAgentId")({"args": []}))
        assert agent_id["result"] == "agent-1"

        global_optional_omitted = assert_success(await arinova_tools._agent_handler("listCards")({}))
        assert global_optional_omitted["result"]["args"] == []
        generic_optional_omitted = assert_success(await arinova_tools._handle_sdk_call({"method": "listCards"}))
        assert generic_optional_omitted["result"]["args"] == []
        required_plus_optional_omitted = assert_success(
            await arinova_tools._agent_handler("listArchivedCards")({"board_id": "board-1"})
        )
        assert required_plus_optional_omitted["result"]["args"] == ["board-1"]
        generic_required_plus_optional_omitted = assert_success(
            await arinova_tools._handle_sdk_call({"method": "listArchivedCards", "boardId": "board-camel"})
        )
        assert generic_required_plus_optional_omitted["result"]["args"] == ["board-camel"]
        required_plus_optional_present = assert_success(
            await arinova_tools._agent_handler("listArchivedCards")(
                {"board_id": "board-1", "options": {"page": 2, "limit": 10}}
            )
        )
        assert required_plus_optional_present["result"]["args"] == ["board-1", {"page": 2, "limit": 10}]

        task_optional_omitted = assert_success(await arinova_tools._task_handler("fetchHistory")({}))
        assert task_optional_omitted["task_id"] == "task-1"
        assert task_optional_omitted["result"]["args"] == []
        generic_task_optional_omitted = assert_success(
            await arinova_tools._handle_task_call({"method": "fetchHistory", "task_id": "task-named"})
        )
        assert generic_task_optional_omitted["task_id"] == "task-named"
        assert generic_task_optional_omitted["result"]["args"] == []

        task = assert_success(await arinova_tools._task_handler("fetchHistory")({"options": {"limit": 1}}))
        assert task["task_id"] == "task-1"
        assert task["result"]["args"] == [{"limit": 1}]

        task_with_empty_args = json.loads(
            await arinova_tools._task_handler("fetchHistory")({"args": [], "options": {"limit": 2}})
        )
        assert task_with_empty_args == {
            "success": False,
            "method": "fetchHistory",
            "error": "args cannot be combined with named arguments: options",
        }

        generic_named_task = assert_success(
            await arinova_tools._handle_task_call(
                {"method": "fetchHistory", "task_id": "task-named", "options": {"limit": 4}}
            )
        )
        assert generic_named_task["task_id"] == "task-named"
        assert generic_named_task["result"]["args"] == [{"limit": 4}]
        generic_camel_task = assert_success(
            await arinova_tools._handle_task_call(
                {"method": "fetchHistory", "taskId": "task-camel", "options": {"limit": 6}}
            )
        )
        assert generic_camel_task["task_id"] == "task-camel"
        assert generic_camel_task["result"]["args"] == [{"limit": 6}]
        generic_trimmed_task = assert_success(
            await arinova_tools._handle_task_call(
                {"method": "callAction", "task_id": "  task-trimmed  ", "action": "noop", "action_args": {}}
            )
        )
        assert generic_trimmed_task["task_id"] == "task-trimmed"
        assert generic_trimmed_task["result"]["task_id"] == "task-trimmed"
        generic_trimmed_task_method = assert_success(
            await arinova_tools._handle_task_call(
                {"method": "  callAction  ", "taskId": "  task-method-trimmed  ", "action": "noop", "action_args": {}}
            )
        )
        assert generic_trimmed_task_method["method"] == "callAction"
        assert generic_trimmed_task_method["task_id"] == "task-method-trimmed"
        assert generic_trimmed_task_method["result"]["task_id"] == "task-method-trimmed"
        generic_trimmed_task_action_arg = assert_success(
            await arinova_tools._handle_task_call(
                {"method": "callAction", "task_id": "task-named", "action": "  noop  ", "action_args": {}}
            )
        )
        assert generic_trimmed_task_action_arg["result"]["args"][0] == "noop"
        generic_trimmed_task_positional_action_arg = assert_success(
            await arinova_tools._handle_task_call(
                {"method": "callAction", "task_id": "task-positional", "args": ["  noop  ", {}]}
            )
        )
        assert generic_trimmed_task_positional_action_arg["result"]["args"][0] == "noop"
        named_trimmed_task = assert_success(
            await arinova_tools._task_handler("callAction")(
                {"taskId": "  task-camel-trimmed  ", "action": "noop", "action_args": {}}
            )
        )
        assert named_trimmed_task["task_id"] == "task-camel-trimmed"
        assert named_trimmed_task["result"]["task_id"] == "task-camel-trimmed"

        task_call_count = len(fake.calls)
        cron_fetch_history = json.loads(
            await arinova_tools._handle_task_call(
                {"method": "fetchHistory", "taskId": "task-cron", "options": {"limit": 1}}
            )
        )
        assert cron_fetch_history == {
            "success": False,
            "task_id": "task-cron",
            "method": "fetchHistory",
            "error": "fetchHistory is unavailable: this task (taskKind=cron_wakeup) is not bound to a conversation",
        }
        cron_upload_file = json.loads(
            await arinova_tools._task_handler("uploadFile")(
                {"taskId": "task-cron", "file": {"base64": "IQ=="}, "fileName": "cron.txt"}
            )
        )
        assert cron_upload_file == {
            "success": False,
            "task_id": "task-cron",
            "method": "uploadFile",
            "error": "uploadFile is unavailable: this task (taskKind=cron_wakeup) is not bound to a conversation",
        }
        assert len(fake.calls) == task_call_count
        cron_call_action = assert_success(
            await arinova_tools._task_handler("callAction")(
                {
                    "taskId": "task-cron",
                    "action": "arinova.cron",
                    "actionArgs": {"wake": True},
                    "options": {"timeoutMs": 1000},
                }
            )
        )
        assert cron_call_action["task_id"] == "task-cron"
        assert cron_call_action["result"]["args"] == ["arinova.cron", {"wake": True}, {"timeoutMs": 1000}]
        generic_cron_call_action = assert_success(
            await arinova_tools._handle_task_call(
                {
                    "taskId": "task-cron",
                    "method": "callAction",
                    "action": "arinova.cron.generic",
                    "actionArgs": {"wake": True},
                    "options": {"timeoutMs": 1000},
                }
            )
        )
        assert generic_cron_call_action["task_id"] == "task-cron"
        assert generic_cron_call_action["result"]["args"] == [
            "arinova.cron.generic",
            {"wake": True},
            {"timeoutMs": 1000},
        ]

        generic_named_task_with_empty_args = json.loads(
            await arinova_tools._handle_task_call(
                {"method": "fetchHistory", "args": [], "task_id": "task-named", "options": {"limit": 5}}
            )
        )
        assert generic_named_task_with_empty_args == {
            "success": False,
            "method": "fetchHistory",
            "error": "args cannot be combined with named arguments: options",
        }

        bad_agent_args = json.loads(await arinova_tools._handle_sdk_call({"method": "getAgentId", "args": {}}))
        assert bad_agent_args == {"success": False, "method": "getAgentId", "error": "args must be an array when provided"}
        bad_named_agent_args = json.loads(await arinova_tools._agent_handler("getAgentId")({"args": {}}))
        assert bad_named_agent_args == {
            "success": False,
            "method": "getAgentId",
            "error": "args must be an array when provided",
        }
        bad_empty_positional_required = json.loads(
            await arinova_tools._handle_sdk_call({"method": "sendTelemetry", "args": []})
        )
        assert bad_empty_positional_required == {
            "success": False,
            "method": "sendTelemetry",
            "error": "args for sendTelemetry requires at least 2 item(s)",
        }
        bad_missing_generic_required_args = json.loads(
            await arinova_tools._handle_sdk_call({"method": "sendTelemetry"})
        )
        assert bad_missing_generic_required_args == {
            "success": False,
            "method": "sendTelemetry",
            "error": "args for sendTelemetry requires at least 2 item(s)",
        }
        bad_missing_named_required_args = json.loads(
            await arinova_tools._agent_handler("sendTelemetry")({})
        )
        assert bad_missing_named_required_args == {
            "success": False,
            "method": "sendTelemetry",
            "error": "args for sendTelemetry requires at least 2 item(s)",
        }
        bad_short_positional_required = json.loads(
            await arinova_tools._agent_handler("sendTelemetry")({"args": ["tool.test"]})
        )
        assert bad_short_positional_required == {
            "success": False,
            "method": "sendTelemetry",
            "error": "args for sendTelemetry requires at least 2 item(s)",
        }
        bad_extra_no_arg_method = json.loads(
            await arinova_tools._agent_handler("getAgentId")({"args": ["unexpected"]})
        )
        assert bad_extra_no_arg_method == {
            "success": False,
            "method": "getAgentId",
            "error": "args for getAgentId accepts at most 0 item(s)",
        }
        bad_positional_type = json.loads(
            await arinova_tools._handle_sdk_call({"method": "sendTelemetry", "args": ["tool.test", "not-object"]})
        )
        assert bad_positional_type == {
            "success": False,
            "method": "sendTelemetry",
            "error": "args[1] must be an object",
        }
        bad_task_args = json.loads(
            await arinova_tools._handle_task_call({"method": "fetchHistory", "task_id": "task-named", "args": {}})
        )
        assert bad_task_args == {
            "success": False,
            "method": "fetchHistory",
            "error": "args must be an array when provided",
        }
        bad_task_positional_required = json.loads(
            await arinova_tools._task_handler("callAction")({"args": ["arinova.test"]})
        )
        assert bad_task_positional_required == {
            "success": False,
            "method": "callAction",
            "error": "args for callAction requires at least 2 item(s)",
        }
        bad_missing_task_required_args = json.loads(
            await arinova_tools._task_handler("callAction")({})
        )
        assert bad_missing_task_required_args == {
            "success": False,
            "method": "callAction",
            "error": "args for callAction requires at least 2 item(s)",
        }
        bad_task_positional_extra = json.loads(
            await arinova_tools._task_handler("fetchHistory")({"args": [{"limit": 1}, "extra"]})
        )
        assert bad_task_positional_extra == {
            "success": False,
            "method": "fetchHistory",
            "error": "args for fetchHistory accepts at most 1 item(s)",
        }
        bad_named_task_args = json.loads(await arinova_tools._task_handler("fetchHistory")({"args": {}}))
        assert bad_named_task_args == {
            "success": False,
            "method": "fetchHistory",
            "error": "args must be an array when provided",
        }
        missing_method = json.loads(await arinova_tools._handle_sdk_call({"args": []}))
        assert missing_method == {"success": False, "error": "method must be a non-empty string"}
        non_object_generic_agent_payload = json.loads(await arinova_tools._handle_sdk_call([]))
        assert non_object_generic_agent_payload == {
            "success": False,
            "error": "tool payload must be a JSON object",
        }
        non_object_named_agent_payload = json.loads(await arinova_tools._agent_handler("getAgentId")([]))
        assert non_object_named_agent_payload == {
            "success": False,
            "method": "getAgentId",
            "error": "tool payload must be a JSON object",
        }
        non_object_generic_task_payload = json.loads(await arinova_tools._handle_task_call([]))
        assert non_object_generic_task_payload == {
            "success": False,
            "error": "tool payload must be a JSON object",
        }
        non_object_named_task_payload = json.loads(await arinova_tools._task_handler("fetchHistory")([]))
        assert non_object_named_task_payload == {
            "success": False,
            "method": "fetchHistory",
            "error": "tool payload must be a JSON object",
        }
        numeric_method = json.loads(await arinova_tools._handle_task_call({"method": 0, "task_id": "task-named"}))
        assert numeric_method == {"success": False, "error": "method must be a non-empty string"}
        numeric_task_id = json.loads(
            await arinova_tools._handle_task_call({"method": "fetchHistory", "task_id": 123, "args": []})
        )
        assert numeric_task_id == {"success": False, "method": "fetchHistory", "error": "task_id must be a non-empty string"}
        empty_task_id_alias = json.loads(
            await arinova_tools._task_handler("fetchHistory")({"taskId": "   ", "args": []})
        )
        assert empty_task_id_alias == {
            "success": False,
            "method": "fetchHistory",
            "error": "taskId must be a non-empty string",
        }
        bad_named_options = json.loads(
            await arinova_tools._task_handler("fetchHistory")({"options": "limit=1"})
        )
        assert bad_named_options == {
            "success": False,
            "method": "fetchHistory",
            "error": "options must be an object",
        }
        bad_nested_option = json.loads(
            await arinova_tools._task_handler("fetchHistory")({"options": {"limit": 1, "typo": True}})
        )
        assert bad_nested_option == {
            "success": False,
            "method": "fetchHistory",
            "error": "options has unsupported field(s): typo",
        }
        bad_fetch_history_limit_type = json.loads(
            await arinova_tools._task_handler("fetchHistory")({"options": {"limit": "10"}})
        )
        assert bad_fetch_history_limit_type == {
            "success": False,
            "method": "fetchHistory",
            "error": "options.limit must be a number",
        }
        bad_fetch_history_limit_nan = json.loads(
            await arinova_tools._task_handler("fetchHistory")({"options": {"limit": float("nan")}})
        )
        assert bad_fetch_history_limit_nan == {
            "success": False,
            "method": "fetchHistory",
            "error": "options.limit must be a number",
        }
        bad_fetch_history_before_type = json.loads(
            await arinova_tools._task_handler("fetchHistory")({"options": {"before": 10}})
        )
        assert bad_fetch_history_before_type == {
            "success": False,
            "method": "fetchHistory",
            "error": "options.before must be a string",
        }
        bad_fetch_history_after_type = json.loads(
            await arinova_tools._task_handler("fetchHistory")({"options": {"after": 10}})
        )
        assert bad_fetch_history_after_type == {
            "success": False,
            "method": "fetchHistory",
            "error": "options.after must be a string",
        }
        bad_fetch_history_around_type = json.loads(
            await arinova_tools._task_handler("fetchHistory")({"options": {"around": 10}})
        )
        assert bad_fetch_history_around_type == {
            "success": False,
            "method": "fetchHistory",
            "error": "options.around must be a string",
        }
        bad_nested_option_type = json.loads(
            await arinova_tools._agent_handler("listNotes")(
                {"conversation_id": "conv-1", "options": {"tags": ["work", 3]}}
            )
        )
        assert bad_nested_option_type == {
            "success": False,
            "method": "listNotes",
            "error": "options.tags items must be strings",
        }
        bad_list_notes_tags_type = json.loads(
            await arinova_tools._agent_handler("listNotes")(
                {"conversation_id": "conv-1", "options": {"tags": "work"}}
            )
        )
        assert bad_list_notes_tags_type == {
            "success": False,
            "method": "listNotes",
            "error": "options.tags must be an array",
        }
        bad_list_notes_limit_type = json.loads(
            await arinova_tools._agent_handler("listNotes")(
                {"conversation_id": "conv-1", "options": {"limit": "10"}}
            )
        )
        assert bad_list_notes_limit_type == {
            "success": False,
            "method": "listNotes",
            "error": "options.limit must be a number",
        }
        bad_list_notes_before_type = json.loads(
            await arinova_tools._agent_handler("listNotes")(
                {"conversation_id": "conv-1", "options": {"before": 10}}
            )
        )
        assert bad_list_notes_before_type == {
            "success": False,
            "method": "listNotes",
            "error": "options.before must be a string",
        }
        bad_list_notes_offset_type = json.loads(
            await arinova_tools._agent_handler("listNotes")(
                {"conversation_id": "conv-1", "options": {"offset": "20"}}
            )
        )
        assert bad_list_notes_offset_type == {
            "success": False,
            "method": "listNotes",
            "error": "options.offset must be a number",
        }
        bad_list_notes_archived_type = json.loads(
            await arinova_tools._agent_handler("listNotes")(
                {"conversation_id": "conv-1", "options": {"archived": "true"}}
            )
        )
        assert bad_list_notes_archived_type == {
            "success": False,
            "method": "listNotes",
            "error": "options.archived must be a boolean",
        }
        bad_list_cards_limit_type = json.loads(
            await arinova_tools._agent_handler("listCards")({"options": {"limit": "10"}})
        )
        assert bad_list_cards_limit_type == {
            "success": False,
            "method": "listCards",
            "error": "options.limit must be a number",
        }
        bad_list_cards_search_type = json.loads(
            await arinova_tools._agent_handler("listCards")({"options": {"search": 10}})
        )
        assert bad_list_cards_search_type == {
            "success": False,
            "method": "listCards",
            "error": "options.search must be a string",
        }
        bad_list_cards_offset_type = json.loads(
            await arinova_tools._agent_handler("listCards")({"options": {"offset": "20"}})
        )
        assert bad_list_cards_offset_type == {
            "success": False,
            "method": "listCards",
            "error": "options.offset must be a number",
        }
        bad_archived_cards_page_type = json.loads(
            await arinova_tools._agent_handler("listArchivedCards")(
                {"board_id": "board-1", "options": {"page": "1"}}
            )
        )
        assert bad_archived_cards_page_type == {
            "success": False,
            "method": "listArchivedCards",
            "error": "options.page must be a number",
        }
        bad_archived_cards_limit_type = json.loads(
            await arinova_tools._agent_handler("listArchivedCards")(
                {"board_id": "board-1", "options": {"limit": "20"}}
            )
        )
        assert bad_archived_cards_limit_type == {
            "success": False,
            "method": "listArchivedCards",
            "error": "options.limit must be a number",
        }
        bad_query_missing_required = json.loads(
            await arinova_tools._agent_handler("queryMemory")({"options": {"limit": 3}})
        )
        assert bad_query_missing_required == {
            "success": False,
            "method": "queryMemory",
            "error": "options.query is required",
        }
        bad_query_memory_query_type = json.loads(
            await arinova_tools._agent_handler("queryMemory")({"options": {"query": 123}})
        )
        assert bad_query_memory_query_type == {
            "success": False,
            "method": "queryMemory",
            "error": "options.query must be a string",
        }
        bad_query_memory_limit_type = json.loads(
            await arinova_tools._agent_handler("queryMemory")({"options": {"query": "q", "limit": "10"}})
        )
        assert bad_query_memory_limit_type == {
            "success": False,
            "method": "queryMemory",
            "error": "options.limit must be a number",
        }
        bad_query_memory_limit_infinite = json.loads(
            await arinova_tools._agent_handler("queryMemory")({"options": {"query": "q", "limit": float("inf")}})
        )
        assert bad_query_memory_limit_infinite == {
            "success": False,
            "method": "queryMemory",
            "error": "options.limit must be a number",
        }
        empty_update_note = assert_success(
            await arinova_tools._agent_handler("updateNote")(
                {"conversation_id": "conv-1", "note_id": "note-empty", "body": {}}
            )
        )
        assert empty_update_note["result"]["args"] == ["conv-1", "note-empty", {}]
        empty_update_card = assert_success(
            await arinova_tools._agent_handler("updateCard")({"card_id": "card-empty", "body": {}})
        )
        assert empty_update_card["result"]["args"] == ["card-empty", {}]
        empty_update_column = assert_success(
            await arinova_tools._agent_handler("updateColumn")({"column_id": "col-empty", "body": {}})
        )
        assert empty_update_column["result"]["args"] == ["col-empty", {}]
        empty_update_label = assert_success(
            await arinova_tools._agent_handler("updateLabel")({"label_id": "label-empty", "body": {}})
        )
        assert empty_update_label["result"]["args"] == ["label-empty", {}]
        empty_optional_arrays = assert_success(
            await arinova_tools._agent_handler("createNote")(
                {"conversation_id": "conv-1", "body": {"title": "", "tags": []}}
            )
        )
        assert empty_optional_arrays["result"]["args"] == ["conv-1", {"title": "", "tags": []}]
        bad_body_missing_required = json.loads(
            await arinova_tools._agent_handler("createNote")(
                {"conversation_id": "conv-1", "body": {"content": "missing title"}}
            )
        )
        assert bad_body_missing_required == {
            "success": False,
            "method": "createNote",
            "error": "body.title is required",
        }
        bad_create_note_tags_item_type = json.loads(
            await arinova_tools._agent_handler("createNote")(
                {"conversation_id": "conv-1", "body": {"title": "Note", "tags": ["work", 3]}}
            )
        )
        assert bad_create_note_tags_item_type == {
            "success": False,
            "method": "createNote",
            "error": "body.tags items must be strings",
        }
        bad_create_note_tags_type = json.loads(
            await arinova_tools._agent_handler("createNote")(
                {"conversation_id": "conv-1", "body": {"title": "Note", "tags": "work"}}
            )
        )
        assert bad_create_note_tags_type == {
            "success": False,
            "method": "createNote",
            "error": "body.tags must be an array",
        }
        bad_create_note_notebook_id_type = json.loads(
            await arinova_tools._agent_handler("createNote")(
                {"conversation_id": "conv-1", "body": {"title": "Note", "notebookId": 123}}
            )
        )
        assert bad_create_note_notebook_id_type == {
            "success": False,
            "method": "createNote",
            "error": "body.notebookId must be a string",
        }
        bad_create_note_title_type = json.loads(
            await arinova_tools._agent_handler("createNote")(
                {"conversation_id": "conv-1", "body": {"title": 123}}
            )
        )
        assert bad_create_note_title_type == {
            "success": False,
            "method": "createNote",
            "error": "body.title must be a string",
        }
        bad_create_note_content_type = json.loads(
            await arinova_tools._agent_handler("createNote")(
                {"conversation_id": "conv-1", "body": {"title": "Note", "content": 123}}
            )
        )
        assert bad_create_note_content_type == {
            "success": False,
            "method": "createNote",
            "error": "body.content must be a string",
        }
        bad_update_note_title_type = json.loads(
            await arinova_tools._agent_handler("updateNote")(
                {"conversation_id": "conv-1", "note_id": "note-1", "body": {"title": 123}}
            )
        )
        assert bad_update_note_title_type == {
            "success": False,
            "method": "updateNote",
            "error": "body.title must be a string",
        }
        bad_update_note_content_type = json.loads(
            await arinova_tools._agent_handler("updateNote")(
                {"conversation_id": "conv-1", "note_id": "note-1", "body": {"content": 123}}
            )
        )
        assert bad_update_note_content_type == {
            "success": False,
            "method": "updateNote",
            "error": "body.content must be a string",
        }
        bad_update_note_tags_item_type = json.loads(
            await arinova_tools._agent_handler("updateNote")(
                {"conversation_id": "conv-1", "note_id": "note-1", "body": {"tags": ["work", 3]}}
            )
        )
        assert bad_update_note_tags_item_type == {
            "success": False,
            "method": "updateNote",
            "error": "body.tags items must be strings",
        }
        bad_update_note_tags_type = json.loads(
            await arinova_tools._agent_handler("updateNote")(
                {"conversation_id": "conv-1", "note_id": "note-1", "body": {"tags": "work"}}
            )
        )
        assert bad_update_note_tags_type == {
            "success": False,
            "method": "updateNote",
            "error": "body.tags must be an array",
        }
        bad_update_card_sort_order_type = json.loads(
            await arinova_tools._agent_handler("updateCard")(
                {"card_id": "card-1", "body": {"sortOrder": "last"}}
            )
        )
        assert bad_update_card_sort_order_type == {
            "success": False,
            "method": "updateCard",
            "error": "body.sortOrder must be a number",
        }
        bad_update_card_title_type = json.loads(
            await arinova_tools._agent_handler("updateCard")(
                {"card_id": "card-1", "body": {"title": 123}}
            )
        )
        assert bad_update_card_title_type == {
            "success": False,
            "method": "updateCard",
            "error": "body.title must be a string",
        }
        bad_update_card_description_type = json.loads(
            await arinova_tools._agent_handler("updateCard")(
                {"card_id": "card-1", "body": {"description": 123}}
            )
        )
        assert bad_update_card_description_type == {
            "success": False,
            "method": "updateCard",
            "error": "body.description must be a string",
        }
        bad_update_card_priority_type = json.loads(
            await arinova_tools._agent_handler("updateCard")(
                {"card_id": "card-1", "body": {"priority": 123}}
            )
        )
        assert bad_update_card_priority_type == {
            "success": False,
            "method": "updateCard",
            "error": "body.priority must be a string",
        }
        bad_update_card_column_id_type = json.loads(
            await arinova_tools._agent_handler("updateCard")(
                {"card_id": "card-1", "body": {"columnId": 123}}
            )
        )
        assert bad_update_card_column_id_type == {
            "success": False,
            "method": "updateCard",
            "error": "body.columnId must be a string",
        }
        bad_create_board_name_type = json.loads(
            await arinova_tools._agent_handler("createBoard")(
                {"body": {"name": 123}}
            )
        )
        assert bad_create_board_name_type == {
            "success": False,
            "method": "createBoard",
            "error": "body.name must be a string",
        }
        bad_create_board_column_name_type = json.loads(
            await arinova_tools._agent_handler("createBoard")(
                {"body": {"name": "Board", "columns": [{"name": 123}]}}
            )
        )
        assert bad_create_board_column_name_type == {
            "success": False,
            "method": "createBoard",
            "error": "body.columns[0].name must be a string",
        }
        bad_create_board_column_missing_name = json.loads(
            await arinova_tools._agent_handler("createBoard")(
                {"body": {"name": "Board", "columns": [{}]}}
            )
        )
        assert bad_create_board_column_missing_name == {
            "success": False,
            "method": "createBoard",
            "error": "body.columns[0].name is required",
        }
        bad_create_board_columns_type = json.loads(
            await arinova_tools._agent_handler("createBoard")(
                {"body": {"name": "Board", "columns": {"name": "Todo"}}}
            )
        )
        assert bad_create_board_columns_type == {
            "success": False,
            "method": "createBoard",
            "error": "body.columns must be an array",
        }
        bad_update_board_name_type = json.loads(
            await arinova_tools._agent_handler("updateBoard")(
                {"board_id": "board-1", "body": {"name": 123}}
            )
        )
        assert bad_update_board_name_type == {
            "success": False,
            "method": "updateBoard",
            "error": "body.name must be a string",
        }
        bad_column_missing_required = json.loads(
            await arinova_tools._agent_handler("createColumn")(
                {"board_id": "board-1", "body": {"sortOrder": 1}}
            )
        )
        assert bad_column_missing_required == {
            "success": False,
            "method": "createColumn",
            "error": "body.name is required",
        }
        bad_create_column_name_type = json.loads(
            await arinova_tools._agent_handler("createColumn")(
                {"board_id": "board-1", "body": {"name": 123}}
            )
        )
        assert bad_create_column_name_type == {
            "success": False,
            "method": "createColumn",
            "error": "body.name must be a string",
        }
        bad_create_column_sort_order_type = json.loads(
            await arinova_tools._agent_handler("createColumn")(
                {"board_id": "board-1", "body": {"name": "Todo", "sortOrder": "first"}}
            )
        )
        assert bad_create_column_sort_order_type == {
            "success": False,
            "method": "createColumn",
            "error": "body.sortOrder must be a number",
        }
        bad_update_column_sort_order_type = json.loads(
            await arinova_tools._agent_handler("updateColumn")(
                {"column_id": "col-1", "body": {"sortOrder": "last"}}
            )
        )
        assert bad_update_column_sort_order_type == {
            "success": False,
            "method": "updateColumn",
            "error": "body.sortOrder must be a number",
        }
        bad_update_column_name_type = json.loads(
            await arinova_tools._agent_handler("updateColumn")(
                {"column_id": "col-1", "body": {"name": 123}}
            )
        )
        assert bad_update_column_name_type == {
            "success": False,
            "method": "updateColumn",
            "error": "body.name must be a string",
        }
        bad_label_missing_required = json.loads(
            await arinova_tools._agent_handler("createLabel")(
                {"board_id": "board-1", "body": {"color": "#ff0000"}}
            )
        )
        assert bad_label_missing_required == {
            "success": False,
            "method": "createLabel",
            "error": "body.name is required",
        }
        bad_create_label_name_type = json.loads(
            await arinova_tools._agent_handler("createLabel")(
                {"board_id": "board-1", "body": {"name": 123}}
            )
        )
        assert bad_create_label_name_type == {
            "success": False,
            "method": "createLabel",
            "error": "body.name must be a string",
        }
        bad_create_label_color_type = json.loads(
            await arinova_tools._agent_handler("createLabel")(
                {"board_id": "board-1", "body": {"name": "Bug", "color": 123}}
            )
        )
        assert bad_create_label_color_type == {
            "success": False,
            "method": "createLabel",
            "error": "body.color must be a string",
        }
        bad_update_label_name_type = json.loads(
            await arinova_tools._agent_handler("updateLabel")(
                {"label_id": "label-1", "body": {"name": 123}}
            )
        )
        assert bad_update_label_name_type == {
            "success": False,
            "method": "updateLabel",
            "error": "body.name must be a string",
        }
        bad_update_label_color_type = json.loads(
            await arinova_tools._agent_handler("updateLabel")(
                {"label_id": "label-1", "body": {"color": 123}}
            )
        )
        assert bad_update_label_color_type == {
            "success": False,
            "method": "updateLabel",
            "error": "body.color must be a string",
        }
        bad_commit_missing_required = json.loads(
            await arinova_tools._agent_handler("addCardCommit")(
                {"card_id": "card-1", "body": {"message": "missing hash"}}
            )
        )
        assert bad_commit_missing_required == {
            "success": False,
            "method": "addCardCommit",
            "error": "body.commitHash is required",
        }
        bad_commit_hash_type = json.loads(
            await arinova_tools._agent_handler("addCardCommit")(
                {"card_id": "card-1", "body": {"commitHash": 123}}
            )
        )
        assert bad_commit_hash_type == {
            "success": False,
            "method": "addCardCommit",
            "error": "body.commitHash must be a string",
        }
        bad_commit_message_type = json.loads(
            await arinova_tools._agent_handler("addCardCommit")(
                {"card_id": "card-1", "body": {"commitHash": "abc123", "message": 123}}
            )
        )
        assert bad_commit_message_type == {
            "success": False,
            "method": "addCardCommit",
            "error": "body.message must be a string",
        }
        bad_create_card_title_type = json.loads(
            await arinova_tools._agent_handler("createCard")(
                {"body": {"title": 123}}
            )
        )
        assert bad_create_card_title_type == {
            "success": False,
            "method": "createCard",
            "error": "body.title must be a string",
        }
        bad_create_card_column_id_type = json.loads(
            await arinova_tools._agent_handler("createCard")(
                {"body": {"title": "Card", "columnId": 123}}
            )
        )
        assert bad_create_card_column_id_type == {
            "success": False,
            "method": "createCard",
            "error": "body.columnId must be a string",
        }
        bad_create_card_column_name_type = json.loads(
            await arinova_tools._agent_handler("createCard")(
                {"body": {"title": "Card", "columnName": 123}}
            )
        )
        assert bad_create_card_column_name_type == {
            "success": False,
            "method": "createCard",
            "error": "body.columnName must be a string",
        }
        bad_create_card_board_id_type = json.loads(
            await arinova_tools._agent_handler("createCard")(
                {"body": {"title": "Card", "boardId": 123}}
            )
        )
        assert bad_create_card_board_id_type == {
            "success": False,
            "method": "createCard",
            "error": "body.boardId must be a string",
        }
        bad_create_card_priority_type = json.loads(
            await arinova_tools._agent_handler("createCard")(
                {"body": {"title": "Card", "priority": 123}}
            )
        )
        assert bad_create_card_priority_type == {
            "success": False,
            "method": "createCard",
            "error": "body.priority must be a string",
        }
        bad_create_card_description_type = json.loads(
            await arinova_tools._agent_handler("createCard")(
                {"body": {"title": "Card", "description": 123}}
            )
        )
        assert bad_create_card_description_type == {
            "success": False,
            "method": "createCard",
            "error": "body.description must be a string",
        }
        bad_body_unknown = json.loads(
            await arinova_tools._agent_handler("createCard")(
                {"body": {"title": "Card", "extra": True}}
            )
        )
        assert bad_body_unknown == {
            "success": False,
            "method": "createCard",
            "error": "body has unsupported field(s): extra",
        }
        bad_nested_body_item = json.loads(
            await arinova_tools._agent_handler("createBoard")(
                {"body": {"name": "Board", "columns": [{"title": "Todo"}]}}
            )
        )
        assert bad_nested_body_item == {
            "success": False,
            "method": "createBoard",
            "error": "body.columns[0] has unsupported field(s): title",
        }
        bad_nested_body_item_type = json.loads(
            await arinova_tools._agent_handler("createBoard")(
                {"body": {"name": "Board", "columns": ["Todo"]}}
            )
        )
        assert bad_nested_body_item_type == {
            "success": False,
            "method": "createBoard",
            "error": "body.columns[0] must be an object",
        }
        bad_task_action_option = json.loads(
            await arinova_tools._task_handler("callAction")(
                {"action": "arinova.test", "actionArgs": {}, "options": {"taskId": "wrong-task"}}
            )
        )
        assert bad_task_action_option == {
            "success": False,
            "method": "callAction",
            "error": "options has unsupported field(s): taskId",
        }
        bad_task_action_timeout_type = json.loads(
            await arinova_tools._task_handler("callAction")(
                {"action": "arinova.test", "actionArgs": {}, "options": {"timeoutMs": True}}
            )
        )
        assert bad_task_action_timeout_type == {
            "success": False,
            "method": "callAction",
            "error": "options.timeoutMs must be a number",
        }
        bad_action_timeout_type = json.loads(
            await arinova_tools._agent_handler("callAction")(
                {"action": "arinova.global", "actionArgs": {}, "options": {"timeoutMs": True}}
            )
        )
        assert bad_action_timeout_type == {
            "success": False,
            "method": "callAction",
            "error": "options.timeoutMs must be a number",
        }
        bad_agent_action_name_type = json.loads(
            await arinova_tools._agent_handler("callAction")(
                {"action": 123, "actionArgs": {}}
            )
        )
        assert bad_agent_action_name_type == {
            "success": False,
            "method": "callAction",
            "error": "action must be a string",
        }
        bad_task_action_name_type = json.loads(
            await arinova_tools._task_handler("callAction")(
                {"action": 123, "actionArgs": {}}
            )
        )
        assert bad_task_action_name_type == {
            "success": False,
            "method": "callAction",
            "error": "action must be a string",
        }
        bad_action_call_id_type = json.loads(
            await arinova_tools._agent_handler("callAction")(
                {"action": "arinova.global", "actionArgs": {}, "options": {"callId": 123}}
            )
        )
        assert bad_action_call_id_type == {
            "success": False,
            "method": "callAction",
            "error": "options.callId must be a string",
        }
        bad_action_parent_call_id_type = json.loads(
            await arinova_tools._task_handler("callAction")(
                {"action": "arinova.test", "actionArgs": {}, "options": {"parentCallId": 123}}
            )
        )
        assert bad_action_parent_call_id_type == {
            "success": False,
            "method": "callAction",
            "error": "options.parentCallId must be a string",
        }
        bad_action_reason_type = json.loads(
            await arinova_tools._task_handler("callAction")(
                {"action": "arinova.test", "actionArgs": {}, "options": {"reason": 123}}
            )
        )
        assert bad_action_reason_type == {
            "success": False,
            "method": "callAction",
            "error": "options.reason must be a string",
        }
        bad_action_conversation_id_type = json.loads(
            await arinova_tools._agent_handler("callAction")(
                {"action": "arinova.global", "actionArgs": {}, "options": {"conversationId": 123}}
            )
        )
        assert bad_action_conversation_id_type == {
            "success": False,
            "method": "callAction",
            "error": "options.conversationId must be a string",
        }
        bad_action_task_id_type = json.loads(
            await arinova_tools._agent_handler("callAction")(
                {"action": "arinova.global", "actionArgs": {}, "options": {"taskId": 123}}
            )
        )
        assert bad_action_task_id_type == {
            "success": False,
            "method": "callAction",
            "error": "options.taskId must be a string",
        }
        bad_action_message_id_type = json.loads(
            await arinova_tools._agent_handler("callAction")(
                {"action": "arinova.global", "actionArgs": {}, "options": {"messageId": 123}}
            )
        )
        assert bad_action_message_id_type == {
            "success": False,
            "method": "callAction",
            "error": "options.messageId must be a string",
        }
        bad_action_metadata_type = json.loads(
            await arinova_tools._agent_handler("callAction")(
                {"action": "arinova.global", "actionArgs": {}, "options": {"metadata": "not-an-object"}}
            )
        )
        assert bad_action_metadata_type == {
            "success": False,
            "method": "callAction",
            "error": "options.metadata must be an object",
        }
        bad_action_metadata_nonfinite = json.loads(
            await arinova_tools._agent_handler("callAction")(
                {
                    "action": "arinova.global",
                    "actionArgs": {},
                    "options": {"metadata": {"score": float("inf")}},
                }
            )
        )
        assert bad_action_metadata_nonfinite == {
            "success": False,
            "method": "callAction",
            "error": "options.metadata.score contains a non-finite number",
        }
        bad_action_args_nonfinite = json.loads(
            await arinova_tools._agent_handler("callAction")(
                {"action": "arinova.global", "actionArgs": {"score": float("nan")}}
            )
        )
        assert bad_action_args_nonfinite == {
            "success": False,
            "method": "callAction",
            "error": "action_args.score contains a non-finite number",
        }
        circular_action_args: dict[str, object] = {}
        circular_action_args["self"] = circular_action_args
        bad_action_args_circular = json.loads(
            await arinova_tools._agent_handler("callAction")(
                {"action": "arinova.global", "actionArgs": circular_action_args}
            )
        )
        assert bad_action_args_circular == {
            "success": False,
            "method": "callAction",
            "error": "action_args.self contains a circular reference",
        }
        bad_action_dry_run_type = json.loads(
            await arinova_tools._task_handler("callAction")(
                {"action": "arinova.test", "actionArgs": {}, "options": {"dryRun": "yes"}}
            )
        )
        assert bad_action_dry_run_type == {
            "success": False,
            "method": "callAction",
            "error": "options.dryRun must be a boolean",
        }
        bad_named_array = json.loads(
            await arinova_tools._agent_handler("reorderColumns")(
                {"board_id": "board-1", "column_ids": "col-1,col-2"}
            )
        )
        assert bad_named_array == {
            "success": False,
            "method": "reorderColumns",
            "error": "column_ids must be an array",
        }
        bad_named_array_items = json.loads(
            await arinova_tools._agent_handler("reorderColumns")(
                {"board_id": "board-1", "column_ids": ["col-1", 2]}
            )
        )
        assert bad_named_array_items == {
            "success": False,
            "method": "reorderColumns",
            "error": "column_ids items must be strings",
        }
        fake.return_void_agent_results = True
        trimmed_named_column_ids = assert_success(
            await arinova_tools._agent_handler("reorderColumns")(
                {"board_id": "  board-column-trim  ", "column_ids": ["  col-a  ", " col-b "]}
            )
        )
        assert trimmed_named_column_ids["result"] is None
        assert fake.calls[-1] == ("agent", "reorderColumns", ("board-column-trim", ["col-a", "col-b"]))
        trimmed_positional_column_ids = assert_success(
            await arinova_tools._handle_sdk_call(
                {"method": "reorderColumns", "args": ["  board-column-pos-trim  ", ["  col-pos-a  ", " col-pos-b "]]}
            )
        )
        assert trimmed_positional_column_ids["result"] is None
        assert fake.calls[-1] == ("agent", "reorderColumns", ("board-column-pos-trim", ["col-pos-a", "col-pos-b"]))
        fake.return_void_agent_results = False
        bad_named_string = json.loads(
            await arinova_tools._handle_sdk_call({"method": "sendMessage", "conversationId": 123, "content": "hi"})
        )
        assert bad_named_string == {
            "success": False,
            "method": "sendMessage",
            "error": "conversation_id must be a string",
        }
        bad_send_message_content_type = json.loads(
            await arinova_tools._agent_handler("sendMessage")(
                {"conversation_id": "conv-1", "content": 123}
            )
        )
        assert bad_send_message_content_type == {
            "success": False,
            "method": "sendMessage",
            "error": "content must be a string",
        }
        trimmed_structured_history_cursors = assert_success(
            await arinova_tools._task_handler("fetchHistory")(
                {
                    "task_id": "task-1",
                    "options": {
                        "before": "  msg-before  ",
                        "after": " msg-after ",
                        "around": " msg-around ",
                        "limit": 3,
                    },
                }
            )
        )
        assert trimmed_structured_history_cursors["result"]["args"] == [
            {"before": "msg-before", "after": "msg-after", "around": "msg-around", "limit": 3},
        ]
        trimmed_structured_card_ids = assert_success(
            await arinova_tools._agent_handler("createCard")(
                {
                    "body": {
                        "title": " keep card title padding ",
                        "boardId": "  board-body  ",
                        "columnId": " col-body ",
                    }
                }
            )
        )
        assert trimmed_structured_card_ids["result"]["args"] == [
            {"title": " keep card title padding ", "boardId": "board-body", "columnId": "col-body"}
        ]
        bad_send_telemetry_data_type = json.loads(
            await arinova_tools._agent_handler("sendTelemetry")(
                {"event": "tool.bad", "data": "not-an-object"}
            )
        )
        assert bad_send_telemetry_data_type == {
            "success": False,
            "method": "sendTelemetry",
            "error": "data must be an object",
        }
        bad_send_hud_conversation_id_type = json.loads(
            await arinova_tools._agent_handler("sendHud")(
                {"data": {}, "conversation_id": 123}
            )
        )
        assert bad_send_hud_conversation_id_type == {
            "success": False,
            "method": "sendHud",
            "error": "conversation_id must be a string",
        }
        bad_skill_slug_type = json.loads(
            await arinova_tools._agent_handler("fetchSkillPrompt")({"skill_slug": 123})
        )
        assert bad_skill_slug_type == {
            "success": False,
            "method": "fetchSkillPrompt",
            "error": "skill_slug must be a string",
        }
        bad_share_note_note_id_type = json.loads(
            await arinova_tools._agent_handler("shareNote")(
                {"conversation_id": "conv-1", "note_id": 123}
            )
        )
        assert bad_share_note_note_id_type == {
            "success": False,
            "method": "shareNote",
            "error": "note_id must be a string",
        }
        bad_update_card_id_type = json.loads(
            await arinova_tools._agent_handler("updateCard")(
                {"card_id": 123, "body": {}}
            )
        )
        assert bad_update_card_id_type == {
            "success": False,
            "method": "updateCard",
            "error": "card_id must be a string",
        }
        bad_archive_board_id_type = json.loads(
            await arinova_tools._agent_handler("archiveBoard")({"board_id": 123})
        )
        assert bad_archive_board_id_type == {
            "success": False,
            "method": "archiveBoard",
            "error": "board_id must be a string",
        }
        bad_add_card_label_id_type = json.loads(
            await arinova_tools._agent_handler("addCardLabel")(
                {"card_id": "card-1", "label_id": 123}
            )
        )
        assert bad_add_card_label_id_type == {
            "success": False,
            "method": "addCardLabel",
            "error": "label_id must be a string",
        }
        bad_delete_note_id_type = json.loads(
            await arinova_tools._agent_handler("deleteNote")(
                {"conversation_id": "conv-1", "note_id": 123}
            )
        )
        assert bad_delete_note_id_type == {
            "success": False,
            "method": "deleteNote",
            "error": "note_id must be a string",
        }
        bad_delete_column_id_type = json.loads(
            await arinova_tools._agent_handler("deleteColumn")({"column_id": 123})
        )
        assert bad_delete_column_id_type == {
            "success": False,
            "method": "deleteColumn",
            "error": "column_id must be a string",
        }
        bad_link_card_note_card_id_type = json.loads(
            await arinova_tools._agent_handler("linkCardNote")(
                {"card_id": 123, "note_id": "note-1"}
            )
        )
        assert bad_link_card_note_card_id_type == {
            "success": False,
            "method": "linkCardNote",
            "error": "card_id must be a string",
        }
        bad_complete_card_id_type = json.loads(
            await arinova_tools._agent_handler("completeCard")({"card_id": 123})
        )
        assert bad_complete_card_id_type == {
            "success": False,
            "method": "completeCard",
            "error": "card_id must be a string",
        }
        bad_list_labels_board_id_type = json.loads(
            await arinova_tools._agent_handler("listLabels")({"board_id": 123})
        )
        assert bad_list_labels_board_id_type == {
            "success": False,
            "method": "listLabels",
            "error": "board_id must be a string",
        }
        bad_unlink_card_note_note_id_type = json.loads(
            await arinova_tools._agent_handler("unlinkCardNote")(
                {"card_id": "card-1", "note_id": 123}
            )
        )
        assert bad_unlink_card_note_note_id_type == {
            "success": False,
            "method": "unlinkCardNote",
            "error": "note_id must be a string",
        }
        bad_list_columns_board_id_type = json.loads(
            await arinova_tools._agent_handler("listColumns")({"board_id": 123})
        )
        assert bad_list_columns_board_id_type == {
            "success": False,
            "method": "listColumns",
            "error": "board_id must be a string",
        }
        bad_list_card_commits_card_id_type = json.loads(
            await arinova_tools._agent_handler("listCardCommits")({"card_id": 123})
        )
        assert bad_list_card_commits_card_id_type == {
            "success": False,
            "method": "listCardCommits",
            "error": "card_id must be a string",
        }
        bad_remove_card_label_card_id_type = json.loads(
            await arinova_tools._agent_handler("removeCardLabel")(
                {"card_id": 123, "label_id": "label-1"}
            )
        )
        assert bad_remove_card_label_card_id_type == {
            "success": False,
            "method": "removeCardLabel",
            "error": "card_id must be a string",
        }
        bad_delete_label_id_type = json.loads(
            await arinova_tools._agent_handler("deleteLabel")({"label_id": 123})
        )
        assert bad_delete_label_id_type == {
            "success": False,
            "method": "deleteLabel",
            "error": "label_id must be a string",
        }
        bad_update_board_id_type = json.loads(
            await arinova_tools._agent_handler("updateBoard")(
                {"board_id": 123, "body": {"name": "Board"}}
            )
        )
        assert bad_update_board_id_type == {
            "success": False,
            "method": "updateBoard",
            "error": "board_id must be a string",
        }
        bad_create_column_board_id_type = json.loads(
            await arinova_tools._agent_handler("createColumn")(
                {"board_id": 123, "body": {"name": "Todo"}}
            )
        )
        assert bad_create_column_board_id_type == {
            "success": False,
            "method": "createColumn",
            "error": "board_id must be a string",
        }
        bad_archived_cards_board_id_type = json.loads(
            await arinova_tools._agent_handler("listArchivedCards")({"board_id": 123})
        )
        assert bad_archived_cards_board_id_type == {
            "success": False,
            "method": "listArchivedCards",
            "error": "board_id must be a string",
        }
        bad_add_card_commit_card_id_type = json.loads(
            await arinova_tools._agent_handler("addCardCommit")(
                {"card_id": 123, "body": {"commitHash": "abc"}}
            )
        )
        assert bad_add_card_commit_card_id_type == {
            "success": False,
            "method": "addCardCommit",
            "error": "card_id must be a string",
        }
        unknown_generic_arg = json.loads(
            await arinova_tools._handle_sdk_call({"method": "sendMessage", "conversation_id": "conv-1", "typo": "hi"})
        )
        assert unknown_generic_arg == {
            "success": False,
            "method": "sendMessage",
            "error": "unsupported argument(s): typo",
        }
        unknown_named_arg = json.loads(
            await arinova_tools._agent_handler("sendMessage")(
                {"conversation_id": "conv-1", "content": "hi", "typo": True}
            )
        )
        assert unknown_named_arg == {
            "success": False,
            "method": "sendMessage",
            "error": "unsupported argument(s): typo",
        }
        unknown_task_arg = json.loads(
            await arinova_tools._handle_task_call(
                {"method": "fetchHistory", "taskId": "task-1", "options": {}, "unknown": True}
            )
        )
        assert unknown_task_arg == {
            "success": False,
            "method": "fetchHistory",
            "error": "unsupported argument(s): unknown",
        }
        irrelevant_generic_arg = json.loads(
            await arinova_tools._handle_sdk_call({"method": "getAgentId", "conversation_id": "conv-ignored"})
        )
        assert irrelevant_generic_arg == {
            "success": False,
            "method": "getAgentId",
            "error": "unsupported argument(s): conversation_id",
        }
        irrelevant_task_arg = json.loads(
            await arinova_tools._handle_task_call(
                {"method": "fetchHistory", "taskId": "task-1", "action": "not-for-history", "options": {}}
            )
        )
        assert irrelevant_task_arg == {
            "success": False,
            "method": "fetchHistory",
            "error": "unsupported argument(s): action",
        }
        duplicate_alias_arg = json.loads(
            await arinova_tools._handle_sdk_call(
                {
                    "method": "sendMessage",
                    "conversation_id": "conv-snake",
                    "conversationId": "conv-camel",
                    "content": "ambiguous",
                }
            )
        )
        assert duplicate_alias_arg == {
            "success": False,
            "method": "sendMessage",
            "error": "conversation_id was provided more than once: conversation_id, conversationId",
        }
        duplicate_task_id_alias = json.loads(
            await arinova_tools._handle_task_call(
                {"method": "fetchHistory", "task_id": "task-snake", "taskId": "task-camel", "options": {}}
            )
        )
        assert duplicate_task_id_alias == {
            "success": False,
            "method": "fetchHistory",
            "error": "task_id was provided more than once: task_id, taskId",
        }
        duplicate_upload_file_name_alias = json.loads(
            await arinova_tools._handle_sdk_call(
                {
                    "method": "uploadFile",
                    "conversationId": "conv-upload",
                    "file": {"base64": "SGk="},
                    "file_name": "snake.txt",
                    "fileName": "camel.txt",
                }
            )
        )
        assert duplicate_upload_file_name_alias == {
            "success": False,
            "method": "uploadFile",
            "error": "file_name was provided more than once: file_name, fileName",
        }
        duplicate_task_action_args_alias = json.loads(
            await arinova_tools._handle_task_call(
                {
                    "method": "callAction",
                    "taskId": "task-action-duplicate",
                    "action": "arinova.duplicate",
                    "action_args": {"snake": True},
                    "actionArgs": {"camel": True},
                }
            )
        )
        assert duplicate_task_action_args_alias == {
            "success": False,
            "method": "callAction",
            "error": "action_args was provided more than once: action_args, actionArgs",
        }
        mixed_args_and_named = json.loads(
            await arinova_tools._handle_sdk_call(
                {
                    "method": "sendMessage",
                    "args": ["conv-positional", "hello positional"],
                    "conversationId": "conv-named",
                }
            )
        )
        assert mixed_args_and_named == {
            "success": False,
            "method": "sendMessage",
            "error": "args cannot be combined with named arguments: conversationId",
        }
        mixed_named_tool_args = json.loads(
            await arinova_tools._agent_handler("uploadFile")(
                {
                    "args": ["conv-1", {"base64": "YQ=="}, "a.txt"],
                    "fileName": "ignored.txt",
                }
            )
        )
        assert mixed_named_tool_args == {
            "success": False,
            "method": "uploadFile",
            "error": "args cannot be combined with named arguments: fileName",
        }
        mixed_task_args_and_named = json.loads(
            await arinova_tools._handle_task_call(
                {
                    "method": "callAction",
                    "taskId": "task-1",
                    "args": ["arinova.test", {"ok": True}],
                    "actionArgs": {"ignored": True},
                }
            )
        )
        assert mixed_task_args_and_named == {
            "success": False,
            "method": "callAction",
            "error": "args cannot be combined with named arguments: actionArgs",
        }
        bad_positional_string_arg0 = json.loads(
            await arinova_tools._handle_sdk_call({"method": "sendMessage", "args": [123, "hello"]})
        )
        assert bad_positional_string_arg0 == {
            "success": False,
            "method": "sendMessage",
            "error": "args[0] must be a string",
        }
        bad_positional_string_arg1 = json.loads(
            await arinova_tools._handle_sdk_call({"method": "sendMessage", "args": ["conv-1", 123]})
        )
        assert bad_positional_string_arg1 == {
            "success": False,
            "method": "sendMessage",
            "error": "args[1] must be a string",
        }
        bad_positional_object_arg0 = json.loads(
            await arinova_tools._handle_sdk_call({"method": "createCard", "args": ["not-an-object"]})
        )
        assert bad_positional_object_arg0 == {
            "success": False,
            "method": "createCard",
            "error": "args[0] must be an object",
        }
        bad_positional_array_arg1 = json.loads(
            await arinova_tools._handle_sdk_call({"method": "reorderColumns", "args": ["board-1", "col-1,col-2"]})
        )
        assert bad_positional_array_arg1 == {
            "success": False,
            "method": "reorderColumns",
            "error": "args[1] must be an array",
        }
        bad_positional_string_arg2 = json.loads(
            await arinova_tools._handle_sdk_call({"method": "updateNote", "args": ["conv-1", "note-1", "body"]})
        )
        assert bad_positional_string_arg2 == {
            "success": False,
            "method": "updateNote",
            "error": "args[2] must be an object",
        }
        bad_positional_upload_file_name_type = json.loads(
            await arinova_tools._handle_sdk_call(
                {"method": "uploadFile", "args": ["conv-1", {"base64": "SGk="}, 123, "text/plain"]}
            )
        )
        assert bad_positional_upload_file_name_type == {
            "success": False,
            "method": "uploadFile",
            "error": "args[2] must be a string",
        }
        bad_positional_upload_file_type_type = json.loads(
            await arinova_tools._handle_sdk_call(
                {"method": "uploadFile", "args": ["conv-1", {"base64": "SGk="}, "bad.txt", 123]}
            )
        )
        assert bad_positional_upload_file_type_type == {
            "success": False,
            "method": "uploadFile",
            "error": "args[3] must be a string",
        }
        named_arg_gap = json.loads(
            await arinova_tools._handle_sdk_call({"method": "fetchHistory", "options": {"limit": 10}})
        )
        assert named_arg_gap == {
            "success": False,
            "error": "Unsupported Arinova SDK method: fetchHistory",
        }
        task_named_arg_gap = json.loads(
            await arinova_tools._handle_task_call({"method": "uploadFile", "taskId": "task-1", "fileName": "late.txt"})
        )
        assert task_named_arg_gap == {
            "success": False,
            "method": "uploadFile",
            "error": "file is required when using later named arguments",
        }
        default_fills_named_gap = json.loads(
            await arinova_tools._handle_sdk_call({"method": "sendHud", "conversationId": "conv-default"})
        )
        assert default_fills_named_gap == {
            "success": False,
            "method": "sendHud",
            "error": "data is required when using later named arguments",
        }

        with tempfile.NamedTemporaryFile(delete=False) as handle:
            handle.write(b"abc")
            path = Path(handle.name)
        old_allow_uploads = os.environ.get("ARINOVA_ALLOW_LOCAL_UPLOADS")
        old_upload_root = os.environ.get("ARINOVA_UPLOAD_ROOT")
        os.environ["ARINOVA_ALLOW_LOCAL_UPLOADS"] = "true"
        os.environ["ARINOVA_UPLOAD_ROOT"] = str(path.parent)
        try:
            uploaded = assert_success(
                await arinova_tools._agent_handler("uploadFile")(
                    {"args": ["conv-1", {"path": path.name}, "a.txt", "text/plain"]}
                )
            )
            assert uploaded["result"]["args"][1] == "abc"
            assert fake.calls[-1][2][1] == b"abc"

            generic_uploaded = assert_success(
                await arinova_tools._handle_sdk_call(
                    {
                        "method": "uploadFile",
                        "args": ["conv-1", {"path": path.name}, "generic.txt", "text/plain"],
                    }
                )
            )
            assert generic_uploaded["result"]["args"][1] == "abc"
            assert fake.calls[-1][2][1] == b"abc"

            named_agent_uploaded = assert_success(
                await arinova_tools._agent_handler("uploadFile")(
                    {
                        "conversation_id": "conv-1",
                        "file": {"path": path.name},
                        "file_name": "named-agent.txt",
                        "file_type": "text/plain",
                    }
                )
            )
            assert named_agent_uploaded["result"]["args"] == ["conv-1", "abc", "named-agent.txt", "text/plain"]
            assert fake.calls[-1][2][1] == b"abc"

            generic_named_agent_uploaded = assert_success(
                await arinova_tools._handle_sdk_call(
                    {
                        "method": "uploadFile",
                        "conversation_id": "conv-1",
                        "file": {"path": path.name},
                        "file_name": "generic-named-agent.txt",
                        "file_type": "text/plain",
                    }
                )
            )
            assert generic_named_agent_uploaded["result"]["args"] == [
                "conv-1",
                "abc",
                "generic-named-agent.txt",
                "text/plain",
            ]
            assert fake.calls[-1][2][1] == b"abc"

            generic_camel_agent_uploaded = assert_success(
                await arinova_tools._handle_sdk_call(
                    {
                        "method": "uploadFile",
                        "conversationId": "conv-camel",
                        "file": {"path": path.name},
                        "fileName": "generic-camel-agent.txt",
                        "fileType": "text/plain",
                    }
                )
            )
            assert generic_camel_agent_uploaded["result"]["args"] == [
                "conv-camel",
                "abc",
                "generic-camel-agent.txt",
                "text/plain",
            ]
            assert fake.calls[-1][2][1] == b"abc"

            task_uploaded = assert_success(
                await arinova_tools._task_handler("uploadFile")(
                    {"file": {"path": path.name}, "file_name": "task.txt", "file_type": "text/plain"}
                )
            )
            assert task_uploaded["task_id"] == "task-1"
            assert task_uploaded["result"]["args"][0] == "abc"
            assert fake.calls[-1][3][0] == b"abc"

            task_uploaded_explicit = assert_success(
                await arinova_tools._task_handler("uploadFile")(
                    {
                        "task_id": "task-upload-explicit",
                        "file": {"path": path.name},
                        "file_name": "explicit-task.txt",
                        "file_type": "text/plain",
                    }
                )
            )
            assert task_uploaded_explicit["task_id"] == "task-upload-explicit"
            assert task_uploaded_explicit["result"]["args"] == ["abc", "explicit-task.txt", "text/plain"]
            assert fake.calls[-1][1] == "task-upload-explicit"
            assert fake.calls[-1][3][0] == b"abc"

            task_uploaded_camel = assert_success(
                await arinova_tools._task_handler("uploadFile")(
                    {
                        "taskId": "task-upload-camel",
                        "file": {"path": path.name},
                        "fileName": "camel-task.txt",
                        "fileType": "text/plain",
                    }
                )
            )
            assert task_uploaded_camel["task_id"] == "task-upload-camel"
            assert task_uploaded_camel["result"]["args"] == ["abc", "camel-task.txt", "text/plain"]
            assert fake.calls[-1][1] == "task-upload-camel"
            assert fake.calls[-1][3][0] == b"abc"

            generic_task_uploaded = assert_success(
                await arinova_tools._handle_task_call(
                    {
                        "method": "uploadFile",
                        "args": [{"path": path.name}, "generic-task.txt", "text/plain"],
                    }
                )
            )
            assert generic_task_uploaded["result"]["args"][0] == "abc"
            assert fake.calls[-1][3][0] == b"abc"
        finally:
            path.unlink(missing_ok=True)
            if old_allow_uploads is None:
                os.environ.pop("ARINOVA_ALLOW_LOCAL_UPLOADS", None)
            else:
                os.environ["ARINOVA_ALLOW_LOCAL_UPLOADS"] = old_allow_uploads
            if old_upload_root is None:
                os.environ.pop("ARINOVA_UPLOAD_ROOT", None)
            else:
                os.environ["ARINOVA_UPLOAD_ROOT"] = old_upload_root

        agent_base64_upload = assert_success(
            await arinova_tools._agent_handler("uploadFile")(
                {"args": ["conv-1", {"base64": "SGk="}, "base64-agent.txt", "text/plain"]}
            )
        )
        assert agent_base64_upload["result"]["args"] == [
            "conv-1",
            {"base64": "SGk="},
            "base64-agent.txt",
            "text/plain",
        ]
        assert fake.calls[-1][2][1] == {"base64": "SGk="}

        named_agent_base64_upload = assert_success(
            await arinova_tools._agent_handler("uploadFile")(
                {
                    "conversation_id": "conv-1",
                    "file": {"base64": "SGk="},
                    "file_name": "named-base64-agent.txt",
                    "file_type": "text/plain",
                }
            )
        )
        assert named_agent_base64_upload["result"]["args"] == [
            "conv-1",
            {"base64": "SGk="},
            "named-base64-agent.txt",
            "text/plain",
        ]
        assert fake.calls[-1][2][1] == {"base64": "SGk="}
        named_agent_upload_without_type = assert_success(
            await arinova_tools._agent_handler("uploadFile")(
                {
                    "conversation_id": "conv-1",
                    "file": {"base64": "SGk="},
                    "file_name": "named-agent-no-type.txt",
                }
            )
        )
        assert named_agent_upload_without_type["result"]["args"] == [
            "conv-1",
            {"base64": "SGk="},
            "named-agent-no-type.txt",
        ]

        task_base64_upload = assert_success(
            await arinova_tools._task_handler("uploadFile")(
                {"file": {"base64": "IQ=="}, "file_name": "base64-task.txt", "file_type": "text/plain"}
            )
        )
        assert task_base64_upload["result"]["args"] == [{"base64": "IQ=="}, "base64-task.txt", "text/plain"]
        assert fake.calls[-1][3][0] == {"base64": "IQ=="}
        task_upload_without_type = assert_success(
            await arinova_tools._task_handler("uploadFile")(
                {"file": {"base64": "IQ=="}, "file_name": "task-no-type.txt"}
            )
        )
        assert task_upload_without_type["result"]["args"] == [{"base64": "IQ=="}, "task-no-type.txt"]

        generic_task_base64_upload = assert_success(
            await arinova_tools._handle_task_call(
                {"method": "uploadFile", "args": [{"base64": "IQ=="}, "generic-base64-task.txt", "text/plain"]}
            )
        )
        assert generic_task_base64_upload["result"]["args"] == [
            {"base64": "IQ=="},
            "generic-base64-task.txt",
            "text/plain",
        ]
        assert fake.calls[-1][3][0] == {"base64": "IQ=="}

        missing_upload = json.loads(
            await arinova_tools._agent_handler("uploadFile")(
                {
                    "conversation_id": "conv-1",
                    "file": {"path": "/tmp/hermes-arinova-missing-upload-file"},
                    "file_name": "missing.txt",
                    "file_type": "text/plain",
                }
            )
        )
        assert missing_upload["success"] is False
        assert missing_upload["error"] == "local path uploads are disabled"

        bad_path_type_upload = json.loads(
            await arinova_tools._agent_handler("uploadFile")(
                {
                    "conversation_id": "conv-1",
                    "file": {"path": 123},
                    "file_name": "bad-path-type.txt",
                    "file_type": "text/plain",
                }
            )
        )
        assert bad_path_type_upload == {
            "success": False,
            "method": "uploadFile",
            "error": "upload file path must be a non-empty string",
        }

        directory_upload = json.loads(
            await arinova_tools._agent_handler("uploadFile")(
                {
                    "conversation_id": "conv-1",
                    "file": {"path": str(ROOT)},
                    "file_name": "directory.txt",
                    "file_type": "text/plain",
                }
            )
        )
        assert directory_upload["success"] is False
        assert directory_upload["error"] == "local path uploads are disabled"

        invalid_base64_upload = json.loads(
            await arinova_tools._agent_handler("uploadFile")(
                {
                    "conversation_id": "conv-1",
                    "file": {"base64": "!!!!"},
                    "file_name": "bad-base64.txt",
                    "file_type": "text/plain",
                }
            )
        )
        assert invalid_base64_upload == {
            "success": False,
            "method": "uploadFile",
            "error": "upload file base64 data is invalid",
        }

        missing_upload_source = json.loads(
            await arinova_tools._agent_handler("uploadFile")(
                {
                    "conversation_id": "conv-1",
                    "file": {"bytes": "SGk="},
                    "file_name": "missing-source.txt",
                    "file_type": "text/plain",
                }
            )
        )
        assert missing_upload_source == {
            "success": False,
            "method": "uploadFile",
            "error": "upload file must be {'base64':'...'} or {'path':'...'}",
        }

        unknown_upload_source = json.loads(
            await arinova_tools._agent_handler("uploadFile")(
                {
                    "conversation_id": "conv-1",
                    "file": {"base64": "SGk=", "extra": True},
                    "file_name": "unknown-source.txt",
                    "file_type": "text/plain",
                }
            )
        )
        assert unknown_upload_source == {
            "success": False,
            "method": "uploadFile",
            "error": "upload file has unsupported field(s): extra",
        }

        ambiguous_upload_source = json.loads(
            await arinova_tools._agent_handler("uploadFile")(
                {
                    "conversation_id": "conv-1",
                    "file": {"path": "/tmp/hermes-arinova-missing-upload-file", "base64": "SGk="},
                    "file_name": "ambiguous-source.txt",
                    "file_type": "text/plain",
                }
            )
        )
        assert ambiguous_upload_source == {
            "success": False,
            "method": "uploadFile",
            "error": "upload file must provide only one of path or base64",
        }

        task_base64_type_upload = json.loads(
            await arinova_tools._task_handler("uploadFile")(
                {
                    "file": {"base64": 123},
                    "file_name": "bad-task-base64.txt",
                    "file_type": "text/plain",
                }
            )
        )
        assert task_base64_type_upload == {
            "success": False,
            "task_id": "task-1",
            "method": "uploadFile",
            "error": "upload file base64 data must be a string",
        }
        unknown_task_upload_source = json.loads(
            await arinova_tools._task_handler("uploadFile")(
                {
                    "file": {"base64": "IQ==", "extra": True},
                    "file_name": "unknown-task-source.txt",
                    "file_type": "text/plain",
                }
            )
        )
        assert unknown_task_upload_source == {
            "success": False,
            "task_id": "task-1",
            "method": "uploadFile",
            "error": "upload file has unsupported field(s): extra",
        }
        blank_task_path_upload = json.loads(
            await arinova_tools._task_handler("uploadFile")(
                {
                    "file": {"path": "   "},
                    "file_name": "blank-task-path.txt",
                    "file_type": "text/plain",
                }
            )
        )
        assert blank_task_path_upload == {
            "success": False,
            "task_id": "task-1",
            "method": "uploadFile",
            "error": "upload file path must be a non-empty string",
        }
        ambiguous_task_upload_source = json.loads(
            await arinova_tools._task_handler("uploadFile")(
                {
                    "file": {"path": "/tmp/hermes-arinova-missing-upload-file", "base64": "IQ=="},
                    "file_name": "ambiguous-task-source.txt",
                    "file_type": "text/plain",
                }
            )
        )
        assert ambiguous_task_upload_source == {
            "success": False,
            "task_id": "task-1",
            "method": "uploadFile",
            "error": "upload file must provide only one of path or base64",
        }

        bad_named_file = json.loads(
            await arinova_tools._agent_handler("uploadFile")(
                {
                    "conversation_id": "conv-1",
                    "file": "not-an-object",
                    "file_name": "bad.txt",
                    "file_type": "text/plain",
                }
            )
        )
        assert bad_named_file == {
            "success": False,
            "method": "uploadFile",
            "error": "file must be an object",
        }
        bad_named_file_name_type = json.loads(
            await arinova_tools._agent_handler("uploadFile")(
                {
                    "conversation_id": "conv-1",
                    "file": {"base64": "SGk="},
                    "file_name": 123,
                    "file_type": "text/plain",
                }
            )
        )
        assert bad_named_file_name_type == {
            "success": False,
            "method": "uploadFile",
            "error": "file_name must be a string",
        }
        bad_named_file_type_type = json.loads(
            await arinova_tools._agent_handler("uploadFile")(
                {
                    "conversation_id": "conv-1",
                    "file": {"base64": "SGk="},
                    "file_name": "bad.txt",
                    "file_type": 123,
                }
            )
        )
        assert bad_named_file_type_type == {
            "success": False,
            "method": "uploadFile",
            "error": "file_type must be a string",
        }
        bad_named_task_file = json.loads(
            await arinova_tools._task_handler("uploadFile")(
                {
                    "taskId": "task-1",
                    "file": "not-an-object",
                    "fileName": "bad-task.txt",
                    "fileType": "text/plain",
                }
            )
        )
        assert bad_named_task_file == {
            "success": False,
            "method": "uploadFile",
            "error": "file must be an object",
        }
        bad_named_task_file_name_type = json.loads(
            await arinova_tools._task_handler("uploadFile")(
                {
                    "taskId": "task-1",
                    "file": {"base64": "IQ=="},
                    "fileName": 123,
                    "fileType": "text/plain",
                }
            )
        )
        assert bad_named_task_file_name_type == {
            "success": False,
            "method": "uploadFile",
            "error": "file_name must be a string",
        }
        bad_named_task_file_type_type = json.loads(
            await arinova_tools._task_handler("uploadFile")(
                {
                    "taskId": "task-1",
                    "file": {"base64": "IQ=="},
                    "fileName": "bad-task.txt",
                    "fileType": 123,
                }
            )
        )
        assert bad_named_task_file_type_type == {
            "success": False,
            "method": "uploadFile",
            "error": "file_type must be a string",
        }

        action = assert_success(
            await arinova_tools._task_handler("callAction")(
                {"action": "arinova.test", "action_args": {"ok": True}, "options": {"timeoutMs": 1000}}
            )
        )
        assert action["result"]["args"] == ["arinova.test", {"ok": True}, {"timeoutMs": 1000}]

        action_camel_args = assert_success(
            await arinova_tools._task_handler("callAction")(
                {"action": "arinova.test", "actionArgs": {"camel": True}, "options": {"timeoutMs": 1000}}
            )
        )
        assert action_camel_args["result"]["args"] == ["arinova.test", {"camel": True}, {"timeoutMs": 1000}]

        bad_task_action_missing_args = json.loads(
            await arinova_tools._task_handler("callAction")(
                {"action": "arinova.test", "options": {"timeoutMs": 1000}}
            )
        )
        assert bad_task_action_missing_args == {
            "success": False,
            "method": "callAction",
            "error": "action_args is required when using later named arguments",
        }
        bad_task_action_args_type = json.loads(
            await arinova_tools._task_handler("callAction")(
                {"action": "arinova.test", "actionArgs": "not-an-object"}
            )
        )
        assert bad_task_action_args_type == {
            "success": False,
            "method": "callAction",
            "error": "action_args must be an object",
        }
        bad_task_action_only = json.loads(
            await arinova_tools._task_handler("callAction")({"action": "arinova.test"})
        )
        assert bad_task_action_only == {
            "success": False,
            "method": "callAction",
            "error": "action_args is required when using later named arguments",
        }

        task_action_full_options = assert_success(
            await arinova_tools._task_handler("callAction")(
                {
                    "action": "arinova.test",
                    "actionArgs": {"ok": True},
                    "options": {
                        "callId": "task-call",
                        "parentCallId": "parent-call",
                        "reason": "manual smoke",
                        "metadata": {"source": "tool-wrapper"},
                        "dryRun": True,
                        "timeoutMs": 1000,
                    },
                }
            )
        )
        assert task_action_full_options["result"]["args"] == [
            "arinova.test",
            {"ok": True},
            {
                "callId": "task-call",
                "parentCallId": "parent-call",
                "reason": "manual smoke",
                "metadata": {"source": "tool-wrapper"},
                "dryRun": True,
                "timeoutMs": 1000,
            },
        ]
        task_action_trimmed_option_ids = assert_success(
            await arinova_tools._task_handler("callAction")(
                {
                    "action": "arinova.test",
                    "actionArgs": {},
                    "options": {
                        "callId": "  task-call-trim  ",
                        "parentCallId": "  task-parent-trim  ",
                        "reason": " keep task reason padding ",
                    },
                }
            )
        )
        assert task_action_trimmed_option_ids["result"]["args"][2] == {
            "callId": "task-call-trim",
            "parentCallId": "task-parent-trim",
            "reason": " keep task reason padding ",
        }

        bad_global_action_missing_args = json.loads(
            await arinova_tools._agent_handler("callAction")(
                {"action": "arinova.global", "options": {"conversationId": "conv-1"}}
            )
        )
        assert bad_global_action_missing_args == {
            "success": False,
            "method": "callAction",
            "error": "action_args is required when using later named arguments",
        }
        bad_global_action_args_type = json.loads(
            await arinova_tools._agent_handler("callAction")(
                {"action": "arinova.global", "actionArgs": "not-an-object"}
            )
        )
        assert bad_global_action_args_type == {
            "success": False,
            "method": "callAction",
            "error": "action_args must be an object",
        }
        bad_global_action_only = json.loads(
            await arinova_tools._agent_handler("callAction")({"action": "arinova.global"})
        )
        assert bad_global_action_only == {
            "success": False,
            "method": "callAction",
            "error": "action_args is required when using later named arguments",
        }

        global_action_full_options = assert_success(
            await arinova_tools._agent_handler("callAction")(
                {
                    "action": "arinova.global",
                    "actionArgs": {"ok": True},
                    "options": {
                        "callId": "global-call",
                        "taskId": "task-1",
                        "conversationId": "conv-1",
                        "messageId": "msg-1",
                        "parentCallId": "parent-call",
                        "reason": "manual smoke",
                        "metadata": {"source": "tool-wrapper"},
                        "dryRun": True,
                        "timeoutMs": 1000,
                    },
                }
            )
        )
        assert global_action_full_options["result"]["args"] == [
            "arinova.global",
            {"ok": True},
            {
                "callId": "global-call",
                "taskId": "task-1",
                "conversationId": "conv-1",
                "messageId": "msg-1",
                "parentCallId": "parent-call",
                "reason": "manual smoke",
                "metadata": {"source": "tool-wrapper"},
                "dryRun": True,
                "timeoutMs": 1000,
            },
        ]
        global_action_trimmed_option_ids = assert_success(
            await arinova_tools._agent_handler("callAction")(
                {
                    "action": "arinova.global",
                    "actionArgs": {},
                    "options": {
                        "callId": "  global-call-trim  ",
                        "taskId": "  task-option-trim  ",
                        "conversationId": "  conv-option-trim  ",
                        "messageId": "  msg-option-trim  ",
                        "parentCallId": "  global-parent-trim  ",
                        "reason": " keep global reason padding ",
                    },
                }
            )
        )
        assert global_action_trimmed_option_ids["result"]["args"][2] == {
            "callId": "global-call-trim",
            "taskId": "task-option-trim",
            "conversationId": "conv-option-trim",
            "messageId": "msg-option-trim",
            "parentCallId": "global-parent-trim",
            "reason": " keep global reason padding ",
        }

        unsupported = json.loads(await arinova_tools._handle_sdk_call({"method": "nope", "args": []}))
        assert unsupported == {"success": False, "error": "Unsupported Arinova SDK method: nope"}
        unsupported_with_named_arg = json.loads(
            await arinova_tools._handle_sdk_call({"method": "nope", "conversation_id": "conv-ignored"})
        )
        assert unsupported_with_named_arg == {"success": False, "error": "Unsupported Arinova SDK method: nope"}
        unsupported_task = json.loads(await arinova_tools._handle_task_call({"method": "nope", "task_id": "task-1", "args": []}))
        assert unsupported_task == {"success": False, "error": "Unsupported Arinova task SDK method: nope"}
        unsupported_task_with_named_arg = json.loads(
            await arinova_tools._handle_task_call({"method": "nope", "task_id": "task-1", "options": {}})
        )
        assert unsupported_task_with_named_arg == {"success": False, "error": "Unsupported Arinova task SDK method: nope"}
        stale_agent_handler = json.loads(await arinova_tools._agent_handler("staleAgentMethod")({"args": []}))
        assert stale_agent_handler == {
            "success": False,
            "error": "Unsupported Arinova SDK method: staleAgentMethod",
        }
        stale_agent_handler_named = json.loads(
            await arinova_tools._agent_handler("staleAgentMethod")({"conversation_id": "conv-ignored"})
        )
        assert stale_agent_handler_named == {
            "success": False,
            "error": "Unsupported Arinova SDK method: staleAgentMethod",
        }
        stale_agent_handler_unknown = json.loads(
            await arinova_tools._agent_handler("staleAgentMethod")({"unknown": True})
        )
        assert stale_agent_handler_unknown == {
            "success": False,
            "error": "Unsupported Arinova SDK method: staleAgentMethod",
        }
        stale_task_handler = json.loads(await arinova_tools._task_handler("staleTaskMethod")({"task_id": "task-1", "args": []}))
        assert stale_task_handler == {
            "success": False,
            "error": "Unsupported Arinova task SDK method: staleTaskMethod",
        }
        stale_task_handler_named = json.loads(
            await arinova_tools._task_handler("staleTaskMethod")({"task_id": "task-1", "options": {}})
        )
        assert stale_task_handler_named == {
            "success": False,
            "error": "Unsupported Arinova task SDK method: staleTaskMethod",
        }
        stale_task_handler_unknown = json.loads(
            await arinova_tools._task_handler("staleTaskMethod")({"task_id": "task-1", "unknown": True})
        )
        assert stale_task_handler_unknown == {
            "success": False,
            "error": "Unsupported Arinova task SDK method: staleTaskMethod",
        }

        fake.fail_agent = True
        agent_failure = json.loads(await arinova_tools._agent_handler("sendMessage")({"args": ["conv-1", "hi"]}))
        assert agent_failure == {"success": False, "method": "sendMessage", "error": "agent sdk boom"}
        fake.fail_agent = False

        fake.fail_task = True
        task_failure = json.loads(await arinova_tools._task_handler("fetchHistory")({"args": []}))
        assert task_failure == {
            "success": False,
            "task_id": "task-1",
            "method": "fetchHistory",
            "error": "task sdk boom",
        }
        fake.fail_task = False

        class MissingActiveTaskAdapter(FakeAdapter):
            active_task_id = None

        missing_active_task_adapter = MissingActiveTaskAdapter()
        arinova_tools._active_adapter = lambda: missing_active_task_adapter
        missing_active_task = json.loads(await arinova_tools._task_handler("callAction")({"action": "noop", "action_args": {}}))
        assert missing_active_task == {
            "success": False,
            "error": "No active Arinova task; provide task_id or call this while handling one task.",
        }
        explicit_task_without_active_helper = json.loads(
            await arinova_tools._task_handler("callAction")(
                {"task_id": "task-explicit", "action": "noop", "action_args": {}}
            )
        )
        assert explicit_task_without_active_helper["success"] is True
        assert explicit_task_without_active_helper["task_id"] == "task-explicit"

        class NonStringActiveTaskAdapter(FakeAdapter):
            def active_task_id(self):
                return {"taskId": "not-a-string"}

        non_string_active_task_adapter = NonStringActiveTaskAdapter()
        arinova_tools._active_adapter = lambda: non_string_active_task_adapter
        non_string_active_task = json.loads(
            await arinova_tools._task_handler("callAction")({"action": "noop", "action_args": {}})
        )
        assert non_string_active_task == {
            "success": False,
            "error": "No active Arinova task; provide task_id or call this while handling one task.",
        }

        arinova_tools._active_adapter = lambda: fake
        fake.nonfinite_agent_result = True
        nonfinite_agent = json.loads(await arinova_tools._agent_handler("queryMemory")({"options": {"query": "bad"}}))
        assert nonfinite_agent["success"] is False
        assert nonfinite_agent["method"] == "queryMemory"
        assert "not JSON-compliant" in nonfinite_agent["error"]
        fake.nonfinite_agent_result = False

        fake.nonfinite_task_result = True
        nonfinite_task = json.loads(await arinova_tools._task_handler("fetchHistory")({"args": []}))
        assert nonfinite_task["success"] is False
        assert nonfinite_task["method"] == "fetchHistory"
        assert nonfinite_task["task_id"] == "task-1"
        assert "not JSON-compliant" in nonfinite_task["error"]
        fake.nonfinite_task_result = False

        fake.is_connected = False
        assert arinova_tools.check_arinova_available() is False
        unavailable = json.loads(await arinova_tools._agent_handler("getAgentId")({"args": []}))
        assert unavailable["success"] is False
        assert "not connected" in unavailable["error"]

        class CallableStateAdapter(FakeAdapter):
            def is_running(self) -> bool:
                return False

        callable_state = CallableStateAdapter()
        arinova_tools._active_adapter = lambda: callable_state
        assert arinova_tools.check_arinova_available() is False

        class RunningDisconnectedAdapter(FakeAdapter):
            def __init__(self) -> None:
                super().__init__()
                self.is_connected = False

            def is_running(self) -> bool:
                return True

        running_disconnected = RunningDisconnectedAdapter()
        arinova_tools._active_adapter = lambda: running_disconnected
        assert arinova_tools.check_arinova_available() is False
        disconnected_result = json.loads(await arinova_tools._agent_handler("getAgentId")({"args": []}))
        assert disconnected_result["success"] is False
        assert "not connected" in disconnected_result["error"]
    finally:
        arinova_tools._active_adapter = original_active_adapter

    print("arinova tools OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
