import { ArinovaAgent } from "@arinova-ai/agent-sdk";
import type { ActionCallResult, ActionCallOptions } from "@arinova-ai/agent-sdk";
import type { McpServerConfig } from "./config.js";
import type { ActionManifest } from "./manifest.js";
import { fetchManifest } from "./manifest.js";
import type { ToolMapping, SkippedAction } from "./tool-mapping.js";
import { mapManifestToTools } from "./tool-mapping.js";
import { ConnectionError, ActionExecutionError } from "./errors.js";
import { logger } from "./logger.js";

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
  private agent: ArinovaAgent;
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
  private shuttingDown = false;

  constructor(config: McpServerConfig) {
    this.config = config;
    this.semaphore = config.maxConcurrentActions;

    this.agent = new ArinovaAgent({
      serverUrl: config.serverUrl,
      botToken: config.botToken,
    });

    this.agent.on("connected", () => {
      this.connectionState = "connected";
      logger.info("WebSocket connected");
    });

    this.agent.on("disconnected", () => {
      if (this.connectionState === "connected") {
        this.connectionState = "reconnecting";
        logger.warn("WebSocket disconnected; reconnecting");
      }
    });

    this.agent.on("error", ((err: Error) => {
      this.lastError = err.message;
      logger.error(`Agent error: ${this.lastError}`);
    }) as () => void);

    this.agent.on("auth_failed", () => {
      this.lastError = "Authentication failed";
      this.connectionState = "disconnected";
      logger.error(this.lastError);
    });
  }

  async connect(): Promise<void> {
    if (this.connectionState === "connected") return;
    this.connectionState = "connecting";
    try {
      await this.agent.connect();
      this.connectionState = "connected";
    } catch (err) {
      this.connectionState = "disconnected";
      this.lastError = err instanceof Error ? err.message : String(err);
      throw new ConnectionError(
        `Failed to connect: ${this.lastError}`,
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
    try {
      const timeoutMs =
        options?.timeoutMs ?? this.config.actionTimeoutMs;

      const result = await this.agent.callAction(actionName, args, {
        ...options,
        timeoutMs,
      });

      return result;
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes("Not connected")
      ) {
        this.connectionState = "reconnecting";
        throw new ActionExecutionError(
          "CONNECTION_LOST",
          "WebSocket disconnected during action execution",
        );
      }
      throw err;
    } finally {
      this.releaseSemaphore();
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

  disconnect(): void {
    this.shuttingDown = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      item.reject(new ActionExecutionError("SHUTDOWN", "Server is shutting down"));
    }
    this.agent.disconnect();
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
