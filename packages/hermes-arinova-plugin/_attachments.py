"""Inbound attachment download budgets and task-context formatting."""

from __future__ import annotations

import asyncio
import logging
import math
import os
import ssl
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable

from gateway.platforms.base import MessageType

try:
    from gateway.platforms.base import cache_media_bytes
except ImportError:
    class _CachedMedia:
        def __init__(self, path: str, media_type: str, filename: str):
            self.path = path
            self.media_type = media_type
            self._filename = filename

        def context_note(self) -> str:
            return f"Downloaded attachment: {self._filename} ({self.media_type})"

    def cache_media_bytes(data: bytes, *, filename: str, mime_type: str):
        safe_name = Path(filename).name or "attachment"
        suffix = Path(safe_name).suffix[:16]
        descriptor, path = tempfile.mkstemp(prefix="hermes-arinova-", suffix=suffix)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(data)
        return _CachedMedia(path, mime_type, safe_name)

try:
    from ._http import (
        AttachmentRedirectHandler,
        PinnedHTTPHandler,
        PinnedHTTPSHandler,
        validate_public_http_url,
    )
    from ._runtime_contract import DEFAULT_ATTACHMENT_ERROR_BODY_MAX_BYTES
except ImportError:
    from _http import (  # type: ignore[no-redef]
        AttachmentRedirectHandler,
        PinnedHTTPHandler,
        PinnedHTTPSHandler,
        validate_public_http_url,
    )
    from _runtime_contract import DEFAULT_ATTACHMENT_ERROR_BODY_MAX_BYTES  # type: ignore[no-redef]


logger = logging.getLogger(__name__)


def message_type_for_media(media_types: list[str]) -> MessageType:
    if any(item.startswith("image/") for item in media_types):
        return MessageType.PHOTO
    if any(item.startswith("video/") for item in media_types):
        return MessageType.VIDEO
    if any(item.startswith("audio/") for item in media_types):
        return MessageType.AUDIO
    if media_types:
        return MessageType.DOCUMENT
    return MessageType.TEXT


async def collect_attachment_media(
    adapter: Any,
    task: dict,
    *,
    authorized: bool,
) -> tuple[list[str], list[str], list[str]]:
    media_urls: list[str] = []
    media_types: list[str] = []
    media_notes: list[str] = []
    if not adapter.download_attachments:
        return media_urls, media_types, media_notes

    attachments = task.get("attachments")
    if not isinstance(attachments, list):
        return media_urls, media_types, media_notes
    candidates = [
        attachment
        for attachment in attachments
        if isinstance(attachment, dict) and attachment.get("url")
    ]
    if not candidates:
        return media_urls, media_types, media_notes
    if not authorized:
        logger.warning("Arinova: skipped attachment downloads for unauthorized sender")
        return media_urls, media_types, media_notes
    if len(candidates) > adapter.attachment_max_count:
        logger.warning(
            "Arinova: rejected %s attachments (maximum %s)",
            len(candidates),
            adapter.attachment_max_count,
        )
        return media_urls, media_types, media_notes

    deadline = time.monotonic() + (adapter.attachment_total_timeout_ms / 1000)
    total_bytes = 0
    for attachment in candidates:
        remaining_bytes = adapter.attachment_total_max_bytes - total_bytes
        remaining_seconds = deadline - time.monotonic()
        if remaining_bytes <= 0 or remaining_seconds <= 0:
            logger.warning("Arinova: attachment aggregate budget exhausted")
            break
        attempt_bytes = 0

        def account_bytes(count: int) -> None:
            nonlocal attempt_bytes
            attempt_bytes += count

        try:
            result = await asyncio.to_thread(
                adapter._download_attachment_media,
                attachment,
                max_bytes=min(adapter.attachment_max_bytes, remaining_bytes),
                timeout_seconds=min(30.0, remaining_seconds),
                on_bytes=account_bytes,
            )
        except Exception as exc:
            logger.warning(
                "Arinova: failed to download attachment %s: %s",
                attachment.get("fileName") or attachment.get("id") or "<unknown>",
                exc,
            )
            continue
        finally:
            total_bytes += attempt_bytes
        if not result:
            continue
        path, media_type, note, downloaded_bytes = result
        total_bytes += max(0, downloaded_bytes - attempt_bytes)
        media_urls.append(path)
        media_types.append(media_type)
        media_notes.append(note)
    return media_urls, media_types, media_notes


def download_attachment_media(
    adapter: Any,
    attachment: dict,
    *,
    max_bytes: int,
    timeout_seconds: float,
    on_bytes: Callable[[int], None] | None = None,
) -> tuple[str, str, str, int] | None:
    url = str(attachment.get("url") or "")
    data, response_type = adapter._download_attachment_bytes(
        url,
        max_bytes=max_bytes,
        timeout_seconds=timeout_seconds,
        on_bytes=on_bytes,
    )
    filename = str(attachment.get("fileName") or attachment.get("id") or "attachment")
    mime_type = str(
        attachment.get("fileType") or response_type or "application/octet-stream"
    )
    cached = cache_media_bytes(data, filename=filename, mime_type=mime_type)
    if cached is None:
        return None
    return cached.path, cached.media_type, cached.context_note(), len(data)


def attachment_urlopen(req: urllib.request.Request, *, timeout: float):
    opener = urllib.request.OpenerDirector()
    for handler in (
        urllib.request.ProxyHandler({}),
        urllib.request.UnknownHandler(),
        urllib.request.HTTPDefaultErrorHandler(),
        PinnedHTTPHandler(),
        PinnedHTTPSHandler(context=ssl.create_default_context()),
        AttachmentRedirectHandler(),
        urllib.request.HTTPErrorProcessor(),
    ):
        opener.add_handler(handler)
    return opener.open(req, timeout=timeout)


def download_attachment_bytes(
    adapter: Any,
    url: str,
    *,
    max_bytes: int | None = None,
    timeout_seconds: float = 30.0,
    on_bytes: Callable[[int], None] | None = None,
) -> tuple[bytes, str]:
    byte_limit = adapter.attachment_max_bytes if max_bytes is None else max_bytes
    if byte_limit <= 0 or timeout_seconds <= 0:
        raise ValueError("attachment download budget exhausted")
    validate_public_http_url(url)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Hermes-Arinova-Plugin/0.1"},
        method="GET",
    )
    try:
        with adapter._attachment_urlopen(req, timeout=timeout_seconds) as res:
            chunks = []
            total = 0
            deadline = time.monotonic() + timeout_seconds
            while True:
                if time.monotonic() >= deadline:
                    raise TimeoutError()
                chunk = res.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if on_bytes is not None:
                    on_bytes(len(chunk))
                if total > byte_limit:
                    raise ValueError(f"attachment exceeds {byte_limit} bytes")
                chunks.append(chunk)
            content_type = res.headers.get("Content-Type", "").split(";", 1)[0].strip()
    except urllib.error.HTTPError as exc:
        error_bytes = exc.read(DEFAULT_ATTACHMENT_ERROR_BODY_MAX_BYTES + 1)
        if on_bytes is not None:
            on_bytes(len(error_bytes))
        truncated = len(error_bytes) > DEFAULT_ATTACHMENT_ERROR_BODY_MAX_BYTES
        body = error_bytes[:DEFAULT_ATTACHMENT_ERROR_BODY_MAX_BYTES].decode(
            "utf-8",
            errors="replace",
        )
        if truncated:
            body += "… [truncated]"
        raise RuntimeError(f"attachment download failed ({exc.code}): {body}") from exc
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise RuntimeError(f"attachment download failed: {reason}") from exc
    except TimeoutError as exc:
        raise RuntimeError("attachment download timed out") from exc
    return b"".join(chunks), content_type


def reply_section(task: dict) -> str:
    reply_to = task.get("replyTo")
    if isinstance(reply_to, dict):
        reply_content = str(reply_to.get("content") or "").strip()
        if reply_content:
            reply_sender = (
                reply_to.get("senderAgentName")
                or reply_to.get("senderUsername")
                or reply_to.get("role")
            )
            prefix = f"Replying to {reply_sender}:" if reply_sender else "Replying to:"
            reply_lines = [prefix, reply_content]
            if reply_to.get("role") and reply_to.get("role") != reply_sender:
                reply_lines.append(f"role={reply_to.get('role')}")
            return "\n".join(reply_lines)
    return ""


def history_section(task: dict) -> str:
    history = task.get("history")
    if isinstance(history, list) and history:
        lines = []
        for item in history[-5:]:
            if not isinstance(item, dict):
                continue
            text = str(item.get("content") or "").strip()
            if not text:
                continue
            sender = (
                item.get("senderAgentName")
                or item.get("senderUsername")
                or item.get("role")
                or "message"
            )
            created = item.get("createdAt")
            label = str(sender)
            if created:
                label += f" @ {created}"
            details = []
            if item.get("role") and item.get("role") != sender:
                details.append(f"role={item.get('role')}")
            suffix = f" ({', '.join(details)})" if details else ""
            lines.append(f"- {label}{suffix}: {text}")
        if lines:
            return "Recent Arinova history:\n" + "\n".join(lines)
    return ""


def members_section(task: dict) -> str:
    members = task.get("members")
    if isinstance(members, list) and members:
        lines = []
        for member in members:
            if not isinstance(member, dict):
                continue
            agent_id = member.get("agentId")
            agent_name = member.get("agentName") or agent_id
            if agent_name:
                detail = str(agent_name)
                if agent_id and agent_id != agent_name:
                    detail += f" ({agent_id})"
                lines.append(f"- {detail}")
        if lines:
            return "Arinova conversation agents:\n" + "\n".join(lines)
    return ""


def attachments_section(task: dict) -> str:
    attachments = task.get("attachments")
    if isinstance(attachments, list) and attachments:
        lines = []
        for attachment in attachments:
            if not isinstance(attachment, dict):
                continue
            name = attachment.get("fileName") or attachment.get("id") or "attachment"
            attachment_id = attachment.get("id")
            file_type = attachment.get("fileType") or "application/octet-stream"
            size = attachment.get("fileSize")
            url = attachment.get("url")
            detail = f"- {name} ({file_type}"
            if attachment_id and attachment_id != name:
                detail += f", id={attachment_id}"
            if (
                size is not None
                and not isinstance(size, bool)
                and isinstance(size, (int, float))
                and math.isfinite(size)
            ):
                detail += f", {size} bytes"
            detail += ")"
            if url:
                detail += f": {url}"
            lines.append(detail)
        if lines:
            return "Attachments:\n" + "\n".join(lines)
    return ""


def skills_section(task: dict) -> str:
    skills = task.get("availableSkills")
    if isinstance(skills, list) and skills:
        lines = []
        for skill in skills:
            if not isinstance(skill, dict):
                continue
            name = skill.get("name") or skill.get("slug") or "skill"
            parts = [str(name)]
            if skill.get("slug"):
                parts.append(f"slug={skill.get('slug')}")
            if skill.get("slashCommand"):
                parts.append(f"slash={skill.get('slashCommand')}")
            if skill.get("description"):
                parts.append(str(skill.get("description")))
            lines.append("- " + " | ".join(parts))
        if lines:
            return (
                "Available Arinova skills (use arinova_fetch_skill_prompt with slug for full prompt):\n"
                + "\n".join(lines)
            )
    return ""


def metadata_section(task: dict) -> str:
    metadata_lines = []
    for label, key in (
        ("taskId", "taskId"),
        ("userMessageId", "userMessageId"),
        ("conversationId", "conversationId"),
        ("conversationName", "conversationName"),
        ("conversationType", "conversationType"),
        ("senderUserId", "senderUserId"),
        ("senderUsername", "senderUsername"),
        ("senderAgentId", "senderAgentId"),
        ("senderAgentName", "senderAgentName"),
    ):
        if key not in task or task.get(key) is None:
            continue
        value = task.get(key)
        if isinstance(value, str) or value:
            metadata_lines.append(f"- {label}: {value}")
    if metadata_lines:
        return "Arinova task metadata:\n" + "\n".join(metadata_lines)
    return ""


def task_text(adapter: Any, task: dict, *, media_notes: list[str] | None = None) -> str:
    sections = [
        str(task.get("content") or ""),
        adapter._reply_section(task),
        adapter._history_section(task),
        adapter._members_section(task),
        adapter._attachments_section(task),
        "Downloaded attachments:\n" + "\n".join(media_notes) if media_notes else "",
        adapter._skills_section(task),
        f"Arinova task kind: {task.get('taskKind')}" if task.get("taskKind") else "",
        adapter._metadata_section(task),
    ]
    return "\n\n".join(section for section in sections if section).strip()
