import type { Command } from "commander";
import { resolveApiKey, getEndpoint } from "./config.js";
import { ApiClient, type HttpMethod } from "./client.js";
import { printResult } from "./output.js";

export function getOpts(cmd: Command): {
  token: string;
  apiUrl: string;
  profileName: string;
} {
  const opts = cmd.optsWithGlobals();
  const { apiKey, profileName } = resolveApiKey({
    token: opts.token as string | undefined,
    profile: opts.profile as string | undefined,
  });
  const apiUrl = ((opts.apiUrl as string | undefined) ?? getEndpoint()).replace(
    /\/+$/,
    "",
  );
  return { token: apiKey, apiUrl, profileName };
}

export async function apiCall(opts: {
  method: string;
  url: string;
  token: string;
  body?: unknown;
  headers?: Record<string, string>;
}): Promise<unknown> {
  const parsed = new URL(opts.url);
  const client = new ApiClient({
    endpoint: parsed.origin,
    token: opts.token,
  });
  return client.request({
    method: opts.method as HttpMethod,
    path: `${parsed.pathname}${parsed.search}`,
    body: opts.body,
    headers: opts.headers,
  });
}

export function output(data: unknown): void {
  printResult(data);
}
