"""Shared primitives for installed and isolated Hermes plugin verification."""

from __future__ import annotations

import sys


REQUIRED_PLUGIN_FILES = (
    "README.md",
    "__init__.py",
    "adapter.py",
    "arinova_tools.py",
    "sdk-contract.json",
    "runtime-contract.json",
    "_runtime_contract.py",
    "plugin.yaml",
    "package.json",
    "sidecar/index.mjs",
    "sidecar/runtime.mjs",
    "sidecar/package.json",
    "sidecar/package-lock.json",
    "sidecar/check-index-lifecycle.mjs",
    "sidecar/check-runtime.mjs",
    "sidecar/check-sdk-e2e.mjs",
    "sidecar/check-sdk-http.mjs",
    "scripts/install_check_helpers.py",
    "scripts/check_local.py",
    "scripts/check_sdk_surface.py",
    "scripts/check_runtime_contract.py",
    "scripts/check_agent_sdk_source.py",
    "scripts/check_arinova_tools.py",
    "scripts/check_live_connection.py",
    "scripts/check_live_connection_gate.py",
    "scripts/check_gateway_config_load.py",
    "scripts/check_hermes_plugin_load.py",
    "scripts/check_user_install.py",
    "scripts/check_clean_install.py",
)


def require_hermes_python() -> None:
    if sys.version_info >= (3, 10):
        return
    version = ".".join(str(part) for part in sys.version_info[:3])
    raise SystemExit(
        "Hermes checks require Python 3.10+ because ~/hermes-agent uses "
        f"modern type syntax; current interpreter is Python {version}. "
        "Run this check with the same Python used by Hermes, for example python3.13."
    )


def ignore_plugin_copy(_directory: str, names: list[str]) -> set[str]:
    ignored = {".git", "__pycache__", "node_modules"}
    ignored.update(name for name in names if name.endswith((".pyc", ".pyo")))
    return ignored & set(names)
