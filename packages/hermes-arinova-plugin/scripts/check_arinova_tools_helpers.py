from __future__ import annotations

import copy
import json


VOID_AGENT_METHODS = {
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
}


class FakeAdapter:
    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.is_connected = True
        self.fail_agent = False
        self.fail_task = False
        self.nonfinite_agent_result = False
        self.nonfinite_task_result = False
        self.return_void_agent_results = False

    async def call_agent_sdk(self, method: str, *args):
        if self.fail_agent:
            raise RuntimeError("agent sdk boom")
        if self.nonfinite_agent_result:
            return {"value": float("nan")}
        if method == "getAgentId":
            return "agent-1"
        if method == "getOnboardingSeed":
            return {
                "kind": "first_touch_opening",
                "seedId": "seed-1",
                "agentId": "agent-1",
                "action": "open",
                "prompt": "hello",
            }
        self.calls.append(("agent", method, args))
        if self.return_void_agent_results and method in VOID_AGENT_METHODS:
            return None
        serializable = [arg.decode("utf-8") if isinstance(arg, bytes) else arg for arg in args]
        return {"method": method, "args": serializable}

    async def call_task_sdk(self, task_id: str, method: str, *args):
        if self.fail_task:
            raise RuntimeError("task sdk boom")
        if self.nonfinite_task_result:
            return {"value": float("inf")}
        self.calls.append(("task", task_id, method, args))
        serializable = [arg.decode("utf-8") if isinstance(arg, bytes) else arg for arg in args]
        return {"task_id": task_id, "method": method, "args": serializable}

    def active_task_id(self) -> str:
        return "task-1"

    def _task_conversation_id(self, task_id: str) -> str | None:
        return None if task_id == "task-cron" else f"conv-{task_id}"

    def _no_conversation_task_error(self, task_id: str, api: str) -> str:
        task_kind = "cron_wakeup" if task_id == "task-cron" else "unknown"
        return f"{api} is unavailable: this task (taskKind={task_kind}) is not bound to a conversation"


class FakeToolContext:
    def __init__(self) -> None:
        self.tools: list[dict] = []

    def register_tool(self, **kwargs) -> None:
        self.tools.append(kwargs)


def assert_success(raw: str) -> dict:
    parsed = json.loads(raw)
    assert parsed["success"] is True, parsed
    return parsed


def schema_rejects_unknown_fields(schema: dict) -> bool:
    if schema.get("type") == "object" and schema.get("additionalProperties") is False:
        return True
    return any(
        isinstance(branch, dict) and schema_rejects_unknown_fields(branch)
        for branch in schema.get("oneOf", [])
    )


def with_unknown_field(value):
    mutated = copy.deepcopy(value)
    assert isinstance(mutated, dict), mutated
    mutated["__unknown_field__"] = True
    return mutated


def named_payload_for(specs, sample_args, target_index: int, required_count: int) -> dict:
    payload = {}
    last_index = max(target_index, required_count - 1)
    for index, (name, _schema) in enumerate(specs):
        if index > last_index:
            break
        payload[name] = copy.deepcopy(sample_args[index])
    return payload

