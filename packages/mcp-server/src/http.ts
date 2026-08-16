export const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_MAX_RETRY_DELAY_MS = 5_000;

export class HttpRequestError extends Error {
  constructor(
    public readonly code: "ABORTED" | "TIMEOUT" | "NETWORK_ERROR" | "RESPONSE_TOO_LARGE",
    message: string,
  ) {
    super(message);
    this.name = "HttpRequestError";
  }
}

export interface HttpRequestOptions {
  method?: string;
  headers?: HeadersInit;
  body?: string;
  signal?: AbortSignal;
  timeoutMs: number;
  retries?: number;
  maxRetryDelayMs?: number;
  maxResponseBytes?: number;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Headers;
  body: string;
  ok: boolean;
}

export async function httpRequest(
  url: string,
  options: HttpRequestOptions,
): Promise<HttpResponse> {
  const method = (options.method ?? "GET").toUpperCase();
  const retries = options.retries ?? (method === "GET" || method === "HEAD" ? 2 : 0);
  const maxRetryDelayMs = options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
  const deadline = Date.now() + options.timeoutMs;
  for (let attempt = 0; ; attempt++) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new HttpRequestError(
        "TIMEOUT",
        `Request timed out after ${options.timeoutMs}ms`,
      );
    }
    try {
      const response = await requestOnce(url, {
        ...options,
        timeoutMs: remainingMs,
      });
      if (attempt < retries && isRetryableStatus(response.status)) {
        await delay(
          Math.min(
            retryDelayMs(response.headers, attempt),
            maxRetryDelayMs,
            Math.max(0, deadline - Date.now()),
          ),
          options.signal,
        );
        continue;
      }
      return response;
    } catch (err) {
      if (
        attempt >= retries ||
        !(err instanceof HttpRequestError) ||
        err.code !== "NETWORK_ERROR"
      ) {
        throw err;
      }
      await delay(
        Math.min(
          retryDelayMs(undefined, attempt),
          maxRetryDelayMs,
          Math.max(0, deadline - Date.now()),
        ),
        options.signal,
      );
    }
  }
}

async function requestOnce(
  url: string,
  options: HttpRequestOptions,
): Promise<HttpResponse> {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);
  timeout.unref?.();

  try {
    const response = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });
    const body = await readBoundedBody(
      response,
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    );
    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body,
      ok: response.ok,
    };
  } catch (err) {
    if (err instanceof HttpRequestError) throw err;
    if (timedOut) {
      throw new HttpRequestError(
        "TIMEOUT",
        `Request timed out after ${options.timeoutMs}ms`,
      );
    }
    if (options.signal?.aborted) {
      throw new HttpRequestError("ABORTED", "Request was aborted");
    }
    throw new HttpRequestError(
      "NETWORK_ERROR",
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new HttpRequestError(
      "RESPONSE_TOO_LARGE",
      `Response exceeds ${maxBytes} byte limit`,
    );
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new HttpRequestError(
          "RESPONSE_TOO_LARGE",
          `Response exceeds ${maxBytes} byte limit`,
        );
      }
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function retryDelayMs(headers: Headers | undefined, attempt: number): number {
  const retryAfter = headers?.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  }
  return 100 * 2 ** attempt + Math.floor(Math.random() * 50);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new HttpRequestError("ABORTED", "Request was aborted"));
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new HttpRequestError("ABORTED", "Request was aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    timer.unref?.();
  });
}
