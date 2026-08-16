import type { McpServerConfig } from "./config.js";
import { ActionExecutionError } from "./errors.js";
import { fetchManifest, type ActionManifest } from "./manifest.js";
import { mapManifestToTools, type ToolMapping } from "./tool-mapping.js";
import { RequestLimiter } from "./limiter.js";

export type ManifestState = "not_loaded" | "loading" | "loaded" | "error";

/** Owns manifest request coalescing, ETag revalidation, mapping, and request aborts. */
export class ManifestCache {
  private state: ManifestState = "not_loaded";
  private manifest: ActionManifest | null = null;
  private etag: string | undefined;
  private mapping: ToolMapping | null = null;
  private loadPromise: Promise<ToolMapping> | null = null;
  private error: string | null = null;
  private readonly activeRequests = new Set<AbortController>();

  constructor(
    private readonly config: Pick<McpServerConfig, "apiUrl" | "botToken" | "manifestTimeoutMs">,
    private readonly limiter: RequestLimiter,
    private readonly isShuttingDown: () => boolean,
  ) {}

  load(): Promise<ToolMapping> {
    if (this.loadPromise) return this.loadPromise;
    const promise = this.loadLimited();
    this.loadPromise = promise;
    const cleanup = () => {
      if (this.loadPromise === promise) this.loadPromise = null;
    };
    promise.then(cleanup, cleanup);
    return promise;
  }

  abort(): void {
    for (const controller of this.activeRequests) controller.abort();
    this.activeRequests.clear();
  }

  get manifestState(): ManifestState {
    return this.state;
  }

  get currentManifest(): ActionManifest | null {
    return this.manifest;
  }

  get toolMapping(): ToolMapping | null {
    return this.mapping;
  }

  get lastError(): string | null {
    return this.error;
  }

  private async loadLimited(): Promise<ToolMapping> {
    this.assertRunning();
    await this.limiter.acquire();
    if (this.isShuttingDown()) {
      this.limiter.release();
      throw new ActionExecutionError("SHUTDOWN", "Server is shutting down");
    }
    this.state = "loading";
    try {
      let result = await this.fetch(this.etag);
      if (result === "not_modified" && this.mapping) {
        this.state = "loaded";
        return this.mapping;
      }
      if (result === "not_modified") {
        this.etag = undefined;
        result = await this.fetch();
        if (result === "not_modified") {
          throw new Error("Manifest returned 304 without a cached mapping");
        }
      }
      this.mapping = mapManifestToTools(result.manifest);
      this.manifest = result.manifest;
      this.etag = result.etag;
      this.state = "loaded";
      return this.mapping;
    } catch (error) {
      this.state = "error";
      this.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.limiter.release();
    }
  }

  private assertRunning(): void {
    if (this.isShuttingDown()) {
      throw new ActionExecutionError("SHUTDOWN", "Server is shutting down");
    }
  }

  private async fetch(etag?: string) {
    const controller = new AbortController();
    this.activeRequests.add(controller);
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
