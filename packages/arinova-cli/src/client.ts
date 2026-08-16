import { createWriteStream, existsSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Command } from "commander";
import { getEndpoint, resolveApiKey } from "./config.js";
import { normalizeApiEndpoint } from "./endpoint.js";
import { appendFileToForm } from "./file-upload.js";

export const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type ResponseMode = "json" | "binary" | "stream";

export interface ApiClientConfig {
  endpoint: string;
  token: string;
  profileName?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface ApiRequest {
  method: HttpMethod;
  path: string;
  body?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
  responseMode?: ResponseMode;
  signal?: AbortSignal;
}

export interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: unknown;
  error?: string | { code?: string; message?: string; details?: unknown };
}

export class ApiError extends Error {
  readonly code?: string;
  readonly details?: unknown;

  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    const parsed = parseApiError(body);
    const rendered = typeof body === "string" ? body : JSON.stringify(body);
    super(`API error ${status}: ${parsed.message || rendered || "empty response"}`);
    this.name = "ApiError";
    this.code = parsed.code;
    this.details = parsed.details ?? body;
  }
}

export class UnsupportedCommandError extends Error {
  readonly code = "UNSUPPORTED_COMMAND";

  constructor(message: string) {
    super(message);
    this.name = "UnsupportedCommandError";
  }
}

export class ResponseBodyTooLargeError extends Error {
  constructor(
    public readonly maxBytes: number,
    public readonly receivedBytes?: number,
  ) {
    super(
      receivedBytes === undefined
        ? `Response body exceeds the ${maxBytes}-byte safety limit`
        : `Response body is ${receivedBytes} bytes; the safety limit is ${maxBytes} bytes`,
    );
    this.name = "ResponseBodyTooLargeError";
  }
}

interface RuntimeDefaults {
  endpoint?: string;
  token?: string;
  profileName?: string;
}

let runtimeDefaults: RuntimeDefaults = {};
let commandClients = new WeakMap<Command, ApiClient>();

export function configureClientDefaults(defaults: RuntimeDefaults): void {
  runtimeDefaults = {
    endpoint: defaults.endpoint
      ? normalizeApiEndpoint(defaults.endpoint, "Runtime endpoint")
      : undefined,
    token: defaults.token,
    profileName: defaults.profileName,
  };
  commandClients = new WeakMap();
}

export function resetClientDefaults(): void {
  runtimeDefaults = {};
  commandClients = new WeakMap();
}

export function encodePathSegment(value: string): string {
  if (!value || value === "." || value === "..") {
    throw new TypeError("Path segment must be non-empty and cannot be '.' or '..'");
  }
  return encodeURIComponent(value).replace(/\./g, "%2E");
}

export function buildQuery(
  values: Record<string, string | number | boolean | undefined | null>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function parseApiError(body: unknown): {
  code?: string;
  message?: string;
  details?: unknown;
} {
  if (typeof body === "string") return { message: body || undefined };
  if (!body || typeof body !== "object") return {};
  const value = body as ApiErrorBody;
  if (typeof value.error === "object" && value.error) {
    return {
      code: value.error.code,
      message: value.error.message,
      details: value.error.details,
    };
  }
  return {
    code: value.code,
    message:
      value.message ??
      (typeof value.error === "string" ? value.error : undefined),
    details: value.details,
  };
}

async function readBoundedResponseBody(
  res: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = res.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    const declaredBytes = Number(declaredLength);
    if (declaredBytes > maxBytes) {
      await res.body?.cancel().catch(() => undefined);
      throw new ResponseBodyTooLargeError(maxBytes, declaredBytes);
    }
  }
  if (!res.body) return new Uint8Array();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ResponseBodyTooLargeError(maxBytes, total);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function parseResponseBody(
  res: Response,
  maxBytes: number,
): Promise<unknown> {
  if (res.status === 204 || res.status === 205) return null;
  const bytes = await readBoundedResponseBody(res, maxBytes);
  const text = new TextDecoder().decode(bytes);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function combineSignals(
  timeoutMs: number,
  externalSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  const abort = () => controller.abort(externalSignal?.reason);
  const interrupt = () =>
    controller.abort(new Error("Request interrupted by SIGINT"));
  externalSignal?.addEventListener("abort", abort, { once: true });
  process.once("SIGINT", interrupt);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abort);
      process.removeListener("SIGINT", interrupt);
    },
  };
}

function managedStream(
  body: ReadableStream<Uint8Array>,
  cleanup: () => void,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          cleanup();
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        cleanup();
        controller.error(error);
      }
    },
    async cancel(reason) {
      cleanup();
      await reader.cancel(reason);
    },
  });
}

export class ApiClient {
  readonly endpoint: string;
  readonly token: string;
  readonly profileName?: string;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  private readonly etagCache = new Map<string, { etag: string; value: unknown }>();

  constructor(config: ApiClientConfig) {
    if (!config.token) throw new Error("No API key configured");
    this.endpoint = normalizeApiEndpoint(config.endpoint, "API endpoint");
    this.token = config.token;
    this.profileName = config.profileName;
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.maxResponseBytes = config.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    if (!Number.isSafeInteger(this.maxResponseBytes) || this.maxResponseBytes <= 0) {
      throw new TypeError("maxResponseBytes must be a positive safe integer");
    }
  }

  async request(request: ApiRequest): Promise<unknown> {
    if (!request.path.startsWith("/")) {
      throw new Error(`API request path must start with '/': ${request.path}`);
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      ...request.headers,
    };
    const cacheable = request.method === "GET" && request.responseMode === undefined;
    const hasCallerCondition = Object.keys(headers)
      .some((name) => name.toLowerCase() === "if-none-match");
    const cached = cacheable && !hasCallerCondition
      ? this.etagCache.get(request.path)
      : undefined;
    if (cached) {
      headers["If-None-Match"] = cached.etag;
    }
    const init: RequestInit = {
      method: request.method,
      headers,
    };
    if (request.form) {
      init.body = request.form;
    } else if (request.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(request.body);
    } else if (request.method !== "GET") {
      headers["Content-Type"] = "application/json";
    }

    const { signal, cleanup } = combineSignals(
      this.timeoutMs,
      request.signal,
    );
    init.signal = signal;
    let keepSignalUntilStreamEnds = false;
    try {
      const res = await fetch(`${this.endpoint}${request.path}`, init);
      if (res.status === 304 && cached) return cached.value;
      if (!res.ok) {
        throw new ApiError(
          res.status,
          await parseResponseBody(res, this.maxResponseBytes),
        );
      }
      if (request.responseMode === "binary") {
        return readBoundedResponseBody(res, this.maxResponseBytes);
      }
      if (request.responseMode === "stream") {
        if (!res.body) throw new Error("API returned an empty stream");
        keepSignalUntilStreamEnds = true;
        return managedStream(res.body, cleanup);
      }
      const value = await parseResponseBody(res, this.maxResponseBytes);
      const etag = res.headers.get("etag");
      if (cacheable && etag) this.etagCache.set(request.path, { etag, value });
      return value;
    } finally {
      if (!keepSignalUntilStreamEnds) cleanup();
    }
  }

  get(path: string, headers?: Record<string, string>): Promise<unknown> {
    return this.request({ method: "GET", path, headers });
  }

  post(path: string, body?: unknown, headers?: Record<string, string>): Promise<unknown> {
    return this.request({ method: "POST", path, body, headers });
  }

  put(path: string, body?: unknown, headers?: Record<string, string>): Promise<unknown> {
    return this.request({ method: "PUT", path, body, headers });
  }

  patch(path: string, body?: unknown, headers?: Record<string, string>): Promise<unknown> {
    return this.request({ method: "PATCH", path, body, headers });
  }

  delete(path: string, headers?: Record<string, string>): Promise<unknown> {
    return this.request({ method: "DELETE", path, headers });
  }

  upload(path: string, form: FormData, method: "POST" | "PUT" = "POST"): Promise<unknown> {
    return this.request({ method, path, form });
  }

  async stream(path: string, body?: unknown): Promise<ReadableStream<Uint8Array>> {
    return this.request({
      method: "POST",
      path,
      body,
      responseMode: "stream",
    }) as Promise<ReadableStream<Uint8Array>>;
  }

  async download(path: string, outputPath: string, force = false): Promise<void> {
    if (!force && existsSync(outputPath)) {
      throw new Error(`Output file already exists: ${outputPath}. Use --force to overwrite.`);
    }
    const stream = (await this.request({
      method: "GET",
      path,
      responseMode: "stream",
    })) as ReadableStream<Uint8Array>;
    const reader = stream.getReader();
    const source = Readable.from(
      (async function* () {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          yield value;
        }
      })(),
    );
    await pipeline(
      source,
      createWriteStream(outputPath, { flags: force ? "w" : "wx" }),
    );
  }
}

export function resolveClient(commandOrApiKey?: Command | string): ApiClient {
  const command = typeof commandOrApiKey === "object" ? commandOrApiKey : undefined;
  const explicitApiKey = typeof commandOrApiKey === "string" ? commandOrApiKey : undefined;
  const commandOptions = command?.optsWithGlobals() as {
    apiUrl?: string; token?: string; profile?: string;
  } | undefined;
  const token = explicitApiKey ?? commandOptions?.token ?? runtimeDefaults.token;
  const profile = commandOptions?.profile ?? runtimeDefaults.profileName;
  const resolved = token
    ? { apiKey: token, profileName: profile }
    : resolveApiKey({ profile });
  const endpoint = normalizeApiEndpoint(
    commandOptions?.apiUrl ?? runtimeDefaults.endpoint ?? getEndpoint(),
    commandOptions?.apiUrl ? "--api-url" : "API endpoint",
  );
  const cached = command ? commandClients.get(command) : undefined;
  if (
    cached
    && cached.endpoint === endpoint
    && cached.token === resolved.apiKey
    && cached.profileName === resolved.profileName
  ) {
    return cached;
  }
  const client = new ApiClient({
    endpoint,
    token: resolved.apiKey,
    profileName: resolved.profileName,
  });
  if (command) commandClients.set(command, client);
  return client;
}

/** @deprecated Resolve a command-scoped `ApiClient` and call `.get()` instead. */
export async function get(path: string, apiKey?: string): Promise<unknown> {
  return resolveClient(apiKey).get(path);
}

/** @deprecated Resolve a command-scoped `ApiClient` and call `.post()` instead. */
export async function post(path: string, body?: unknown, apiKey?: string): Promise<unknown> {
  return resolveClient(apiKey).post(path, body);
}

/** @deprecated Resolve a command-scoped `ApiClient` and call `.patch()` instead. */
export async function patch(path: string, body?: unknown, apiKey?: string): Promise<unknown> {
  return resolveClient(apiKey).patch(path, body);
}

/** @deprecated Resolve a command-scoped `ApiClient` and call `.put()` instead. */
export async function put(path: string, body?: unknown, apiKey?: string): Promise<unknown> {
  return resolveClient(apiKey).put(path, body);
}

/** @deprecated Resolve a command-scoped `ApiClient` and call `.delete()` instead. */
export async function del(path: string, apiKey?: string): Promise<unknown> {
  return resolveClient(apiKey).delete(path);
}

/** @deprecated Resolve a command-scoped `ApiClient` and call `.upload()` instead. */
export async function upload(
  path: string,
  filePath: string,
  fieldName = "file",
  apiKey?: string,
): Promise<unknown> {
  const form = new FormData();
  await appendFileToForm(form, fieldName, filePath);
  return resolveClient(apiKey).upload(path, form);
}

/** @deprecated Resolve a command-scoped `ApiClient` and call `.upload()` instead. */
export async function uploadMultipart(
  path: string,
  fields: Record<string, string | Blob>,
  method: "POST" | "PUT" = "POST",
  apiKey?: string,
): Promise<unknown> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return resolveClient(apiKey).upload(path, form, method);
}

/** @deprecated Resolve a command-scoped `ApiClient` and call `.download()` instead. */
export async function download(
  path: string,
  outputPath: string,
  force = false,
  apiKey?: string,
): Promise<void> {
  return resolveClient(apiKey).download(path, outputPath, force);
}
