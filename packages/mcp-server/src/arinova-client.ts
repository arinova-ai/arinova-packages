import type { McpServerConfig } from "./config.js";
import type { ActionManifest } from "./manifest.js";
import { fetchManifest } from "./manifest.js";
import type { ToolMapping, SkippedAction } from "./tool-mapping.js";
import { mapManifestToTools } from "./tool-mapping.js";
import { ConnectionError, ActionExecutionError } from "./errors.js";
import { logger } from "./logger.js";
import type { ActionCallResult, ActionCallOptions } from "./action-types.js";
import { randomUUID } from "node:crypto";
import { httpRequest, HttpRequestError } from "./http.js";

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
  private manifestLoadPromise: Promise<ToolMapping> | null = null;
  private lastError: string | null = null;
  private semaphore: number;
  private queue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  private inFlight = 0;
  private inFlightTracker = new Set<Promise<unknown>>();
  private shuttingDown = false;
  private activeRequests = new Set<AbortController>();

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
    if (this.manifestLoadPromise) return this.manifestLoadPromise;
    const loadPromise = this.loadManifestLimited();
    this.manifestLoadPromise = loadPromise;
    this.inFlightTracker.add(loadPromise);
    const cleanup = () => {
      this.inFlightTracker.delete(loadPromise);
      if (this.manifestLoadPromise === loadPromise) {
        this.manifestLoadPromise = null;
      }
    };
    loadPromise.then(cleanup, cleanup);
    return loadPromise;
  }

  private async loadManifestLimited(): Promise<ToolMapping> {
    if (this.shuttingDown) {
      throw new ActionExecutionError("SHUTDOWN", "Server is shutting down");
    }
    await this.acquireSemaphore();
    if (this.shuttingDown) {
      this.releaseSemaphore();
      throw new ActionExecutionError("SHUTDOWN", "Server is shutting down");
    }
    this.manifestState = "loading";
    try {
      let result = await this.fetchCurrentManifest(this.manifestEtag);

      if (result === "not_modified" && this.toolMapping) {
        this.manifestState = "loaded";
        return this.toolMapping;
      }

      if (result === "not_modified") {
        this.manifestEtag = undefined;
        result = await this.fetchCurrentManifest();
        if (result === "not_modified") {
          throw new Error("Manifest returned 304 without a cached mapping");
        }
      }

      const mapping = mapManifestToTools(result.manifest);
      this.manifest = result.manifest;
      this.toolMapping = mapping;
      this.manifestEtag = result.etag;
      this.manifestState = "loaded";
      return this.toolMapping;
    } catch (err) {
      this.manifestState = "error";
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      this.releaseSemaphore();
    }
  }

  async callAction(
    actionName: string,
    args: Record<string, unknown>,
    options?: Partial<ActionCallOptions>,
    maxRequestBytes?: number,
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

    const actionPromise = this.executeAction(
      actionName,
      args,
      options,
      maxRequestBytes,
    );
    this.inFlightTracker.add(actionPromise);
    const cleanup = () => { this.inFlightTracker.delete(actionPromise); };
    actionPromise.then(cleanup, cleanup);

    return actionPromise;
  }

  private async executeAction(
    actionName: string,
    args: Record<string, unknown>,
    options?: Partial<ActionCallOptions>,
    maxRequestBytes?: number,
  ): Promise<ActionCallResult> {
    try {
      const timeoutMs =
        options?.timeoutMs ?? this.config.actionTimeoutMs;
      return await this.callActionHttp(
        actionName,
        args,
        { ...options, timeoutMs },
        maxRequestBytes,
      );
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
    maxRequestBytes?: number,
  ): Promise<ActionCallResult> {
    const timeoutMs = options.timeoutMs ?? this.config.actionTimeoutMs;
    const callId = options.callId ?? `mcp_${randomUUID()}`;
    const payload = {
      type: "action_call",
      id: callId,
      taskId: options.taskId ?? null,
      conversationId: options.conversationId ?? null,
      messageId: options.messageId ?? null,
      action: actionName,
      arguments: args,
      dryRun: options.dryRun ?? false,
      reason: options.reason ?? null,
      metadata: options.metadata ?? null,
      parentCallId: options.parentCallId ?? null,
    };
    const bodyText = JSON.stringify(payload);
    const requestBytes = Buffer.byteLength(bodyText, "utf8");
    if (maxRequestBytes && requestBytes > maxRequestBytes) {
      throw new ActionExecutionError(
        "ARGUMENTS_TOO_LARGE",
        `Action call envelope size ${requestBytes} exceeds limit ${maxRequestBytes}`,
        { callId },
      );
    }
    const controller = this.createRequestController();

    try {
      const res = await httpRequest(`${this.config.apiUrl}/api/v1/actions/call`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.botToken}`,
          "Content-Type": "application/json",
        },
        body: bodyText,
        signal: controller.signal,
        timeoutMs,
      });

      const body = await parseJsonBody(res);
      if (!res.ok) {
        const error = actionErrorFromBody(body);
        throw new ActionExecutionError(
          error.code ?? "HTTP_ACTION_CALL_FAILED",
          error.message ?? `HTTP action call failed (${res.status})`,
          { statusCode: res.status, details: error.details, callId },
        );
      }

      return normalizeHttpActionResult(body, callId, actionName);
    } catch (err) {
      if (err instanceof ActionExecutionError) throw err;
      if (err instanceof HttpRequestError && err.code === "TIMEOUT") {
        throw new ActionExecutionError(
          "TIMEOUT",
          `Action timed out after ${timeoutMs}ms`,
          { callId },
        );
      }
      if (err instanceof HttpRequestError && err.code === "ABORTED") {
        throw new ActionExecutionError("ABORTED", "Action request was aborted", {
          callId,
        });
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new ActionExecutionError("HTTP_ACTION_CALL_FAILED", message, {
        callId,
      });
    } finally {
      this.activeRequests.delete(controller);
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
      const item = {
        resolve: () => {
          clearTimeout(item.timer);
          resolve();
        },
        reject,
        timer: undefined as unknown as ReturnType<typeof setTimeout>,
      };
      item.timer = setTimeout(() => {
        const index = this.queue.indexOf(item);
        if (index >= 0) this.queue.splice(index, 1);
        reject(
          new ActionExecutionError(
            "QUEUE_TIMEOUT",
            `Action waited more than ${this.config.actionQueueWaitMs}ms for capacity`,
          ),
        );
      }, this.config.actionQueueWaitMs);
      item.timer.unref?.();
      this.queue.push(item);
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
      clearTimeout(item.timer);
      item.reject(new ActionExecutionError("SHUTDOWN", "Server is shutting down"));
    }

    if (this.inFlightTracker.size === 0) return;

    logger.info(
      `Draining ${this.inFlightTracker.size} in-flight action(s) (timeout: ${timeoutMs}ms)`,
    );

    const pending = Promise.allSettled([...this.inFlightTracker]);
    let timerHandle: ReturnType<typeof setTimeout> | undefined;
    const timer = new Promise<void>((resolve) => {
      timerHandle = setTimeout(resolve, timeoutMs);
      timerHandle.unref?.();
    });
    await Promise.race([pending, timer]);
    if (timerHandle) clearTimeout(timerHandle);

    if (this.inFlightTracker.size > 0) {
      logger.warn(
        `Drain timeout: ${this.inFlightTracker.size} action(s) still in-flight; forcing disconnect`,
      );
    }
  }

  disconnect(): void {
    this.connectionState = "disconnected";
    for (const controller of this.activeRequests) controller.abort();
    this.activeRequests.clear();
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      clearTimeout(item.timer);
      item.reject(new ActionExecutionError("DISCONNECTED", "Client disconnected"));
    }
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
        backend: this.manifest?.manifestVersion ?? null,
        compatible:
          this.manifest?.manifestVersion === EXPECTED_ACTION_PROTOCOL_VERSION,
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

  private createRequestController(): AbortController {
    const controller = new AbortController();
    this.activeRequests.add(controller);
    return controller;
  }

  private async fetchCurrentManifest(etag?: string) {
    const controller = this.createRequestController();
    try {
      return await fetchManifest(this.config.apiUrl, this.config.botToken, etag, {
        timeoutMs: this.config.manifestTimeoutMs,
        signal: controller.signal,
      });
    } finally {
      this.activeRequests.delete(controller);
    }
  }
}

async function parseJsonBody(res: { body: string }): Promise<unknown> {
  const text = res.body;
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function actionErrorFromBody(body: unknown): {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
} {
  if (!body || typeof body !== "object") return {};
  const value = body as Record<string, unknown>;
  const nested =
    value.error && typeof value.error === "object"
      ? (value.error as Record<string, unknown>)
      : value;
  return {
    code: stringField(nested.code),
    message: stringField(nested.message),
    details: recordOrNull(nested.details) ?? undefined,
  };
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
