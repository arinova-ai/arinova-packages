/** Typed error thrown by all SDK requests. */
export class ArinovaError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code = "unknown_error") {
    super(message);
    this.name = "ArinovaError";
    this.status = status;
    this.code = code;
  }
}

export interface RequestOptions {
  method?: string;
  headers?: Headers | Record<string, string> | [string, string][];
  /** The SDK currently sends JSON request bodies. */
  body?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  token?: string;
  maxResponseBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
export const MAX_RETRY_DELAY_MS = 5_000;

type ErrorBody = {
  error?: string | {
    code?: string;
    message?: string;
    details?: unknown;
  };
  error_description?: string;
};

/** Parse both API-v1 error envelopes and OAuth's legacy flat errors. */
export function parseError(body: unknown, fallback: string): { message: string; code?: string } {
  if (!body || typeof body !== "object") return { message: fallback };
  const value = body as ErrorBody;
  if (value.error && typeof value.error === "object") {
    return {
      message: typeof value.error.message === "string" ? value.error.message : fallback,
      code: typeof value.error.code === "string" ? value.error.code : undefined,
    };
  }
  return {
    message:
      (typeof value.error_description === "string" && value.error_description)
      || (typeof value.error === "string" && value.error)
      || fallback,
    code: typeof value.error === "string" ? value.error : undefined,
  };
}

/** fetch wrapper: JSON in/out, Bearer auth, API-v1 and OAuth error parsing. */
function combinedSignal(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; clear: () => void; disarmTimeout: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    },
    disarmTimeout: () => clearTimeout(timer),
  };
}

interface ResponseHandle {
  response: Response;
  maxResponseBytes: number;
  close(): void;
  abortCode(): "timeout" | "aborted" | undefined;
  /** Stop the timeout clock while keeping caller-abort wiring intact. */
  disarmTimeout(): void;
}

async function fetchWithErrors(url: string, init: RequestOptions): Promise<ResponseHandle> {
  const {
    token,
    headers,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = 0,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
    ...rest
  } = init;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ArinovaError("timeoutMs must be a positive number", 0, "invalid_timeout");
  }
  if (!Number.isInteger(retries) || retries < 0 || retries > 5) {
    throw new ArinovaError("retries must be an integer from 0 to 5", 0, "invalid_retries");
  }
  const deadline = combinedSignal(rest.signal, timeoutMs);
  const deadlineAt = Date.now() + timeoutMs;
  const normalizedHeaders = new Headers(headers);
  if (!normalizedHeaders.has("Content-Type")) normalizedHeaders.set("Content-Type", "application/json");
  if (token) normalizedHeaders.set("Authorization", `Bearer ${token}`);
  const fetchHeaders: Record<string, string> = {};
  normalizedHeaders.forEach((value, key) => {
    const canonical = key === "authorization" ? "Authorization" : key === "content-type" ? "Content-Type" : key;
    fetchHeaders[canonical] = value;
  });
  try {
    let lastCause: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(url, { ...rest, headers: fetchHeaders, signal: deadline.signal });
        if (attempt === retries || (response.status !== 429 && response.status < 500)) {
          return {
            response,
            maxResponseBytes,
            close: deadline.clear,
            abortCode: () => deadline.signal.aborted ? (rest.signal?.aborted ? "aborted" : "timeout") : undefined,
            disarmTimeout: deadline.disarmTimeout,
          };
        }
        const retryAfterHeader = response.headers.get("retry-after");
        const delayMs = Math.min(
          retryDelayMs(retryAfterHeader, attempt),
          MAX_RETRY_DELAY_MS,
          Math.max(0, deadlineAt - Date.now()),
        );
        const delay = abortableDelay(delayMs, deadline.signal);
        await Promise.all([
          response.body?.cancel().catch(() => undefined),
          delay,
        ]);
      } catch (cause) {
        lastCause = cause;
        if (deadline.signal.aborted || attempt === retries) break;
      }
    }
    if (deadline.signal.aborted) {
      const timedOut = !rest.signal?.aborted;
      throw new ArinovaError(timedOut ? "Request timed out" : "Request aborted", 0, timedOut ? "timeout" : "aborted");
    }
    throw new ArinovaError(lastCause instanceof Error ? lastCause.message : "Network request failed", 0, "network_error");
  } catch (error) {
    deadline.clear();
    throw error;
  }
}

export async function request<T>(url: string, init: RequestOptions = {}): Promise<T> {
  const handle = await fetchWithErrors(url, init);
  const { response: res } = handle;
  try {
    if (!res.ok) {
      const body = await readBoundedJson(res, handle.maxResponseBytes).catch((error) => {
        if (error instanceof ArinovaError) throw error;
        return undefined;
      });
      const error = parseError(body, `Request failed (${res.status})`);
      throw new ArinovaError(error.message, res.status, error.code ?? "http_error");
    }
    if (res.status === 204) return undefined as T;
    return (await readBoundedJson(res, handle.maxResponseBytes)) as T;
  } catch (error) {
    if (error instanceof ArinovaError) throw error;
    const abortCode = handle.abortCode();
    if (abortCode) {
      throw new ArinovaError(abortCode === "timeout" ? "Request timed out" : "Request aborted", 0, abortCode);
    }
    throw new ArinovaError(`Invalid JSON response (${res.status})`, res.status, "invalid_response");
  } finally {
    handle.close();
  }
}

/** Fetch a streaming response with the same auth, timeout and error contract. */
export async function requestStream(url: string, init: RequestOptions = {}): Promise<ResponseHandle> {
  const handle = await fetchWithErrors(url, init);
  const { response: res } = handle;
  if (!res.ok) {
    const body = await readBoundedJson(res, handle.maxResponseBytes).catch((error) => {
      if (error instanceof ArinovaError) throw error;
      return undefined;
    });
    const error = parseError(body, `Request failed (${res.status})`);
    handle.close();
    throw new ArinovaError(error.message, res.status, error.code ?? "http_error");
  }
  if (!res.body) {
    handle.close();
    throw new ArinovaError("Streaming response has no body", res.status, "invalid_response");
  }
  // timeoutMs bounds connection + headers only. Body consumption can
  // legitimately outlast any fixed deadline (LLM generation), so stop the
  // clock here; the caller's own AbortSignal still cancels mid-stream.
  handle.disarmTimeout();
  return handle;
}

function retryDelayMs(retryAfter: string | null, attempt: number): number {
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {
      return seconds >= 0 ? seconds * 1_000 : 100 * 2 ** attempt;
    }
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  }
  return 100 * 2 ** attempt;
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new ArinovaError(
      `Response exceeds ${maxBytes} byte limit`,
      response.status,
      "response_too_large",
    );
  }
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new ArinovaError(
          `Response exceeds ${maxBytes} byte limit`,
          response.status,
          "response_too_large",
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text ? JSON.parse(text) : undefined;
  } finally {
    reader.releaseLock();
  }
}

export function stripTrailingSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

export function parseScopes(scope: string | undefined | null): string[] {
  return (scope ?? "").split(/[ ,]+/).filter(Boolean);
}
