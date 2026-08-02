export const WS_OPEN = 1;

export function normalizeWebSocketBaseUrl(serverUrl: string): string {
  return serverUrl
    .replace(/^http:/, "ws:")
    .replace(/^https:/, "wss:")
    .replace(/\/$/, "");
}

export function toHttpBaseUrl(serverUrl: string): string {
  return serverUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
}

export function reconnectDelayMs(baseMs: number, attempt: number): number {
  const exponential = Math.min(baseMs * 2 ** Math.min(attempt, 5), 60_000);
  if (attempt === 0) return exponential;
  return exponential + Math.floor(Math.random() * Math.max(1, baseMs / 5));
}

export function httpRetryDelayMs(headers: Headers, attempt: number): number {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  }
  return 100 * 2 ** attempt + Math.floor(Math.random() * 50);
}

export function delayWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const finish = () => signal?.removeEventListener("abort", onAbort);
    const timer = setTimeout(() => {
      finish();
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      finish();
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function decodeWebSocketFrame(
  value: unknown,
  maxBytes: number,
): Record<string, unknown> | Promise<Record<string, unknown>> {
  let raw: string;
  let byteLength: number;
  if (typeof value === "string") {
    raw = value;
    byteLength = new TextEncoder().encode(raw).byteLength;
  } else if (value instanceof ArrayBuffer) {
    byteLength = value.byteLength;
    raw = new TextDecoder().decode(value);
  } else if (typeof Blob !== "undefined" && value instanceof Blob) {
    if (value.size > maxBytes) {
      throw new RangeError("inbound WebSocket frame exceeds configured limit");
    }
    return value.text().then((text) => parseFrame(text, maxBytes));
  } else {
    throw new TypeError("unsupported inbound WebSocket frame type");
  }
  if (byteLength > maxBytes) {
    throw new RangeError("inbound WebSocket frame exceeds configured limit");
  }
  return parseFrame(raw, maxBytes);
}

function parseFrame(raw: string, maxBytes: number): Record<string, unknown> {
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new RangeError("inbound WebSocket frame exceeds configured limit");
  }
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SyntaxError("inbound WebSocket frame must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}
