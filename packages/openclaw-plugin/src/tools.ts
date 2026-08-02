import type { CoreConfig } from "./types.js";
import { resolveArinovaChatAccount } from "./accounts.js";
import { getArinovaChatRuntime } from "./runtime.js";

// ── Helpers ──

export function resolveAccount(accountId?: string) {
  const cfg = getArinovaChatRuntime().config.current() as CoreConfig;
  return resolveArinovaChatAccount({ cfg, accountId });
}

export async function apiCall(opts: {
  method: string;
  url: string;
  token: string;
  body?: unknown;
}): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
  };
  const init: RequestInit = { method: opts.method, headers, signal: AbortSignal.timeout(30_000) };

  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(opts.url, init);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
