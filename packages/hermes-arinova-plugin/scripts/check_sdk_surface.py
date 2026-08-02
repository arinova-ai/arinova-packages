#!/usr/bin/env python3
"""Structural and parameter-level parity gate for the Hermes plugin and agent SDK.

`sdk-contract.json` is the single source of truth for both runtimes, so this
gate must fail whenever the contract drifts from the installed SDK surface or
whenever either runtime stops enforcing the contract:

1. method-name parity: sidecar == python tools == contract (both scopes);
2. contract vs installed SDK (`dist/*.d.ts`): every contract method exists on
   the SDK with the same parameter names in the same order (via the documented
   camelCase->snake_case rename convention), the contract's required-arg count
   is never below the SDK's required count nor above the SDK's total count;
3. dispatch parity: the sidecar control server and the python wrappers accept
   exactly the contract arity and pass arguments through positionally;
4. the pre-existing manifest/env/bundled-version checks.
"""

from __future__ import annotations

import argparse
import base64
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_sdk_surface_helpers import (  # noqa: E402
    class_method_params,
    class_method_required_param_counts,
    task_context_callable_params,
    task_context_helper_required_param_counts,
    tool_param_name,
)

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "sdk-contract.json"
INSTALLED_SDK = ROOT / "sidecar/node_modules/@arinova-ai/agent-sdk"
PRODUCTION_FILES = (
    ROOT / "adapter.py",
    ROOT / "__init__.py",
    ROOT / "arinova_tools.py",
    ROOT / "sidecar/index.mjs",
    ROOT / "sidecar/runtime.mjs",
)
# Bridge-side helpers that the src scrape does not have to report.
SRC_SCRAPE_EXEMPT = {"getAgentId", "getOnboardingSeed"}
SAMPLE_FILE_BASE64 = "aGVsbG8="  # "hello"

SIDECAR_PROBE = """
import { readFileSync } from "node:fs";
import { createControlServer, listen, agentMethods, taskMethods } from "./sidecar/runtime.mjs";

const plan = JSON.parse(readFileSync(0, "utf8"));
const TOKEN = "probe-token";
const recorded = [];

function serialize(value) {
  if (value instanceof Uint8Array) return { __u8: Array.from(value) };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value === undefined ? null : value;
}

const agent = { on() { return agent; }, onTask() {} };
for (const method of Object.keys(plan.agent)) {
  agent[method] = (...args) => {
    recorded.push(args.map(serialize));
    return null;
  };
}
const stubTask = {};
for (const method of Object.keys(plan.task)) {
  stubTask[method] = (...args) => {
    recorded.push(args.map(serialize));
    return null;
  };
}

const { controlServer, tasks } = createControlServer({
  agent,
  adapterUrl: "http://127.0.0.1:9/unreachable",
  sharedToken: TOKEN,
  onShutdown() {},
});
tasks.set("task-probe", stubTask);
await listen(controlServer, 0, "127.0.0.1");
const port = controlServer.address().port;

async function post(path, body) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-arinova-bridge-token": TOKEN },
    body: JSON.stringify(body),
  });
  return await res.json();
}

const results = [];
for (const [scope, path, extra] of [
  ["agent", "/agent-sdk", {}],
  ["task", "/task-sdk", { taskId: "task-probe" }],
]) {
  for (const [method, spec] of Object.entries(plan[scope])) {
    const cases = [];
    if (spec.required > 0) {
      cases.push(["under", spec.samples.slice(0, spec.required - 1)]);
    }
    cases.push(["exact", spec.samples]);
    cases.push(["over", [...spec.samples, "probe-extra-arg"]]);
    for (const [label, args] of cases) {
      recorded.length = 0;
      const response = await post(path, { ...extra, method, args });
      results.push({
        scope,
        method,
        case: label,
        ok: response.ok === true,
        error: typeof response.error === "string" ? response.error : "",
        recorded: recorded.length === 1 ? recorded[0] : null,
        calls: recorded.length,
      });
    }
  }
}
controlServer.close();
console.log(JSON.stringify({
  agentMethods: [...agentMethods],
  taskMethods: [...taskMethods],
  results,
}));
"""


def _fail(message: str) -> None:
    raise AssertionError(message)


def _load_contract() -> dict[str, dict[str, Any]]:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    if set(contract) != {"agent", "task"}:
        _fail(f"sdk-contract.json must define exactly agent+task scopes, got {sorted(contract)}")
    for scope, definitions in contract.items():
        for method, definition in definitions.items():
            label = f"sdk-contract.json {scope}.{method}"
            args = definition.get("args")
            required = definition.get("required")
            if not isinstance(args, list) or not isinstance(required, int):
                _fail(f"{label}: args must be a list and required an integer")
            names = [argument.get("name") for argument in args]
            if any(not isinstance(name, str) or not re.fullmatch(r"[a-z][a-z0-9_]*", name) for name in names):
                _fail(f"{label}: argument names must be snake_case strings, got {names}")
            if len(set(names)) != len(names):
                _fail(f"{label}: duplicate argument names {names}")
            if any(not isinstance(argument.get("schema"), dict) for argument in args):
                _fail(f"{label}: every argument needs an object schema")
            if not 0 <= required <= len(args):
                _fail(f"{label}: required={required} out of range for {len(args)} argument(s)")
    return contract


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


def _sdk_methods(sdk_root: Path) -> set[str]:
    source = "\n".join(
        (sdk_root / relative).read_text()
        for relative in ("src/client.ts", "src/rest/client.ts")
    )
    return set(re.findall(r"^  (?:async )?([A-Za-z][A-Za-z0-9_]*)\(", source, re.MULTILINE))


def _installed_agent_signatures() -> tuple[dict[str, list[str]], dict[str, int]]:
    rest_decl = (INSTALLED_SDK / "dist/rest/client.d.ts").read_text()
    client_decl = (INSTALLED_SDK / "dist/client.d.ts").read_text()
    rest_marker = "export declare abstract class ArinovaRestClient"
    agent_marker = "export declare class ArinovaAgent"
    params = class_method_params(rest_decl, rest_marker)
    params.update(class_method_params(client_decl, agent_marker))
    required = class_method_required_param_counts(rest_decl, rest_marker)
    required.update(class_method_required_param_counts(client_decl, agent_marker))
    return params, required


def _installed_task_signatures() -> tuple[dict[str, list[str]], dict[str, int]]:
    types_decl = (INSTALLED_SDK / "dist/types.d.ts").read_text()
    return task_context_callable_params(types_decl), task_context_helper_required_param_counts(types_decl)


def _assert_contract_matches_sdk(
    scope: str,
    definitions: dict[str, Any],
    sdk_params: dict[str, list[str]],
    sdk_required: dict[str, int],
) -> int:
    checked = 0
    for method, definition in definitions.items():
        label = f"{scope}.{method}"
        if method not in sdk_params:
            _fail(
                f"contract drift: {label} is missing from the installed SDK "
                f"({sorted(sdk_params)} available)"
            )
        contract_names = [argument["name"] for argument in definition["args"]]
        sdk_names = [tool_param_name(name) for name in sdk_params[method]]
        if contract_names != sdk_names:
            _fail(
                f"contract drift: {label} parameters diverge from the installed SDK: "
                f"contract={contract_names} sdk={sdk_params[method]} (as tool params: {sdk_names})"
            )
        required = definition["required"]
        if method not in sdk_required:
            _fail(f"contract drift: {label} has no readable required-parameter count in the installed SDK")
        if required < sdk_required[method]:
            _fail(
                f"contract drift: {label} marks only {required} argument(s) required but the installed "
                f"SDK requires {sdk_required[method]}; contract-valid calls would TypeError at runtime"
            )
        if required > len(sdk_params[method]):
            _fail(
                f"contract drift: {label} requires {required} argument(s) but the installed SDK "
                f"accepts at most {len(sdk_params[method])}"
            )
        checked += 1
    return checked


def _sample_from_schema(schema: dict[str, Any], name: str, position: int) -> Any:
    if schema.get("x-arinova-file") is True:
        return {"base64": SAMPLE_FILE_BASE64}
    enum_values = schema.get("enum")
    if isinstance(enum_values, list) and enum_values:
        return enum_values[0]
    one_of = schema.get("oneOf")
    if isinstance(one_of, list) and one_of:
        return _sample_from_schema(one_of[0], name, position)
    schema_type = schema.get("type", "object")
    if schema_type == "string":
        return f"sample-{name}-{position}"
    if schema_type == "number":
        return position + 1
    if schema_type == "boolean":
        return True
    if schema_type == "array":
        items = schema.get("items") if isinstance(schema.get("items"), dict) else {}
        return [_sample_from_schema(items, f"{name}-item", position)]
    properties = schema.get("properties") if isinstance(schema.get("properties"), dict) else {}
    return {
        field: _sample_from_schema(properties.get(field, {}), field, index)
        for index, field in enumerate(schema.get("required", []))
    }


def _samples_for(definition: dict[str, Any]) -> list[Any]:
    return [
        _sample_from_schema(argument["schema"], argument["name"], index)
        for index, argument in enumerate(definition["args"])
    ]


def _expected_dispatch(definition: dict[str, Any], samples: list[Any]) -> list[Any]:
    expected = list(samples)
    for index, argument in enumerate(definition["args"]):
        if argument["schema"].get("x-arinova-file") is True:
            expected[index] = {"__u8": list(base64.b64decode(SAMPLE_FILE_BASE64))}
    return expected


def _probe_sidecar_dispatch(contract: dict[str, dict[str, Any]]) -> int:
    plan = {
        scope: {
            method: {"required": definition["required"], "samples": _samples_for(definition)}
            for method, definition in definitions.items()
        }
        for scope, definitions in contract.items()
    }
    process = subprocess.run(
        ["node", "--input-type=module", "-e", SIDECAR_PROBE],
        cwd=ROOT,
        input=json.dumps(plan),
        check=True,
        capture_output=True,
        text=True,
        timeout=120,
    )
    payload = json.loads(process.stdout)
    for scope, exported in (("agent", payload["agentMethods"]), ("task", payload["taskMethods"])):
        if set(exported) != set(contract[scope]):
            _fail(
                f"sidecar {scope} methods diverge from sdk-contract.json: "
                f"missing={sorted(set(contract[scope]) - set(exported))} "
                f"extra={sorted(set(exported) - set(contract[scope]))}"
            )
    checked = 0
    for result in payload["results"]:
        scope, method, case = result["scope"], result["method"], result["case"]
        label = f"sidecar dispatch {scope}.{method} [{case}]"
        definition = contract[scope][method]
        if case == "under":
            if result["ok"] or "requires at least" not in result["error"]:
                _fail(
                    f"{label}: {definition['required'] - 1} argument(s) must be rejected with the "
                    f"contract minimum, got ok={result['ok']} error={result['error']!r}"
                )
            if result["calls"]:
                _fail(f"{label}: under-arity call still reached the SDK stub")
        elif case == "over":
            if result["ok"] or "accepts at most" not in result["error"]:
                _fail(
                    f"{label}: {len(definition['args']) + 1} argument(s) must be rejected with the "
                    f"contract maximum, got ok={result['ok']} error={result['error']!r}"
                )
            if result["calls"]:
                _fail(f"{label}: over-arity call still reached the SDK stub")
        else:
            if not result["ok"]:
                _fail(f"{label}: contract-valid arguments were rejected: {result['error']!r}")
            if result["calls"] != 1 or result["recorded"] is None:
                _fail(f"{label}: expected exactly one SDK call, saw {result['calls']}")
            expected = _expected_dispatch(definition, plan[scope][method]["samples"])
            if result["recorded"] != expected:
                _fail(
                    f"{label}: arguments reached the SDK out of contract order/shape: "
                    f"expected={expected} got={result['recorded']}"
                )
        checked += 1
    return checked


def _assert_python_tools_match_contract(tools, contract: dict[str, dict[str, Any]]) -> None:
    for scope, methods_name, specs_name, required_name in (
        ("agent", "AGENT_METHODS", "ARG_SPECS", "REQUIRED_ARG_COUNTS"),
        ("task", "TASK_METHODS", "TASK_ARG_SPECS", "TASK_REQUIRED_ARG_COUNTS"),
    ):
        definitions = contract[scope]
        methods = tuple(getattr(tools, methods_name))
        if methods != tuple(definitions):
            _fail(
                f"arinova_tools.{methods_name} diverges from sdk-contract.json: "
                f"python={methods} contract={tuple(definitions)}"
            )
        specs = getattr(tools, specs_name)
        for method, definition in definitions.items():
            spec_names = [name for name, _schema in specs.get(method, ())]
            contract_names = [argument["name"] for argument in definition["args"]]
            if spec_names != contract_names:
                _fail(
                    f"arinova_tools.{specs_name}[{method!r}] argument drift: "
                    f"python={spec_names} contract={contract_names}"
                )
        required = dict(getattr(tools, required_name))
        contract_required = {method: definition["required"] for method, definition in definitions.items()}
        if required != contract_required:
            _fail(
                f"arinova_tools.{required_name} diverges from sdk-contract.json: "
                f"python={required} contract={contract_required}"
            )


def _assert_python_dispatch(tools, contract: dict[str, dict[str, Any]]) -> int:
    checked = 0
    for scope, definitions in contract.items():
        task_scoped = scope == "task"
        for method, definition in definitions.items():
            label = f"python wrapper {scope}.{method}"
            samples = _samples_for(definition)
            required = definition["required"]
            if required > 0:
                try:
                    tools._validate_positional_args(method, samples[: required - 1], task_scoped=task_scoped)
                except ValueError as exc:
                    if "requires at least" not in str(exc):
                        _fail(f"{label}: unexpected under-arity error: {exc}")
                else:
                    _fail(f"{label}: accepted {required - 1} argument(s) below the contract minimum")
            validated = tools._validate_positional_args(method, list(samples), task_scoped=task_scoped)
            if validated != samples:
                _fail(
                    f"{label}: contract-valid arguments were reordered or rewritten: "
                    f"expected={samples} got={validated}"
                )
            try:
                tools._validate_positional_args(method, [*samples, "probe-extra-arg"], task_scoped=task_scoped)
            except ValueError as exc:
                if "accepts at most" not in str(exc):
                    _fail(f"{label}: unexpected over-arity error: {exc}")
            else:
                _fail(f"{label}: accepted {len(samples) + 1} argument(s) above the contract maximum")
            checked += 1
    return checked


def _assert_adapter_positional_passthrough() -> None:
    adapter_source = (ROOT / "adapter.py").read_text()
    for snippet in (
        "async def call_agent_sdk(self, method: str, *args: Any)",
        '{"method": method, "args": _json_safe(list(args))}',
        "async def call_task_sdk(self, task_id: str, method: str, *args: Any)",
        '{"taskId": task_id, "method": method, "args": _json_safe(list(args))}',
    ):
        if snippet not in adapter_source:
            _fail(
                "adapter.py no longer forwards SDK arguments positionally as the contract "
                f"requires; missing: {snippet}"
            )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sdk-root", default=str(ROOT.parent / "agent-sdk"))
    args = parser.parse_args()
    sdk_root = Path(args.sdk_root).expanduser().resolve()

    contract = _load_contract()
    tools = _load_tools()

    # Method-name parity across the contract, the sidecar, and the python tools.
    _assert_python_tools_match_contract(tools, contract)
    dispatch_cases = _probe_sidecar_dispatch(contract)
    wrapper_cases = _assert_python_dispatch(tools, contract)
    _assert_adapter_positional_passthrough()

    # Contract vs installed SDK parameter parity (names, order, arity bounds).
    installed_agent_params, installed_agent_required = _installed_agent_signatures()
    installed_task_params, installed_task_required = _installed_task_signatures()
    agent_parity = _assert_contract_matches_sdk(
        "agent", contract["agent"], installed_agent_params, installed_agent_required
    )
    task_parity = _assert_contract_matches_sdk(
        "task", contract["task"], installed_task_params, installed_task_required
    )

    # Contract methods must also exist in the local SDK sources.
    sdk_methods = _sdk_methods(sdk_root)
    missing_sdk = sorted(set(contract["agent"]) - sdk_methods - SRC_SCRAPE_EXEMPT)
    if missing_sdk:
        _fail(f"sidecar exposes missing SDK methods: {missing_sdk}")

    registry = _ToolRegistry()
    tools.register_tools(registry)
    manifest_source = (ROOT / "plugin.yaml").read_text()
    tools_block = manifest_source.split("provides_tools:", 1)[1].split("requires_env:", 1)[0]
    advertised = set(re.findall(r"^  - ([a-z][a-z0-9_]*)$", tools_block, re.MULTILINE))
    registered = set(registry.names)
    if advertised != registered:
        _fail(
            f"tool manifest drift: missing={sorted(registered - advertised)} extra={sorted(advertised - registered)}"
        )

    declared_env = set(re.findall(r"^  - name: (ARINOVA_[A-Z0-9_]+)$", manifest_source, re.MULTILINE))
    used_env = {
        match
        for path in PRODUCTION_FILES
        for match in re.findall(r"ARINOVA_[A-Z0-9_]+", path.read_text())
    }
    missing_env = sorted(used_env - declared_env - {"ARINOVA_ADAPTER_URL", "ARINOVA_BRIDGE_TOKEN"})
    if missing_env:
        _fail(f"production env vars missing from plugin.yaml: {missing_env}")

    local_version = json.loads((sdk_root / "package.json").read_text())["version"]
    bundled_version = json.loads((INSTALLED_SDK / "package.json").read_text())["version"]
    if local_version != bundled_version:
        _fail(f"bundled SDK drift: local={local_version} bundled={bundled_version}")

    print(
        f"SDK surface OK: {len(contract['agent'])} agent methods, {len(contract['task'])} task methods, "
        f"{agent_parity + task_parity} contract-vs-SDK signatures, {dispatch_cases} sidecar dispatch cases, "
        f"{wrapper_cases} python wrapper cases, {len(registered)} tools, {len(used_env)} production env vars"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
