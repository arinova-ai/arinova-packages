import type { Command } from "commander";
import { getApiKey, getEndpoint } from "./config.js";

export function getOpts(cmd: Command): { token: string; apiUrl: string } {
  const opts = cmd.optsWithGlobals();

  // Priority: --token flag > config file apiKey > error
  let token = opts.token as string | undefined;
  if (!token) {
    token = getApiKey();
  }
  if (!token) {
    console.error("Error: No token provided. Use --token flag or run: arinova auth set-key <key>");
    process.exit(1);
  }

  const apiUrl = (opts.apiUrl as string) ?? getEndpoint();

  return { token, apiUrl };
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
  const init: RequestInit = { method: opts.method, headers };

  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(opts.url, init);
  const text = await res.text();

  if (!res.ok) {
    console.error(`Error ${res.status}: ${text.slice(0, 500)}`);
    process.exit(1);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
