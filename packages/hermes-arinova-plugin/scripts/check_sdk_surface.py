#!/usr/bin/env python3
"""Fast structural parity gate for the real Hermes plugin and agent SDK."""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PRODUCTION_FILES = (
    ROOT / "adapter.py",
    ROOT / "__init__.py",
    ROOT / "arinova_tools.py",
    ROOT / "sidecar/index.mjs",
    ROOT / "sidecar/runtime.mjs",
)


def _load_tools():
    spec = importlib.util.spec_from_file_location("hermes_arinova_tools", ROOT / "arinova_tools.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load arinova_tools.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _ToolRegistry:
    def __init__(self) -> None:
        self.names: list[str] = []

    def register_tool(self, *, name: str, **_: Any) -> None:
        self.names.append(name)


def _sidecar_methods() -> tuple[set[str], set[str]]:
    script = """
import {agentMethods, taskMethods} from './sidecar/runtime.mjs';
console.log(JSON.stringify({agent:[...agentMethods], task:[...taskMethods]}));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    payload = json.loads(result.stdout)
    return set(payload["agent"]), set(payload["task"])


def _sdk_methods(sdk_root: Path) -> set[str]:
    source = "\n".join(
        (sdk_root / relative).read_text()
        for relative in ("src/client.ts", "src/rest/client.ts")
    )
    return set(re.findall(r"^  (?:async )?([A-Za-z][A-Za-z0-9_]*)\(", source, re.MULTILINE))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sdk-root", default=str(ROOT.parent / "agent-sdk"))
    args = parser.parse_args()
    sdk_root = Path(args.sdk_root).expanduser().resolve()

    tools = _load_tools()
    sidecar_agent, sidecar_task = _sidecar_methods()
    if sidecar_agent != set(tools.AGENT_METHODS):
        raise AssertionError(f"agent method drift: sidecar={sorted(sidecar_agent)} python={sorted(tools.AGENT_METHODS)}")
    if sidecar_task != set(tools.TASK_METHODS):
        raise AssertionError(f"task method drift: sidecar={sorted(sidecar_task)} python={sorted(tools.TASK_METHODS)}")

    sdk_methods = _sdk_methods(sdk_root)
    missing_sdk = sorted(sidecar_agent - sdk_methods - {"getAgentId", "getOnboardingSeed"})
    if missing_sdk:
        raise AssertionError(f"sidecar exposes missing SDK methods: {missing_sdk}")

    registry = _ToolRegistry()
    tools.register_tools(registry)
    manifest_source = (ROOT / "plugin.yaml").read_text()
    tools_block = manifest_source.split("provides_tools:", 1)[1].split("requires_env:", 1)[0]
    advertised = set(re.findall(r"^  - ([a-z][a-z0-9_]*)$", tools_block, re.MULTILINE))
    registered = set(registry.names)
    if advertised != registered:
        raise AssertionError(
            f"tool manifest drift: missing={sorted(registered-advertised)} extra={sorted(advertised-registered)}"
        )

    declared_env = set(re.findall(r"^  - name: (ARINOVA_[A-Z0-9_]+)$", manifest_source, re.MULTILINE))
    used_env = {
        match
        for path in PRODUCTION_FILES
        for match in re.findall(r"ARINOVA_[A-Z0-9_]+", path.read_text())
    }
    missing_env = sorted(used_env - declared_env - {"ARINOVA_ADAPTER_URL", "ARINOVA_BRIDGE_TOKEN"})
    if missing_env:
        raise AssertionError(f"production env vars missing from plugin.yaml: {missing_env}")

    local_version = json.loads((sdk_root / "package.json").read_text())["version"]
    bundled_version = json.loads(
        (ROOT / "sidecar/node_modules/@arinova-ai/agent-sdk/package.json").read_text()
    )["version"]
    if local_version != bundled_version:
        raise AssertionError(f"bundled SDK drift: local={local_version} bundled={bundled_version}")

    print(
        f"SDK surface OK: {len(sidecar_agent)} agent methods, {len(sidecar_task)} task methods, "
        f"{len(registered)} tools, {len(used_env)} production env vars"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
