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

/** fetch wrapper: JSON in/out, Bearer auth, `{error, error_description}` parsing. */
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
    const body = (await res.json().catch(() => ({}))) as Record<string, string>;
    throw new ArinovaError(
      body.error_description ?? body.error ?? `Request failed (${res.status})`,
      res.status,
      body.error,
    );
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
