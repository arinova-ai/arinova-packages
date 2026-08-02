#!/usr/bin/env python3
"""Check live smoke skip/fail behavior without real Arinova credentials."""

from __future__ import annotations

import tempfile
from pathlib import Path

from check_live_connection_gate_helpers import (
    assert_disconnected,
    assert_failed,
    assert_sdk_call,
    clean_env,
    read_sdk_calls,
    run_basic_live_failure_cases,
    run_credential_and_config_cases,
    run_full_env_import_probe_case,
    run_live,
)


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="hermes-arinova-live-gate-") as tmp:
        hermes_home = Path(tmp)
        missing_hermes_root = hermes_home / "missing-hermes-agent"

        fake_hermes_root = run_credential_and_config_cases(hermes_home, missing_hermes_root)
        run_full_env_import_probe_case(hermes_home, fake_hermes_root)
        run_basic_live_failure_cases(hermes_home, fake_hermes_root)
        bad_task_update_json_marker = hermes_home / "bad-task-update-json-disconnect.txt"
        bad_task_update_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--send-task-update-json",
            "{bad json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_update_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_update_json, "SDK sendTaskUpdate() probe JSON argument could not be parsed")
        assert_disconnected(bad_task_update_json_marker, "bad sendTaskUpdate JSON live smoke")

        bad_task_update_payload_marker = hermes_home / "bad-task-update-payload-disconnect.txt"
        bad_task_update_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--send-task-update-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_update_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_update_payload, "SDK sendTaskUpdate() probe payload must be a JSON object")
        assert_disconnected(bad_task_update_payload_marker, "bad sendTaskUpdate payload live smoke")

        completed_task_update_marker = hermes_home / "completed-task-update-disconnect.txt"
        completed_task_update_sdk_marker = hermes_home / "completed-task-update-sdk-calls.jsonl"
        completed_task_update = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--send-task-update-json",
            '{"status":"completed","durationMs":12,"costUsd":0.02,"numTurns":3}',
            "--skip-telemetry",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(completed_task_update_marker),
                ARINOVA_FAKE_SDK_CALLS_MARKER=str(completed_task_update_sdk_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        if completed_task_update.returncode != 0:
            raise RuntimeError(
                "expected completed sendTaskUpdate live smoke to pass, "
                f"got {completed_task_update.returncode}: stdout={completed_task_update.stdout!r} "
                f"stderr={completed_task_update.stderr!r}"
            )
        if "live Arinova sendTaskUpdate OK" not in completed_task_update.stdout:
            raise RuntimeError(
                f"completed sendTaskUpdate live smoke message missing: {completed_task_update.stdout!r}"
            )
        assert_disconnected(completed_task_update_marker, "completed sendTaskUpdate live smoke")
        assert_sdk_call(
            read_sdk_calls(completed_task_update_sdk_marker),
            {
                "method": "sendTaskUpdate",
                "args": [
                    "Hermes",
                    {"status": "completed", "durationMs": 12, "costUsd": 0.02, "numTurns": 3},
                ],
            },
            "completed sendTaskUpdate live smoke",
        )

        bad_task_update_started_marker = hermes_home / "bad-task-update-started-disconnect.txt"
        bad_task_update_started = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--send-task-update-json",
            '{"status":"started"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_update_started_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_update_started, "SDK sendTaskUpdate() probe payload must match TaskUpdateData")
        assert_disconnected(bad_task_update_started_marker, "bad sendTaskUpdate started live smoke")

        bad_task_update_unknown_marker = hermes_home / "bad-task-update-unknown-disconnect.txt"
        bad_task_update_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--send-task-update-json",
            '{"status":"started","task":"boot","durationMs":1}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_update_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_update_unknown, "SDK sendTaskUpdate() probe payload must match TaskUpdateData")
        assert_disconnected(bad_task_update_unknown_marker, "bad sendTaskUpdate unknown field live smoke")

        bad_tool_report_json_marker = hermes_home / "bad-tool-report-json-disconnect.txt"
        bad_tool_report_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--report-tool-call-json",
            "{bad json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_tool_report_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_tool_report_json, "SDK reportToolCall() probe JSON argument could not be parsed")
        assert_disconnected(bad_tool_report_json_marker, "bad reportToolCall JSON live smoke")

        bad_tool_report_payload_marker = hermes_home / "bad-tool-report-payload-disconnect.txt"
        bad_tool_report_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--report-tool-call-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_tool_report_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_tool_report_payload, "SDK reportToolCall() probe payload must be a JSON object")
        assert_disconnected(bad_tool_report_payload_marker, "bad reportToolCall payload live smoke")

        failure_tool_report_marker = hermes_home / "failure-tool-report-disconnect.txt"
        failure_tool_report_sdk_marker = hermes_home / "failure-tool-report-sdk-calls.jsonl"
        failure_tool_report = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--report-tool-call-json",
            (
                '{"sessionId":"session-1","turnId":"turn-1","seqOrder":1,'
                '"toolName":"arinova_sdk_call","input":{"method":"queryMemory"},'
                '"durationMs":7,"success":false,"error":"tool failed","messageId":"msg-2"}'
            ),
            "--skip-telemetry",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(failure_tool_report_marker),
                ARINOVA_FAKE_SDK_CALLS_MARKER=str(failure_tool_report_sdk_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        if failure_tool_report.returncode != 0:
            raise RuntimeError(
                "expected failure reportToolCall live smoke to pass, "
                f"got {failure_tool_report.returncode}: stdout={failure_tool_report.stdout!r} "
                f"stderr={failure_tool_report.stderr!r}"
            )
        if "live Arinova reportToolCall OK" not in failure_tool_report.stdout:
            raise RuntimeError(
                f"failure reportToolCall live smoke message missing: {failure_tool_report.stdout!r}"
            )
        assert_disconnected(failure_tool_report_marker, "failure reportToolCall live smoke")
        assert_sdk_call(
            read_sdk_calls(failure_tool_report_sdk_marker),
            {
                "method": "reportToolCall",
                "args": [
                    {
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
                ],
            },
            "failure reportToolCall live smoke",
        )

        bad_tool_report_shape_marker = hermes_home / "bad-tool-report-shape-disconnect.txt"
        bad_tool_report_shape = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--report-tool-call-json",
            '{"sessionId":"session-1","turnId":"turn-1","seqOrder":0,"input":{},"success":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_tool_report_shape_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_tool_report_shape, "SDK reportToolCall() probe payload must match ToolCallReport")
        assert_disconnected(bad_tool_report_shape_marker, "bad reportToolCall shape live smoke")

        bad_tool_report_unknown_marker = hermes_home / "bad-tool-report-unknown-disconnect.txt"
        bad_tool_report_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--report-tool-call-json",
            (
                '{"sessionId":"session-1","turnId":"turn-1","seqOrder":0,'
                '"toolName":"bash","input":{},"success":true,"unknown":true}'
            ),
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_tool_report_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_tool_report_unknown, "SDK reportToolCall() probe payload must match ToolCallReport")
        assert_disconnected(bad_tool_report_unknown_marker, "bad reportToolCall unknown field live smoke")

        bad_query_memory_json_marker = hermes_home / "bad-query-memory-json-disconnect.txt"
        bad_query_memory_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--query-memory-json",
            "{bad json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_query_memory_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_query_memory_json, "SDK queryMemory() probe JSON argument could not be parsed")
        assert_disconnected(bad_query_memory_json_marker, "bad queryMemory JSON live smoke")

        bad_query_memory_payload_marker = hermes_home / "bad-query-memory-payload-disconnect.txt"
        bad_query_memory_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--query-memory-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_query_memory_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_query_memory_payload, "SDK queryMemory() probe payload must be a JSON object")
        assert_disconnected(bad_query_memory_payload_marker, "bad queryMemory payload live smoke")

        bad_query_memory_shape_marker = hermes_home / "bad-query-memory-shape-disconnect.txt"
        bad_query_memory_shape = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--query-memory-json",
            '{"limit":3}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_query_memory_shape_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_query_memory_shape, "SDK queryMemory() probe payload must match QueryMemoryOptions")
        assert_disconnected(bad_query_memory_shape_marker, "bad queryMemory shape live smoke")

        bad_query_memory_unknown_marker = hermes_home / "bad-query-memory-unknown-disconnect.txt"
        bad_query_memory_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--query-memory-json",
            '{"query":"memo","unknown":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_query_memory_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_query_memory_unknown, "SDK queryMemory() probe payload must match QueryMemoryOptions")
        assert_disconnected(bad_query_memory_unknown_marker, "bad queryMemory unknown field live smoke")

        bad_query_memory_result_marker = hermes_home / "bad-query-memory-result-disconnect.txt"
        bad_query_memory_result = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--query-memory-json",
            '{"query":"bad"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_QUERY_MEMORY="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_query_memory_result_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_query_memory_result, "SDK queryMemory() returned malformed memory result")
        assert_disconnected(bad_query_memory_result_marker, "bad queryMemory result live smoke")

        bad_query_memory_entry_marker = hermes_home / "bad-query-memory-entry-disconnect.txt"
        bad_query_memory_entry = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--query-memory-json",
            '{"query":"bad-entry"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_QUERY_MEMORY_ENTRY="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_query_memory_entry_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_query_memory_entry, "SDK queryMemory() returned malformed memory result")
        assert_disconnected(bad_query_memory_entry_marker, "bad queryMemory entry live smoke")

        bad_query_memory_score_marker = hermes_home / "bad-query-memory-score-disconnect.txt"
        bad_query_memory_score = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--query-memory-json",
            '{"query":"bad-score"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_QUERY_MEMORY_SCORE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_query_memory_score_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_query_memory_score, "SDK queryMemory() returned malformed memory result")
        assert_disconnected(bad_query_memory_score_marker, "bad queryMemory score live smoke")

        bad_query_memory_origin_marker = hermes_home / "bad-query-memory-origin-disconnect.txt"
        bad_query_memory_origin = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--query-memory-json",
            '{"query":"bad-origin"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_QUERY_MEMORY_ORIGIN="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_query_memory_origin_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_query_memory_origin, "SDK queryMemory() returned malformed memory result")
        assert_disconnected(bad_query_memory_origin_marker, "bad queryMemory origin live smoke")

        bad_query_memory_shared_origin_marker = hermes_home / "bad-query-memory-shared-origin-disconnect.txt"
        bad_query_memory_shared_origin = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--query-memory-json",
            '{"query":"bad-shared-origin"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_QUERY_MEMORY_SHARED_ORIGIN="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_query_memory_shared_origin_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_query_memory_shared_origin, "SDK queryMemory() returned malformed memory result")
        assert_disconnected(bad_query_memory_shared_origin_marker, "bad queryMemory shared origin live smoke")

        bad_query_memory_null_origin_marker = hermes_home / "bad-query-memory-null-origin-disconnect.txt"
        bad_query_memory_null_origin = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--query-memory-json",
            '{"query":"bad-null-origin"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_QUERY_MEMORY_NULL_ORIGIN="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_query_memory_null_origin_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_query_memory_null_origin, "SDK queryMemory() returned malformed memory result")
        assert_disconnected(bad_query_memory_null_origin_marker, "bad queryMemory null origin live smoke")

        bad_skill_prompt_marker = hermes_home / "bad-skill-prompt-disconnect.txt"
        bad_skill_prompt = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--fetch-skill-prompt",
            "memo",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_SKILL_PROMPT="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_skill_prompt_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_skill_prompt, "SDK fetchSkillPrompt() returned malformed prompt")
        assert_disconnected(bad_skill_prompt_marker, "bad fetchSkillPrompt live smoke")

        bad_skill_prompt_parameters_marker = hermes_home / "bad-skill-prompt-parameters-disconnect.txt"
        bad_skill_prompt_parameters = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--fetch-skill-prompt",
            "memo",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_SKILL_PROMPT_PARAMETERS="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_skill_prompt_parameters_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_skill_prompt_parameters, "SDK fetchSkillPrompt() returned malformed prompt")
        assert_disconnected(bad_skill_prompt_parameters_marker, "bad fetchSkillPrompt parameters live smoke")

        bad_list_boards_marker = hermes_home / "bad-list-boards-disconnect.txt"
        bad_list_boards = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-boards",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_BOARDS="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_boards_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_boards, "SDK listBoards() returned malformed boards result")
        assert_disconnected(bad_list_boards_marker, "bad listBoards live smoke")

        bad_list_boards_entry_marker = hermes_home / "bad-list-boards-entry-disconnect.txt"
        bad_list_boards_entry = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-boards",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_BOARDS_ENTRY="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_boards_entry_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_boards_entry, "SDK listBoards() returned malformed boards result")
        assert_disconnected(bad_list_boards_entry_marker, "bad listBoards entry live smoke")

        bad_list_boards_missing_marker = hermes_home / "bad-list-boards-missing-disconnect.txt"
        bad_list_boards_missing = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-boards",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_BOARDS_MISSING_FIELD="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_boards_missing_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_boards_missing, "SDK listBoards() returned malformed boards result")
        assert_disconnected(bad_list_boards_missing_marker, "bad listBoards missing field live smoke")

        bad_list_cards_json_marker = hermes_home / "bad-list-cards-json-disconnect.txt"
        bad_list_cards_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-cards-json",
            "{not json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_cards_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_cards_json, "SDK listCards() probe JSON argument could not be parsed")
        assert_disconnected(bad_list_cards_json_marker, "bad listCards JSON live smoke")

        bad_list_cards_payload_marker = hermes_home / "bad-list-cards-payload-disconnect.txt"
        bad_list_cards_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-cards-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_cards_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_cards_payload, "SDK listCards() probe options must be a JSON object")
        assert_disconnected(bad_list_cards_payload_marker, "bad listCards payload live smoke")

        bad_list_cards_shape_marker = hermes_home / "bad-list-cards-shape-disconnect.txt"
        bad_list_cards_shape = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-cards-json",
            '{"limit":"10"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_cards_shape_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_cards_shape, "SDK listCards() probe options must match SDK listCards options")
        assert_disconnected(bad_list_cards_shape_marker, "bad listCards options shape live smoke")

        bad_list_cards_unknown_marker = hermes_home / "bad-list-cards-unknown-disconnect.txt"
        bad_list_cards_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-cards-json",
            '{"search":"memo","unknown":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_cards_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_cards_unknown, "SDK listCards() probe options must match SDK listCards options")
        assert_disconnected(bad_list_cards_unknown_marker, "bad listCards options unknown field live smoke")

        bad_list_cards_marker = hermes_home / "bad-list-cards-disconnect.txt"
        bad_list_cards = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-cards-json",
            '{"search":"live smoke"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_CARDS="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_cards_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_cards, "SDK listCards() returned malformed cards result")
        assert_disconnected(bad_list_cards_marker, "bad listCards live smoke")

        bad_list_cards_entry_marker = hermes_home / "bad-list-cards-entry-disconnect.txt"
        bad_list_cards_entry = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-cards-json",
            '{"search":"live smoke"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_CARDS_ENTRY="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_cards_entry_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_cards_entry, "SDK listCards() returned malformed cards result")
        assert_disconnected(bad_list_cards_entry_marker, "bad listCards entry live smoke")

        bad_list_cards_nullable_marker = hermes_home / "bad-list-cards-nullable-disconnect.txt"
        bad_list_cards_nullable = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-cards-json",
            '{"search":"live smoke"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_CARDS_MISSING_NULLABLE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_cards_nullable_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_cards_nullable, "SDK listCards() returned malformed cards result")
        assert_disconnected(bad_list_cards_nullable_marker, "bad listCards nullable live smoke")

        list_cards_offset_marker = hermes_home / "list-cards-offset-disconnect.txt"
        list_cards_offset_sdk_marker = hermes_home / "list-cards-offset-sdk-calls.jsonl"
        list_cards_offset = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-cards-json",
            '{"search":"offset smoke","limit":2,"offset":4}',
            "--skip-telemetry",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(list_cards_offset_marker),
                ARINOVA_FAKE_SDK_CALLS_MARKER=str(list_cards_offset_sdk_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        if list_cards_offset.returncode != 0:
            raise RuntimeError(
                "expected listCards offset live smoke to pass, "
                f"got {list_cards_offset.returncode}: stdout={list_cards_offset.stdout!r} "
                f"stderr={list_cards_offset.stderr!r}"
            )
        if "live Arinova listCards OK: cards=0" not in list_cards_offset.stdout:
            raise RuntimeError(f"listCards offset live smoke message missing: {list_cards_offset.stdout!r}")
        assert_disconnected(list_cards_offset_marker, "listCards offset live smoke")
        assert_sdk_call(
            read_sdk_calls(list_cards_offset_sdk_marker),
            {"method": "listCards", "args": [{"limit": 2, "offset": 4, "search": "offset smoke"}]},
            "listCards offset live smoke",
        )

        bad_list_notes_options_without_conversation_marker = (
            hermes_home / "bad-list-notes-options-without-conversation-disconnect.txt"
        )
        bad_list_notes_options_without_conversation = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-notes-options-json",
            '{"limit":1}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_notes_options_without_conversation_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_list_notes_options_without_conversation,
            "SDK listNotes() probe requires conversation id when notes options JSON is provided",
        )
        assert_disconnected(
            bad_list_notes_options_without_conversation_marker,
            "bad listNotes options without conversation live smoke",
        )

        bad_list_notes_json_marker = hermes_home / "bad-list-notes-json-disconnect.txt"
        bad_list_notes_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-notes-conversation",
            "conv-notes",
            "--list-notes-options-json",
            "{not json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_notes_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_notes_json, "SDK listNotes() probe JSON argument could not be parsed")
        assert_disconnected(bad_list_notes_json_marker, "bad listNotes JSON live smoke")

        bad_list_notes_payload_marker = hermes_home / "bad-list-notes-payload-disconnect.txt"
        bad_list_notes_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-notes-conversation",
            "conv-notes",
            "--list-notes-options-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_notes_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_notes_payload, "SDK listNotes() probe options must be a JSON object")
        assert_disconnected(bad_list_notes_payload_marker, "bad listNotes payload live smoke")

        bad_list_notes_shape_marker = hermes_home / "bad-list-notes-shape-disconnect.txt"
        bad_list_notes_shape = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-notes-conversation",
            "conv-notes",
            "--list-notes-options-json",
            '{"limit":"10"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_notes_shape_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_notes_shape, "SDK listNotes() probe options must match ListNotesOptions")
        assert_disconnected(bad_list_notes_shape_marker, "bad listNotes options shape live smoke")

        bad_list_notes_tags_marker = hermes_home / "bad-list-notes-tags-disconnect.txt"
        bad_list_notes_tags = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-notes-conversation",
            "conv-notes",
            "--list-notes-options-json",
            '{"tags":["memo",3]}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_notes_tags_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_notes_tags, "SDK listNotes() probe options must match ListNotesOptions")
        assert_disconnected(bad_list_notes_tags_marker, "bad listNotes options tags live smoke")

        bad_list_notes_unknown_marker = hermes_home / "bad-list-notes-unknown-disconnect.txt"
        bad_list_notes_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-notes-conversation",
            "conv-notes",
            "--list-notes-options-json",
            '{"before":"note-1","unknown":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_notes_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_notes_unknown, "SDK listNotes() probe options must match ListNotesOptions")
        assert_disconnected(bad_list_notes_unknown_marker, "bad listNotes options unknown field live smoke")

        bad_list_notes_marker = hermes_home / "bad-list-notes-disconnect.txt"
        bad_list_notes = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-notes-conversation",
            "conv-notes",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_NOTES="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_notes_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_notes, "SDK listNotes() returned malformed notes result")
        assert_disconnected(bad_list_notes_marker, "bad listNotes live smoke")

        bad_list_notes_metadata_marker = hermes_home / "bad-list-notes-metadata-disconnect.txt"
        bad_list_notes_metadata = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-notes-conversation",
            "conv-notes",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_NOTES_METADATA="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_notes_metadata_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_notes_metadata, "SDK listNotes() returned malformed notes result")
        assert_disconnected(bad_list_notes_metadata_marker, "bad listNotes metadata live smoke")

        bad_list_notes_null_cursor_marker = hermes_home / "bad-list-notes-null-cursor-disconnect.txt"
        bad_list_notes_null_cursor = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-notes-conversation",
            "conv-notes",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_NOTES_NULL_CURSOR="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_notes_null_cursor_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_notes_null_cursor, "SDK listNotes() returned malformed notes result")
        assert_disconnected(bad_list_notes_null_cursor_marker, "bad listNotes null cursor live smoke")

        bad_list_notes_entry_marker = hermes_home / "bad-list-notes-entry-disconnect.txt"
        bad_list_notes_entry = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-notes-conversation",
            "conv-notes",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_NOTES_ENTRY="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_notes_entry_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_notes_entry, "SDK listNotes() returned malformed notes result")
        assert_disconnected(bad_list_notes_entry_marker, "bad listNotes entry live smoke")

        list_notes_pagination_marker = hermes_home / "list-notes-pagination-disconnect.txt"
        list_notes_pagination_sdk_marker = hermes_home / "list-notes-pagination-sdk-calls.jsonl"
        list_notes_pagination = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-notes-conversation",
            "conv-notes",
            "--list-notes-options-json",
            '{"before":"note-before","limit":2,"offset":3,"tags":["memo","live"],"archived":true}',
            "--skip-telemetry",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(list_notes_pagination_marker),
                ARINOVA_FAKE_SDK_CALLS_MARKER=str(list_notes_pagination_sdk_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        if list_notes_pagination.returncode != 0:
            raise RuntimeError(
                "expected listNotes pagination live smoke to pass, "
                f"got {list_notes_pagination.returncode}: stdout={list_notes_pagination.stdout!r} "
                f"stderr={list_notes_pagination.stderr!r}"
            )
        if "live Arinova listNotes OK: conversation_id=conv-notes notes=0" not in list_notes_pagination.stdout:
            raise RuntimeError(
                f"listNotes pagination live smoke message missing: {list_notes_pagination.stdout!r}"
            )
        assert_disconnected(list_notes_pagination_marker, "listNotes pagination live smoke")
        assert_sdk_call(
            read_sdk_calls(list_notes_pagination_sdk_marker),
            {
                "method": "listNotes",
                "args": [
                    "conv-notes",
                    {
                        "archived": True,
                        "before": "note-before",
                        "limit": 2,
                        "offset": 3,
                        "tags": ["memo", "live"],
                    },
                ],
            },
            "listNotes pagination live smoke",
        )

        bad_list_columns_marker = hermes_home / "bad-list-columns-disconnect.txt"
        bad_list_columns = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-columns-board",
            "board-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_COLUMNS="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_columns_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_columns, "SDK listColumns() returned malformed columns result")
        assert_disconnected(bad_list_columns_marker, "bad listColumns live smoke")

        bad_list_columns_entry_marker = hermes_home / "bad-list-columns-entry-disconnect.txt"
        bad_list_columns_entry = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-columns-board",
            "board-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_COLUMNS_ENTRY="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_columns_entry_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_columns_entry, "SDK listColumns() returned malformed columns result")
        assert_disconnected(bad_list_columns_entry_marker, "bad listColumns entry live smoke")

        bad_list_columns_missing_marker = hermes_home / "bad-list-columns-missing-disconnect.txt"
        bad_list_columns_missing = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-columns-board",
            "board-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_COLUMNS_MISSING_FIELD="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_columns_missing_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_columns_missing, "SDK listColumns() returned malformed columns result")
        assert_disconnected(bad_list_columns_missing_marker, "bad listColumns missing field live smoke")

        bad_list_labels_marker = hermes_home / "bad-list-labels-disconnect.txt"
        bad_list_labels = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-labels-board",
            "board-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_LABELS="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_labels_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_labels, "SDK listLabels() returned malformed labels result")
        assert_disconnected(bad_list_labels_marker, "bad listLabels live smoke")

        bad_list_labels_entry_marker = hermes_home / "bad-list-labels-entry-disconnect.txt"
        bad_list_labels_entry = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-labels-board",
            "board-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_LABELS_ENTRY="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_labels_entry_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_labels_entry, "SDK listLabels() returned malformed labels result")
        assert_disconnected(bad_list_labels_entry_marker, "bad listLabels entry live smoke")

        bad_list_labels_missing_marker = hermes_home / "bad-list-labels-missing-disconnect.txt"
        bad_list_labels_missing = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-labels-board",
            "board-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_LABELS_MISSING_FIELD="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_labels_missing_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_labels_missing, "SDK listLabels() returned malformed labels result")
        assert_disconnected(bad_list_labels_missing_marker, "bad listLabels missing field live smoke")

        bad_list_archived_cards_options_without_board_marker = (
            hermes_home / "bad-list-archived-cards-options-without-board-disconnect.txt"
        )
        bad_list_archived_cards_options_without_board = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-archived-cards-options-json",
            '{"limit":1}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_archived_cards_options_without_board_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_list_archived_cards_options_without_board,
            "SDK listArchivedCards() probe requires board id when archived cards options JSON is provided",
        )
        assert_disconnected(
            bad_list_archived_cards_options_without_board_marker,
            "bad listArchivedCards options without board live smoke",
        )

        bad_list_archived_cards_json_marker = hermes_home / "bad-list-archived-cards-json-disconnect.txt"
        bad_list_archived_cards_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-archived-cards-board",
            "board-live",
            "--list-archived-cards-options-json",
            "{not json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_archived_cards_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_list_archived_cards_json,
            "SDK listArchivedCards() probe JSON argument could not be parsed",
        )
        assert_disconnected(bad_list_archived_cards_json_marker, "bad listArchivedCards JSON live smoke")

        bad_list_archived_cards_payload_marker = hermes_home / "bad-list-archived-cards-payload-disconnect.txt"
        bad_list_archived_cards_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-archived-cards-board",
            "board-live",
            "--list-archived-cards-options-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_archived_cards_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_list_archived_cards_payload,
            "SDK listArchivedCards() probe options must be a JSON object",
        )
        assert_disconnected(bad_list_archived_cards_payload_marker, "bad listArchivedCards payload live smoke")

        bad_list_archived_cards_shape_marker = hermes_home / "bad-list-archived-cards-shape-disconnect.txt"
        bad_list_archived_cards_shape = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-archived-cards-board",
            "board-live",
            "--list-archived-cards-options-json",
            '{"page":"1"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_archived_cards_shape_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_list_archived_cards_shape,
            "SDK listArchivedCards() probe options must match SDK listArchivedCards options",
        )
        assert_disconnected(
            bad_list_archived_cards_shape_marker,
            "bad listArchivedCards options shape live smoke",
        )

        bad_list_archived_cards_unknown_marker = hermes_home / "bad-list-archived-cards-unknown-disconnect.txt"
        bad_list_archived_cards_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-archived-cards-board",
            "board-live",
            "--list-archived-cards-options-json",
            '{"limit":10,"unknown":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_archived_cards_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_list_archived_cards_unknown,
            "SDK listArchivedCards() probe options must match SDK listArchivedCards options",
        )
        assert_disconnected(
            bad_list_archived_cards_unknown_marker,
            "bad listArchivedCards options unknown field live smoke",
        )

        bad_list_archived_cards_marker = hermes_home / "bad-list-archived-cards-disconnect.txt"
        bad_list_archived_cards = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-archived-cards-board",
            "board-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_ARCHIVED_CARDS="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_archived_cards_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_list_archived_cards,
            "SDK listArchivedCards() returned malformed archived cards result",
        )
        assert_disconnected(bad_list_archived_cards_marker, "bad listArchivedCards live smoke")

        bad_list_archived_cards_metadata_marker = (
            hermes_home / "bad-list-archived-cards-metadata-disconnect.txt"
        )
        bad_list_archived_cards_metadata = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-archived-cards-board",
            "board-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_ARCHIVED_CARDS_METADATA="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_archived_cards_metadata_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_list_archived_cards_metadata,
            "SDK listArchivedCards() returned malformed archived cards result",
        )
        assert_disconnected(
            bad_list_archived_cards_metadata_marker,
            "bad listArchivedCards metadata live smoke",
        )

        bad_list_archived_cards_entry_marker = hermes_home / "bad-list-archived-cards-entry-disconnect.txt"
        bad_list_archived_cards_entry = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-archived-cards-board",
            "board-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_ARCHIVED_CARDS_ENTRY="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_archived_cards_entry_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_list_archived_cards_entry,
            "SDK listArchivedCards() returned malformed archived cards result",
        )
        assert_disconnected(bad_list_archived_cards_entry_marker, "bad listArchivedCards entry live smoke")

        bad_list_archived_cards_nullable_marker = (
            hermes_home / "bad-list-archived-cards-nullable-disconnect.txt"
        )
        bad_list_archived_cards_nullable = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-archived-cards-board",
            "board-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_ARCHIVED_CARDS_MISSING_NULLABLE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_archived_cards_nullable_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_list_archived_cards_nullable,
            "SDK listArchivedCards() returned malformed archived cards result",
        )
        assert_disconnected(
            bad_list_archived_cards_nullable_marker,
            "bad listArchivedCards nullable live smoke",
        )

        bad_list_card_commits_marker = hermes_home / "bad-list-card-commits-disconnect.txt"
        bad_list_card_commits = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-card-commits-card",
            "card-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_CARD_COMMITS="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_card_commits_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_card_commits, "SDK listCardCommits() returned malformed commits result")
        assert_disconnected(bad_list_card_commits_marker, "bad listCardCommits live smoke")

        bad_list_card_commits_entry_marker = hermes_home / "bad-list-card-commits-entry-disconnect.txt"
        bad_list_card_commits_entry = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-card-commits-card",
            "card-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_CARD_COMMITS_ENTRY="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_card_commits_entry_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_card_commits_entry, "SDK listCardCommits() returned malformed commits result")
        assert_disconnected(bad_list_card_commits_entry_marker, "bad listCardCommits entry live smoke")

        bad_list_card_commits_missing_marker = hermes_home / "bad-list-card-commits-missing-disconnect.txt"
        bad_list_card_commits_missing = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-card-commits-card",
            "card-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_CARD_COMMITS_MISSING_FIELD="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_card_commits_missing_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_card_commits_missing, "SDK listCardCommits() returned malformed commits result")
        assert_disconnected(bad_list_card_commits_missing_marker, "bad listCardCommits missing field live smoke")

        bad_list_card_notes_marker = hermes_home / "bad-list-card-notes-disconnect.txt"
        bad_list_card_notes = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-card-notes-card",
            "card-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_CARD_NOTES="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_card_notes_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_card_notes, "SDK listCardNotes() returned malformed card notes result")
        assert_disconnected(bad_list_card_notes_marker, "bad listCardNotes live smoke")

        bad_list_card_notes_entry_marker = hermes_home / "bad-list-card-notes-entry-disconnect.txt"
        bad_list_card_notes_entry = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-card-notes-card",
            "card-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_CARD_NOTES_ENTRY="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_card_notes_entry_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_card_notes_entry, "SDK listCardNotes() returned malformed card notes result")
        assert_disconnected(bad_list_card_notes_entry_marker, "bad listCardNotes entry live smoke")

        bad_list_card_notes_tags_marker = hermes_home / "bad-list-card-notes-tags-disconnect.txt"
        bad_list_card_notes_tags = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--list-card-notes-card",
            "card-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_LIST_CARD_NOTES_TAGS="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_list_card_notes_tags_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_list_card_notes_tags, "SDK listCardNotes() returned malformed card notes result")
        assert_disconnected(bad_list_card_notes_tags_marker, "bad listCardNotes tags live smoke")

        create_note_notebook_marker = hermes_home / "create-note-notebook-disconnect.txt"
        create_note_notebook_sdk_marker = hermes_home / "create-note-notebook-sdk-calls.jsonl"
        create_note_notebook = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-note-conversation",
            "conv-note",
            "--create-note-body-json",
            (
                '{"title":"Notebook live smoke note","content":"Created with notebookId",'
                '"tags":["live","notebook"],"notebookId":"book-live"}'
            ),
            "--skip-telemetry",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(create_note_notebook_marker),
                ARINOVA_FAKE_SDK_CALLS_MARKER=str(create_note_notebook_sdk_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        if create_note_notebook.returncode != 0:
            raise RuntimeError(
                "expected createNote notebookId live smoke to pass, "
                f"got {create_note_notebook.returncode}: stdout={create_note_notebook.stdout!r} "
                f"stderr={create_note_notebook.stderr!r}"
            )
        if "live Arinova createNote OK: conversation_id=conv-note note_id=note-live" not in create_note_notebook.stdout:
            raise RuntimeError(
                f"createNote notebookId live smoke message missing: {create_note_notebook.stdout!r}"
            )
        assert_disconnected(create_note_notebook_marker, "createNote notebookId live smoke")
        assert_sdk_call(
            read_sdk_calls(create_note_notebook_sdk_marker),
            {
                "method": "createNote",
                "args": [
                    "conv-note",
                    {
                        "title": "Notebook live smoke note",
                        "content": "Created with notebookId",
                        "tags": ["live", "notebook"],
                        "notebookId": "book-live",
                    },
                ],
            },
            "createNote notebookId live smoke",
        )

        bad_create_note_partial_marker = hermes_home / "bad-create-note-partial-disconnect.txt"
        bad_create_note_partial = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-note-conversation",
            "conv-note",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_note_partial_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_note_partial, "SDK createNote() probe requires both conversation id and note body JSON")
        assert_disconnected(bad_create_note_partial_marker, "bad createNote partial live smoke")

        bad_create_note_json_marker = hermes_home / "bad-create-note-json-disconnect.txt"
        bad_create_note_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-note-conversation",
            "conv-note",
            "--create-note-body-json",
            "{not json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_note_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_note_json, "SDK createNote() probe JSON argument could not be parsed")
        assert_disconnected(bad_create_note_json_marker, "bad createNote JSON live smoke")

        bad_create_note_payload_marker = hermes_home / "bad-create-note-payload-disconnect.txt"
        bad_create_note_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-note-conversation",
            "conv-note",
            "--create-note-body-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_note_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_note_payload, "SDK createNote() probe body must be a JSON object")
        assert_disconnected(bad_create_note_payload_marker, "bad createNote payload live smoke")

        bad_create_note_shape_marker = hermes_home / "bad-create-note-shape-disconnect.txt"
        bad_create_note_shape = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-note-conversation",
            "conv-note",
            "--create-note-body-json",
            '{"content":"missing title"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_note_shape_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_note_shape, "SDK createNote() probe body must match CreateNoteBody")
        assert_disconnected(bad_create_note_shape_marker, "bad createNote body shape live smoke")

        bad_create_note_tags_marker = hermes_home / "bad-create-note-tags-disconnect.txt"
        bad_create_note_tags = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-note-conversation",
            "conv-note",
            "--create-note-body-json",
            '{"title":"Live smoke note","tags":["memo",3]}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_note_tags_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_note_tags, "SDK createNote() probe body must match CreateNoteBody")
        assert_disconnected(bad_create_note_tags_marker, "bad createNote body tags live smoke")

        bad_create_note_unknown_marker = hermes_home / "bad-create-note-unknown-disconnect.txt"
        bad_create_note_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-note-conversation",
            "conv-note",
            "--create-note-body-json",
            '{"title":"Live smoke note","unknown":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_note_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_note_unknown, "SDK createNote() probe body must match CreateNoteBody")
        assert_disconnected(bad_create_note_unknown_marker, "bad createNote body unknown field live smoke")

        bad_create_note_marker = hermes_home / "bad-create-note-disconnect.txt"
        bad_create_note = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-note-conversation",
            "conv-note",
            "--create-note-body-json",
            '{"title":"Live smoke note"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CREATE_NOTE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_note_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_note, "SDK createNote() returned malformed note result")
        assert_disconnected(bad_create_note_marker, "bad createNote live smoke")

        bad_create_note_entry_marker = hermes_home / "bad-create-note-entry-disconnect.txt"
        bad_create_note_entry = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-note-conversation",
            "conv-note",
            "--create-note-body-json",
            '{"title":"Live smoke note"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CREATE_NOTE_ENTRY="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_note_entry_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_note_entry, "SDK createNote() returned malformed note result")
        assert_disconnected(bad_create_note_entry_marker, "bad createNote entry live smoke")

        bad_create_note_null_optional_marker = hermes_home / "bad-create-note-null-optional-disconnect.txt"
        bad_create_note_null_optional = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-note-conversation",
            "conv-note",
            "--create-note-body-json",
            '{"title":"Live smoke note"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CREATE_NOTE_NULL_OPTIONAL="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_note_null_optional_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_note_null_optional, "SDK createNote() returned malformed note result")
        assert_disconnected(bad_create_note_null_optional_marker, "bad createNote null optional live smoke")

        bad_create_note_null_tags_marker = hermes_home / "bad-create-note-null-tags-disconnect.txt"
        bad_create_note_null_tags = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-note-conversation",
            "conv-note",
            "--create-note-body-json",
            '{"title":"Live smoke note"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CREATE_NOTE_NULL_TAGS="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_note_null_tags_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_note_null_tags, "SDK createNote() returned malformed note result")
        assert_disconnected(bad_create_note_null_tags_marker, "bad createNote null tags live smoke")

        bad_update_note_partial_marker = hermes_home / "bad-update-note-partial-disconnect.txt"
        bad_update_note_partial = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-note-conversation",
            "conv-note",
            "--update-note-id",
            "note-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_note_partial_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_update_note_partial,
            "SDK updateNote() probe requires conversation id, note id, and note body JSON",
        )
        assert_disconnected(bad_update_note_partial_marker, "bad updateNote partial live smoke")

        bad_update_note_json_marker = hermes_home / "bad-update-note-json-disconnect.txt"
        bad_update_note_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-note-conversation",
            "conv-note",
            "--update-note-id",
            "note-live",
            "--update-note-body-json",
            "{not json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_note_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_note_json, "SDK updateNote() probe JSON argument could not be parsed")
        assert_disconnected(bad_update_note_json_marker, "bad updateNote JSON live smoke")

        bad_update_note_payload_marker = hermes_home / "bad-update-note-payload-disconnect.txt"
        bad_update_note_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-note-conversation",
            "conv-note",
            "--update-note-id",
            "note-live",
            "--update-note-body-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_note_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_note_payload, "SDK updateNote() probe body must be a JSON object")
        assert_disconnected(bad_update_note_payload_marker, "bad updateNote payload live smoke")

        bad_update_note_tags_marker = hermes_home / "bad-update-note-tags-disconnect.txt"
        bad_update_note_tags = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-note-conversation",
            "conv-note",
            "--update-note-id",
            "note-live",
            "--update-note-body-json",
            '{"tags":["memo",3]}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_note_tags_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_note_tags, "SDK updateNote() probe body must match UpdateNoteBody")
        assert_disconnected(bad_update_note_tags_marker, "bad updateNote body tags live smoke")

        bad_update_note_unknown_marker = hermes_home / "bad-update-note-unknown-disconnect.txt"
        bad_update_note_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-note-conversation",
            "conv-note",
            "--update-note-id",
            "note-live",
            "--update-note-body-json",
            '{"title":"Updated live smoke note","unknown":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_note_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_note_unknown, "SDK updateNote() probe body must match UpdateNoteBody")
        assert_disconnected(bad_update_note_unknown_marker, "bad updateNote body unknown field live smoke")

        bad_update_note_marker = hermes_home / "bad-update-note-disconnect.txt"
        bad_update_note = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-note-conversation",
            "conv-note",
            "--update-note-id",
            "note-live",
            "--update-note-body-json",
            '{"title":"Updated live smoke note"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_UPDATE_NOTE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_note_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_note, "SDK updateNote() returned malformed note result")
        assert_disconnected(bad_update_note_marker, "bad updateNote live smoke")

        bad_update_note_entry_marker = hermes_home / "bad-update-note-entry-disconnect.txt"
        bad_update_note_entry = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-note-conversation",
            "conv-note",
            "--update-note-id",
            "note-live",
            "--update-note-body-json",
            '{"title":"Updated live smoke note"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_UPDATE_NOTE_ENTRY="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_note_entry_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_note_entry, "SDK updateNote() returned malformed note result")
        assert_disconnected(bad_update_note_entry_marker, "bad updateNote entry live smoke")

        bad_update_note_null_tags_marker = hermes_home / "bad-update-note-null-tags-disconnect.txt"
        bad_update_note_null_tags = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-note-conversation",
            "conv-note",
            "--update-note-id",
            "note-live",
            "--update-note-body-json",
            '{"title":"Updated live smoke note"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_UPDATE_NOTE_NULL_TAGS="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_note_null_tags_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_note_null_tags, "SDK updateNote() returned malformed note result")
        assert_disconnected(bad_update_note_null_tags_marker, "bad updateNote null tags live smoke")

        bad_delete_note_partial_marker = hermes_home / "bad-delete-note-partial-disconnect.txt"
        bad_delete_note_partial = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--delete-note-conversation",
            "conv-note",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_delete_note_partial_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_delete_note_partial, "SDK deleteNote() probe requires both conversation id and note id")
        assert_disconnected(bad_delete_note_partial_marker, "bad deleteNote partial live smoke")

        delete_note_failure_marker = hermes_home / "delete-note-failure-disconnect.txt"
        delete_note_failure = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--delete-note-conversation",
            "conv-note",
            "--delete-note-id",
            "note-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_REJECT_DELETE_NOTE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(delete_note_failure_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(delete_note_failure, "fake deleteNote rejected")
        assert_disconnected(delete_note_failure_marker, "deleteNote failure live smoke")

        bad_create_board_json_marker = hermes_home / "bad-create-board-json-disconnect.txt"
        bad_create_board_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-board-body-json",
            "{not json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_board_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_board_json, "SDK createBoard() probe JSON argument could not be parsed")
        assert_disconnected(bad_create_board_json_marker, "bad createBoard JSON live smoke")

        bad_create_board_payload_marker = hermes_home / "bad-create-board-payload-disconnect.txt"
        bad_create_board_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-board-body-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_board_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_board_payload, "SDK createBoard() probe body must be a JSON object")
        assert_disconnected(bad_create_board_payload_marker, "bad createBoard payload live smoke")

        bad_create_board_shape_marker = hermes_home / "bad-create-board-shape-disconnect.txt"
        bad_create_board_shape = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-board-body-json",
            '{"columns":[{"name":"Todo"}]}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_board_shape_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_board_shape, "SDK createBoard() probe body must match CreateBoardBody")
        assert_disconnected(bad_create_board_shape_marker, "bad createBoard body shape live smoke")

        bad_create_board_columns_marker = hermes_home / "bad-create-board-columns-disconnect.txt"
        bad_create_board_columns = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-board-body-json",
            '{"name":"Live smoke board","columns":[{"name":3}]}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_board_columns_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_board_columns, "SDK createBoard() probe body must match CreateBoardBody")
        assert_disconnected(bad_create_board_columns_marker, "bad createBoard body columns live smoke")

        bad_create_board_unknown_marker = hermes_home / "bad-create-board-unknown-disconnect.txt"
        bad_create_board_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-board-body-json",
            '{"name":"Live smoke board","unknown":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_board_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_board_unknown, "SDK createBoard() probe body must match CreateBoardBody")
        assert_disconnected(bad_create_board_unknown_marker, "bad createBoard body unknown field live smoke")

        bad_create_board_marker = hermes_home / "bad-create-board-disconnect.txt"
        bad_create_board = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-board-body-json",
            '{"name":"Live smoke board"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CREATE_BOARD="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_board_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_board, "SDK createBoard() returned malformed board result")
        assert_disconnected(bad_create_board_marker, "bad createBoard live smoke")

        bad_create_board_created_at_marker = hermes_home / "bad-create-board-created-at-disconnect.txt"
        bad_create_board_created_at = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-board-body-json",
            '{"name":"Live smoke board"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CREATE_BOARD_CREATED_AT="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_board_created_at_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_board_created_at, "SDK createBoard() returned malformed board result")
        assert_disconnected(bad_create_board_created_at_marker, "bad createBoard createdAt live smoke")

        create_board_no_columns_marker = hermes_home / "create-board-no-columns-disconnect.txt"
        create_board_no_columns_sdk_marker = hermes_home / "create-board-no-columns-sdk-calls.jsonl"
        create_board_no_columns = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-board-body-json",
            '{"name":"No columns live smoke board"}',
            "--skip-telemetry",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(create_board_no_columns_marker),
                ARINOVA_FAKE_SDK_CALLS_MARKER=str(create_board_no_columns_sdk_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        if create_board_no_columns.returncode != 0:
            raise RuntimeError(
                "expected createBoard no-columns live smoke to pass, "
                f"got {create_board_no_columns.returncode}: stdout={create_board_no_columns.stdout!r} "
                f"stderr={create_board_no_columns.stderr!r}"
            )
        if "live Arinova createBoard OK: board_id=board-live" not in create_board_no_columns.stdout:
            raise RuntimeError(f"createBoard no-columns live smoke message missing: {create_board_no_columns.stdout!r}")
        assert_disconnected(create_board_no_columns_marker, "createBoard no-columns live smoke")
        assert_sdk_call(
            read_sdk_calls(create_board_no_columns_sdk_marker),
            {"method": "createBoard", "args": [{"name": "No columns live smoke board"}]},
            "createBoard no-columns live smoke",
        )

        bad_update_board_partial_marker = hermes_home / "bad-update-board-partial-disconnect.txt"
        bad_update_board_partial = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-board-id",
            "board-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_board_partial_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_board_partial, "SDK updateBoard() probe requires both board id and board body JSON")
        assert_disconnected(bad_update_board_partial_marker, "bad updateBoard partial live smoke")

        bad_update_board_json_marker = hermes_home / "bad-update-board-json-disconnect.txt"
        bad_update_board_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-board-id",
            "board-live",
            "--update-board-body-json",
            "{not json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_board_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_board_json, "SDK updateBoard() probe JSON argument could not be parsed")
        assert_disconnected(bad_update_board_json_marker, "bad updateBoard JSON live smoke")

        bad_update_board_payload_marker = hermes_home / "bad-update-board-payload-disconnect.txt"
        bad_update_board_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-board-id",
            "board-live",
            "--update-board-body-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_board_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_board_payload, "SDK updateBoard() probe body must be a JSON object")
        assert_disconnected(bad_update_board_payload_marker, "bad updateBoard payload live smoke")

        bad_update_board_shape_marker = hermes_home / "bad-update-board-shape-disconnect.txt"
        bad_update_board_shape = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-board-id",
            "board-live",
            "--update-board-body-json",
            '{}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_board_shape_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_board_shape, "SDK updateBoard() probe body must match UpdateBoardBody")
        assert_disconnected(bad_update_board_shape_marker, "bad updateBoard body shape live smoke")

        bad_update_board_name_marker = hermes_home / "bad-update-board-name-disconnect.txt"
        bad_update_board_name = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-board-id",
            "board-live",
            "--update-board-body-json",
            '{"name":3}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_board_name_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_board_name, "SDK updateBoard() probe body must match UpdateBoardBody")
        assert_disconnected(bad_update_board_name_marker, "bad updateBoard body name live smoke")

        bad_update_board_unknown_marker = hermes_home / "bad-update-board-unknown-disconnect.txt"
        bad_update_board_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-board-id",
            "board-live",
            "--update-board-body-json",
            '{"name":"Live smoke board","unknown":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_board_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_board_unknown, "SDK updateBoard() probe body must match UpdateBoardBody")
        assert_disconnected(bad_update_board_unknown_marker, "bad updateBoard body unknown field live smoke")

        bad_update_board_marker = hermes_home / "bad-update-board-disconnect.txt"
        bad_update_board = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-board-id",
            "board-live",
            "--update-board-body-json",
            '{"name":"Updated live smoke board"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_UPDATE_BOARD="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_board_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_board, "SDK updateBoard() returned malformed board result")
        assert_disconnected(bad_update_board_marker, "bad updateBoard live smoke")

        bad_update_board_created_at_marker = hermes_home / "bad-update-board-created-at-disconnect.txt"
        bad_update_board_created_at = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-board-id",
            "board-live",
            "--update-board-body-json",
            '{"name":"Updated live smoke board"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_UPDATE_BOARD_CREATED_AT="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_board_created_at_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_board_created_at, "SDK updateBoard() returned malformed board result")
        assert_disconnected(bad_update_board_created_at_marker, "bad updateBoard createdAt live smoke")

        archive_board_failure_marker = hermes_home / "archive-board-failure-disconnect.txt"
        archive_board_failure = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--archive-board-id",
            "board-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_REJECT_ARCHIVE_BOARD="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(archive_board_failure_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(archive_board_failure, "fake archiveBoard rejected")
        assert_disconnected(archive_board_failure_marker, "archiveBoard failure live smoke")

        bad_create_card_json_marker = hermes_home / "bad-create-card-json-disconnect.txt"
        bad_create_card_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-card-body-json",
            "{not json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_card_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_card_json, "SDK createCard() probe JSON argument could not be parsed")
        assert_disconnected(bad_create_card_json_marker, "bad createCard JSON live smoke")

        bad_create_card_payload_marker = hermes_home / "bad-create-card-payload-disconnect.txt"
        bad_create_card_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-card-body-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_card_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_card_payload, "SDK createCard() probe body must be a JSON object")
        assert_disconnected(bad_create_card_payload_marker, "bad createCard payload live smoke")

        bad_create_card_shape_marker = hermes_home / "bad-create-card-shape-disconnect.txt"
        bad_create_card_shape = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-card-body-json",
            '{}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_card_shape_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_card_shape, "SDK createCard() probe body must match CreateCardBody")
        assert_disconnected(bad_create_card_shape_marker, "bad createCard body shape live smoke")

        bad_create_card_description_marker = hermes_home / "bad-create-card-description-disconnect.txt"
        bad_create_card_description = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-card-body-json",
            '{"title":"Live smoke card","description":3}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_card_description_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_card_description, "SDK createCard() probe body must match CreateCardBody")
        assert_disconnected(bad_create_card_description_marker, "bad createCard body description live smoke")

        bad_create_card_unknown_marker = hermes_home / "bad-create-card-unknown-disconnect.txt"
        bad_create_card_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-card-body-json",
            '{"title":"Live smoke card","unknown":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_card_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_card_unknown, "SDK createCard() probe body must match CreateCardBody")
        assert_disconnected(bad_create_card_unknown_marker, "bad createCard body unknown field live smoke")

        bad_create_card_marker = hermes_home / "bad-create-card-disconnect.txt"
        bad_create_card = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-card-body-json",
            '{"title":"Live smoke card"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CREATE_CARD="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_card_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_card, "SDK createCard() returned malformed card result")
        assert_disconnected(bad_create_card_marker, "bad createCard live smoke")

        bad_create_card_nullable_marker = hermes_home / "bad-create-card-nullable-disconnect.txt"
        bad_create_card_nullable = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-card-body-json",
            '{"title":"Live smoke card"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CREATE_CARD_MISSING_NULLABLE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_card_nullable_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_card_nullable, "SDK createCard() returned malformed card result")
        assert_disconnected(bad_create_card_nullable_marker, "bad createCard nullable live smoke")

        bad_create_card_column_name_marker = hermes_home / "bad-create-card-column-name-disconnect.txt"
        bad_create_card_column_name = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-card-body-json",
            '{"title":"Live smoke card"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CREATE_CARD_NULL_COLUMN_NAME="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_card_column_name_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_card_column_name, "SDK createCard() returned malformed card result")
        assert_disconnected(bad_create_card_column_name_marker, "bad createCard columnName live smoke")

        bad_create_card_archived_at_marker = hermes_home / "bad-create-card-archived-at-disconnect.txt"
        bad_create_card_archived_at = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-card-body-json",
            '{"title":"Live smoke card"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CREATE_CARD_ARCHIVED_AT="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_card_archived_at_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_card_archived_at, "SDK createCard() returned malformed card result")
        assert_disconnected(bad_create_card_archived_at_marker, "bad createCard archivedAt live smoke")

        create_card_column_id_marker = hermes_home / "create-card-column-id-disconnect.txt"
        create_card_column_id_sdk_marker = hermes_home / "create-card-column-id-sdk-calls.jsonl"
        create_card_column_id = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-card-body-json",
            (
                '{"title":"Column id live smoke card","description":"Created with columnId",'
                '"priority":"medium","columnId":"column-live","boardId":"board-live"}'
            ),
            "--skip-telemetry",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(create_card_column_id_marker),
                ARINOVA_FAKE_SDK_CALLS_MARKER=str(create_card_column_id_sdk_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        if create_card_column_id.returncode != 0:
            raise RuntimeError(
                "expected createCard columnId live smoke to pass, "
                f"got {create_card_column_id.returncode}: stdout={create_card_column_id.stdout!r} "
                f"stderr={create_card_column_id.stderr!r}"
            )
        if "live Arinova createCard OK: card_id=card-live" not in create_card_column_id.stdout:
            raise RuntimeError(
                f"createCard columnId live smoke message missing: {create_card_column_id.stdout!r}"
            )
        assert_disconnected(create_card_column_id_marker, "createCard columnId live smoke")
        assert_sdk_call(
            read_sdk_calls(create_card_column_id_sdk_marker),
            {
                "method": "createCard",
                "args": [
                    {
                        "title": "Column id live smoke card",
                        "description": "Created with columnId",
                        "priority": "medium",
                        "columnId": "column-live",
                        "boardId": "board-live",
                    }
                ],
            },
            "createCard columnId live smoke",
        )

        bad_update_card_partial_marker = hermes_home / "bad-update-card-partial-disconnect.txt"
        bad_update_card_partial = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-card-id",
            "card-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_card_partial_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_card_partial, "SDK updateCard() probe requires both card id and card body JSON")
        assert_disconnected(bad_update_card_partial_marker, "bad updateCard partial live smoke")

        bad_update_card_json_marker = hermes_home / "bad-update-card-json-disconnect.txt"
        bad_update_card_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-card-id",
            "card-live",
            "--update-card-body-json",
            "{not json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_card_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_card_json, "SDK updateCard() probe JSON argument could not be parsed")
        assert_disconnected(bad_update_card_json_marker, "bad updateCard JSON live smoke")

        bad_update_card_payload_marker = hermes_home / "bad-update-card-payload-disconnect.txt"
        bad_update_card_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-card-id",
            "card-live",
            "--update-card-body-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_card_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_card_payload, "SDK updateCard() probe body must be a JSON object")
        assert_disconnected(bad_update_card_payload_marker, "bad updateCard payload live smoke")

        bad_update_card_title_marker = hermes_home / "bad-update-card-title-disconnect.txt"
        bad_update_card_title = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-card-id",
            "card-live",
            "--update-card-body-json",
            '{"title":3}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_card_title_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_card_title, "SDK updateCard() probe body must match UpdateCardBody")
        assert_disconnected(bad_update_card_title_marker, "bad updateCard body title live smoke")

        bad_update_card_sort_order_marker = hermes_home / "bad-update-card-sort-order-disconnect.txt"
        bad_update_card_sort_order = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-card-id",
            "card-live",
            "--update-card-body-json",
            '{"sortOrder":"1"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_card_sort_order_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_card_sort_order, "SDK updateCard() probe body must match UpdateCardBody")
        assert_disconnected(bad_update_card_sort_order_marker, "bad updateCard body sortOrder live smoke")

        bad_update_card_unknown_marker = hermes_home / "bad-update-card-unknown-disconnect.txt"
        bad_update_card_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-card-id",
            "card-live",
            "--update-card-body-json",
            '{"title":"Updated live smoke card","unknown":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_card_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_card_unknown, "SDK updateCard() probe body must match UpdateCardBody")
        assert_disconnected(bad_update_card_unknown_marker, "bad updateCard body unknown field live smoke")

        bad_update_card_marker = hermes_home / "bad-update-card-disconnect.txt"
        bad_update_card = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-card-id",
            "card-live",
            "--update-card-body-json",
            '{"title":"Updated live smoke card"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_UPDATE_CARD="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_card_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_card, "SDK updateCard() returned malformed card result")
        assert_disconnected(bad_update_card_marker, "bad updateCard live smoke")

        bad_update_card_nullable_marker = hermes_home / "bad-update-card-nullable-disconnect.txt"
        bad_update_card_nullable = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-card-id",
            "card-live",
            "--update-card-body-json",
            '{"title":"Updated live smoke card"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_UPDATE_CARD_MISSING_NULLABLE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_card_nullable_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_card_nullable, "SDK updateCard() returned malformed card result")
        assert_disconnected(bad_update_card_nullable_marker, "bad updateCard nullable live smoke")

        bad_complete_card_marker = hermes_home / "bad-complete-card-disconnect.txt"
        bad_complete_card = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--complete-card-id",
            "card-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_COMPLETE_CARD="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_complete_card_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_complete_card, "SDK completeCard() returned malformed card result")
        assert_disconnected(bad_complete_card_marker, "bad completeCard live smoke")

        bad_complete_card_sort_order_marker = hermes_home / "bad-complete-card-sort-order-disconnect.txt"
        bad_complete_card_sort_order = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--complete-card-id",
            "card-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_COMPLETE_CARD_SORT_ORDER="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_complete_card_sort_order_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_complete_card_sort_order, "SDK completeCard() returned malformed card result")
        assert_disconnected(bad_complete_card_sort_order_marker, "bad completeCard sortOrder live smoke")

        bad_create_column_partial_marker = hermes_home / "bad-create-column-partial-disconnect.txt"
        bad_create_column_partial = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-column-board",
            "board-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_column_partial_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_column_partial, "SDK createColumn() probe requires both board id and column body JSON")
        assert_disconnected(bad_create_column_partial_marker, "bad createColumn partial live smoke")

        bad_create_column_json_marker = hermes_home / "bad-create-column-json-disconnect.txt"
        bad_create_column_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-column-board",
            "board-live",
            "--create-column-body-json",
            "{not json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_column_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_column_json, "SDK createColumn() probe JSON argument could not be parsed")
        assert_disconnected(bad_create_column_json_marker, "bad createColumn JSON live smoke")

        bad_create_column_payload_marker = hermes_home / "bad-create-column-payload-disconnect.txt"
        bad_create_column_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-column-board",
            "board-live",
            "--create-column-body-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_column_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_column_payload, "SDK createColumn() probe body must be a JSON object")
        assert_disconnected(bad_create_column_payload_marker, "bad createColumn payload live smoke")

        bad_create_column_shape_marker = hermes_home / "bad-create-column-shape-disconnect.txt"
        bad_create_column_shape = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-column-board",
            "board-live",
            "--create-column-body-json",
            '{}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_column_shape_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_column_shape, "SDK createColumn() probe body must match CreateColumnBody")
        assert_disconnected(bad_create_column_shape_marker, "bad createColumn body shape live smoke")

        bad_create_column_sort_order_marker = hermes_home / "bad-create-column-sort-order-disconnect.txt"
        bad_create_column_sort_order = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-column-board",
            "board-live",
            "--create-column-body-json",
            '{"name":"Live smoke column","sortOrder":"1"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_column_sort_order_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_column_sort_order, "SDK createColumn() probe body must match CreateColumnBody")
        assert_disconnected(bad_create_column_sort_order_marker, "bad createColumn body sortOrder live smoke")

        bad_create_column_unknown_marker = hermes_home / "bad-create-column-unknown-disconnect.txt"
        bad_create_column_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-column-board",
            "board-live",
            "--create-column-body-json",
            '{"name":"Live smoke column","unknown":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_column_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_column_unknown, "SDK createColumn() probe body must match CreateColumnBody")
        assert_disconnected(bad_create_column_unknown_marker, "bad createColumn body unknown field live smoke")

        bad_create_column_marker = hermes_home / "bad-create-column-disconnect.txt"
        bad_create_column = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-column-board",
            "board-live",
            "--create-column-body-json",
            '{"name":"Live smoke column"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CREATE_COLUMN="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_column_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_column, "SDK createColumn() returned malformed column result")
        assert_disconnected(bad_create_column_marker, "bad createColumn live smoke")

        bad_create_column_result_sort_order_marker = hermes_home / "bad-create-column-result-sort-order-disconnect.txt"
        bad_create_column_result_sort_order = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-column-board",
            "board-live",
            "--create-column-body-json",
            '{"name":"Live smoke column"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CREATE_COLUMN_SORT_ORDER="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_column_result_sort_order_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_column_result_sort_order, "SDK createColumn() returned malformed column result")
        assert_disconnected(
            bad_create_column_result_sort_order_marker,
            "bad createColumn result sortOrder live smoke",
        )

        bad_update_column_partial_marker = hermes_home / "bad-update-column-partial-disconnect.txt"
        bad_update_column_partial = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-column-id",
            "column-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_column_partial_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_column_partial, "SDK updateColumn() probe requires both column id and column body JSON")
        assert_disconnected(bad_update_column_partial_marker, "bad updateColumn partial live smoke")

        bad_update_column_json_marker = hermes_home / "bad-update-column-json-disconnect.txt"
        bad_update_column_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-column-id",
            "column-live",
            "--update-column-body-json",
            "{not json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_column_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_column_json, "SDK updateColumn() probe JSON argument could not be parsed")
        assert_disconnected(bad_update_column_json_marker, "bad updateColumn JSON live smoke")

        bad_update_column_payload_marker = hermes_home / "bad-update-column-payload-disconnect.txt"
        bad_update_column_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-column-id",
            "column-live",
            "--update-column-body-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_column_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_column_payload, "SDK updateColumn() probe body must be a JSON object")
        assert_disconnected(bad_update_column_payload_marker, "bad updateColumn payload live smoke")

        bad_update_column_name_marker = hermes_home / "bad-update-column-name-disconnect.txt"
        bad_update_column_name = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-column-id",
            "column-live",
            "--update-column-body-json",
            '{"name":3}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_column_name_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_column_name, "SDK updateColumn() probe body must match UpdateColumnBody")
        assert_disconnected(bad_update_column_name_marker, "bad updateColumn body name live smoke")

        bad_update_column_sort_order_marker = hermes_home / "bad-update-column-sort-order-disconnect.txt"
        bad_update_column_sort_order = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-column-id",
            "column-live",
            "--update-column-body-json",
            '{"sortOrder":"1"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_column_sort_order_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_column_sort_order, "SDK updateColumn() probe body must match UpdateColumnBody")
        assert_disconnected(bad_update_column_sort_order_marker, "bad updateColumn body sortOrder live smoke")

        bad_update_column_unknown_marker = hermes_home / "bad-update-column-unknown-disconnect.txt"
        bad_update_column_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-column-id",
            "column-live",
            "--update-column-body-json",
            '{"name":"Updated live smoke column","unknown":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_column_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_column_unknown, "SDK updateColumn() probe body must match UpdateColumnBody")
        assert_disconnected(bad_update_column_unknown_marker, "bad updateColumn body unknown field live smoke")

        bad_update_column_marker = hermes_home / "bad-update-column-disconnect.txt"
        bad_update_column = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-column-id",
            "column-live",
            "--update-column-body-json",
            '{"name":"Updated live smoke column"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_UPDATE_COLUMN="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_column_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_column, "SDK updateColumn() returned malformed column result")
        assert_disconnected(bad_update_column_marker, "bad updateColumn live smoke")

        bad_update_column_result_sort_order_marker = hermes_home / "bad-update-column-result-sort-order-disconnect.txt"
        bad_update_column_result_sort_order = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-column-id",
            "column-live",
            "--update-column-body-json",
            '{"name":"Updated live smoke column"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_UPDATE_COLUMN_SORT_ORDER="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_column_result_sort_order_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_column_result_sort_order, "SDK updateColumn() returned malformed column result")
        assert_disconnected(
            bad_update_column_result_sort_order_marker,
            "bad updateColumn result sortOrder live smoke",
        )

        delete_column_failure_marker = hermes_home / "delete-column-failure-disconnect.txt"
        delete_column_failure = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--delete-column-id",
            "column-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_REJECT_DELETE_COLUMN="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(delete_column_failure_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(delete_column_failure, "fake deleteColumn rejected")
        assert_disconnected(delete_column_failure_marker, "deleteColumn failure live smoke")

        bad_reorder_columns_partial_marker = hermes_home / "bad-reorder-columns-partial-disconnect.txt"
        bad_reorder_columns_partial = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--reorder-columns-board",
            "board-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_reorder_columns_partial_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_reorder_columns_partial, "SDK reorderColumns() probe requires both board id and column ids JSON")
        assert_disconnected(bad_reorder_columns_partial_marker, "bad reorderColumns partial live smoke")

        bad_reorder_columns_json_marker = hermes_home / "bad-reorder-columns-json-disconnect.txt"
        bad_reorder_columns_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--reorder-columns-board",
            "board-live",
            "--reorder-columns-json",
            "{not json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_reorder_columns_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_reorder_columns_json, "SDK reorderColumns() probe JSON argument could not be parsed")
        assert_disconnected(bad_reorder_columns_json_marker, "bad reorderColumns JSON live smoke")

        bad_reorder_columns_payload_marker = hermes_home / "bad-reorder-columns-payload-disconnect.txt"
        bad_reorder_columns_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--reorder-columns-board",
            "board-live",
            "--reorder-columns-json",
            '{"columnIds":["column-live"]}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_reorder_columns_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_reorder_columns_payload, "SDK reorderColumns() probe column ids must be a JSON string array")
        assert_disconnected(bad_reorder_columns_payload_marker, "bad reorderColumns payload live smoke")

        reorder_columns_failure_marker = hermes_home / "reorder-columns-failure-disconnect.txt"
        reorder_columns_failure = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--reorder-columns-board",
            "board-live",
            "--reorder-columns-json",
            '["column-live","done-column"]',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_REJECT_REORDER_COLUMNS="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(reorder_columns_failure_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(reorder_columns_failure, "fake reorderColumns rejected")
        assert_disconnected(reorder_columns_failure_marker, "reorderColumns failure live smoke")

        bad_add_card_commit_partial_marker = hermes_home / "bad-add-card-commit-partial-disconnect.txt"
        bad_add_card_commit_partial = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--add-card-commit-card",
            "card-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_add_card_commit_partial_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_add_card_commit_partial, "SDK addCardCommit() probe requires both card id and commit body JSON")
        assert_disconnected(bad_add_card_commit_partial_marker, "bad addCardCommit partial live smoke")

        bad_add_card_commit_json_marker = hermes_home / "bad-add-card-commit-json-disconnect.txt"
        bad_add_card_commit_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--add-card-commit-card",
            "card-live",
            "--add-card-commit-body-json",
            "{not json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_add_card_commit_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_add_card_commit_json, "SDK addCardCommit() probe JSON argument could not be parsed")
        assert_disconnected(bad_add_card_commit_json_marker, "bad addCardCommit JSON live smoke")

        bad_add_card_commit_payload_marker = hermes_home / "bad-add-card-commit-payload-disconnect.txt"
        bad_add_card_commit_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--add-card-commit-card",
            "card-live",
            "--add-card-commit-body-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_add_card_commit_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_add_card_commit_payload, "SDK addCardCommit() probe body must be a JSON object")
        assert_disconnected(bad_add_card_commit_payload_marker, "bad addCardCommit payload live smoke")

        bad_add_card_commit_shape_marker = hermes_home / "bad-add-card-commit-shape-disconnect.txt"
        bad_add_card_commit_shape = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--add-card-commit-card",
            "card-live",
            "--add-card-commit-body-json",
            '{}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_add_card_commit_shape_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_add_card_commit_shape, "SDK addCardCommit() probe body must match AddCommitBody")
        assert_disconnected(bad_add_card_commit_shape_marker, "bad addCardCommit body shape live smoke")

        bad_add_card_commit_message_marker = hermes_home / "bad-add-card-commit-message-disconnect.txt"
        bad_add_card_commit_message = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--add-card-commit-card",
            "card-live",
            "--add-card-commit-body-json",
            '{"commitHash":"abc123","message":3}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_add_card_commit_message_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_add_card_commit_message, "SDK addCardCommit() probe body must match AddCommitBody")
        assert_disconnected(bad_add_card_commit_message_marker, "bad addCardCommit body message live smoke")

        bad_add_card_commit_unknown_marker = hermes_home / "bad-add-card-commit-unknown-disconnect.txt"
        bad_add_card_commit_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--add-card-commit-card",
            "card-live",
            "--add-card-commit-body-json",
            '{"commitHash":"abc123","unknown":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_add_card_commit_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_add_card_commit_unknown, "SDK addCardCommit() probe body must match AddCommitBody")
        assert_disconnected(bad_add_card_commit_unknown_marker, "bad addCardCommit body unknown field live smoke")

        bad_add_card_commit_marker = hermes_home / "bad-add-card-commit-disconnect.txt"
        bad_add_card_commit = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--add-card-commit-card",
            "card-live",
            "--add-card-commit-body-json",
            '{"commitHash":"abc123","message":"Live smoke commit"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_ADD_CARD_COMMIT="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_add_card_commit_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_add_card_commit, "SDK addCardCommit() returned malformed commit result")
        assert_disconnected(bad_add_card_commit_marker, "bad addCardCommit live smoke")

        add_card_commit_no_message_marker = hermes_home / "add-card-commit-no-message-disconnect.txt"
        add_card_commit_no_message_sdk_marker = hermes_home / "add-card-commit-no-message-sdk-calls.jsonl"
        add_card_commit_no_message = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--add-card-commit-card",
            "card-live",
            "--add-card-commit-body-json",
            '{"commitHash":"def456"}',
            "--skip-telemetry",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(add_card_commit_no_message_marker),
                ARINOVA_FAKE_SDK_CALLS_MARKER=str(add_card_commit_no_message_sdk_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        if add_card_commit_no_message.returncode != 0:
            raise RuntimeError(
                "expected addCardCommit no-message live smoke to pass, "
                f"got {add_card_commit_no_message.returncode}: stdout={add_card_commit_no_message.stdout!r} "
                f"stderr={add_card_commit_no_message.stderr!r}"
            )
        if "live Arinova addCardCommit OK: card_id=card-live" not in add_card_commit_no_message.stdout:
            raise RuntimeError(
                f"addCardCommit no-message live smoke message missing: {add_card_commit_no_message.stdout!r}"
            )
        assert_disconnected(add_card_commit_no_message_marker, "addCardCommit no-message live smoke")
        assert_sdk_call(
            read_sdk_calls(add_card_commit_no_message_sdk_marker),
            {"method": "addCardCommit", "args": ["card-live", {"commitHash": "def456"}]},
            "addCardCommit no-message live smoke",
        )

        bad_link_card_note_partial_marker = hermes_home / "bad-link-card-note-partial-disconnect.txt"
        bad_link_card_note_partial = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--link-card-note-card",
            "card-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_link_card_note_partial_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_link_card_note_partial, "SDK linkCardNote() probe requires both card id and note id")
        assert_disconnected(bad_link_card_note_partial_marker, "bad linkCardNote partial live smoke")

        link_card_note_failure_marker = hermes_home / "link-card-note-failure-disconnect.txt"
        link_card_note_failure = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--link-card-note-card",
            "card-live",
            "--link-card-note-note",
            "note-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_REJECT_LINK_CARD_NOTE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(link_card_note_failure_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(link_card_note_failure, "fake linkCardNote rejected")
        assert_disconnected(link_card_note_failure_marker, "linkCardNote failure live smoke")

        bad_unlink_card_note_partial_marker = hermes_home / "bad-unlink-card-note-partial-disconnect.txt"
        bad_unlink_card_note_partial = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--unlink-card-note-card",
            "card-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_unlink_card_note_partial_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_unlink_card_note_partial, "SDK unlinkCardNote() probe requires both card id and note id")
        assert_disconnected(bad_unlink_card_note_partial_marker, "bad unlinkCardNote partial live smoke")

        unlink_card_note_failure_marker = hermes_home / "unlink-card-note-failure-disconnect.txt"
        unlink_card_note_failure = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--unlink-card-note-card",
            "card-live",
            "--unlink-card-note-note",
            "note-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_REJECT_UNLINK_CARD_NOTE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(unlink_card_note_failure_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(unlink_card_note_failure, "fake unlinkCardNote rejected")
        assert_disconnected(unlink_card_note_failure_marker, "unlinkCardNote failure live smoke")

        bad_create_label_partial_marker = hermes_home / "bad-create-label-partial-disconnect.txt"
        bad_create_label_partial = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-label-board",
            "board-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_label_partial_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_label_partial, "SDK createLabel() probe requires both board id and label body JSON")
        assert_disconnected(bad_create_label_partial_marker, "bad createLabel partial live smoke")

        bad_create_label_json_marker = hermes_home / "bad-create-label-json-disconnect.txt"
        bad_create_label_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-label-board",
            "board-live",
            "--create-label-body-json",
            "{not json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_label_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_label_json, "SDK createLabel() probe JSON argument could not be parsed")
        assert_disconnected(bad_create_label_json_marker, "bad createLabel JSON live smoke")

        bad_create_label_payload_marker = hermes_home / "bad-create-label-payload-disconnect.txt"
        bad_create_label_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-label-board",
            "board-live",
            "--create-label-body-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_label_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_label_payload, "SDK createLabel() probe body must be a JSON object")
        assert_disconnected(bad_create_label_payload_marker, "bad createLabel payload live smoke")

        bad_create_label_shape_marker = hermes_home / "bad-create-label-shape-disconnect.txt"
        bad_create_label_shape = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-label-board",
            "board-live",
            "--create-label-body-json",
            '{}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_label_shape_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_label_shape, "SDK createLabel() probe body must match CreateLabelBody")
        assert_disconnected(bad_create_label_shape_marker, "bad createLabel body shape live smoke")

        bad_create_label_color_marker = hermes_home / "bad-create-label-color-disconnect.txt"
        bad_create_label_color = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-label-board",
            "board-live",
            "--create-label-body-json",
            '{"name":"Live smoke label","color":3}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_label_color_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_label_color, "SDK createLabel() probe body must match CreateLabelBody")
        assert_disconnected(bad_create_label_color_marker, "bad createLabel body color live smoke")

        bad_create_label_unknown_marker = hermes_home / "bad-create-label-unknown-disconnect.txt"
        bad_create_label_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-label-board",
            "board-live",
            "--create-label-body-json",
            '{"name":"Live smoke label","unknown":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_label_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_label_unknown, "SDK createLabel() probe body must match CreateLabelBody")
        assert_disconnected(bad_create_label_unknown_marker, "bad createLabel body unknown field live smoke")

        bad_create_label_marker = hermes_home / "bad-create-label-disconnect.txt"
        bad_create_label = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-label-board",
            "board-live",
            "--create-label-body-json",
            '{"name":"Live smoke label"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CREATE_LABEL="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_label_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_label, "SDK createLabel() returned malformed label result")
        assert_disconnected(bad_create_label_marker, "bad createLabel live smoke")

        bad_create_label_nullable_marker = hermes_home / "bad-create-label-nullable-disconnect.txt"
        bad_create_label_nullable = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-label-board",
            "board-live",
            "--create-label-body-json",
            '{"name":"Live smoke label"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CREATE_LABEL_MISSING_NULLABLE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_create_label_nullable_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_create_label_nullable, "SDK createLabel() returned malformed label result")
        assert_disconnected(bad_create_label_nullable_marker, "bad createLabel nullable live smoke")

        create_label_no_color_marker = hermes_home / "create-label-no-color-disconnect.txt"
        create_label_no_color_sdk_marker = hermes_home / "create-label-no-color-sdk-calls.jsonl"
        create_label_no_color = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--create-label-board",
            "board-live",
            "--create-label-body-json",
            '{"name":"No color live smoke label"}',
            "--skip-telemetry",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(create_label_no_color_marker),
                ARINOVA_FAKE_SDK_CALLS_MARKER=str(create_label_no_color_sdk_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        if create_label_no_color.returncode != 0:
            raise RuntimeError(
                "expected createLabel no-color live smoke to pass, "
                f"got {create_label_no_color.returncode}: stdout={create_label_no_color.stdout!r} "
                f"stderr={create_label_no_color.stderr!r}"
            )
        if "live Arinova createLabel OK: label_id=label-live" not in create_label_no_color.stdout:
            raise RuntimeError(f"createLabel no-color live smoke message missing: {create_label_no_color.stdout!r}")
        assert_disconnected(create_label_no_color_marker, "createLabel no-color live smoke")
        assert_sdk_call(
            read_sdk_calls(create_label_no_color_sdk_marker),
            {"method": "createLabel", "args": ["board-live", {"name": "No color live smoke label"}]},
            "createLabel no-color live smoke",
        )

        bad_update_label_partial_marker = hermes_home / "bad-update-label-partial-disconnect.txt"
        bad_update_label_partial = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-label-id",
            "label-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_label_partial_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_label_partial, "SDK updateLabel() probe requires both label id and label body JSON")
        assert_disconnected(bad_update_label_partial_marker, "bad updateLabel partial live smoke")

        bad_update_label_json_marker = hermes_home / "bad-update-label-json-disconnect.txt"
        bad_update_label_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-label-id",
            "label-live",
            "--update-label-body-json",
            "{not json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_label_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_label_json, "SDK updateLabel() probe JSON argument could not be parsed")
        assert_disconnected(bad_update_label_json_marker, "bad updateLabel JSON live smoke")

        bad_update_label_payload_marker = hermes_home / "bad-update-label-payload-disconnect.txt"
        bad_update_label_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-label-id",
            "label-live",
            "--update-label-body-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_label_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_label_payload, "SDK updateLabel() probe body must be a JSON object")
        assert_disconnected(bad_update_label_payload_marker, "bad updateLabel payload live smoke")

        bad_update_label_name_marker = hermes_home / "bad-update-label-name-disconnect.txt"
        bad_update_label_name = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-label-id",
            "label-live",
            "--update-label-body-json",
            '{"name":3}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_label_name_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_label_name, "SDK updateLabel() probe body must match UpdateLabelBody")
        assert_disconnected(bad_update_label_name_marker, "bad updateLabel body name live smoke")

        bad_update_label_color_marker = hermes_home / "bad-update-label-color-disconnect.txt"
        bad_update_label_color = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-label-id",
            "label-live",
            "--update-label-body-json",
            '{"color":3}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_label_color_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_label_color, "SDK updateLabel() probe body must match UpdateLabelBody")
        assert_disconnected(bad_update_label_color_marker, "bad updateLabel body color live smoke")

        bad_update_label_unknown_marker = hermes_home / "bad-update-label-unknown-disconnect.txt"
        bad_update_label_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-label-id",
            "label-live",
            "--update-label-body-json",
            '{"name":"Updated live smoke label","unknown":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_label_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_label_unknown, "SDK updateLabel() probe body must match UpdateLabelBody")
        assert_disconnected(bad_update_label_unknown_marker, "bad updateLabel body unknown field live smoke")

        bad_update_label_marker = hermes_home / "bad-update-label-disconnect.txt"
        bad_update_label = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-label-id",
            "label-live",
            "--update-label-body-json",
            '{"name":"Updated live smoke label"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_UPDATE_LABEL="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_label_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_label, "SDK updateLabel() returned malformed label result")
        assert_disconnected(bad_update_label_marker, "bad updateLabel live smoke")

        bad_update_label_nullable_marker = hermes_home / "bad-update-label-nullable-disconnect.txt"
        bad_update_label_nullable = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--update-label-id",
            "label-live",
            "--update-label-body-json",
            '{"name":"Updated live smoke label"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_UPDATE_LABEL_MISSING_NULLABLE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_update_label_nullable_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_update_label_nullable, "SDK updateLabel() returned malformed label result")
        assert_disconnected(bad_update_label_nullable_marker, "bad updateLabel nullable live smoke")

        for label, args, env_key, error, disconnect_label in [
            (
                "mismatch-update-note-id",
                [
                    "--update-note-conversation",
                    "conv-note",
                    "--update-note-id",
                    "note-live",
                    "--update-note-body-json",
                    '{"title":"Updated note"}',
                ],
                "ARINOVA_FAKE_MISMATCH_UPDATE_NOTE_ID",
                "SDK updateNote() returned mismatched note id",
                "mismatch updateNote id live smoke",
            ),
            (
                "mismatch-update-board-id",
                ["--update-board-id", "board-live", "--update-board-body-json", '{"name":"Updated board"}'],
                "ARINOVA_FAKE_MISMATCH_UPDATE_BOARD_ID",
                "SDK updateBoard() returned mismatched board id",
                "mismatch updateBoard id live smoke",
            ),
            (
                "mismatch-update-card-id",
                ["--update-card-id", "card-live", "--update-card-body-json", '{"title":"Updated card"}'],
                "ARINOVA_FAKE_MISMATCH_UPDATE_CARD_ID",
                "SDK updateCard() returned mismatched card id",
                "mismatch updateCard id live smoke",
            ),
            (
                "mismatch-complete-card-id",
                ["--complete-card-id", "card-live"],
                "ARINOVA_FAKE_MISMATCH_COMPLETE_CARD_ID",
                "SDK completeCard() returned mismatched card id",
                "mismatch completeCard id live smoke",
            ),
            (
                "mismatch-create-column-board-id",
                ["--create-column-board", "board-live", "--create-column-body-json", '{"name":"New column"}'],
                "ARINOVA_FAKE_MISMATCH_CREATE_COLUMN_BOARD_ID",
                "SDK createColumn() returned mismatched board id",
                "mismatch createColumn board id live smoke",
            ),
            (
                "mismatch-update-column-id",
                ["--update-column-id", "column-live", "--update-column-body-json", '{"name":"Updated column"}'],
                "ARINOVA_FAKE_MISMATCH_UPDATE_COLUMN_ID",
                "SDK updateColumn() returned mismatched column id",
                "mismatch updateColumn id live smoke",
            ),
            (
                "mismatch-add-card-commit-card-id",
                ["--add-card-commit-card", "card-live", "--add-card-commit-body-json", '{"commitHash":"abc123"}'],
                "ARINOVA_FAKE_MISMATCH_ADD_CARD_COMMIT_CARD_ID",
                "SDK addCardCommit() returned mismatched card id",
                "mismatch addCardCommit card id live smoke",
            ),
            (
                "mismatch-create-label-board-id",
                ["--create-label-board", "board-live", "--create-label-body-json", '{"name":"Live label"}'],
                "ARINOVA_FAKE_MISMATCH_CREATE_LABEL_BOARD_ID",
                "SDK createLabel() returned mismatched board id",
                "mismatch createLabel board id live smoke",
            ),
            (
                "mismatch-update-label-id",
                ["--update-label-id", "label-live", "--update-label-body-json", '{"name":"Updated label"}'],
                "ARINOVA_FAKE_MISMATCH_UPDATE_LABEL_ID",
                "SDK updateLabel() returned mismatched label id",
                "mismatch updateLabel id live smoke",
            ),
        ]:
            marker = hermes_home / f"{label}-disconnect.txt"
            process = run_live(
                "--hermes-root",
                str(fake_hermes_root),
                *args,
                env=clean_env(
                    hermes_home,
                    ARINOVA_SERVER_URL="wss://env.example",
                    ARINOVA_BOT_TOKEN="ari_env",
                    ARINOVA_FAKE_DISCONNECT_MARKER=str(marker),
                    PYTHONPATH="/definitely/not/hermes",
                    **{env_key: "1"},
                ),
            )
            assert_failed(process, error)
            assert_disconnected(marker, disconnect_label)

        for label, args, env_key, error, disconnect_label in [
            (
                "deleteLabel",
                ["--delete-label-id", "label-live"],
                "ARINOVA_FAKE_REJECT_DELETE_LABEL",
                "fake deleteLabel rejected",
                "deleteLabel failure live smoke",
            ),
            (
                "addCardLabel",
                ["--add-card-label-card", "card-live", "--add-card-label-label", "label-live"],
                "ARINOVA_FAKE_REJECT_ADD_CARD_LABEL",
                "fake addCardLabel rejected",
                "addCardLabel failure live smoke",
            ),
            (
                "removeCardLabel",
                ["--remove-card-label-card", "card-live", "--remove-card-label-label", "label-live"],
                "ARINOVA_FAKE_REJECT_REMOVE_CARD_LABEL",
                "fake removeCardLabel rejected",
                "removeCardLabel failure live smoke",
            ),
        ]:
            marker = hermes_home / f"{label}-failure-disconnect.txt"
            process = run_live(
                "--hermes-root",
                str(fake_hermes_root),
                *args,
                env=clean_env(
                    hermes_home,
                    ARINOVA_SERVER_URL="wss://env.example",
                    ARINOVA_BOT_TOKEN="ari_env",
                    ARINOVA_FAKE_DISCONNECT_MARKER=str(marker),
                    PYTHONPATH="/definitely/not/hermes",
                    **{env_key: "1"},
                ),
            )
            assert_failed(process, error)
            assert_disconnected(marker, disconnect_label)

        bad_add_card_label_partial_marker = hermes_home / "bad-add-card-label-partial-disconnect.txt"
        bad_add_card_label_partial = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--add-card-label-card",
            "card-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_add_card_label_partial_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_add_card_label_partial, "SDK addCardLabel() probe requires both card id and label id")
        assert_disconnected(bad_add_card_label_partial_marker, "bad addCardLabel partial live smoke")

        bad_remove_card_label_partial_marker = hermes_home / "bad-remove-card-label-partial-disconnect.txt"
        bad_remove_card_label_partial = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--remove-card-label-card",
            "card-live",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_remove_card_label_partial_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_remove_card_label_partial, "SDK removeCardLabel() probe requires both card id and label id")
        assert_disconnected(bad_remove_card_label_partial_marker, "bad removeCardLabel partial live smoke")

        bad_fetch_history_options_json_marker = hermes_home / "bad-fetch-history-options-json-disconnect.txt"
        bad_fetch_history_options_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--fetch-history-conversation",
            "conv-history",
            "--fetch-history-options-json",
            "{not json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_fetch_history_options_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_fetch_history_options_json,
            "SDK fetchHistory() probe options JSON argument could not be parsed",
        )
        assert_disconnected(bad_fetch_history_options_json_marker, "bad fetchHistory options JSON live smoke")

        bad_fetch_history_options_payload_marker = hermes_home / "bad-fetch-history-options-payload-disconnect.txt"
        bad_fetch_history_options_payload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--fetch-history-conversation",
            "conv-history",
            "--fetch-history-options-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_fetch_history_options_payload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_fetch_history_options_payload, "SDK fetchHistory() probe options must be a JSON object")
        assert_disconnected(bad_fetch_history_options_payload_marker, "bad fetchHistory options payload live smoke")

        bad_fetch_history_options_cursor_marker = hermes_home / "bad-fetch-history-options-cursor-disconnect.txt"
        bad_fetch_history_options_cursor = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--fetch-history-conversation",
            "conv-history",
            "--fetch-history-options-json",
            '{"before":3}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_fetch_history_options_cursor_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_fetch_history_options_cursor, "SDK fetchHistory() probe options must match FetchHistoryOptions")
        assert_disconnected(bad_fetch_history_options_cursor_marker, "bad fetchHistory options cursor live smoke")

        bad_fetch_history_options_limit_marker = hermes_home / "bad-fetch-history-options-limit-disconnect.txt"
        bad_fetch_history_options_limit = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--fetch-history-conversation",
            "conv-history",
            "--fetch-history-options-json",
            '{"limit":"2"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_fetch_history_options_limit_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_fetch_history_options_limit, "SDK fetchHistory() probe options must match FetchHistoryOptions")
        assert_disconnected(bad_fetch_history_options_limit_marker, "bad fetchHistory options limit live smoke")

        bad_fetch_history_options_unknown_marker = hermes_home / "bad-fetch-history-options-unknown-disconnect.txt"
        bad_fetch_history_options_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--fetch-history-conversation",
            "conv-history",
            "--fetch-history-options-json",
            '{"limit":2,"unknown":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_fetch_history_options_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_fetch_history_options_unknown, "SDK fetchHistory() probe options must match FetchHistoryOptions")
        assert_disconnected(bad_fetch_history_options_unknown_marker, "bad fetchHistory options unknown field live smoke")

        bad_fetch_history_limit_without_conversation_marker = (
            hermes_home / "bad-fetch-history-limit-without-conversation-disconnect.txt"
        )
        bad_fetch_history_limit_without_conversation = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--fetch-history-limit",
            "2",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_fetch_history_limit_without_conversation_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_fetch_history_limit_without_conversation,
            "SDK fetchHistory() probe requires conversation id when history limit is provided",
        )
        assert_disconnected(
            bad_fetch_history_limit_without_conversation_marker,
            "bad fetchHistory limit without conversation live smoke",
        )

        bad_fetch_history_options_without_conversation_marker = (
            hermes_home / "bad-fetch-history-options-without-conversation-disconnect.txt"
        )
        bad_fetch_history_options_without_conversation = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--fetch-history-options-json",
            '{"limit":2}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_fetch_history_options_without_conversation_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_fetch_history_options_without_conversation,
            "SDK fetchHistory() probe requires conversation id when history options JSON is provided",
        )
        assert_disconnected(
            bad_fetch_history_options_without_conversation_marker,
            "bad fetchHistory options without conversation live smoke",
        )

        bad_history_marker = hermes_home / "bad-history-disconnect.txt"
        bad_history = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--fetch-history-conversation",
            "conv-history",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_FETCH_HISTORY="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_history_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_history, "SDK fetchHistory() returned malformed history")
        assert_disconnected(bad_history_marker, "bad fetchHistory live smoke")

        bad_history_metadata_marker = hermes_home / "bad-history-metadata-disconnect.txt"
        bad_history_metadata = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--fetch-history-conversation",
            "conv-history",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_FETCH_HISTORY_METADATA="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_history_metadata_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_history_metadata, "SDK fetchHistory() returned malformed history")
        assert_disconnected(bad_history_metadata_marker, "bad fetchHistory metadata live smoke")

        bad_history_null_cursor_marker = hermes_home / "bad-history-null-cursor-disconnect.txt"
        bad_history_null_cursor = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--fetch-history-conversation",
            "conv-history",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_FETCH_HISTORY_NULL_CURSOR="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_history_null_cursor_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_history_null_cursor, "SDK fetchHistory() returned malformed history")
        assert_disconnected(bad_history_null_cursor_marker, "bad fetchHistory null cursor live smoke")

        bad_history_entry_marker = hermes_home / "bad-history-entry-disconnect.txt"
        bad_history_entry = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--fetch-history-conversation",
            "conv-history",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_FETCH_HISTORY_ENTRY="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_history_entry_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_history_entry, "SDK fetchHistory() returned malformed history")
        assert_disconnected(bad_history_entry_marker, "bad fetchHistory entry live smoke")

        bad_history_null_optional_marker = hermes_home / "bad-history-null-optional-disconnect.txt"
        bad_history_null_optional = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--fetch-history-conversation",
            "conv-history",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_FETCH_HISTORY_NULL_OPTIONAL="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_history_null_optional_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_history_null_optional, "SDK fetchHistory() returned malformed history")
        assert_disconnected(bad_history_null_optional_marker, "bad fetchHistory null optional live smoke")

        bad_history_null_attachments_marker = hermes_home / "bad-history-null-attachments-disconnect.txt"
        bad_history_null_attachments = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--fetch-history-conversation",
            "conv-history",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_FETCH_HISTORY_NULL_ATTACHMENTS="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_history_null_attachments_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_history_null_attachments, "SDK fetchHistory() returned malformed history")
        assert_disconnected(bad_history_null_attachments_marker, "bad fetchHistory null attachments live smoke")

        bad_upload_path_without_conversation_marker = hermes_home / "bad-upload-path-without-conversation-disconnect.txt"
        bad_upload_path_without_conversation = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--upload-file-path",
            "/tmp/hermes-arinova-missing-live-upload-file",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_upload_path_without_conversation_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_upload_path_without_conversation,
            "SDK uploadFile() probe requires conversation id when upload file path is provided",
        )
        assert_disconnected(
            bad_upload_path_without_conversation_marker,
            "bad uploadFile path without conversation live smoke",
        )

        bad_upload_name_without_conversation_marker = hermes_home / "bad-upload-name-without-conversation-disconnect.txt"
        bad_upload_name_without_conversation = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--upload-file-name",
            "ignored.txt",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_upload_name_without_conversation_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_upload_name_without_conversation,
            "SDK uploadFile() probe requires conversation id when upload file name is provided",
        )
        assert_disconnected(
            bad_upload_name_without_conversation_marker,
            "bad uploadFile name without conversation live smoke",
        )

        bad_upload_type_without_conversation_marker = hermes_home / "bad-upload-type-without-conversation-disconnect.txt"
        bad_upload_type_without_conversation = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--upload-file-type",
            "application/octet-stream",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_upload_type_without_conversation_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_upload_type_without_conversation,
            "SDK uploadFile() probe requires conversation id when upload file type is provided",
        )
        assert_disconnected(
            bad_upload_type_without_conversation_marker,
            "bad uploadFile type without conversation live smoke",
        )

        bad_upload_missing_path_marker = hermes_home / "bad-upload-missing-path-disconnect.txt"
        bad_upload_missing_path = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--upload-file-conversation",
            "conv-missing-upload-path",
            "--upload-file-path",
            "/tmp/hermes-arinova-missing-live-upload-file",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_upload_missing_path_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_upload_missing_path, "SDK uploadFile() probe file path does not exist")
        assert_disconnected(bad_upload_missing_path_marker, "bad uploadFile missing path live smoke")

        upload_failure_marker = hermes_home / "upload-failure-disconnect.txt"
        upload_failure = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--upload-file-conversation",
            "conv-upload-failure",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_REJECT_UPLOAD_FILE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(upload_failure_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(upload_failure, "fake uploadFile rejected")
        assert_disconnected(upload_failure_marker, "uploadFile failure live smoke")

        bad_upload_marker = hermes_home / "bad-upload-disconnect.txt"
        bad_upload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--upload-file-conversation",
            "conv-bad-upload",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_UPLOAD_FILE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_upload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_upload, "SDK uploadFile() returned malformed upload result")
        assert_disconnected(bad_upload_marker, "bad uploadFile live smoke")

        bad_upload_size_marker = hermes_home / "bad-upload-size-disconnect.txt"
        bad_upload_size = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--upload-file-conversation",
            "conv-bad-upload-size",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_UPLOAD_FILE_SIZE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_upload_size_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_upload_size, "SDK uploadFile() returned malformed upload result")
        assert_disconnected(bad_upload_size_marker, "bad uploadFile size live smoke")

        bad_upload_metadata_marker = hermes_home / "bad-upload-metadata-disconnect.txt"
        bad_upload_metadata = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--upload-file-conversation",
            "conv-bad-upload-metadata",
            "--upload-file-type",
            "text/plain",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_UPLOAD_FILE_TYPE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_upload_metadata_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_upload_metadata, "SDK uploadFile() returned mismatched upload metadata")
        assert_disconnected(bad_upload_metadata_marker, "bad uploadFile metadata live smoke")

        bad_action_args_without_name_marker = hermes_home / "bad-action-args-without-name-disconnect.txt"
        bad_action_args_without_name = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action-args-json",
            '{"probe":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_action_args_without_name_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_action_args_without_name,
            "SDK callAction() probe requires action name when args JSON is provided",
        )
        assert_disconnected(bad_action_args_without_name_marker, "bad callAction args without action live smoke")

        bad_action_options_without_name_marker = hermes_home / "bad-action-options-without-name-disconnect.txt"
        bad_action_options_without_name = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action-options-json",
            '{"dryRun":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_action_options_without_name_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_action_options_without_name,
            "SDK callAction() probe requires action name when options JSON is provided",
        )
        assert_disconnected(bad_action_options_without_name_marker, "bad callAction options without action live smoke")

        action_failure_marker = hermes_home / "action-failure-disconnect.txt"
        action_failure = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.reject",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_REJECT_CALL_ACTION="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(action_failure_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(action_failure, "fake callAction rejected")
        assert_disconnected(action_failure_marker, "callAction failure live smoke")

        mismatch_action_call_id_marker = hermes_home / "mismatch-action-call-id-disconnect.txt"
        mismatch_action_call_id = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.mismatch-call-id",
            "--call-action-options-json",
            '{"callId":"expected-action-call"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_MISMATCH_CALL_ACTION_CALL_ID="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(mismatch_action_call_id_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(mismatch_action_call_id, "SDK callAction() returned mismatched call id")
        assert_disconnected(mismatch_action_call_id_marker, "mismatch callAction call id live smoke")

        mismatch_action_dry_run_marker = hermes_home / "mismatch-action-dry-run-disconnect.txt"
        mismatch_action_dry_run = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.mismatch-dry-run",
            "--call-action-options-json",
            '{"callId":"expected-action-dry-run","dryRun":false}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_MISMATCH_CALL_ACTION_DRY_RUN="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(mismatch_action_dry_run_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(mismatch_action_dry_run, "SDK callAction() returned mismatched dryRun")
        assert_disconnected(mismatch_action_dry_run_marker, "mismatch callAction dryRun live smoke")

        for label, status_label, env_key, disconnect_label in [
            (
                "success",
                "success",
                "ARINOVA_FAKE_INCONSISTENT_SUCCESS_CALL_ACTION",
                "inconsistent success callAction live smoke",
            ),
            (
                "error",
                "error",
                "ARINOVA_FAKE_INCONSISTENT_ERROR_CALL_ACTION",
                "inconsistent error callAction live smoke",
            ),
            (
                "confirmation",
                "confirmation",
                "ARINOVA_FAKE_INCONSISTENT_CONFIRMATION_CALL_ACTION",
                "inconsistent confirmation callAction live smoke",
            ),
            (
                "cancelled",
                "cancelled",
                "ARINOVA_FAKE_INCONSISTENT_CANCELLED_CALL_ACTION",
                "inconsistent cancelled callAction live smoke",
            ),
        ]:
            marker = hermes_home / f"inconsistent-action-{label}-disconnect.txt"
            process = run_live(
                "--hermes-root",
                str(fake_hermes_root),
                "--call-action",
                f"live.inconsistent-{status_label}",
                env=clean_env(
                    hermes_home,
                    ARINOVA_SERVER_URL="wss://env.example",
                    ARINOVA_BOT_TOKEN="ari_env",
                    ARINOVA_FAKE_DISCONNECT_MARKER=str(marker),
                    PYTHONPATH="/definitely/not/hermes",
                    **{env_key: "1"},
                ),
            )
            assert_failed(process, "SDK callAction() returned inconsistent action result")
            assert_disconnected(marker, disconnect_label)

        confirmation_action_marker = hermes_home / "confirmation-action-disconnect.txt"
        confirmation_action = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.confirm",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_CONFIRMATION_CALL_ACTION="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(confirmation_action_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        if confirmation_action.returncode != 0:
            raise RuntimeError(
                "expected confirmation callAction live smoke to pass, "
                f"got {confirmation_action.returncode}: stdout={confirmation_action.stdout!r} "
                f"stderr={confirmation_action.stderr!r}"
            )
        if "live Arinova callAction OK: action=live.confirm status=requires_confirmation" not in confirmation_action.stdout:
            raise RuntimeError(
                f"confirmation callAction live smoke message missing: {confirmation_action.stdout!r}"
            )
        assert_disconnected(confirmation_action_marker, "confirmation callAction live smoke")

        error_action_marker = hermes_home / "error-action-disconnect.txt"
        error_action = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.error",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_ERROR_CALL_ACTION="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(error_action_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        if error_action.returncode != 0:
            raise RuntimeError(
                "expected error callAction live smoke to pass, "
                f"got {error_action.returncode}: stdout={error_action.stdout!r} "
                f"stderr={error_action.stderr!r}"
            )
        if "live Arinova callAction OK: action=live.error status=error" not in error_action.stdout:
            raise RuntimeError(
                f"error callAction live smoke message missing: {error_action.stdout!r}"
            )
        assert_disconnected(error_action_marker, "error callAction live smoke")

        cancelled_action_marker = hermes_home / "cancelled-action-disconnect.txt"
        cancelled_action = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.cancelled",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_CANCELLED_CALL_ACTION="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(cancelled_action_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        if cancelled_action.returncode != 0:
            raise RuntimeError(
                "expected cancelled callAction live smoke to pass, "
                f"got {cancelled_action.returncode}: stdout={cancelled_action.stdout!r} "
                f"stderr={cancelled_action.stderr!r}"
            )
        if "live Arinova callAction OK: action=live.cancelled status=cancelled" not in cancelled_action.stdout:
            raise RuntimeError(
                f"cancelled callAction live smoke message missing: {cancelled_action.stdout!r}"
            )
        assert_disconnected(cancelled_action_marker, "cancelled callAction live smoke")

        full_options_action_marker = hermes_home / "full-options-action-disconnect.txt"
        full_options_action_sdk_marker = hermes_home / "full-options-action-sdk-calls.jsonl"
        full_options_action = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.full-options",
            "--call-action-args-json",
            '{"probe":true}',
            "--call-action-options-json",
            (
                '{"callId":"full-options-call","taskId":"task-full","conversationId":"conv-full",'
                '"messageId":"msg-full","parentCallId":"parent-full","reason":"full option smoke",'
                '"metadata":{"source":"live-gate","nested":{"ok":true}},"dryRun":false,"timeoutMs":1000}'
            ),
            "--skip-telemetry",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(full_options_action_marker),
                ARINOVA_FAKE_SDK_CALLS_MARKER=str(full_options_action_sdk_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        if full_options_action.returncode != 0:
            raise RuntimeError(
                "expected full-options callAction live smoke to pass, "
                f"got {full_options_action.returncode}: stdout={full_options_action.stdout!r} "
                f"stderr={full_options_action.stderr!r}"
            )
        if "live Arinova callAction OK: action=live.full-options status=success" not in full_options_action.stdout:
            raise RuntimeError(
                f"full-options callAction live smoke message missing: {full_options_action.stdout!r}"
            )
        assert_disconnected(full_options_action_marker, "full-options callAction live smoke")
        assert_sdk_call(
            read_sdk_calls(full_options_action_sdk_marker),
            {
                "method": "callAction",
                "args": [
                    "live.full-options",
                    {"probe": True},
                    {
                        "callId": "full-options-call",
                        "taskId": "task-full",
                        "conversationId": "conv-full",
                        "messageId": "msg-full",
                        "parentCallId": "parent-full",
                        "reason": "full option smoke",
                        "metadata": {"source": "live-gate", "nested": {"ok": True}},
                        "dryRun": False,
                        "timeoutMs": 1000,
                    },
                ],
            },
            "full-options callAction live smoke",
        )

        task_history_marker = hermes_home / "task-history-disconnect.txt"
        task_history_sdk_marker = hermes_home / "task-history-sdk-calls.jsonl"
        task_history = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-fetch-history-task",
            "task-live-history",
            "--task-fetch-history-options-json",
            '{"before":"task-msg-before","after":"task-msg-after","around":"task-msg-around","limit":3}',
            "--skip-telemetry",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(task_history_marker),
                ARINOVA_FAKE_SDK_CALLS_MARKER=str(task_history_sdk_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        if task_history.returncode != 0:
            raise RuntimeError(
                "expected task fetchHistory live smoke to pass, "
                f"got {task_history.returncode}: stdout={task_history.stdout!r} "
                f"stderr={task_history.stderr!r}"
            )
        if "live Arinova task fetchHistory OK: task_id=task-live-history messages=0" not in task_history.stdout:
            raise RuntimeError(f"task fetchHistory live smoke message missing: {task_history.stdout!r}")
        assert_disconnected(task_history_marker, "task fetchHistory live smoke")
        assert_sdk_call(
            read_sdk_calls(task_history_sdk_marker),
            {
                "taskId": "task-live-history",
                "method": "fetchHistory",
                "args": [
                    {
                        "after": "task-msg-after",
                        "around": "task-msg-around",
                        "before": "task-msg-before",
                        "limit": 3,
                    },
                ],
            },
            "task fetchHistory live smoke",
        )

        bad_task_history_limit_without_task_marker = (
            hermes_home / "bad-task-history-limit-without-task-disconnect.txt"
        )
        bad_task_history_limit_without_task = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-fetch-history-limit",
            "2",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_history_limit_without_task_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_task_history_limit_without_task,
            "Task SDK fetchHistory() probe requires task id when history limit is provided",
        )
        assert_disconnected(
            bad_task_history_limit_without_task_marker,
            "bad task fetchHistory limit without task live smoke",
        )

        bad_task_history_options_without_task_marker = (
            hermes_home / "bad-task-history-options-without-task-disconnect.txt"
        )
        bad_task_history_options_without_task = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-fetch-history-options-json",
            '{"limit":2}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_history_options_without_task_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_task_history_options_without_task,
            "Task SDK fetchHistory() probe requires task id when history options JSON is provided",
        )
        assert_disconnected(
            bad_task_history_options_without_task_marker,
            "bad task fetchHistory options without task live smoke",
        )

        bad_task_history_options_json_marker = hermes_home / "bad-task-history-options-json-disconnect.txt"
        bad_task_history_options_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-fetch-history-task",
            "task-bad-history-options-json",
            "--task-fetch-history-options-json",
            "{not json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_history_options_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_task_history_options_json,
            "Task SDK fetchHistory() probe options JSON argument could not be parsed",
        )
        assert_disconnected(bad_task_history_options_json_marker, "bad task fetchHistory options JSON live smoke")

        for label, options_json, disconnect_label in [
            ("payload", "[]", "bad task fetchHistory options payload live smoke"),
            ("cursor", '{"before":3}', "bad task fetchHistory options cursor live smoke"),
            ("limit", '{"limit":"2"}', "bad task fetchHistory options limit live smoke"),
            ("unknown", '{"limit":2,"unknown":true}', "bad task fetchHistory options unknown field live smoke"),
        ]:
            marker = hermes_home / f"bad-task-history-options-{label}-disconnect.txt"
            process = run_live(
                "--hermes-root",
                str(fake_hermes_root),
                "--task-fetch-history-task",
                f"task-bad-history-options-{label}",
                "--task-fetch-history-options-json",
                options_json,
                env=clean_env(
                    hermes_home,
                    ARINOVA_SERVER_URL="wss://env.example",
                    ARINOVA_BOT_TOKEN="ari_env",
                    ARINOVA_FAKE_DISCONNECT_MARKER=str(marker),
                    PYTHONPATH="/definitely/not/hermes",
                ),
            )
            if label == "payload":
                assert_failed(process, "Task SDK fetchHistory() probe options must be a JSON object")
            else:
                assert_failed(process, "Task SDK fetchHistory() probe options must match FetchHistoryOptions")
            assert_disconnected(marker, disconnect_label)

        bad_task_history_marker = hermes_home / "bad-task-history-disconnect.txt"
        bad_task_history = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-fetch-history-task",
            "task-bad-history",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_TASK_FETCH_HISTORY="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_history_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_history, "Task SDK fetchHistory() returned malformed history")
        assert_disconnected(bad_task_history_marker, "bad task fetchHistory live smoke")

        bad_task_history_metadata_marker = hermes_home / "bad-task-history-metadata-disconnect.txt"
        bad_task_history_metadata = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-fetch-history-task",
            "task-bad-history-metadata",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_TASK_FETCH_HISTORY_METADATA="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_history_metadata_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_history_metadata, "Task SDK fetchHistory() returned malformed history")
        assert_disconnected(bad_task_history_metadata_marker, "bad task fetchHistory metadata live smoke")

        bad_task_history_null_cursor_marker = hermes_home / "bad-task-history-null-cursor-disconnect.txt"
        bad_task_history_null_cursor = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-fetch-history-task",
            "task-bad-history-null-cursor",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_TASK_FETCH_HISTORY_NULL_CURSOR="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_history_null_cursor_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_history_null_cursor, "Task SDK fetchHistory() returned malformed history")
        assert_disconnected(
            bad_task_history_null_cursor_marker,
            "bad task fetchHistory null cursor live smoke",
        )

        bad_task_history_entry_marker = hermes_home / "bad-task-history-entry-disconnect.txt"
        bad_task_history_entry = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-fetch-history-task",
            "task-bad-history-entry",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_TASK_FETCH_HISTORY_ENTRY="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_history_entry_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_history_entry, "Task SDK fetchHistory() returned malformed history")
        assert_disconnected(bad_task_history_entry_marker, "bad task fetchHistory entry live smoke")

        bad_task_history_null_optional_marker = hermes_home / "bad-task-history-null-optional-disconnect.txt"
        bad_task_history_null_optional = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-fetch-history-task",
            "task-bad-history-null-optional",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_TASK_FETCH_HISTORY_NULL_OPTIONAL="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_history_null_optional_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_history_null_optional, "Task SDK fetchHistory() returned malformed history")
        assert_disconnected(
            bad_task_history_null_optional_marker,
            "bad task fetchHistory null optional live smoke",
        )

        bad_task_history_null_attachments_marker = hermes_home / "bad-task-history-null-attachments-disconnect.txt"
        bad_task_history_null_attachments = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-fetch-history-task",
            "task-bad-history-null-attachments",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_TASK_FETCH_HISTORY_NULL_ATTACHMENTS="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_history_null_attachments_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_history_null_attachments, "Task SDK fetchHistory() returned malformed history")
        assert_disconnected(
            bad_task_history_null_attachments_marker,
            "bad task fetchHistory null attachments live smoke",
        )

        task_upload_marker = hermes_home / "task-upload-disconnect.txt"
        task_upload_sdk_marker = hermes_home / "task-upload-sdk-calls.jsonl"
        task_upload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-upload-file-task",
            "task-live-upload",
            "--task-upload-file-name",
            "task-live-gate.txt",
            "--task-upload-file-type",
            "text/plain",
            "--skip-telemetry",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(task_upload_marker),
                ARINOVA_FAKE_SDK_CALLS_MARKER=str(task_upload_sdk_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        if task_upload.returncode != 0:
            raise RuntimeError(
                "expected task uploadFile live smoke to pass, "
                f"got {task_upload.returncode}: stdout={task_upload.stdout!r} "
                f"stderr={task_upload.stderr!r}"
            )
        if "live Arinova task uploadFile OK: task_id=task-live-upload fileName=task-live-gate.txt" not in task_upload.stdout:
            raise RuntimeError(f"task uploadFile live smoke message missing: {task_upload.stdout!r}")
        assert_disconnected(task_upload_marker, "task uploadFile live smoke")
        assert_sdk_call(
            read_sdk_calls(task_upload_sdk_marker),
            {
                "taskId": "task-live-upload",
                "method": "uploadFile",
                "args": [
                    {"base64": "SGVybWVzIEFyaW5vdmEgdGFzayBsaXZlIHNtb2tlIHVwbG9hZAo="},
                    "task-live-gate.txt",
                    "text/plain",
                ],
            },
            "task uploadFile live smoke",
        )

        bad_task_upload_path_without_task_marker = hermes_home / "bad-task-upload-path-without-task-disconnect.txt"
        bad_task_upload_path_without_task = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-upload-file-path",
            "/tmp/hermes-arinova-missing-task-live-upload-file",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_upload_path_without_task_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_task_upload_path_without_task,
            "Task SDK uploadFile() probe requires task id when upload file path is provided",
        )
        assert_disconnected(
            bad_task_upload_path_without_task_marker,
            "bad task uploadFile path without task live smoke",
        )

        bad_task_upload_name_without_task_marker = hermes_home / "bad-task-upload-name-without-task-disconnect.txt"
        bad_task_upload_name_without_task = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-upload-file-name",
            "ignored.txt",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_upload_name_without_task_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_task_upload_name_without_task,
            "Task SDK uploadFile() probe requires task id when upload file name is provided",
        )
        assert_disconnected(
            bad_task_upload_name_without_task_marker,
            "bad task uploadFile name without task live smoke",
        )

        bad_task_upload_type_without_task_marker = hermes_home / "bad-task-upload-type-without-task-disconnect.txt"
        bad_task_upload_type_without_task = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-upload-file-type",
            "application/octet-stream",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_upload_type_without_task_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_task_upload_type_without_task,
            "Task SDK uploadFile() probe requires task id when upload file type is provided",
        )
        assert_disconnected(
            bad_task_upload_type_without_task_marker,
            "bad task uploadFile type without task live smoke",
        )

        bad_task_upload_missing_path_marker = hermes_home / "bad-task-upload-missing-path-disconnect.txt"
        bad_task_upload_missing_path = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-upload-file-task",
            "task-missing-upload-path",
            "--task-upload-file-path",
            "/tmp/hermes-arinova-missing-task-live-upload-file",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_upload_missing_path_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_upload_missing_path, "Task SDK uploadFile() probe file path does not exist")
        assert_disconnected(bad_task_upload_missing_path_marker, "bad task uploadFile missing path live smoke")

        bad_task_upload_marker = hermes_home / "bad-task-upload-disconnect.txt"
        bad_task_upload = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-upload-file-task",
            "task-bad-upload",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_TASK_UPLOAD_FILE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_upload_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_upload, "Task SDK uploadFile() returned malformed upload result")
        assert_disconnected(bad_task_upload_marker, "bad task uploadFile live smoke")

        bad_task_upload_size_marker = hermes_home / "bad-task-upload-size-disconnect.txt"
        bad_task_upload_size = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-upload-file-task",
            "task-bad-upload-size",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_TASK_UPLOAD_FILE_SIZE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_upload_size_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_upload_size, "Task SDK uploadFile() returned malformed upload result")
        assert_disconnected(bad_task_upload_size_marker, "bad task uploadFile size live smoke")

        bad_task_upload_metadata_marker = hermes_home / "bad-task-upload-metadata-disconnect.txt"
        bad_task_upload_metadata = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-upload-file-task",
            "task-bad-upload-metadata",
            "--task-upload-file-type",
            "text/plain",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_TASK_UPLOAD_FILE_TYPE="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_upload_metadata_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_upload_metadata, "Task SDK uploadFile() returned mismatched upload metadata")
        assert_disconnected(bad_task_upload_metadata_marker, "bad task uploadFile metadata live smoke")

        task_action_marker = hermes_home / "task-action-disconnect.txt"
        task_action_sdk_marker = hermes_home / "task-action-sdk-calls.jsonl"
        task_action = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-task",
            "task-live-action",
            "--task-call-action",
            "live.task-action",
            "--task-call-action-args-json",
            '{"probe":true}',
            "--task-call-action-options-json",
            (
                '{"callId":"task-options-call","parentCallId":"task-parent",'
                '"reason":"task option smoke","metadata":{"source":"live-gate-task"},'
                '"dryRun":false,"timeoutMs":1000}'
            ),
            "--skip-telemetry",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(task_action_marker),
                ARINOVA_FAKE_SDK_CALLS_MARKER=str(task_action_sdk_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        if task_action.returncode != 0:
            raise RuntimeError(
                "expected task callAction live smoke to pass, "
                f"got {task_action.returncode}: stdout={task_action.stdout!r} "
                f"stderr={task_action.stderr!r}"
            )
        if (
            "live Arinova task callAction OK: "
            "task_id=task-live-action action=live.task-action status=success"
            not in task_action.stdout
        ):
            raise RuntimeError(f"task callAction live smoke message missing: {task_action.stdout!r}")
        assert_disconnected(task_action_marker, "task callAction live smoke")
        assert_sdk_call(
            read_sdk_calls(task_action_sdk_marker),
            {
                "taskId": "task-live-action",
                "method": "callAction",
                "args": [
                    "live.task-action",
                    {"probe": True},
                    {
                        "callId": "task-options-call",
                        "parentCallId": "task-parent",
                        "reason": "task option smoke",
                        "metadata": {"source": "live-gate-task"},
                        "dryRun": False,
                        "timeoutMs": 1000,
                    },
                ],
            },
            "task callAction live smoke",
        )

        bad_task_action_without_task_marker = hermes_home / "bad-task-action-without-task-disconnect.txt"
        bad_task_action_without_task = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action",
            "live.task-missing-task",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_action_without_task_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_task_action_without_task,
            "Task SDK callAction() probe requires task id when action name is provided",
        )
        assert_disconnected(
            bad_task_action_without_task_marker,
            "bad task callAction action without task live smoke",
        )

        bad_task_action_args_without_task_marker = hermes_home / "bad-task-action-args-without-task-disconnect.txt"
        bad_task_action_args_without_task = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-args-json",
            '{"probe":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_action_args_without_task_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_task_action_args_without_task,
            "Task SDK callAction() probe requires task id when args JSON is provided",
        )
        assert_disconnected(
            bad_task_action_args_without_task_marker,
            "bad task callAction args without task live smoke",
        )

        bad_task_action_options_without_task_marker = hermes_home / "bad-task-action-options-without-task-disconnect.txt"
        bad_task_action_options_without_task = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-options-json",
            '{"dryRun":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_action_options_without_task_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_task_action_options_without_task,
            "Task SDK callAction() probe requires task id when options JSON is provided",
        )
        assert_disconnected(
            bad_task_action_options_without_task_marker,
            "bad task callAction options without task live smoke",
        )

        bad_task_action_without_name_marker = hermes_home / "bad-task-action-without-name-disconnect.txt"
        bad_task_action_without_name = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-task",
            "task-no-action",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_action_without_name_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_task_action_without_name,
            "Task SDK callAction() probe requires action name when task id is provided",
        )
        assert_disconnected(
            bad_task_action_without_name_marker,
            "bad task callAction task without action live smoke",
        )

        bad_task_action_attribution_marker = hermes_home / "bad-task-action-attribution-disconnect.txt"
        bad_task_action_attribution = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-task",
            "task-bad-attribution",
            "--task-call-action",
            "live.task-bad-attribution",
            "--task-call-action-options-json",
            '{"taskId":"other-task","conversationId":"conv-other","messageId":"msg-other"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_action_attribution_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_task_action_attribution,
            "Task SDK callAction() probe options must match TaskContext ActionCallOptions",
        )
        assert_disconnected(
            bad_task_action_attribution_marker,
            "bad task callAction attribution options live smoke",
        )

        bad_task_action_json_marker = hermes_home / "bad-task-action-json-disconnect.txt"
        bad_task_action_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-task",
            "task-bad-action-json",
            "--task-call-action",
            "live.task-bad-json",
            "--task-call-action-args-json",
            "{bad json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_action_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_action_json, "Task SDK callAction() probe JSON argument could not be parsed")
        assert_disconnected(bad_task_action_json_marker, "bad task callAction JSON live smoke")

        bad_task_action_duplicate_json_marker = (
            hermes_home / "bad-task-action-duplicate-json-disconnect.txt"
        )
        bad_task_action_duplicate_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-task",
            "task-bad-duplicate-json",
            "--task-call-action",
            "live.task-bad-duplicate-json",
            "--task-call-action-options-json",
            '{"dryRun":false,"dryRun":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_action_duplicate_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_action_duplicate_json, "JSON object contains duplicate key: dryRun")
        assert_disconnected(
            bad_task_action_duplicate_json_marker,
            "bad task callAction options duplicate key live smoke",
        )

        bad_task_action_nonfinite_json_marker = (
            hermes_home / "bad-task-action-nonfinite-json-disconnect.txt"
        )
        bad_task_action_nonfinite_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-task",
            "task-bad-nonfinite-json",
            "--task-call-action",
            "live.task-bad-nonfinite-json",
            "--task-call-action-args-json",
            '{"score":NaN}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_action_nonfinite_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_action_nonfinite_json, "JSON contains non-finite constant: NaN")
        assert_disconnected(
            bad_task_action_nonfinite_json_marker,
            "bad task callAction args non-finite live smoke",
        )

        bad_task_action_args_marker = hermes_home / "bad-task-action-args-disconnect.txt"
        bad_task_action_args = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-task",
            "task-bad-action-args",
            "--task-call-action",
            "live.task-bad-args",
            "--task-call-action-args-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_action_args_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_action_args, "Task SDK callAction() probe args must be a JSON object")
        assert_disconnected(bad_task_action_args_marker, "bad task callAction args live smoke")

        bad_task_action_options_marker = hermes_home / "bad-task-action-options-disconnect.txt"
        bad_task_action_options = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-task",
            "task-bad-action-options",
            "--task-call-action",
            "live.task-bad-options",
            "--task-call-action-options-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_action_options_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_action_options, "Task SDK callAction() probe options must be a JSON object")
        assert_disconnected(bad_task_action_options_marker, "bad task callAction options live smoke")

        bad_task_action_options_shape_marker = hermes_home / "bad-task-action-options-shape-disconnect.txt"
        bad_task_action_options_shape = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-task",
            "task-bad-action-options-shape",
            "--task-call-action",
            "live.task-bad-options-shape",
            "--task-call-action-options-json",
            '{"timeoutMs":"slow"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_action_options_shape_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_task_action_options_shape,
            "Task SDK callAction() probe options must match TaskContext ActionCallOptions",
        )
        assert_disconnected(
            bad_task_action_options_shape_marker,
            "bad task callAction options shape live smoke",
        )

        bad_task_action_options_metadata_marker = hermes_home / "bad-task-action-options-metadata-disconnect.txt"
        bad_task_action_options_metadata = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-task",
            "task-bad-action-options-metadata",
            "--task-call-action",
            "live.task-bad-options-metadata",
            "--task-call-action-options-json",
            '{"metadata":null}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_action_options_metadata_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_task_action_options_metadata,
            "Task SDK callAction() probe options must match TaskContext ActionCallOptions",
        )
        assert_disconnected(
            bad_task_action_options_metadata_marker,
            "bad task callAction options metadata live smoke",
        )

        bad_task_action_options_unknown_marker = hermes_home / "bad-task-action-options-unknown-disconnect.txt"
        bad_task_action_options_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-task",
            "task-bad-action-options-unknown",
            "--task-call-action",
            "live.task-bad-options-unknown",
            "--task-call-action-options-json",
            '{"timeoutMs":15000,"typo":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_action_options_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(
            bad_task_action_options_unknown,
            "Task SDK callAction() probe options must match TaskContext ActionCallOptions",
        )
        assert_disconnected(
            bad_task_action_options_unknown_marker,
            "bad task callAction options unknown field live smoke",
        )

        bad_task_action_marker = hermes_home / "bad-task-action-disconnect.txt"
        bad_task_action = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-task",
            "task-bad-action",
            "--task-call-action",
            "live.task-bad",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_TASK_CALL_ACTION="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_action_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_action, "Task SDK callAction() returned malformed action result")
        assert_disconnected(bad_task_action_marker, "bad task callAction live smoke")

        mismatch_task_action_call_id_marker = hermes_home / "mismatch-task-action-call-id-disconnect.txt"
        mismatch_task_action_call_id = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-task",
            "task-mismatch-call-id",
            "--task-call-action",
            "live.task-mismatch-call-id",
            "--task-call-action-options-json",
            '{"callId":"expected-task-action-call"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_MISMATCH_TASK_CALL_ACTION_CALL_ID="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(mismatch_task_action_call_id_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(mismatch_task_action_call_id, "Task SDK callAction() returned mismatched call id")
        assert_disconnected(
            mismatch_task_action_call_id_marker,
            "mismatch task callAction call id live smoke",
        )

        mismatch_task_action_dry_run_marker = hermes_home / "mismatch-task-action-dry-run-disconnect.txt"
        mismatch_task_action_dry_run = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-task",
            "task-mismatch-dry-run",
            "--task-call-action",
            "live.task-mismatch-dry-run",
            "--task-call-action-options-json",
            '{"callId":"expected-task-action-dry-run","dryRun":false}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_MISMATCH_TASK_CALL_ACTION_DRY_RUN="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(mismatch_task_action_dry_run_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(mismatch_task_action_dry_run, "Task SDK callAction() returned mismatched dryRun")
        assert_disconnected(
            mismatch_task_action_dry_run_marker,
            "mismatch task callAction dryRun live smoke",
        )

        for label, status_label, env_key, disconnect_label in [
            (
                "success",
                "success",
                "ARINOVA_FAKE_INCONSISTENT_TASK_SUCCESS_CALL_ACTION",
                "inconsistent task success callAction live smoke",
            ),
            (
                "error",
                "error",
                "ARINOVA_FAKE_INCONSISTENT_TASK_ERROR_CALL_ACTION",
                "inconsistent task error callAction live smoke",
            ),
            (
                "confirmation",
                "confirmation",
                "ARINOVA_FAKE_INCONSISTENT_TASK_CONFIRMATION_CALL_ACTION",
                "inconsistent task confirmation callAction live smoke",
            ),
            (
                "cancelled",
                "cancelled",
                "ARINOVA_FAKE_INCONSISTENT_TASK_CANCELLED_CALL_ACTION",
                "inconsistent task cancelled callAction live smoke",
            ),
        ]:
            marker = hermes_home / f"inconsistent-task-action-{label}-disconnect.txt"
            process = run_live(
                "--hermes-root",
                str(fake_hermes_root),
                "--task-call-action-task",
                f"task-inconsistent-{status_label}",
                "--task-call-action",
                f"live.task-inconsistent-{status_label}",
                env=clean_env(
                    hermes_home,
                    ARINOVA_SERVER_URL="wss://env.example",
                    ARINOVA_BOT_TOKEN="ari_env",
                    ARINOVA_FAKE_DISCONNECT_MARKER=str(marker),
                    PYTHONPATH="/definitely/not/hermes",
                    **{env_key: "1"},
                ),
            )
            assert_failed(process, "Task SDK callAction() returned inconsistent action result")
            assert_disconnected(marker, disconnect_label)

        bad_task_action_optional_marker = hermes_home / "bad-task-action-optional-disconnect.txt"
        bad_task_action_optional = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-task",
            "task-bad-action-optional",
            "--task-call-action",
            "live.task-bad-optional",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_TASK_CALL_ACTION_OPTIONAL="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_action_optional_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_action_optional, "Task SDK callAction() returned malformed action result")
        assert_disconnected(bad_task_action_optional_marker, "bad task callAction optional live smoke")

        bad_task_action_null_details_marker = hermes_home / "bad-task-action-null-details-disconnect.txt"
        bad_task_action_null_details = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-task",
            "task-bad-action-null-details",
            "--task-call-action",
            "live.task-bad-null-details",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_TASK_CALL_ACTION_NULL_DETAILS="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_action_null_details_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_action_null_details, "Task SDK callAction() returned malformed action result")
        assert_disconnected(
            bad_task_action_null_details_marker,
            "bad task callAction null details live smoke",
        )

        bad_task_action_null_dry_run_marker = hermes_home / "bad-task-action-null-dry-run-disconnect.txt"
        bad_task_action_null_dry_run = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-task",
            "task-bad-action-null-dry-run",
            "--task-call-action",
            "live.task-bad-null-dry-run",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_TASK_CALL_ACTION_NULL_DRY_RUN="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_action_null_dry_run_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_action_null_dry_run, "Task SDK callAction() returned malformed action result")
        assert_disconnected(
            bad_task_action_null_dry_run_marker,
            "bad task callAction null dryRun live smoke",
        )

        bad_task_action_null_metadata_marker = hermes_home / "bad-task-action-null-metadata-disconnect.txt"
        bad_task_action_null_metadata = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--task-call-action-task",
            "task-bad-action-null-metadata",
            "--task-call-action",
            "live.task-bad-null-metadata",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_TASK_CALL_ACTION_NULL_METADATA="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_task_action_null_metadata_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_task_action_null_metadata, "Task SDK callAction() returned malformed action result")
        assert_disconnected(
            bad_task_action_null_metadata_marker,
            "bad task callAction null metadata live smoke",
        )

        bad_action_marker = hermes_home / "bad-action-disconnect.txt"
        bad_action = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.bad",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CALL_ACTION="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_action_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_action, "SDK callAction() returned malformed action result")
        assert_disconnected(bad_action_marker, "bad callAction live smoke")

        bad_action_optional_marker = hermes_home / "bad-action-optional-disconnect.txt"
        bad_action_optional = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.bad-optional",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CALL_ACTION_OPTIONAL="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_action_optional_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_action_optional, "SDK callAction() returned malformed action result")
        assert_disconnected(bad_action_optional_marker, "bad callAction optional live smoke")

        bad_action_null_details_marker = hermes_home / "bad-action-null-details-disconnect.txt"
        bad_action_null_details = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.bad-null-details",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CALL_ACTION_NULL_DETAILS="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_action_null_details_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_action_null_details, "SDK callAction() returned malformed action result")
        assert_disconnected(bad_action_null_details_marker, "bad callAction null details live smoke")

        for nonterminal_status in ("received", "validating", "processing"):
            nonterminal_action_marker = hermes_home / f"nonterminal-action-{nonterminal_status}-disconnect.txt"
            nonterminal_action = run_live(
                "--hermes-root",
                str(fake_hermes_root),
                "--call-action",
                f"live.nonterminal.{nonterminal_status}",
                env=clean_env(
                    hermes_home,
                    ARINOVA_SERVER_URL="wss://env.example",
                    ARINOVA_BOT_TOKEN="ari_env",
                    ARINOVA_FAKE_NONTERMINAL_CALL_ACTION=nonterminal_status,
                    ARINOVA_FAKE_DISCONNECT_MARKER=str(nonterminal_action_marker),
                    PYTHONPATH="/definitely/not/hermes",
                ),
            )
            assert_failed(nonterminal_action, "SDK callAction() returned malformed action result")
            assert_disconnected(
                nonterminal_action_marker,
                f"nonterminal {nonterminal_status} callAction live smoke",
            )

        bad_action_null_dry_run_marker = hermes_home / "bad-action-null-dry-run-disconnect.txt"
        bad_action_null_dry_run = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.bad-null-dry-run",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CALL_ACTION_NULL_DRY_RUN="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_action_null_dry_run_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_action_null_dry_run, "SDK callAction() returned malformed action result")
        assert_disconnected(bad_action_null_dry_run_marker, "bad callAction null dryRun live smoke")

        bad_action_null_metadata_marker = hermes_home / "bad-action-null-metadata-disconnect.txt"
        bad_action_null_metadata = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.bad-null-metadata",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_BAD_CALL_ACTION_NULL_METADATA="1",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_action_null_metadata_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_action_null_metadata, "SDK callAction() returned malformed action result")
        assert_disconnected(bad_action_null_metadata_marker, "bad callAction null metadata live smoke")

        bad_action_json_marker = hermes_home / "bad-action-json-disconnect.txt"
        bad_action_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.bad-json",
            "--call-action-args-json",
            "{bad json",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_action_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_action_json, "SDK callAction() probe JSON argument could not be parsed")
        assert_disconnected(bad_action_json_marker, "bad callAction JSON live smoke")

        bad_action_duplicate_json_marker = hermes_home / "bad-action-duplicate-json-disconnect.txt"
        bad_action_duplicate_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.bad-duplicate-json",
            "--call-action-options-json",
            '{"dryRun":false,"dryRun":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_action_duplicate_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_action_duplicate_json, "JSON object contains duplicate key: dryRun")
        assert_disconnected(
            bad_action_duplicate_json_marker,
            "bad callAction options duplicate key live smoke",
        )

        bad_action_nonfinite_json_marker = hermes_home / "bad-action-nonfinite-json-disconnect.txt"
        bad_action_nonfinite_json = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.bad-nonfinite-json",
            "--call-action-args-json",
            '{"score":NaN}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_action_nonfinite_json_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_action_nonfinite_json, "JSON contains non-finite constant: NaN")
        assert_disconnected(
            bad_action_nonfinite_json_marker,
            "bad callAction args non-finite live smoke",
        )

        bad_action_args_marker = hermes_home / "bad-action-args-disconnect.txt"
        bad_action_args = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.bad-args",
            "--call-action-args-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_action_args_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_action_args, "SDK callAction() probe args must be a JSON object")
        assert_disconnected(bad_action_args_marker, "bad callAction args live smoke")

        bad_action_options_marker = hermes_home / "bad-action-options-disconnect.txt"
        bad_action_options = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.bad-options",
            "--call-action-options-json",
            "[]",
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_action_options_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_action_options, "SDK callAction() probe options must be a JSON object")
        assert_disconnected(bad_action_options_marker, "bad callAction options live smoke")

        bad_action_options_shape_marker = hermes_home / "bad-action-options-shape-disconnect.txt"
        bad_action_options_shape = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.bad-options-shape",
            "--call-action-options-json",
            '{"timeoutMs":"slow"}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_action_options_shape_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_action_options_shape, "SDK callAction() probe options must match ActionCallOptions")
        assert_disconnected(bad_action_options_shape_marker, "bad callAction options shape live smoke")

        bad_action_options_metadata_marker = hermes_home / "bad-action-options-metadata-disconnect.txt"
        bad_action_options_metadata = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.bad-options-metadata",
            "--call-action-options-json",
            '{"metadata":null}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_action_options_metadata_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_action_options_metadata, "SDK callAction() probe options must match ActionCallOptions")
        assert_disconnected(bad_action_options_metadata_marker, "bad callAction options metadata live smoke")

        bad_action_options_dry_run_marker = hermes_home / "bad-action-options-dry-run-disconnect.txt"
        bad_action_options_dry_run = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.bad-options-dry-run",
            "--call-action-options-json",
            '{"dryRun":null}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_action_options_dry_run_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_action_options_dry_run, "SDK callAction() probe options must match ActionCallOptions")
        assert_disconnected(bad_action_options_dry_run_marker, "bad callAction options dryRun live smoke")

        bad_action_options_unknown_marker = hermes_home / "bad-action-options-unknown-disconnect.txt"
        bad_action_options_unknown = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            "--call-action",
            "live.bad-options-unknown",
            "--call-action-options-json",
            '{"timeoutMs":15000,"typo":true}',
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_action_options_unknown_marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(bad_action_options_unknown, "SDK callAction() probe options must match ActionCallOptions")
        assert_disconnected(bad_action_options_unknown_marker, "bad callAction options unknown field live smoke")

    print("live Arinova credential gate OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
