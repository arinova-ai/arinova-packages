"""Bounded JSON HTTP helpers and DNS-pinned attachment transport."""

from __future__ import annotations

import base64
import hmac
import http.client
import ipaddress
import json
import socket
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


def resolve_public_http_url(url: str) -> tuple[urllib.parse.SplitResult, str, int]:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("attachment URL must be an absolute http(s) URL")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("attachment URL credentials are not allowed")
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError as exc:
        raise ValueError("attachment URL port is invalid") from exc
    try:
        addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError("attachment URL host could not be resolved") from exc
    if not addresses:
        raise ValueError("attachment URL host could not be resolved")

    pinned_ip = ""
    for address in addresses:
        raw_ip = address[4][0]
        try:
            ip = ipaddress.ip_address(raw_ip)
        except ValueError as exc:
            raise ValueError("attachment URL resolved to an invalid address") from exc
        if not ip.is_global:
            raise ValueError("attachment URL resolves to a non-public address")
        if not pinned_ip:
            pinned_ip = raw_ip
    return parsed, pinned_ip, port


def validate_public_http_url(url: str) -> None:
    resolve_public_http_url(url)


class PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, host: str, *, pinned_ip: str, **kwargs: Any):
        self._pinned_ip = pinned_ip
        super().__init__(host, **kwargs)

    def connect(self) -> None:
        self.sock = self._create_connection(
            (self._pinned_ip, self.port),
            self.timeout,
            self.source_address,
        )
        if self._tunnel_host:
            self._tunnel()


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host: str, *, pinned_ip: str, **kwargs: Any):
        self._pinned_ip = pinned_ip
        super().__init__(host, **kwargs)

    def connect(self) -> None:
        self.sock = self._create_connection(
            (self._pinned_ip, self.port),
            self.timeout,
            self.source_address,
        )
        if self._tunnel_host:
            self._tunnel()
        self.sock = self._context.wrap_socket(self.sock, server_hostname=self.host)


class PinnedHTTPHandler(urllib.request.HTTPHandler):
    handler_order = 100

    def http_open(self, req):
        _, pinned_ip, _ = resolve_public_http_url(req.full_url)
        return self.do_open(
            lambda host, **kwargs: PinnedHTTPConnection(
                host,
                pinned_ip=pinned_ip,
                **kwargs,
            ),
            req,
        )


class PinnedHTTPSHandler(urllib.request.HTTPSHandler):
    handler_order = 100

    def __init__(self, context: ssl.SSLContext | None = None):
        if context is None:
            context = ssl.create_default_context()
        super().__init__(context=context)

    def https_open(self, req):
        _, pinned_ip, _ = resolve_public_http_url(req.full_url)
        return self.do_open(
            lambda host, **kwargs: PinnedHTTPSConnection(
                host,
                pinned_ip=pinned_ip,
                **kwargs,
            ),
            req,
            context=self._context,
        )


class AttachmentRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urllib.parse.urljoin(req.full_url, newurl)
        scheme = urllib.parse.urlsplit(target).scheme
        if scheme not in {"http", "https"}:
            raise ValueError("attachment redirect must use an http(s) URL")
        validate_public_http_url(target)
        return super().redirect_request(req, fp, code, msg, headers, target)


def json_safe(value: Any) -> Any:
    if isinstance(value, (bytes, bytearray, memoryview)):
        return {"base64": base64.b64encode(bytes(value)).decode("ascii")}
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    return value


def reject_json_constant(value: str) -> None:
    raise ValueError(f"JSON contains non-finite constant: {value}")


def reject_duplicate_json_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for key, value in pairs:
        if key in data:
            raise ValueError(f"JSON object contains duplicate key: {key}")
        data[key] = value
    return data


def is_json_content_type(value: str | None) -> bool:
    content_type = str(value or "").split(";", 1)[0].strip().lower()
    return content_type == "application/json"


def callback_content_length(value: str | None) -> int:
    if value is None:
        raise ValueError("callback Content-Length is required")
    try:
        length = int(str(value).strip())
    except (TypeError, ValueError) as exc:
        raise ValueError("callback Content-Length must be a non-negative integer") from exc
    if length < 0:
        raise ValueError("callback Content-Length must be a non-negative integer")
    return length


def bridge_tokens_equal(supplied: str | None, expected: str) -> bool:
    try:
        supplied_bytes = str(supplied or "").encode("ascii")
        expected_bytes = expected.encode("ascii")
    except UnicodeEncodeError:
        return False
    return hmac.compare_digest(supplied_bytes, expected_bytes)


def urlopen_json(req: urllib.request.Request, *, timeout: float, label: str) -> dict:
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            if not is_json_content_type(res.headers.get("Content-Type")):
                content_type = res.headers.get("Content-Type") or "<missing>"
                raise RuntimeError(
                    f"{label} returned non-JSON response content type: {content_type}"
                )
            body = res.read()
            try:
                raw = body.decode("utf-8")
            except UnicodeDecodeError as exc:
                raise RuntimeError(f"{label} returned non-UTF-8 response body") from exc
            try:
                parsed = json.loads(
                    raw,
                    parse_constant=reject_json_constant,
                    object_pairs_hook=reject_duplicate_json_keys,
                )
            except (json.JSONDecodeError, ValueError) as exc:
                raise RuntimeError(f"{label} returned malformed JSON: {raw!r}") from exc
            if not isinstance(parsed, dict):
                raise RuntimeError(f"{label} returned malformed response: {parsed!r}")
            return parsed
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{label} failed ({exc.code}): {body}") from exc
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise RuntimeError(f"{label} failed: {reason}") from exc
    except TimeoutError as exc:
        raise RuntimeError(f"{label} timed out") from exc
