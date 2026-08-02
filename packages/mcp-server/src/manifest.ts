import { ManifestError } from "./errors.js";
import { logger } from "./logger.js";
import { httpRequest, HttpRequestError } from "./http.js";

export interface ActionDefinition {
  name: string;
  version: string;
  description?: string;
  promptSummary?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  confirmation?: string;
  maxExecutionMs?: number;
  maxArgumentsBytes?: number;
  deprecated?: boolean;
  replacementAction?: string;
  removed?: boolean;
}

export interface ActionManifest {
  manifestVersion: string;
  actions: ActionDefinition[];
}

const MAX_MANIFEST_BYTES = 10 * 1024 * 1024;

export async function fetchManifest(
  apiUrl: string,
  botToken: string,
  etag?: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ manifest: ActionManifest; etag?: string } | "not_modified"> {
  const url = `${apiUrl}/api/v1/actions/agent-manifest`;
  logger.info(`Fetching manifest from ${url}`);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${botToken}`,
    Accept: "application/json",
  };
  if (etag) {
    headers["If-None-Match"] = etag;
  }

  let res;
  try {
    res = await httpRequest(url, {
      headers,
      timeoutMs: options.timeoutMs ?? 15_000,
      signal: options.signal,
      maxResponseBytes: MAX_MANIFEST_BYTES,
    });
  } catch (err) {
    const reason =
      err instanceof HttpRequestError && err.code === "TIMEOUT"
        ? `Manifest request timed out after ${options.timeoutMs ?? 15_000}ms`
        : err instanceof Error
          ? err.message
          : String(err);
    throw new ManifestError(
      `Failed to reach manifest endpoint: ${reason}`,
    );
  }

  if (res.status === 304) {
    return "not_modified";
  }

  if (!res.ok) {
    throw new ManifestError(
      `Manifest fetch failed: HTTP ${res.status} ${res.statusText}${res.body ? ` — ${res.body.slice(0, 200)}` : ""}`,
      res.status,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(res.body) as unknown;
  } catch {
    throw new ManifestError("Manifest response is not valid JSON");
  }

  const manifest = validateManifest(data);
  const newEtag = res.headers.get("etag") ?? undefined;

  logger.info(
    `Manifest loaded: version=${manifest.manifestVersion}, actions=${manifest.actions.length}`,
  );

  return { manifest, etag: newEtag };
}

function validateManifest(data: unknown): ActionManifest {
  if (!data || typeof data !== "object") {
    throw new ManifestError("Manifest is not an object");
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.manifestVersion !== "string") {
    throw new ManifestError("Manifest missing manifestVersion");
  }

  if (!Array.isArray(obj.actions)) {
    throw new ManifestError("Manifest missing actions array");
  }

  const actions: ActionDefinition[] = [];
  for (const raw of obj.actions) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    if (typeof a.name !== "string") continue;

    actions.push({
      name: a.name,
      version: typeof a.version === "string" ? a.version : "0.0.0",
      description:
        typeof a.description === "string" ? a.description : undefined,
      promptSummary:
        typeof a.promptSummary === "string" ? a.promptSummary : undefined,
      inputSchema:
        a.inputSchema && typeof a.inputSchema === "object"
          ? (a.inputSchema as Record<string, unknown>)
          : undefined,
      outputSchema:
        a.outputSchema && typeof a.outputSchema === "object"
          ? (a.outputSchema as Record<string, unknown>)
          : undefined,
      confirmation:
        typeof a.confirmation === "string" ? a.confirmation : undefined,
      maxExecutionMs:
        typeof a.maxExecutionMs === "number" ? a.maxExecutionMs : undefined,
      maxArgumentsBytes:
        typeof a.maxArgumentsBytes === "number"
          ? a.maxArgumentsBytes
          : undefined,
      deprecated: a.deprecated === true,
      replacementAction:
        typeof a.replacementAction === "string"
          ? a.replacementAction
          : undefined,
      removed: a.removed === true,
    });
  }

  return { manifestVersion: obj.manifestVersion as string, actions };
}
