/** Typed error thrown by all SDK requests. */
export class ArinovaError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ArinovaError";
    this.status = status;
    this.code = code;
  }
}

export interface RequestInitWithToken extends RequestInit {
  /** Bearer token to attach as Authorization. */
  token?: string;
}

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
export async function request<T>(url: string, init: RequestInitWithToken = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    const error = parseError(body, `Request failed (${res.status})`);
    throw new ArinovaError(error.message, res.status, error.code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function stripTrailingSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

export function parseScopes(scope: string | undefined | null): string[] {
  return (scope ?? "").split(/[ ,]+/).filter(Boolean);
}
