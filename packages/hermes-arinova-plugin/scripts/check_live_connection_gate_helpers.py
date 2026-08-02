from __future__ import annotations

import os
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from check_live_connection_gate_fake_hermes import write_fake_hermes_root


ROOT = Path(__file__).resolve().parents[1]
COMMAND_TIMEOUT_SECONDS = 300
LIVE_CHECK = ROOT / "scripts/check_live_connection.py"
LOCAL_CHECK = ROOT / "scripts/check_local.py"
SKIP_BOTH_MESSAGE = "live Arinova smoke skipped: missing ARINOVA_SERVER_URL, ARINOVA_BOT_TOKEN in env or Hermes config"
SKIP_SERVER_MESSAGE = "live Arinova smoke skipped: missing ARINOVA_SERVER_URL in env or Hermes config"
SKIP_TOKEN_MESSAGE = "live Arinova smoke skipped: missing ARINOVA_BOT_TOKEN in env or Hermes config"
CONFIG_SOURCE_MESSAGE = "live Arinova credentials resolved: server_url=config bot_token=config"
ENV_SERVER_CONFIG_TOKEN_MESSAGE = "live Arinova credentials resolved: server_url=env bot_token=config"
CONFIG_SERVER_ENV_TOKEN_MESSAGE = "live Arinova credentials resolved: server_url=config bot_token=env"
ENV_SOURCE_MESSAGE = "live Arinova credentials resolved: server_url=env bot_token=env"


def clean_env(hermes_home: Path, **overrides: str) -> dict[str, str]:
    env = os.environ.copy()
    env.pop("ARINOVA_SERVER_URL", None)
    env.pop("ARINOVA_BOT_TOKEN", None)
    env["HERMES_HOME"] = str(hermes_home)
    env.update(overrides)
    return env


def run_live(*args: str, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(LIVE_CHECK), *args],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=COMMAND_TIMEOUT_SECONDS,
        check=False,
    )


def run_local(*args: str, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(LOCAL_CHECK), *args],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=COMMAND_TIMEOUT_SECONDS,
        check=False,
    )


def write_config(hermes_home: Path) -> None:
    (hermes_home / "config.yaml").write_text(
        "\n".join(
            [
                "arinova:",
                "  enabled: true",
                "  server_url: wss://config.example",
                "  bot_token: ari_config",
                "",
            ]
        )
    )


def write_token_alias_config(hermes_home: Path) -> None:
    (hermes_home / "config.yaml").write_text(
        "\n".join(
            [
                "arinova:",
                "  enabled: true",
                "  server_url: wss://config-token-alias.example",
                "  token: ari_config_token_alias",
                "",
            ]
        )
    )


def assert_resolved(process: subprocess.CompletedProcess[str], expected: str) -> None:
    if process.returncode != 0:
        raise RuntimeError(f"expected credential resolution to pass, got {process.returncode}: {process.stderr!r}")
    if expected not in process.stdout:
        raise RuntimeError(f"credential source message missing from stdout: {process.stdout!r}")


def assert_failed(process: subprocess.CompletedProcess[str], expected_stderr: str) -> None:
    if process.returncode == 0:
        raise RuntimeError(f"expected live smoke to fail, got 0: stdout={process.stdout!r}")
    if expected_stderr not in process.stderr:
        raise RuntimeError(
            f"expected live smoke stderr to contain {expected_stderr!r}, "
            f"got stdout={process.stdout!r} stderr={process.stderr!r}"
        )


def assert_disconnected(marker: Path, label: str) -> None:
    if not marker.exists():
        raise RuntimeError(f"{label} did not disconnect fake Arinova adapter")
    if "disconnect" not in marker.read_text(encoding="utf-8"):
        raise RuntimeError(f"{label} wrote unexpected disconnect marker: {marker.read_text(encoding='utf-8')!r}")


def read_sdk_calls(marker: Path) -> list[dict[str, object]]:
    if not marker.exists():
        raise RuntimeError(f"fake Arinova adapter did not write SDK call marker: {marker}")
    return [json.loads(line) for line in marker.read_text(encoding="utf-8").splitlines() if line.strip()]


def assert_sdk_call(calls: list[dict[str, object]], expected: dict[str, object], label: str) -> None:
    if expected not in calls:
        raise RuntimeError(f"{label} SDK call missing: expected={expected!r} calls={calls!r}")


def run_credential_and_config_cases(hermes_home: Path, missing_hermes_root: Path) -> Path:
    skipped = run_live(env=clean_env(hermes_home))
    if skipped.returncode != 0:
        raise RuntimeError(f"expected credential-free live smoke to skip with 0, got {skipped.returncode}")
    if SKIP_BOTH_MESSAGE not in skipped.stdout:
        raise RuntimeError(f"skip message missing from stdout: {skipped.stdout!r}")

    required = run_live("--require-credentials", env=clean_env(hermes_home))
    if required.returncode != 2:
        raise RuntimeError(f"expected --require-credentials to fail with 2, got {required.returncode}")
    if SKIP_BOTH_MESSAGE not in required.stderr:
        raise RuntimeError(f"required-credentials message missing from stderr: {required.stderr!r}")

    local_required = run_local(
        "--hermes-root",
        str(missing_hermes_root),
        "--require-credentials",
        env=clean_env(hermes_home),
    )
    if local_required.returncode != 2:
        raise RuntimeError(
            "expected local gate --require-credentials to fail fast with 2, "
            f"got {local_required.returncode}"
        )
    if SKIP_BOTH_MESSAGE not in local_required.stdout + local_required.stderr:
        raise RuntimeError(
            "local gate --require-credentials did not surface missing credential message: "
            f"stdout={local_required.stdout!r} stderr={local_required.stderr!r}"
        )
    if "scripts/check_agent_sdk_source.py" in local_required.stdout:
        raise RuntimeError(
            "local gate --require-credentials did not preflight credentials before slower checks: "
            f"{local_required.stdout!r}"
        )

    missing_server = run_live(
        "--require-credentials",
        env=clean_env(hermes_home, ARINOVA_BOT_TOKEN="ari_fake"),
    )
    if missing_server.returncode != 2:
        raise RuntimeError(f"expected missing server URL to fail with 2, got {missing_server.returncode}")
    if SKIP_SERVER_MESSAGE not in missing_server.stderr:
        raise RuntimeError(f"missing server URL message missing from stderr: {missing_server.stderr!r}")

    missing_token = run_live(
        "--require-credentials",
        env=clean_env(hermes_home, ARINOVA_SERVER_URL="wss://example.invalid"),
    )
    if missing_token.returncode != 2:
        raise RuntimeError(f"expected missing bot token to fail with 2, got {missing_token.returncode}")
    if SKIP_TOKEN_MESSAGE not in missing_token.stderr:
        raise RuntimeError(f"missing bot token message missing from stderr: {missing_token.stderr!r}")

    write_config(hermes_home)
    config_only = run_live(
        "--resolve-credentials-only",
        "--hermes-root",
        str(missing_hermes_root),
        env=clean_env(hermes_home),
    )
    assert_resolved(config_only, CONFIG_SOURCE_MESSAGE)

    blank_env_config = run_live(
        "--resolve-credentials-only",
        "--hermes-root",
        str(missing_hermes_root),
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="   ",
            ARINOVA_BOT_TOKEN="  ",
        ),
    )
    assert_resolved(blank_env_config, CONFIG_SOURCE_MESSAGE)

    env_server_config_token = run_live(
        "--resolve-credentials-only",
        "--hermes-root",
        str(missing_hermes_root),
        env=clean_env(hermes_home, ARINOVA_SERVER_URL="wss://env.example"),
    )
    assert_resolved(env_server_config_token, ENV_SERVER_CONFIG_TOKEN_MESSAGE)

    config_server_env_token = run_live(
        "--resolve-credentials-only",
        "--hermes-root",
        str(missing_hermes_root),
        env=clean_env(hermes_home, ARINOVA_BOT_TOKEN="ari_env"),
    )
    assert_resolved(config_server_env_token, CONFIG_SERVER_ENV_TOKEN_MESSAGE)

    blank_server_env_token = run_live(
        "--resolve-credentials-only",
        "--hermes-root",
        str(missing_hermes_root),
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="   ",
            ARINOVA_BOT_TOKEN="ari_env",
        ),
    )
    assert_resolved(blank_server_env_token, CONFIG_SERVER_ENV_TOKEN_MESSAGE)

    env_server_blank_token = run_live(
        "--resolve-credentials-only",
        "--hermes-root",
        str(missing_hermes_root),
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="  ",
        ),
    )
    assert_resolved(env_server_blank_token, ENV_SERVER_CONFIG_TOKEN_MESSAGE)

    env_only = run_live(
        "--resolve-credentials-only",
        "--hermes-root",
        str(missing_hermes_root),
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
        ),
    )
    assert_resolved(env_only, ENV_SOURCE_MESSAGE)

    write_token_alias_config(hermes_home)
    token_alias_config_only = run_live(
        "--resolve-credentials-only",
        "--hermes-root",
        str(missing_hermes_root),
        env=clean_env(hermes_home),
    )
    assert_resolved(token_alias_config_only, CONFIG_SOURCE_MESSAGE)

    fake_hermes_root = hermes_home / "fake-hermes-agent"
    write_fake_hermes_root(fake_hermes_root)
    (hermes_home / "config.yaml").unlink()
    platform_key_config_marker = hermes_home / "platform-key-config.jsonl"
    platform_key_validate_marker = hermes_home / "platform-key-validate.jsonl"
    platform_key_config_disconnect_marker = hermes_home / "platform-key-config-disconnect.txt"
    platform_key_config = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        "--skip-telemetry",
        env=clean_env(
            hermes_home,
            ARINOVA_FAKE_CONFIG_PLATFORM_KEY="platform",
            ARINOVA_FAKE_CONFIG_MARKER=str(platform_key_config_marker),
            ARINOVA_FAKE_VALIDATE_CONFIG_MARKER=str(platform_key_validate_marker),
            ARINOVA_FAKE_DISCONNECT_MARKER=str(platform_key_config_disconnect_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    if platform_key_config.returncode != 0:
        raise RuntimeError(
            "expected live smoke to load typed Hermes platform config credentials, "
            f"got {platform_key_config.returncode}: stdout={platform_key_config.stdout!r} "
            f"stderr={platform_key_config.stderr!r}"
        )
    if "live Arinova smoke OK: connected agent_id=agent-from-fake-hermes-root" not in platform_key_config.stdout:
        raise RuntimeError(f"typed platform-key live smoke message missing: {platform_key_config.stdout!r}")
    assert_disconnected(platform_key_config_disconnect_marker, "typed platform-key config live smoke")
    platform_key_configs = read_sdk_calls(platform_key_config_marker)
    platform_key_validate_configs = read_sdk_calls(platform_key_validate_marker)
    if platform_key_configs != [
        {
            "token": "ari_loaded_config",
            "extra": {
                "agent_skills_json": '[{"id":"live-smoke-skill","name":"Live Smoke Skill","description":"Live smoke skill"}]',
                "bot_token": "ari_loaded_config",
                "concurrency_mode": "per-conversation",
                "server_url": "wss://loaded-config.example",
            },
        }
    ]:
        raise RuntimeError(f"typed platform-key config was not passed to fake adapter: {platform_key_configs!r}")
    if platform_key_validate_configs != platform_key_configs:
        raise RuntimeError(
            "typed platform-key config was not validated before fake adapter construction: "
            f"{platform_key_validate_configs!r}"
        )

    platform_key_env_server_marker = hermes_home / "platform-key-env-server.jsonl"
    platform_key_env_server_disconnect_marker = hermes_home / "platform-key-env-server-disconnect.txt"
    platform_key_env_server = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        "--skip-telemetry",
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env-typed.example",
            ARINOVA_FAKE_CONFIG_PLATFORM_KEY="platform",
            ARINOVA_FAKE_CONFIG_MARKER=str(platform_key_env_server_marker),
            ARINOVA_FAKE_DISCONNECT_MARKER=str(platform_key_env_server_disconnect_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    if platform_key_env_server.returncode != 0:
        raise RuntimeError(
            "expected live smoke to merge env server URL with typed Hermes config token, "
            f"got {platform_key_env_server.returncode}: stdout={platform_key_env_server.stdout!r} "
            f"stderr={platform_key_env_server.stderr!r}"
        )
    assert_disconnected(platform_key_env_server_disconnect_marker, "typed platform-key env-server live smoke")
    platform_key_env_server_configs = read_sdk_calls(platform_key_env_server_marker)
    if platform_key_env_server_configs != [
        {
            "token": "ari_loaded_config",
            "extra": {
                "agent_skills_json": '[{"id":"live-smoke-skill","name":"Live Smoke Skill","description":"Live smoke skill"}]',
                "bot_token": "ari_loaded_config",
                "concurrency_mode": "per-conversation",
                "server_url": "wss://env-typed.example",
            },
        }
    ]:
        raise RuntimeError(
            "typed platform-key config did not preserve env-over-config server precedence: "
            f"{platform_key_env_server_configs!r}"
        )

    platform_key_env_token_marker = hermes_home / "platform-key-env-token.jsonl"
    platform_key_env_token_disconnect_marker = hermes_home / "platform-key-env-token-disconnect.txt"
    platform_key_env_token = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        "--skip-telemetry",
        env=clean_env(
            hermes_home,
            ARINOVA_BOT_TOKEN="ari_env_typed",
            ARINOVA_FAKE_CONFIG_PLATFORM_KEY="platform",
            ARINOVA_FAKE_CONFIG_MARKER=str(platform_key_env_token_marker),
            ARINOVA_FAKE_DISCONNECT_MARKER=str(platform_key_env_token_disconnect_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    if platform_key_env_token.returncode != 0:
        raise RuntimeError(
            "expected live smoke to merge typed Hermes config server URL with env token, "
            f"got {platform_key_env_token.returncode}: stdout={platform_key_env_token.stdout!r} "
            f"stderr={platform_key_env_token.stderr!r}"
        )
    assert_disconnected(platform_key_env_token_disconnect_marker, "typed platform-key env-token live smoke")
    platform_key_env_token_configs = read_sdk_calls(platform_key_env_token_marker)
    if platform_key_env_token_configs != [
        {
            "token": "ari_env_typed",
            "extra": {
                "agent_skills_json": '[{"id":"live-smoke-skill","name":"Live Smoke Skill","description":"Live smoke skill"}]',
                "bot_token": "ari_env_typed",
                "concurrency_mode": "per-conversation",
                "server_url": "wss://loaded-config.example",
            },
        }
    ]:
        raise RuntimeError(
            "typed platform-key config did not preserve env-over-config token precedence: "
            f"{platform_key_env_token_configs!r}"
        )

    platform_key_env_concurrency_marker = hermes_home / "platform-key-env-concurrency.jsonl"
    platform_key_env_concurrency_disconnect_marker = hermes_home / "platform-key-env-concurrency-disconnect.txt"
    platform_key_env_concurrency = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        "--skip-telemetry",
        env=clean_env(
            hermes_home,
            ARINOVA_CONCURRENCY_MODE="agent-wide",
            ARINOVA_FAKE_CONFIG_PLATFORM_KEY="platform",
            ARINOVA_FAKE_CONFIG_MARKER=str(platform_key_env_concurrency_marker),
            ARINOVA_FAKE_DISCONNECT_MARKER=str(platform_key_env_concurrency_disconnect_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    if platform_key_env_concurrency.returncode != 0:
        raise RuntimeError(
            "expected live smoke to merge env concurrency mode with typed Hermes config credentials, "
            f"got {platform_key_env_concurrency.returncode}: stdout={platform_key_env_concurrency.stdout!r} "
            f"stderr={platform_key_env_concurrency.stderr!r}"
        )
    assert_disconnected(
        platform_key_env_concurrency_disconnect_marker,
        "typed platform-key env-concurrency live smoke",
    )
    platform_key_env_concurrency_configs = read_sdk_calls(platform_key_env_concurrency_marker)
    if platform_key_env_concurrency_configs != [
        {
            "token": "ari_loaded_config",
            "extra": {
                "agent_skills_json": '[{"id":"live-smoke-skill","name":"Live Smoke Skill","description":"Live smoke skill"}]',
                "bot_token": "ari_loaded_config",
                "concurrency_mode": "agent-wide",
                "server_url": "wss://loaded-config.example",
            },
        }
    ]:
        raise RuntimeError(
            "typed platform-key config did not preserve env concurrency mode: "
            f"{platform_key_env_concurrency_configs!r}"
        )

    validate_false = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        "--skip-telemetry",
        env=clean_env(
            hermes_home,
            ARINOVA_FAKE_CONFIG_PLATFORM_KEY="platform",
            ARINOVA_FAKE_VALIDATE_CONFIG_FALSE="1",
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(validate_false, "resolved Arinova live smoke config did not pass plugin validate_config")
    return fake_hermes_root


def run_full_env_import_probe_case(hermes_home: Path, fake_hermes_root: Path) -> None:
    env_import_marker = hermes_home / "env-import-disconnect.txt"
    env_import_sdk_marker = hermes_home / "env-import-sdk-calls.jsonl"
    env_import_path = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        "--send-message-conversation",
        "conv-import-path",
        "--send-message-content",
        "custom live gate probe",
        "--send-telemetry-event",
        "custom.live.telemetry",
        "--send-telemetry-json",
        '{"agentId":"agent-from-fake-hermes-root","phase":"live-gate","nested":{"ok":true}}',
        "--send-hud-json",
        '{"status":"live-smoke","progress":1}',
        "--send-hud-conversation",
        "conv-hud",
        "--send-task-update-json",
        '{"status":"started","task":"live smoke"}',
        "--report-tool-call-json",
        '{"sessionId":"live-session","turnId":"live-turn","seqOrder":0,"toolName":"live_smoke","input":{"probe":true},"output":{"ok":true},"success":true}',
        "--query-memory-json",
        '{"query":"live smoke","limit":1}',
        "--fetch-skill-prompt",
        "memo",
        "--list-boards",
        "--list-cards-json",
        '{"search":"live smoke","limit":1}',
        "--list-notes-conversation",
        "conv-notes",
        "--list-notes-options-json",
        '{"tags":["live"],"limit":1,"archived":false}',
        "--list-columns-board",
        "board-live",
        "--list-labels-board",
        "board-live",
        "--list-archived-cards-board",
        "board-live",
        "--list-archived-cards-options-json",
        '{"page":1,"limit":1}',
        "--list-card-commits-card",
        "card-live",
        "--list-card-notes-card",
        "card-live",
        "--create-note-conversation",
        "conv-note",
        "--create-note-body-json",
        '{"title":"Live smoke note","content":"Created by hermes-arinova-plugin live smoke","tags":["live"]}',
        "--update-note-conversation",
        "conv-note",
        "--update-note-id",
        "note-live",
        "--update-note-body-json",
        '{"title":"Updated live smoke note","content":"Updated by hermes-arinova-plugin live smoke","tags":["live","updated"]}',
        "--delete-note-conversation",
        "conv-note",
        "--delete-note-id",
        "note-live",
        "--create-board-body-json",
        '{"name":"Live smoke board","columns":[{"name":"Todo"},{"name":"Done"}]}',
        "--update-board-id",
        "board-live",
        "--update-board-body-json",
        '{"name":"Updated live smoke board"}',
        "--archive-board-id",
        "board-live",
        "--create-card-body-json",
        '{"title":"Live smoke card","description":"Created by hermes-arinova-plugin live smoke","priority":"high","columnName":"Todo","boardId":"board-live"}',
        "--update-card-id",
        "card-live",
        "--update-card-body-json",
        '{"title":"Updated live smoke card","description":"Updated by hermes-arinova-plugin live smoke","priority":"urgent","columnId":"column-live","sortOrder":2}',
        "--complete-card-id",
        "card-live",
        "--create-column-board",
        "board-live",
        "--create-column-body-json",
        '{"name":"Live smoke column","sortOrder":4}',
        "--update-column-id",
        "column-live",
        "--update-column-body-json",
        '{"name":"Updated live smoke column","sortOrder":5}',
        "--delete-column-id",
        "column-live",
        "--reorder-columns-board",
        "board-live",
        "--reorder-columns-json",
        '["column-live","done-column"]',
        "--add-card-commit-card",
        "card-live",
        "--add-card-commit-body-json",
        '{"commitHash":"abc123","message":"Live smoke commit"}',
        "--link-card-note-card",
        "card-live",
        "--link-card-note-note",
        "note-live",
        "--unlink-card-note-card",
        "card-live",
        "--unlink-card-note-note",
        "note-live",
        "--create-label-board",
        "board-live",
        "--create-label-body-json",
        '{"name":"Live smoke label","color":"#ff0000"}',
        "--update-label-id",
        "label-live",
        "--update-label-body-json",
        '{"name":"Updated live smoke label","color":"#00ff00"}',
        "--delete-label-id",
        "label-live",
        "--add-card-label-card",
        "card-live",
        "--add-card-label-label",
        "label-live",
        "--remove-card-label-card",
        "card-live",
        "--remove-card-label-label",
        "label-live",
        "--fetch-history-conversation",
        "conv-history",
        "--fetch-history-limit",
        "2",
        "--fetch-history-options-json",
        '{"before":"msg-before","after":"msg-after","around":"msg-around","limit":2}',
        "--upload-file-conversation",
        "conv-upload",
        "--upload-file-name",
        "live-gate.txt",
        "--call-action",
        "live.smoke",
        "--call-action-args-json",
        '{"probe":true}',
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(env_import_marker),
            ARINOVA_FAKE_SDK_CALLS_MARKER=str(env_import_sdk_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    if env_import_path.returncode != 0:
        raise RuntimeError(
            "expected env credential live smoke to honor --hermes-root import path, "
            f"got {env_import_path.returncode}: stdout={env_import_path.stdout!r} "
            f"stderr={env_import_path.stderr!r}"
        )
    if "live Arinova smoke OK: connected agent_id=agent-from-fake-hermes-root" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root live smoke message missing: {env_import_path.stdout!r}")
    if "live Arinova sendMessage OK: conversation_id=conv-import-path" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root sendMessage probe message missing: {env_import_path.stdout!r}")
    if "live Arinova sendHud OK" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root sendHud probe message missing: {env_import_path.stdout!r}")
    if "live Arinova sendTaskUpdate OK" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root sendTaskUpdate probe message missing: {env_import_path.stdout!r}")
    if "live Arinova reportToolCall OK" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root reportToolCall probe message missing: {env_import_path.stdout!r}")
    if "live Arinova queryMemory OK: entries=0" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root queryMemory probe message missing: {env_import_path.stdout!r}")
    if "live Arinova fetchSkillPrompt OK: slug=memo" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root fetchSkillPrompt probe message missing: {env_import_path.stdout!r}")
    if "live Arinova listBoards OK: boards=0" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root listBoards probe message missing: {env_import_path.stdout!r}")
    if "live Arinova listCards OK: cards=0" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root listCards probe message missing: {env_import_path.stdout!r}")
    if "live Arinova listNotes OK: conversation_id=conv-notes notes=0" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root listNotes probe message missing: {env_import_path.stdout!r}")
    if "live Arinova listColumns OK: board_id=board-live columns=0" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root listColumns probe message missing: {env_import_path.stdout!r}")
    if "live Arinova listLabels OK: board_id=board-live labels=0" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root listLabels probe message missing: {env_import_path.stdout!r}")
    if "live Arinova listArchivedCards OK: board_id=board-live cards=0" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root listArchivedCards probe message missing: {env_import_path.stdout!r}")
    if "live Arinova listCardCommits OK: card_id=card-live commits=0" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root listCardCommits probe message missing: {env_import_path.stdout!r}")
    if "live Arinova listCardNotes OK: card_id=card-live notes=0" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root listCardNotes probe message missing: {env_import_path.stdout!r}")
    if "live Arinova createNote OK: conversation_id=conv-note note_id=note-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root createNote probe message missing: {env_import_path.stdout!r}")
    if "live Arinova updateNote OK: conversation_id=conv-note note_id=note-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root updateNote probe message missing: {env_import_path.stdout!r}")
    if "live Arinova deleteNote OK: conversation_id=conv-note note_id=note-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root deleteNote probe message missing: {env_import_path.stdout!r}")
    if "live Arinova createBoard OK: board_id=board-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root createBoard probe message missing: {env_import_path.stdout!r}")
    if "live Arinova updateBoard OK: board_id=board-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root updateBoard probe message missing: {env_import_path.stdout!r}")
    if "live Arinova archiveBoard OK: board_id=board-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root archiveBoard probe message missing: {env_import_path.stdout!r}")
    if "live Arinova createCard OK: card_id=card-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root createCard probe message missing: {env_import_path.stdout!r}")
    if "live Arinova updateCard OK: card_id=card-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root updateCard probe message missing: {env_import_path.stdout!r}")
    if "live Arinova completeCard OK: card_id=card-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root completeCard probe message missing: {env_import_path.stdout!r}")
    if "live Arinova createColumn OK: column_id=column-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root createColumn probe message missing: {env_import_path.stdout!r}")
    if "live Arinova updateColumn OK: column_id=column-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root updateColumn probe message missing: {env_import_path.stdout!r}")
    if "live Arinova deleteColumn OK: column_id=column-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root deleteColumn probe message missing: {env_import_path.stdout!r}")
    if "live Arinova reorderColumns OK: board_id=board-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root reorderColumns probe message missing: {env_import_path.stdout!r}")
    if "live Arinova addCardCommit OK: card_id=card-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root addCardCommit probe message missing: {env_import_path.stdout!r}")
    if "live Arinova linkCardNote OK: card_id=card-live note_id=note-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root linkCardNote probe message missing: {env_import_path.stdout!r}")
    if "live Arinova unlinkCardNote OK: card_id=card-live note_id=note-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root unlinkCardNote probe message missing: {env_import_path.stdout!r}")
    if "live Arinova createLabel OK: label_id=label-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root createLabel probe message missing: {env_import_path.stdout!r}")
    if "live Arinova updateLabel OK: label_id=label-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root updateLabel probe message missing: {env_import_path.stdout!r}")
    if "live Arinova deleteLabel OK: label_id=label-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root deleteLabel probe message missing: {env_import_path.stdout!r}")
    if "live Arinova addCardLabel OK: card_id=card-live label_id=label-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root addCardLabel probe message missing: {env_import_path.stdout!r}")
    if "live Arinova removeCardLabel OK: card_id=card-live label_id=label-live" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root removeCardLabel probe message missing: {env_import_path.stdout!r}")
    if "live Arinova fetchHistory OK: conversation_id=conv-history messages=0" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root fetchHistory probe message missing: {env_import_path.stdout!r}")
    if "live Arinova uploadFile OK: conversation_id=conv-upload fileName=live-gate.txt" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root uploadFile probe message missing: {env_import_path.stdout!r}")
    if "live Arinova callAction OK: action=live.smoke status=success" not in env_import_path.stdout:
        raise RuntimeError(f"fake Hermes root callAction probe message missing: {env_import_path.stdout!r}")
    assert_disconnected(env_import_marker, "env credential live smoke")
    env_import_calls = read_sdk_calls(env_import_sdk_marker)
    assert_sdk_call(env_import_calls, {"method": "getAgentId", "args": []}, "env credential live smoke")
    assert_sdk_call(env_import_calls, {"method": "getOnboardingSeed", "args": []}, "env credential live smoke")
    assert_sdk_call(
        env_import_calls,
        {
            "method": "sendTelemetry",
            "args": [
                "custom.live.telemetry",
                {
                    "agentId": "agent-from-fake-hermes-root",
                    "nested": {"ok": True},
                    "phase": "live-gate",
                },
            ],
        },
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "sendMessage", "args": ["conv-import-path", "custom live gate probe"]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "sendHud", "args": [{"progress": 1, "status": "live-smoke"}, "conv-hud"]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "sendTaskUpdate", "args": ["Hermes", {"status": "started", "task": "live smoke"}]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {
            "method": "reportToolCall",
            "args": [
                {
                    "input": {"probe": True},
                    "output": {"ok": True},
                    "seqOrder": 0,
                    "sessionId": "live-session",
                    "success": True,
                    "toolName": "live_smoke",
                    "turnId": "live-turn",
                }
            ],
        },
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "queryMemory", "args": [{"limit": 1, "query": "live smoke"}]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "fetchSkillPrompt", "args": ["memo"]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "listBoards", "args": []},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "listCards", "args": [{"limit": 1, "search": "live smoke"}]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "listNotes", "args": ["conv-notes", {"archived": False, "limit": 1, "tags": ["live"]}]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "listColumns", "args": ["board-live"]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "listLabels", "args": ["board-live"]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "listArchivedCards", "args": ["board-live", {"limit": 1, "page": 1}]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "listCardCommits", "args": ["card-live"]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "listCardNotes", "args": ["card-live"]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {
            "method": "createNote",
            "args": [
                "conv-note",
                {
                    "content": "Created by hermes-arinova-plugin live smoke",
                    "tags": ["live"],
                    "title": "Live smoke note",
                },
            ],
        },
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {
            "method": "updateNote",
            "args": [
                "conv-note",
                "note-live",
                {
                    "content": "Updated by hermes-arinova-plugin live smoke",
                    "tags": ["live", "updated"],
                    "title": "Updated live smoke note",
                },
            ],
        },
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "deleteNote", "args": ["conv-note", "note-live"]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {
            "method": "createBoard",
            "args": [
                {
                    "columns": [{"name": "Todo"}, {"name": "Done"}],
                    "name": "Live smoke board",
                }
            ],
        },
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {
            "method": "updateBoard",
            "args": ["board-live", {"name": "Updated live smoke board"}],
        },
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "archiveBoard", "args": ["board-live"]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {
            "method": "createCard",
            "args": [
                {
                    "boardId": "board-live",
                    "columnName": "Todo",
                    "description": "Created by hermes-arinova-plugin live smoke",
                    "priority": "high",
                    "title": "Live smoke card",
                }
            ],
        },
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {
            "method": "updateCard",
            "args": [
                "card-live",
                {
                    "columnId": "column-live",
                    "description": "Updated by hermes-arinova-plugin live smoke",
                    "priority": "urgent",
                    "sortOrder": 2,
                    "title": "Updated live smoke card",
                },
            ],
        },
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "completeCard", "args": ["card-live"]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {
            "method": "createColumn",
            "args": ["board-live", {"name": "Live smoke column", "sortOrder": 4}],
        },
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {
            "method": "updateColumn",
            "args": ["column-live", {"name": "Updated live smoke column", "sortOrder": 5}],
        },
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "deleteColumn", "args": ["column-live"]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "reorderColumns", "args": ["board-live", ["column-live", "done-column"]]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {
            "method": "addCardCommit",
            "args": ["card-live", {"commitHash": "abc123", "message": "Live smoke commit"}],
        },
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "linkCardNote", "args": ["card-live", "note-live"]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "unlinkCardNote", "args": ["card-live", "note-live"]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {
            "method": "createLabel",
            "args": ["board-live", {"color": "#ff0000", "name": "Live smoke label"}],
        },
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {
            "method": "updateLabel",
            "args": ["label-live", {"color": "#00ff00", "name": "Updated live smoke label"}],
        },
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "deleteLabel", "args": ["label-live"]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "addCardLabel", "args": ["card-live", "label-live"]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {"method": "removeCardLabel", "args": ["card-live", "label-live"]},
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {
            "method": "fetchHistory",
            "args": [
                "conv-history",
                {
                    "after": "msg-after",
                    "around": "msg-around",
                    "before": "msg-before",
                    "limit": 2,
                },
            ],
        },
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {
            "method": "uploadFile",
            "args": [
                "conv-upload",
                {"base64": "SGVybWVzIEFyaW5vdmEgbGl2ZSBzbW9rZSB1cGxvYWQK"},
                "live-gate.txt",
                "text/plain",
            ],
        },
        "env credential live smoke",
    )
    assert_sdk_call(
        env_import_calls,
        {
            "method": "callAction",
            "args": [
                "live.smoke",
                {"probe": True},
                {
                    "callId": "hermes-arinova-live-smoke-action",
                    "dryRun": True,
                    "timeoutMs": 15000,
                },
            ],
        },
        "env credential live smoke",
    )


def run_basic_live_failure_cases(hermes_home: Path, fake_hermes_root: Path) -> None:
    skip_telemetry_marker = hermes_home / "skip-telemetry-disconnect.txt"
    skip_telemetry_sdk_marker = hermes_home / "skip-telemetry-sdk-calls.jsonl"
    skip_telemetry = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        "--skip-telemetry",
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_REJECT_TELEMETRY="1",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(skip_telemetry_marker),
            ARINOVA_FAKE_SDK_CALLS_MARKER=str(skip_telemetry_sdk_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    if skip_telemetry.returncode != 0:
        raise RuntimeError(
            "expected --skip-telemetry live smoke to avoid sendTelemetry, "
            f"got {skip_telemetry.returncode}: stdout={skip_telemetry.stdout!r} "
            f"stderr={skip_telemetry.stderr!r}"
        )
    if "live Arinova smoke OK: connected agent_id=agent-from-fake-hermes-root" not in skip_telemetry.stdout:
        raise RuntimeError(f"skip-telemetry fake live smoke message missing: {skip_telemetry.stdout!r}")
    assert_disconnected(skip_telemetry_marker, "--skip-telemetry live smoke")
    skip_telemetry_calls = read_sdk_calls(skip_telemetry_sdk_marker)
    if any(call.get("method") == "sendTelemetry" for call in skip_telemetry_calls):
        raise RuntimeError(f"--skip-telemetry live smoke still called sendTelemetry: {skip_telemetry_calls!r}")

    bad_skip_telemetry_event_marker = hermes_home / "bad-skip-telemetry-event-disconnect.txt"
    bad_skip_telemetry_event = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        "--skip-telemetry",
        "--send-telemetry-event",
        "custom.skip.telemetry",
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_skip_telemetry_event_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(
        bad_skip_telemetry_event,
        "SDK sendTelemetry() probe cannot use custom event when telemetry is skipped",
    )
    assert_disconnected(bad_skip_telemetry_event_marker, "bad skip telemetry event live smoke")

    bad_skip_telemetry_data_marker = hermes_home / "bad-skip-telemetry-data-disconnect.txt"
    bad_skip_telemetry_data = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        "--skip-telemetry",
        "--send-telemetry-json",
        '{"phase":"skip"}',
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_skip_telemetry_data_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(
        bad_skip_telemetry_data,
        "SDK sendTelemetry() probe cannot use custom data when telemetry is skipped",
    )
    assert_disconnected(bad_skip_telemetry_data_marker, "bad skip telemetry data live smoke")

    bad_health_ok_marker = hermes_home / "bad-health-ok-disconnect.txt"
    bad_health_ok = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_BAD_HEALTH_OK="1",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_health_ok_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(bad_health_ok, "sidecar health did not report healthy control state")
    assert_disconnected(bad_health_ok_marker, "bad health ok live smoke")

    bad_health_marker = hermes_home / "bad-health-disconnect.txt"
    bad_health = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_BAD_HEALTH="1",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_health_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(bad_health, "sidecar health did not report authenticated SDK state")
    assert_disconnected(bad_health_marker, "bad health live smoke")

    telemetry_failure_marker = hermes_home / "telemetry-failure-disconnect.txt"
    telemetry_failure = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_REJECT_TELEMETRY="1",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(telemetry_failure_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(telemetry_failure, "fake telemetry rejected")
    assert_disconnected(telemetry_failure_marker, "telemetry failure live smoke")

    bad_telemetry_event_marker = hermes_home / "bad-telemetry-event-disconnect.txt"
    bad_telemetry_event = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        "--send-telemetry-event",
        "   ",
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_telemetry_event_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(bad_telemetry_event, "SDK sendTelemetry() probe event must be a non-empty string")
    assert_disconnected(bad_telemetry_event_marker, "bad sendTelemetry event live smoke")

    bad_telemetry_json_marker = hermes_home / "bad-telemetry-json-disconnect.txt"
    bad_telemetry_json = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        "--send-telemetry-json",
        "{bad json",
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_telemetry_json_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(bad_telemetry_json, "SDK sendTelemetry() probe data JSON argument could not be parsed")
    assert_disconnected(bad_telemetry_json_marker, "bad sendTelemetry JSON live smoke")

    bad_telemetry_payload_marker = hermes_home / "bad-telemetry-payload-disconnect.txt"
    bad_telemetry_payload = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        "--send-telemetry-json",
        "[]",
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_telemetry_payload_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(bad_telemetry_payload, "SDK sendTelemetry() probe data must be a JSON object")
    assert_disconnected(bad_telemetry_payload_marker, "bad sendTelemetry payload live smoke")

    send_message_failure_marker = hermes_home / "send-message-failure-disconnect.txt"
    send_message_failure = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        "--send-message-conversation",
        "conv-send-failure",
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_REJECT_SEND_MESSAGE="1",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(send_message_failure_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(send_message_failure, "fake sendMessage rejected")
    assert_disconnected(send_message_failure_marker, "sendMessage failure live smoke")

    bad_send_message_content_without_conversation_marker = (
        hermes_home / "bad-send-message-content-without-conversation-disconnect.txt"
    )
    bad_send_message_content_without_conversation = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        "--send-message-content",
        "ignored live smoke message",
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_send_message_content_without_conversation_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(
        bad_send_message_content_without_conversation,
        "SDK sendMessage() probe requires conversation id when message content is provided",
    )
    assert_disconnected(
        bad_send_message_content_without_conversation_marker,
        "bad sendMessage content without conversation live smoke",
    )

    non_null_void_marker = hermes_home / "non-null-void-disconnect.txt"
    non_null_void = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        "--send-hud-json",
        '{"status":"bad-void"}',
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_NON_NULL_VOID_METHOD="sendHud",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(non_null_void_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(non_null_void, "SDK sendHud() returned non-null void result")
    assert_disconnected(non_null_void_marker, "non-null void result live smoke")

    for method, cli_args, expected_error, disconnect_label in [
        (
            "sendTelemetry",
            ["--send-telemetry-event", "bad.void.telemetry"],
            "SDK sendTelemetry() returned non-null void result",
            "non-null void sendTelemetry live smoke",
        ),
        (
            "sendTaskUpdate",
            ["--send-task-update-json", '{"status":"started","task":"bad void"}'],
            "SDK sendTaskUpdate() returned non-null void result",
            "non-null void sendTaskUpdate live smoke",
        ),
        (
            "reportToolCall",
            [
                "--report-tool-call-json",
                (
                    '{"sessionId":"session-void","turnId":"turn-void","seqOrder":0,'
                    '"toolName":"arinova_sdk_call","input":{"method":"queryMemory"},'
                    '"durationMs":1,"success":true}'
                ),
            ],
            "SDK reportToolCall() returned non-null void result",
            "non-null void reportToolCall live smoke",
        ),
    ]:
        marker = hermes_home / f"non-null-void-{method}-disconnect.txt"
        process = run_live(
            "--hermes-root",
            str(fake_hermes_root),
            *cli_args,
            env=clean_env(
                hermes_home,
                ARINOVA_SERVER_URL="wss://env.example",
                ARINOVA_BOT_TOKEN="ari_env",
                ARINOVA_FAKE_NON_NULL_VOID_METHOD=method,
                ARINOVA_FAKE_DISCONNECT_MARKER=str(marker),
                PYTHONPATH="/definitely/not/hermes",
            ),
        )
        assert_failed(process, expected_error)
        assert_disconnected(marker, disconnect_label)

    connect_false = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_CONNECT_FALSE="1",
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(connect_false, "fake connect returned false")

    connected_state_marker = hermes_home / "connected-state-disconnect.txt"
    connected_state_false = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_CONNECT_WITHOUT_CONNECTED_STATE="1",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(connected_state_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(connected_state_false, "adapter.connect() returned false")
    assert_disconnected(connected_state_marker, "connected false state live smoke")

    claimed_mismatch_marker = hermes_home / "claimed-mismatch-disconnect.txt"
    claimed_mismatch = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_CLAIMED_AGENT_MISMATCH="1",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(claimed_mismatch_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(claimed_mismatch, "SDK getAgentId() disagreed with token-claimed agent id")
    assert_disconnected(claimed_mismatch_marker, "claimed agent mismatch live smoke")

    health_agent_mismatch_marker = hermes_home / "health-agent-mismatch-disconnect.txt"
    health_agent_mismatch = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_HEALTH_AGENT_MISMATCH="1",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(health_agent_mismatch_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(health_agent_mismatch, "sidecar health agent id disagreed with SDK getAgentId()")
    assert_disconnected(health_agent_mismatch_marker, "health agent mismatch live smoke")

    empty_agent_marker = hermes_home / "empty-agent-disconnect.txt"
    empty_agent_id = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_EMPTY_AGENT_ID="1",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(empty_agent_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(empty_agent_id, "SDK getAgentId() did not return an authenticated agent id")
    assert_disconnected(empty_agent_marker, "empty agent id live smoke")

    unexpected_seed_marker = hermes_home / "unexpected-seed-disconnect.txt"
    unexpected_onboarding_seed = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_UNEXPECTED_ONBOARDING_SEED="1",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(unexpected_seed_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(unexpected_onboarding_seed, "SDK getOnboardingSeed() returned unexpected value")
    assert_disconnected(unexpected_seed_marker, "unexpected onboarding seed live smoke")

    bad_seed_marker = hermes_home / "bad-seed-disconnect.txt"
    bad_onboarding_seed = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_BAD_ONBOARDING_SEED="1",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_seed_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(bad_onboarding_seed, "SDK getOnboardingSeed() returned malformed seed")
    assert_disconnected(bad_seed_marker, "bad onboarding seed live smoke")

    bad_hud_json_marker = hermes_home / "bad-hud-json-disconnect.txt"
    bad_hud_json = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        "--send-hud-json",
        "{bad json",
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_hud_json_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(bad_hud_json, "SDK sendHud() probe JSON argument could not be parsed")
    assert_disconnected(bad_hud_json_marker, "bad sendHud JSON live smoke")

    bad_hud_payload_marker = hermes_home / "bad-hud-payload-disconnect.txt"
    bad_hud_payload = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        "--send-hud-json",
        "[]",
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_hud_payload_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(bad_hud_payload, "SDK sendHud() probe payload must be a JSON object")
    assert_disconnected(bad_hud_payload_marker, "bad sendHud payload live smoke")

    bad_hud_conversation_without_payload_marker = hermes_home / "bad-hud-conversation-without-payload-disconnect.txt"
    bad_hud_conversation_without_payload = run_live(
        "--hermes-root",
        str(fake_hermes_root),
        "--send-hud-conversation",
        "conv-hud",
        env=clean_env(
            hermes_home,
            ARINOVA_SERVER_URL="wss://env.example",
            ARINOVA_BOT_TOKEN="ari_env",
            ARINOVA_FAKE_DISCONNECT_MARKER=str(bad_hud_conversation_without_payload_marker),
            PYTHONPATH="/definitely/not/hermes",
        ),
    )
    assert_failed(
        bad_hud_conversation_without_payload,
        "SDK sendHud() probe requires HUD JSON when conversation id is provided",
    )
    assert_disconnected(
        bad_hud_conversation_without_payload_marker,
        "bad sendHud conversation without payload live smoke",
    )
