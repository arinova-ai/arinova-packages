"""Validated runtime defaults shared with the Node sidecar."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


_CONTRACT_PATH = Path(__file__).with_name("runtime-contract.json")
_CONTRACT = json.loads(_CONTRACT_PATH.read_text(encoding="utf-8"))
_DEFAULTS = _CONTRACT.get("defaults")
_MODES = _CONTRACT.get("concurrencyModes")

if not isinstance(_DEFAULTS, dict):
    raise RuntimeError("runtime-contract.json defaults must be an object")
if (
    not isinstance(_MODES, list)
    or not _MODES
    or any(not isinstance(mode, str) or not mode for mode in _MODES)
    or len(set(_MODES)) != len(_MODES)
):
    raise RuntimeError("runtime-contract.json concurrencyModes must be unique strings")


def _positive_int(name: str) -> int:
    value: Any = _DEFAULTS.get(name)
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise RuntimeError(f"runtime-contract.json defaults.{name} must be a positive integer")
    return value


def _string(name: str) -> str:
    value: Any = _DEFAULTS.get(name)
    if not isinstance(value, str) or not value:
        raise RuntimeError(f"runtime-contract.json defaults.{name} must be a non-empty string")
    return value


DEFAULT_SIDECAR_PORT = _positive_int("sidecarPort")
DEFAULT_ADAPTER_PORT = _positive_int("adapterPort")
DEFAULT_BIND = _string("bind")
DEFAULT_ATTACHMENT_MAX_BYTES = _positive_int("attachmentMaxBytes")
DEFAULT_ATTACHMENT_MAX_COUNT = _positive_int("attachmentMaxCount")
DEFAULT_ATTACHMENT_TOTAL_MAX_BYTES = _positive_int("attachmentTotalMaxBytes")
DEFAULT_ATTACHMENT_TOTAL_TIMEOUT_MS = _positive_int("attachmentTotalTimeoutMs")
DEFAULT_ATTACHMENT_ERROR_BODY_MAX_BYTES = _positive_int("attachmentErrorBodyMaxBytes")
DEFAULT_CONNECT_TIMEOUT_MS = _positive_int("connectTimeoutMs")
DEFAULT_ADAPTER_POST_TIMEOUT_MS = _positive_int("adapterPostTimeoutMs")
DEFAULT_SIDECAR_POST_TIMEOUT_MS = _positive_int("sidecarPostTimeoutMs")
DEFAULT_CONTROL_MAX_BODY_BYTES = _positive_int("controlMaxBodyBytes")
DEFAULT_MAX_PENDING_TASK_OUTPUTS = _positive_int("maxPendingTaskOutputs")
CONCURRENCY_MODES = frozenset(_MODES)
