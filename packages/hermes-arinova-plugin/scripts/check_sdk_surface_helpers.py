"""Focused TypeScript signature parsers used by check_sdk_surface.py."""

from __future__ import annotations

import re


def split_ts_params(params: str) -> list[str]:
    return [part.split(":", 1)[0].strip().rstrip("?") for part in split_ts_param_decls(params)]


def split_ts_param_decls(params: str) -> list[str]:
    names: list[str] = []
    current: list[str] = []
    depth = 0
    for char in params:
        if char in "({[<":
            depth += 1
        elif char in ")}]>":
            depth = max(0, depth - 1)
        if char == "," and depth == 0:
            part = "".join(current).strip()
            if part:
                names.append(part)
            current = []
            continue
        current.append(char)
    part = "".join(current).strip()
    if part:
        names.append(part)
    return names


def required_ts_param_count(params: str) -> int:
    count = 0
    for declaration in split_ts_param_decls(params):
        name = declaration.split(":", 1)[0].strip()
        if not name.endswith("?") and "=" not in declaration:
            count += 1
    return count


def class_method_params(source: str, class_marker: str) -> dict[str, list[str]]:
    try:
        body = source.split(class_marker, 1)[1]
    except IndexError as exc:
        raise ValueError(f"could not find `{class_marker}`") from exc

    params: dict[str, list[str]] = {}
    lines = body.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        match = re.match(
            r"^\s+(?!(?:private|protected)\b)(?:async )?([A-Za-z0-9_]+)(?:<[^>]+>)?\(",
            line,
        )
        if not match or match.group(1) == "constructor":
            index += 1
            continue
        name = match.group(1)
        collected = [line]
        paren_depth = line.count("(") - line.count(")")
        while paren_depth > 0 and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            paren_depth += lines[index].count("(") - lines[index].count(")")
        signature = "\n".join(collected)
        inner = signature.split("(", 1)[1].rsplit(")", 1)[0]
        params[name] = split_ts_params(inner)
        index += 1
    return params


def class_method_required_param_counts(source: str, class_marker: str) -> dict[str, int]:
    try:
        body = source.split(class_marker, 1)[1]
    except IndexError as exc:
        raise ValueError(f"could not find `{class_marker}`") from exc

    counts: dict[str, int] = {}
    lines = body.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        match = re.match(
            r"^\s+(?!(?:private|protected)\b)(?:async )?([A-Za-z0-9_]+)(?:<[^>]+>)?\(",
            line,
        )
        if not match or match.group(1) == "constructor":
            index += 1
            continue
        name = match.group(1)
        collected = [line]
        paren_depth = line.count("(") - line.count(")")
        while paren_depth > 0 and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            paren_depth += lines[index].count("(") - lines[index].count(")")
        signature = "\n".join(collected)
        inner = signature.split("(", 1)[1].rsplit(")", 1)[0]
        counts[name] = required_ts_param_count(inner)
        index += 1
    return counts


def ts_declaration_terminated(declaration: str) -> bool:
    depth = 0
    in_string: str | None = None
    escaped = False
    for char in declaration:
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == in_string:
                in_string = None
            continue
        if char in {"'", '"', "`"}:
            in_string = char
            continue
        if char in "({[<":
            depth += 1
        elif char in ")}]>":
            depth = max(0, depth - 1)
        elif char == ";" and depth == 0:
            return True
    return False


def task_context_callable_declarations(source: str) -> dict[str, str]:
    try:
        body = source.split("interface TaskContext", 1)[1].split("\n}", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find `TaskContext` interface") from exc
    declarations: dict[str, str] = {}
    lines = body.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        match = re.match(r"^\s+([A-Za-z0-9_]+):\s*\(", line)
        if not match:
            index += 1
            continue
        name = match.group(1)
        collected = [line]
        declaration = line
        while not ts_declaration_terminated(declaration) and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            declaration = "\n".join(collected)
        declarations[name] = declaration
        index += 1
    return declarations


def task_context_callable_params(source: str) -> dict[str, list[str]]:
    params: dict[str, list[str]] = {}
    for name, declaration in task_context_callable_declarations(source).items():
        inner = declaration.split("(", 1)[1].rsplit(")", 1)[0]
        params[name] = split_ts_params(inner)
    return params


def task_context_helper_required_param_counts(source: str) -> dict[str, int]:
    try:
        body = source.split("interface TaskContext", 1)[1].split("\n}", 1)[0]
    except IndexError as exc:
        raise ValueError("could not find `TaskContext` interface") from exc
    counts: dict[str, int] = {}
    lines = body.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        match = re.match(r"^\s+([A-Za-z0-9_]+):\s*\(", line)
        if not match:
            index += 1
            continue
        name = match.group(1)
        collected = [line]
        declaration = line
        while ";" not in declaration and index + 1 < len(lines):
            index += 1
            collected.append(lines[index])
            declaration = "\n".join(collected)
        if "=> Promise<" in declaration:
            inner = declaration.split("(", 1)[1].rsplit(")", 1)[0]
            counts[name] = required_ts_param_count(inner)
        index += 1
    return counts


def snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def tool_param_name(ts_name: str) -> str:
    if ts_name == "args":
        return "action_args"
    return snake(ts_name)
