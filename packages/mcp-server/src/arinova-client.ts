import type { McpServerConfig } from "./config.js";
import { ActionExecutionError, ConnectionError } from "./errors.js";
import { logger } from "./logger.js";
import type { ActionCallOptions, ActionCallResult } from "./action-types.js";
import type { SkippedAction, ToolMapping } from "./tool-mapping.js";
import { ActionCaller } from "./action-call.js";
import { RequestLimiter } from "./limiter.js";
import { ManifestCache, type ManifestState } from "./manifest-cache.js";

export const EXPECTED_ACTION_PROTOCOL_VERSION = "2026-05-05";

export type ConnectionState =
  | "not_connected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type { ManifestState } from "./manifest-cache.js";

export class ArinovaClient {
  private connectionState: ConnectionState = "not_connected";
  private lastError: string | null = null;
  private readonly limiter: RequestLimiter;
  private readonly manifestCache: ManifestCache;
  private readonly actionCaller: ActionCaller;
  private readonly inFlightTracker = new Set<Promise<unknown>>();
  private shuttingDown = false;

  constructor(private readonly config: McpServerConfig) {
    this.limiter = new RequestLimiter(
      config.maxConcurrentActions,
      config.actionQueueLimit,
      config.actionQueueWaitMs,
    );
    this.manifestCache = new ManifestCache(
      config,
      this.limiter,
      () => this.shuttingDown,
    );
    this.actionCaller = new ActionCaller(config);
  }

  async connect(): Promise<void> {
    if (this.connectionState === "connected") return;
    this.connectionState = "connecting";
    try {
      await this.loadManifest();
      this.connectionState = "connected";
    } catch (error) {
      this.connectionState = "disconnected";
      this.lastError = error instanceof Error ? error.message : String(error);
      throw new ConnectionError(
        `Failed to initialize HTTP action client: ${this.lastError}`,
      );
    }
  }

  loadManifest(): Promise<ToolMapping> {
    return this.track(this.manifestCache.load());
  }

  async callAction(
    actionName: string,
    args: Record<string, unknown>,
    options?: Partial<ActionCallOptions>,
    maxRequestBytes?: number,
  ): Promise<ActionCallResult> {
    this.assertActionAvailable();
    await this.limiter.acquire();
    if (this.shuttingDown) {
      this.limiter.release();
      throw new ActionExecutionError("SHUTDOWN", "Server is shutting down");
    }

    const actionPromise = (async () => {
      try {
        return await this.actionCaller.call(
          actionName,
          args,
          {
            ...options,
            timeoutMs: options?.timeoutMs ?? this.config.actionTimeoutMs,
          },
          maxRequestBytes,
        );
      } finally {
        this.limiter.release();
      }
    })();
    return this.track(actionPromise);
  }

  async drain(timeoutMs: number): Promise<void> {
    this.shuttingDown = true;
    this.limiter.rejectQueued("SHUTDOWN", "Server is shutting down");
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
    this.actionCaller.abort();
    this.manifestCache.abort();
    this.limiter.rejectQueued("DISCONNECTED", "Client disconnected");
  }

  getHealthData(): Record<string, unknown> {
    const manifest = this.manifestCache.currentManifest;
    const mapping = this.manifestCache.toolMapping;
    return {
      process: "running",
      connection: this.connectionState,
      manifest: this.manifestCache.manifestState,
      manifestVersion: manifest?.manifestVersion ?? null,
      actionCount: mapping?.tools.length ?? 0,
      skippedActions: mapping?.skippedActions ?? [],
      queueDepth: this.limiter.queueDepth,
      inFlightActions: this.limiter.inFlightCount,
      protocolVersion: {
        expected: EXPECTED_ACTION_PROTOCOL_VERSION,
        backend: null,
        compatible: null,
      },
      lastError: this.manifestCache.lastError ?? this.lastError,
    };
  }

  getManifestInfo(): Record<string, unknown> {
    const manifest = this.manifestCache.currentManifest;
    const mapping = this.manifestCache.toolMapping;
    return {
      state: this.manifestCache.manifestState,
      version: manifest?.manifestVersion ?? null,
      totalActions: manifest?.actions.length ?? 0,
      registeredTools: mapping?.tools.length ?? 0,
      skippedActions: mapping?.skippedActions ?? [],
    };
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  getManifestState(): ManifestState {
    return this.manifestCache.manifestState;
  }

  getToolMapping(): ToolMapping | null {
    return this.manifestCache.toolMapping;
  }

  getSkippedActions(): SkippedAction[] {
    return this.manifestCache.toolMapping?.skippedActions ?? [];
  }

  isConnected(): boolean {
    return this.connectionState === "connected";
  }

  get inFlightCount(): number {
    return this.limiter.inFlightCount;
  }

  private assertActionAvailable(): void {
    if (this.shuttingDown) {
      throw new ActionExecutionError("SHUTDOWN", "Server is shutting down");
    }
    if (this.connectionState !== "connected") {
      throw new ActionExecutionError(
        "CONNECTION_UNAVAILABLE",
        `Cannot execute action: connection state is ${this.connectionState}`,
      );
    }
  }

  private track<T>(promise: Promise<T>): Promise<T> {
    this.inFlightTracker.add(promise);
    const cleanup = () => this.inFlightTracker.delete(promise);
    promise.then(cleanup, cleanup);
    return promise;
  }
}
