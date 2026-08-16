#!/usr/bin/env python3
"""Run the local verification gate for this plugin."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

from install_check_helpers import REQUIRED_PLUGIN_FILES


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SDK_ROOT = ROOT.parent / "agent-sdk"
COMMAND_TIMEOUT_SECONDS = 300
LIVE_SKIP_PREFIX = "live Arinova smoke skipped"
HERMES_SKIP_PREFIX = "Hermes integration checks skipped"
PY_COMPILE_FILES = tuple(path for path in REQUIRED_PLUGIN_FILES if path.endswith(".py"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hermes-root", default=str(Path.home() / "hermes-agent"))
    parser.add_argument(
        "--require-credentials",
        action="store_true",
        help="Require real Arinova credentials for the live smoke step.",
    )
    parser.add_argument(
        "--hermes-python",
        help="Python 3.10+ interpreter to use for checks that import ~/hermes-agent.",
    )
    parser.add_argument("--sdk-root", default=str(DEFAULT_SDK_ROOT), help="Path to the agent-sdk checkout.")
    return parser.parse_args()


LIVE_CREDENTIAL_ENV_KEYS = (
    "ARINOVA_SERVER_URL",
    "ARINOVA_BOT_TOKEN",
)


def run(command: list[str], *, cwd: Path = ROOT, env: dict[str, str] | None = None) -> int:
    print("+ " + " ".join(command), flush=True)
    return subprocess.run(command, cwd=cwd, env=env, timeout=COMMAND_TIMEOUT_SECONDS).returncode


def run_captured(command: list[str], *, cwd: Path = ROOT, env: dict[str, str] | None = None) -> tuple[int, str]:
    print("+ " + " ".join(command), flush=True)
    process = subprocess.run(
        command,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=COMMAND_TIMEOUT_SECONDS,
    )
    if process.stdout:
        print(process.stdout, end="" if process.stdout.endswith("\n") else "\n")
    return process.returncode, process.stdout or ""


def env_without_live_credentials() -> dict[str, str]:
    env = os.environ.copy()
    for key in LIVE_CREDENTIAL_ENV_KEYS:
        env.pop(key, None)
    return env


def assert_hermes_source_clean(hermes_root: Path, phase: str) -> None:
    if not (hermes_root / ".git").exists():
        return
    status = subprocess.run(
        ["git", "-C", str(hermes_root), "status", "--short"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=COMMAND_TIMEOUT_SECONDS,
    )
    if status.returncode != 0:
        raise RuntimeError(f"could not inspect Hermes source git status {phase}: {status.stderr.strip()}")
    if status.stdout.strip():
        raise RuntimeError(
            "Hermes source checkout is dirty "
            f"{phase}; plugin integration checks must not modify {hermes_root}:\n{status.stdout.rstrip()}"
        )


def git_root(path: Path) -> Path | None:
    result = subprocess.run(
        ["git", "-C", str(path), "rev-parse", "--show-toplevel"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        timeout=COMMAND_TIMEOUT_SECONDS,
    )
    if result.returncode != 0:
        return None
    return Path(result.stdout.strip())


def assert_sdk_source_clean(sdk_root: Path, phase: str) -> None:
    root = git_root(sdk_root)
    if root is None:
        return
    status = subprocess.run(
        ["git", "-C", str(root), "status", "--short", "--", str(sdk_root)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=COMMAND_TIMEOUT_SECONDS,
    )
    if status.returncode != 0:
        raise RuntimeError(f"could not inspect local agent-sdk git status {phase}: {status.stderr.strip()}")
    if status.stdout.strip():
        raise RuntimeError(
            "local agent-sdk checkout is dirty "
            f"{phase}; plugin integration checks must not modify {sdk_root}:\n{status.stdout.rstrip()}"
        )


def _python_probe(command: str) -> tuple[int, int] | None:
    probe = subprocess.run(
        [
            command,
            "-c",
            "import sys; import yaml; print(f'{sys.version_info.major}.{sys.version_info.minor}')",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        timeout=COMMAND_TIMEOUT_SECONDS,
    )
    if probe.returncode != 0:
        return None
    try:
        major, minor = probe.stdout.strip().split(".", 1)
        return int(major), int(minor)
    except ValueError:
        return None


def resolve_hermes_python(explicit: str | None) -> str:
    candidates: list[str] = []
    if explicit:
        candidates.append(explicit)
    candidates.append(sys.executable)
    candidates.extend(
        str(path)
        for path in (
            ROOT / ".venv/bin/python",
            Path("/tmp/hermes-arinova-plugin-py313-venv/bin/python"),
        )
        if path.exists()
    )
    candidates.extend(
        resolved
        for name in ("python3.13", "python3.12", "python3.11", "python3.10")
        if (resolved := shutil.which(name))
    )
    seen: set[str] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        version = _python_probe(candidate)
        if version is not None and version >= (3, 10):
            return candidate
    raise RuntimeError(
        "Hermes checks require Python 3.10+ with Hermes Python dependencies; "
        "pass --hermes-python or install a compatible interpreter"
    )


def main() -> int:
    args = parse_args()
    hermes_root_path = Path(args.hermes_root).expanduser().resolve()
    hermes_root = str(hermes_root_path)
    sdk_root_path = Path(args.sdk_root).expanduser().resolve()
    sdk_root = str(sdk_root_path)
    try:
        hermes_python = resolve_hermes_python(args.hermes_python)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    if args.require_credentials:
        code = run([
            sys.executable,
            "scripts/check_live_connection.py",
            "--hermes-root",
            hermes_root,
            "--resolve-credentials-only",
            "--require-credentials",
        ])
        if code:
            return code
    try:
        assert_sdk_source_clean(sdk_root_path, "before local gate")
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    commands = [
        [sys.executable, "scripts/check_runtime_contract.py"],
        [sys.executable, "scripts/check_agent_sdk_source.py", "--sdk-root", sdk_root],
        [sys.executable, "scripts/check_sdk_surface.py", "--sdk-root", sdk_root],
        [sys.executable, "scripts/check_arinova_tools.py"],
        [sys.executable, "scripts/check_live_connection_gate.py"],
    ]
    for command in commands:
        code = run(command)
        if code:
            return code
    # The Hermes integration stages import the host's `gateway` package, which
    # only exists in a Hermes checkout. Without one (CI, a fresh clone) they
    # cannot run at all — skip them explicitly and say so in the summary
    # rather than failing on ModuleNotFoundError or, worse, passing silently.
    hermes_available = (hermes_root_path / "gateway").is_dir()
    if not hermes_available:
        print(f"{HERMES_SKIP_PREFIX}: no Hermes checkout at {hermes_root}")
    try:
        assert_hermes_source_clean(hermes_root_path, "before Hermes integration checks")
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    live_command = [
        hermes_python,
        "scripts/check_live_connection.py",
        "--hermes-root",
        hermes_root,
        "--sdk-root",
        sdk_root,
    ]
    if args.require_credentials:
        live_command.append("--require-credentials")
    live_code, live_output = run_captured(live_command)
    if live_code:
        return live_code
    live_skipped = LIVE_SKIP_PREFIX in live_output
    fixture_env = env_without_live_credentials()
    hermes_commands = (
        [hermes_python, "scripts/check_hermes_plugin_load.py", "--hermes-root", hermes_root],
        [hermes_python, "scripts/check_gateway_config_load.py", "--hermes-root", hermes_root],
        [hermes_python, "scripts/check_user_install.py", "--hermes-root", hermes_root, "--sdk-root", sdk_root],
        [hermes_python, "scripts/check_clean_install.py", "--hermes-root", hermes_root, "--sdk-root", sdk_root],
    ) if hermes_available else ()
    for command in (
        *hermes_commands,
        [sys.executable, "-m", "py_compile", *PY_COMPILE_FILES],
        ["npm", "--prefix", "sidecar", "run", "check"],
    ):
        code = run(command, env=fixture_env)
        if code:
            return code
    try:
        assert_hermes_source_clean(hermes_root_path, "after Hermes integration checks")
        assert_sdk_source_clean(sdk_root_path, "after local gate")
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    source_clean_summary = (
        "Hermes source clean; local agent-sdk source clean"
        if hermes_available
        else f"Hermes integration checks skipped (no checkout at {hermes_root}); local agent-sdk source clean"
    )
    if live_skipped:
        print(
            "hermes-arinova local gate OK "
            f"({source_clean_summary}; live Arinova smoke skipped; rerun with --require-credentials for release)"
        )
    else:
        print(f"hermes-arinova local gate OK ({source_clean_summary}; live Arinova smoke connected)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
