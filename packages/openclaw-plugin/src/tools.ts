import type { CoreConfig } from "./types.js";
import { resolveArinovaChatAccount } from "./accounts.js";
import { getArinovaChatRuntime } from "./runtime.js";
import { parseJsonOrText, readBoundedText } from "./http.js";
import { assertTrustedApiRequestUrl } from "./api-endpoint.js";

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
  form?: FormData;
}): Promise<unknown> {
  assertTrustedApiRequestUrl(opts.url);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
  };
  const init: RequestInit = { method: opts.method, headers, signal: AbortSignal.timeout(30_000) };

  if (opts.form) {
    init.body = opts.form;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(opts.url, init);
  const text = await readBoundedText(res);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  return parseJsonOrText(text);
}
