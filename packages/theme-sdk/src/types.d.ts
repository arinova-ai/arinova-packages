/**
 * Arinova Office Theme SDK — TypeScript Type Definitions
 *
 * These mirror the runtime bridge (`src/bridge.js`, kept in sync with the
 * server's `SDK_BRIDGE_STUB`). Only the members below exist at runtime.
 */

export type AgentStatus = "working" | "idle" | "blocked" | "collaborating" | "unbound";

export interface AgentActivity {
  /** Preformatted display string for the activity time (NOT an ISO timestamp). */
  time: string;
  text: string;
}

export interface AgentTokenUsage {
  /** Context window usage percentage, e.g. "42%" */
  contextPercent?: string;
}

export interface Agent {
  id: string;
  name: string;
  /** Agent description / role */
  role: string;
  /** Display emoji (default: "🤖") */
  emoji: string;
  /** Accent color (CSS hex) */
  color: string;
  status: AgentStatus;
  online?: boolean;
  /** Current task title as a plain string (or undefined if idle) */
  currentTask?: string;
  /**
   * Epoch milliseconds when the current task started, sent live with every
   * `agents:update`. Compute elapsed time as `Date.now() - taskStartedAt`.
   */
  taskStartedAt?: number;
  recentActivity: AgentActivity[];
  /** Model identifier, e.g. "claude-opus-4-6" */
  model?: string;
  tokenUsage?: AgentTokenUsage;
  /** @deprecated Not populated by the host — always undefined. Use `taskStartedAt`. */
  sessionDurationMs?: number;
  /** @deprecated Not populated by the host — always undefined. */
  currentToolDetail?: string;
}

export interface User {
  id: string;
  name: string;
  username: string;
}

export interface ConnectedAgent {
  id: string;
  name: string;
  /** Avatar URL when the connected agent has one. */
  avatarUrl?: string;
}

export interface Binding {
  slotIndex: number;
  agentId: string;
  agentName?: string;
}

export interface Size {
  width: number;
  height: number;
}

export interface ArinovaSDK {
  /** All agents in the office (enriched with state) */
  readonly agents: Agent[];

  /** Subscribe to agent list changes. Returns unsubscribe function. */
  onAgentsChange(callback: (agents: Agent[]) => void): () => void;

  /** All connected agents available for binding */
  readonly connectedAgents: ConnectedAgent[];
  /** Current slot-to-agent bindings */
  readonly bindings: Binding[];
  /** Bind an agent to a slot */
  bindAgent(slotIndex: number, agentId: string): void;
  /** Unbind an agent from a slot */
  unbindAgent(slotIndex: number): void;
  /** Subscribe to binding changes. Returns unsubscribe function. */
  onBindingsChange(callback: (bindings: Binding[]) => void): () => void;
  /** Subscribe to connected-agent list changes. Returns unsubscribe function. */
  onConnectedAgentsChange(callback: (connectedAgents: ConnectedAgent[]) => void): () => void;

  /**
   * Resolve a relative path to a full asset URL. Asset filenames are a single
   * flat segment (no subdirectories) served same-origin — e.g. `assetUrl("bg.png")`.
   */
  assetUrl(relativePath: string): string;
  /** Find an office agent by id. */
  getAgent(id: string): Agent | undefined;
  /** Fetch and parse a JSON asset from this theme's asset base. */
  loadJSON<T = unknown>(relativePath: string): Promise<T>;
  /** Convenience accessor for the first agent, or null when none exist. */
  readonly agent: Agent | null;

  /** Tell the host to select (highlight) an agent */
  selectAgent(agentId: string): void;
  /** Tell the host to open an agent's chat */
  openChat(agentId: string): void;
  /** Tell the host to navigate to a path */
  navigate(path: string): void;

  /**
   * Subscribe to viewport size changes. This is the ONLY resize mechanism —
   * the runtime does not call a `resize()` module hook. Returns unsubscribe.
   */
  onResize(callback: (size: Size) => void): () => void;

  /** Viewport width (px) */
  readonly width: number;
  /** Viewport height (px) */
  readonly height: number;
  /** Whether the device is mobile */
  readonly isMobile: boolean;
  /** Device pixel ratio */
  readonly pixelRatio: number;
  /** Current user info (null until the host `init` message arrives) */
  readonly user: User | null;
  /** Theme identifier */
  readonly themeId: string;
  /** Theme manifest version supplied by the host. */
  readonly themeVersion: string;
}

/**
 * Theme module interface — what your theme.js should `export default`.
 *
 * The runtime invokes ONLY `init`. There are no `resize()` / `destroy()`
 * lifecycle hooks — subscribe to viewport changes via `sdk.onResize(cb)`.
 */
export interface ThemeModule {
  /** Called once when the theme is initialized. */
  init(sdk: ArinovaSDK, container: HTMLElement): void | Promise<void>;
  /** @deprecated NOT called by the runtime. Use `sdk.onResize(cb)` instead. */
  resize?(width: number, height: number): void;
  /** @deprecated NOT called by the runtime. */
  destroy?(): void;
}

/** Author block in a theme manifest (theme.json). */
export interface ThemeAuthor {
  name: string;
  /** Creator id (owner handle). */
  id: string;
}

/**
 * Theme manifest — the shape of `theme.json`.
 *
 * Validation enforced on upload:
 *  - `id`: kebab-case matching `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`, ≤100 chars,
 *    globally unique & permanently owned by the first author to claim it.
 *  - `version`: semver `X.Y.Z`.
 *  - `name`: 1–100 characters.
 *  - `preview` / `entry`: relative, path-safe (no leading `/`, no `..`, no `:`),
 *    and must exist as a flat entry at the bundle (zip) root.
 *  - `price`: integer ≥ 0 (points; 0 = free).
 */
export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  /** Entry JS file — the runtime always loads `theme.js`, so keep this `"theme.js"`. */
  entry: string;
  /** Preview image at the bundle root, e.g. "preview.png". Required by upload. */
  preview?: string;
  description?: string;
  author?: ThemeAuthor;
  tags?: string[];
  /** Marketplace license. Defaults to "standard". */
  license?: "standard" | "exclusive";
  /** Price in points (integer ≥ 0). 0 or omitted = free. */
  price?: number;
  /** Renderer kind. Defaults to "iframe". */
  renderer?: string;
  /**
   * Maximum number of agent slots the theme exposes; `Binding.slotIndex` runs
   * `0..maxAgents-1`. If omitted, the server derives it from `zones` capacity,
   * else defaults to 1.
   */
  maxAgents?: number;
}

declare global {
  interface Window {
    /** Register your theme module with the runtime bridge (called for you by the runtime HTML). */
    __ARINOVA_REGISTER_THEME__: (themeModule: { default?: ThemeModule } | ThemeModule) => void;
    /** Report a sanitized pre-init/runtime loading failure to the host. */
    __ARINOVA_REPORT_THEME_ERROR__: (stage: string, error: unknown) => void;
  }
}
