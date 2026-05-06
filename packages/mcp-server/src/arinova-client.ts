import type { McpServerConfig } from "./config.js";
import type { ActionManifest } from "./manifest.js";
import { fetchManifest } from "./manifest.js";
import type { ToolMapping, SkippedAction } from "./tool-mapping.js";
import { mapManifestToTools } from "./tool-mapping.js";
import { ConnectionError, ActionExecutionError } from "./errors.js";
import { logger } from "./logger.js";
import type { ActionCallResult, ActionCallOptions } from "./action-types.js";

export const EXPECTED_ACTION_PROTOCOL_VERSION = "2026-05-05";

export type ConnectionState =
  | "not_connected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type ManifestState =
  | "not_loaded"
  | "loading"
  | "loaded"
  | "error";

export class ArinovaClient {
  private config: McpServerConfig;
  private connectionState: ConnectionState = "not_connected";
  private manifestState: ManifestState = "not_loaded";
  private manifest: ActionManifest | null = null;
  private manifestEtag: string | undefined;
  private toolMapping: ToolMapping | null = null;
  private lastError: string | null = null;
  private semaphore: number;
  private queue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];
  private inFlight = 0;
  private inFlightTracker = new Set<Promise<unknown>>();
  private shuttingDown = false;

  constructor(config: McpServerConfig) {
    this.config = config;
    this.semaphore = config.maxConcurrentActions;
  }

  async connect(): Promise<void> {
    if (this.connectionState === "connected") return;
    this.connectionState = "connecting";
    try {
      await this.loadManifest();
      this.connectionState = "connected";
    } catch (err) {
      this.connectionState = "disconnected";
      this.lastError = err instanceof Error ? err.message : String(err);
      throw new ConnectionError(
        `Failed to initialize HTTP action client: ${this.lastError}`,
      );
    }
  }

  async loadManifest(): Promise<ToolMapping> {
    this.manifestState = "loading";
    try {
      const result = await fetchManifest(
        this.config.apiUrl,
        this.config.botToken,
        this.manifestEtag,
      );

      if (result === "not_modified" && this.toolMapping) {
        this.manifestState = "loaded";
        return this.toolMapping;
      }

      if (result === "not_modified") {
        this.manifestState = "error";
        throw new Error("Manifest not modified but no cached mapping exists");
      }

      this.manifest = result.manifest;
      this.manifestEtag = result.etag;
      this.toolMapping = mapManifestToTools(result.manifest);
      this.manifestState = "loaded";
      return this.toolMapping;
    } catch (err) {
      this.manifestState = "error";
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async callAction(
    actionName: string,
    args: Record<string, unknown>,
    options?: Partial<ActionCallOptions>,
  ): Promise<ActionCallResult> {
    if (this.shuttingDown) {
      throw new ActionExecutionError(
        "SHUTDOWN",
        "Server is shutting down",
      );
    }

    if (this.connectionState !== "connected") {
      throw new ActionExecutionError(
        "CONNECTION_UNAVAILABLE",
        `Cannot execute action: connection state is ${this.connectionState}`,
      );
    }

    await this.acquireSemaphore();

    if (this.shuttingDown) {
      this.releaseSemaphore();
      throw new ActionExecutionError(
        "SHUTDOWN",
        "Server is shutting down",
      );
    }

    const actionPromise = this.executeAction(actionName, args, options);
    this.inFlightTracker.add(actionPromise);
    const cleanup = () => { this.inFlightTracker.delete(actionPromise); };
    actionPromise.then(cleanup, cleanup);

    return actionPromise;
  }

  private async executeAction(
    actionName: string,
    args: Record<string, unknown>,
    options?: Partial<ActionCallOptions>,
  ): Promise<ActionCallResult> {
    try {
      const timeoutMs =
        options?.timeoutMs ?? this.config.actionTimeoutMs;
      return await this.callActionHttp(actionName, args, { ...options, timeoutMs });
    } catch (err) {
      throw err;
    } finally {
      this.releaseSemaphore();
    }
  }

  private async callActionHttp(
    actionName: string,
    args: Record<string, unknown>,
    options: Partial<ActionCallOptions>,
  ): Promise<ActionCallResult> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? this.config.actionTimeoutMs;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const callId = options.callId ?? `mcp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    try {
      const res = await fetch(`${this.config.apiUrl}/api/v1/actions/call`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "action_call",
          id: callId,
          taskId: options.taskId ?? null,
          conversationId: options.conversationId ?? null,
          messageId: options.messageId ?? options.taskId ?? null,
          action: actionName,
          arguments: args,
          dryRun: options.dryRun ?? false,
          reason: options.reason ?? null,
          metadata: options.metadata ?? null,
          parentCallId: options.parentCallId ?? null,
        }),
        signal: controller.signal,
      });

      const body = await parseJsonBody(res);
      if (!res.ok) {
        const message =
          body && typeof body === "object" && "message" in body
            ? String((body as { message?: unknown }).message)
            : `HTTP action call failed (${res.status})`;
        throw new ActionExecutionError("HTTP_ACTION_CALL_FAILED", message);
      }

      return normalizeHttpActionResult(body, callId, actionName);
    } catch (err) {
      if (err instanceof ActionExecutionError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new ActionExecutionError(
          "TIMEOUT",
          `Action timed out after ${timeoutMs}ms`,
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new ActionExecutionError("HTTP_ACTION_CALL_FAILED", message);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async acquireSemaphore(): Promise<void> {
    if (this.inFlight < this.semaphore) {
      this.inFlight++;
      return;
    }

    if (this.queue.length >= this.config.actionQueueLimit) {
      throw new ActionExecutionError(
        "RATE_LIMITED",
        `Action queue is full (${this.config.actionQueueLimit}). Try again later.`,
      );
    }

    return new Promise<void>((resolve, reject) => {
      this.queue.push({ resolve, reject });
    });
  }

  private releaseSemaphore(): void {
    this.inFlight--;
    const next = this.queue.shift();
    if (next) {
      this.inFlight++;
      next.resolve();
    }
  }

  async drain(timeoutMs: number): Promise<void> {
    this.shuttingDown = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.inFlight++;
      item.resolve();
    }

    if (this.inFlightTracker.size === 0) return;

    logger.info(
      `Draining ${this.inFlightTracker.size} in-flight action(s) (timeout: ${timeoutMs}ms)`,
    );

    const pending = Promise.allSettled([...this.inFlightTracker]);
    const timer = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
    await Promise.race([pending, timer]);

    if (this.inFlightTracker.size > 0) {
      logger.warn(
        `Drain timeout: ${this.inFlightTracker.size} action(s) still in-flight; forcing disconnect`,
      );
    }
  }

  disconnect(): void {
    this.connectionState = "disconnected";
  }

  getHealthData(): Record<string, unknown> {
    return {
      process: "running",
      connection: this.connectionState,
      manifest: this.manifestState,
      manifestVersion: this.manifest?.manifestVersion ?? null,
      actionCount: this.toolMapping?.tools.length ?? 0,
      skippedActions: this.toolMapping?.skippedActions ?? [],
      queueDepth: this.queue.length,
      inFlightActions: this.inFlight,
      protocolVersion: {
        expected: EXPECTED_ACTION_PROTOCOL_VERSION,
        backend: null,
      },
      lastError: this.lastError,
    };
  }

  getManifestInfo(): Record<string, unknown> {
    return {
      state: this.manifestState,
      version: this.manifest?.manifestVersion ?? null,
      totalActions: this.manifest?.actions.length ?? 0,
      registeredTools: this.toolMapping?.tools.length ?? 0,
      skippedActions: this.toolMapping?.skippedActions ?? [],
    };
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  getManifestState(): ManifestState {
    return this.manifestState;
  }

  getToolMapping(): ToolMapping | null {
    return this.toolMapping;
  }

  getSkippedActions(): SkippedAction[] {
    return this.toolMapping?.skippedActions ?? [];
  }

  isConnected(): boolean {
    return this.connectionState === "connected";
  }

  get inFlightCount(): number {
    return this.inFlight;
  }
}

async function parseJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function normalizeHttpActionResult(
  body: unknown,
  fallbackCallId: string,
  fallbackAction: string,
): ActionCallResult {
  const value =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return {
    callId: stringField(value.id) ?? stringField(value.callId) ?? fallbackCallId,
    action: stringField(value.action) ?? fallbackAction,
    status: actionStatus(value.status),
    result: recordOrNull(value.result),
    error: recordOrNull(value.error) as ActionCallResult["error"],
    confirmation: recordOrNull(value.confirmation) as ActionCallResult["confirmation"],
    traceId: stringField(value.traceId),
    actionVersion: stringField(value.actionVersion),
    dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined,
  };
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function actionStatus(value: unknown): ActionCallResult["status"] {
  if (
    value === "success" ||
    value === "error" ||
    value === "requires_confirmation" ||
    value === "cancelled" ||
    value === "processing" ||
    value === "received" ||
    value === "validating"
  ) {
    return value;
  }
  return "error";
}

function recordOrNull(value: unknown): Record<string, unknown> | null | undefined {
  if (value === null) return null;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}
