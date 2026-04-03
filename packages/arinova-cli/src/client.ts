import { getApiKey, getEndpoint } from "./config.js";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API error ${status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
}

function headers(): Record<string, string> {
  const key = getApiKey();
  if (!key) {
    throw new Error("No API key configured. Run: arinova auth set-key <key>");
  }
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function url(path: string): string {
  return `${getEndpoint()}${path}`;
}

async function handleResponse(res: Response): Promise<unknown> {
  const body = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = body;
  }
  if (!res.ok) {
    throw new ApiError(res.status, parsed);
  }
  return parsed;
}

export async function get(path: string): Promise<unknown> {
  const res = await fetch(url(path), { method: "GET", headers: headers() });
  return handleResponse(res);
}

export async function post(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(url(path), {
    method: "POST",
    headers: headers(),
    body: body != null ? JSON.stringify(body) : undefined,
  });
  return handleResponse(res);
}

export async function patch(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(url(path), {
    method: "PATCH",
    headers: headers(),
    body: body != null ? JSON.stringify(body) : undefined,
  });
  return handleResponse(res);
}

export async function put(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(url(path), {
    method: "PUT",
    headers: headers(),
    body: body != null ? JSON.stringify(body) : undefined,
  });
  return handleResponse(res);
}

export async function del(path: string): Promise<unknown> {
  const res = await fetch(url(path), { method: "DELETE", headers: headers() });
  return handleResponse(res);
}

export async function upload(
  path: string,
  filePath: string,
  fieldName: string = "file",
): Promise<unknown> {
  const key = getApiKey();
  if (!key) {
    throw new Error("No API key configured. Run: arinova auth set-key <key>");
  }

  const fileData = readFileSync(filePath);
  const blob = new Blob([fileData]);
  const form = new FormData();
  form.append(fieldName, blob, basename(filePath));

  const res = await fetch(url(path), {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  return handleResponse(res);
}

export async function uploadMultipart(
  path: string,
  fields: Record<string, string | Blob>,
  method: "POST" | "PUT" = "POST",
): Promise<unknown> {
  const key = getApiKey();
  if (!key) {
    throw new Error("No API key configured. Run: arinova auth set-key <key>");
  }

  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    form.append(k, v);
  }

  const res = await fetch(url(path), {
    method,
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  return handleResponse(res);
}
