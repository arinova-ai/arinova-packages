#!/usr/bin/env python3
"""Verify shared Hermes runtime defaults and their documented values."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import _runtime_contract as python_contract  # noqa: E402


DEFAULT_FIELDS = {
    "sidecarPort": "DEFAULT_SIDECAR_PORT",
    "adapterPort": "DEFAULT_ADAPTER_PORT",
    "bind": "DEFAULT_BIND",
    "attachmentMaxBytes": "DEFAULT_ATTACHMENT_MAX_BYTES",
    "attachmentMaxCount": "DEFAULT_ATTACHMENT_MAX_COUNT",
    "attachmentTotalMaxBytes": "DEFAULT_ATTACHMENT_TOTAL_MAX_BYTES",
    "attachmentTotalTimeoutMs": "DEFAULT_ATTACHMENT_TOTAL_TIMEOUT_MS",
    "attachmentErrorBodyMaxBytes": "DEFAULT_ATTACHMENT_ERROR_BODY_MAX_BYTES",
    "connectTimeoutMs": "DEFAULT_CONNECT_TIMEOUT_MS",
    "adapterPostTimeoutMs": "DEFAULT_ADAPTER_POST_TIMEOUT_MS",
    "sidecarPostTimeoutMs": "DEFAULT_SIDECAR_POST_TIMEOUT_MS",
    "controlMaxBodyBytes": "DEFAULT_CONTROL_MAX_BODY_BYTES",
    "maxPendingTaskOutputs": "DEFAULT_MAX_PENDING_TASK_OUTPUTS",
}

ENV_FIELDS = {
    "ARINOVA_SIDECAR_PORT": "sidecarPort",
    "ARINOVA_ADAPTER_PORT": "adapterPort",
    "ARINOVA_CONNECT_TIMEOUT_MS": "connectTimeoutMs",
    "ARINOVA_ADAPTER_POST_TIMEOUT_MS": "adapterPostTimeoutMs",
    "ARINOVA_CONTROL_MAX_BODY_BYTES": "controlMaxBodyBytes",
    "ARINOVA_SIDECAR_POST_TIMEOUT_MS": "sidecarPostTimeoutMs",
    "ARINOVA_ATTACHMENT_MAX_BYTES": "attachmentMaxBytes",
    "ARINOVA_ATTACHMENT_MAX_COUNT": "attachmentMaxCount",
    "ARINOVA_ATTACHMENT_TOTAL_MAX_BYTES": "attachmentTotalMaxBytes",
    "ARINOVA_ATTACHMENT_TOTAL_TIMEOUT_MS": "attachmentTotalTimeoutMs",
}

YAML_FIELDS = {
    "sidecar_port": "sidecarPort",
    "adapter_port": "adapterPort",
    "connect_timeout_ms": "connectTimeoutMs",
    "adapter_post_timeout_ms": "adapterPostTimeoutMs",
    "control_max_body_bytes": "controlMaxBodyBytes",
    "sidecar_post_timeout_ms": "sidecarPostTimeoutMs",
    "attachment_max_bytes": "attachmentMaxBytes",
    "attachment_max_count": "attachmentMaxCount",
    "attachment_total_max_bytes": "attachmentTotalMaxBytes",
    "attachment_total_timeout_ms": "attachmentTotalTimeoutMs",
}


def fail(message: str) -> None:
    raise AssertionError(message)


def main() -> int:
    contract = json.loads((ROOT / "runtime-contract.json").read_text(encoding="utf-8"))
    if set(contract) != {"concurrencyModes", "defaults"}:
        fail(f"runtime contract keys drifted: {sorted(contract)}")
    defaults = contract["defaults"]
    if set(defaults) != set(DEFAULT_FIELDS):
        fail(
            "runtime default fields drifted: "
            f"missing={sorted(set(DEFAULT_FIELDS) - set(defaults))} "
            f"extra={sorted(set(defaults) - set(DEFAULT_FIELDS))}"
        )
    for name, value in defaults.items():
        if name == "bind":
            if not isinstance(value, str) or not value:
                fail("runtime defaults.bind must be a non-empty string")
        elif isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            fail(f"runtime defaults.{name} must be a positive integer")
    if defaults["controlMaxBodyBytes"] > 8 * 1024 * 1024:
        fail("default bridge HTTP body cap must not exceed 8 MiB")
    if contract["concurrencyModes"] != ["per-conversation", "agent-wide", "unbounded"]:
        fail(f"runtime concurrency modes drifted: {contract['concurrencyModes']!r}")

    python_values = {
        name: getattr(python_contract, constant)
        for name, constant in DEFAULT_FIELDS.items()
    }
    if python_values != defaults:
        fail(f"Python runtime defaults diverge from contract: {python_values!r}")
    if set(python_contract.CONCURRENCY_MODES) != set(contract["concurrencyModes"]):
        fail("Python runtime concurrency modes diverge from contract")

    node_probe = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            'import { runtimeDefaults } from "./sidecar/runtime.mjs"; console.log(JSON.stringify(runtimeDefaults));',
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if json.loads(node_probe.stdout) != defaults:
        fail("Node runtime defaults diverge from contract")

    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    for field, contract_name in ENV_FIELDS.items():
        expected = str(defaults[contract_name])
        if not re.search(rf"^{re.escape(field)}={re.escape(expected)}$", readme, re.MULTILINE):
            fail(f"README environment default drifted: {field}={expected}")
    for field, contract_name in YAML_FIELDS.items():
        expected = str(defaults[contract_name])
        if not re.search(rf"^  {re.escape(field)}: {re.escape(expected)}$", readme, re.MULTILINE):
            fail(f"README YAML default drifted: {field}: {expected}")

    manifest = (ROOT / "plugin.yaml").read_text(encoding="utf-8")
    for field, contract_name in ENV_FIELDS.items():
        expected = str(defaults[contract_name])
        block = manifest.split(f"  - name: {field}\n", 1)
        if len(block) != 2 or f"default {expected}" not in block[1].split("  - name:", 1)[0]:
            fail(f"plugin.yaml default drifted: {field}={expected}")

    adapter_source = (ROOT / "adapter.py").read_text(encoding="utf-8")
    runtime_source = (ROOT / "sidecar/runtime.mjs").read_text(encoding="utf-8")
    index_source = (ROOT / "sidecar/index.mjs").read_text(encoding="utf-8")
    if "from ._runtime_contract import" not in adapter_source:
        fail("adapter.py no longer consumes the shared runtime contract")
    if '../runtime-contract.json' not in runtime_source:
        fail("sidecar runtime no longer consumes the shared runtime contract")
    for expression in (
        "runtimeDefaults.bind",
        "runtimeDefaults.sidecarPort",
        "runtimeDefaults.adapterPort",
    ):
        if expression not in index_source:
            fail(f"sidecar index bypasses shared runtime default: {expression}")

    print(
        f"runtime contract OK: {len(defaults)} defaults, "
        f"{len(contract['concurrencyModes'])} concurrency modes, docs synchronized"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
