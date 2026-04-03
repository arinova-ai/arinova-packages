/**
 * Arinova Office Theme SDK — TypeScript Type Definitions
 */

export type AgentStatus = "working" | "idle" | "blocked" | "collaborating" | "unbound";

export interface AgentActivity {
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
  /** Current task title (or undefined if idle) */
  currentTask?: string;
  recentActivity: AgentActivity[];
  /** Model identifier, e.g. "claude-opus-4-6" */
  model?: string;
  tokenUsage?: AgentTokenUsage;
  sessionDurationMs?: number;
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
  avatarUrl?: string;
}

export interface Binding {
  slotIndex: number;
  agentId: string;
  agentName?: string;
}

export interface ArinovaSDK {
  /** All agents in the office (enriched with state) */
  readonly agents: Agent[];
  /** First agent or null (convenience getter) */
  readonly agent: Agent | null;

  /** Subscribe to agent list changes. Returns unsubscribe function. */
  onAgentsChange(callback: (agents: Agent[]) => void): () => void;
  /** Find agent by ID */
  getAgent(id: string): Agent | undefined;

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

  /** Resolve a relative path to a full asset URL */
  assetUrl(relativePath: string): string;
  /** Load and parse a JSON asset */
  loadJSON<T = unknown>(relativePath: string): Promise<T>;
  /** Load a custom font from an asset */
  loadFont(name: string, relativePath: string): Promise<void>;

  /** Tell the host to select (highlight) an agent */
  selectAgent(agentId: string): void;
  /** Tell the host to open an agent's chat */
  openChat(agentId: string): void;
  /** Tell the host to navigate to a path */
  navigate(path: string): void;
  /** Emit a custom event to the host */
  emit(event: string, data?: unknown): void;

  /** Viewport width (px) */
  readonly width: number;
  /** Viewport height (px) */
  readonly height: number;
  /** Whether the device is mobile */
  readonly isMobile: boolean;
  /** Device pixel ratio */
  readonly pixelRatio: number;
  /** Current user info */
  readonly user: User;
  /** Theme identifier */
  readonly themeId: string;
  /** Theme version string */
  readonly themeVersion: string;
}

/**
 * Theme module interface — what your theme.js should export.
 */
export interface ThemeModule {
  /** Called once when the theme is initialized */
  init(sdk: ArinovaSDK, container: HTMLElement): void | Promise<void>;
  /** Called when the viewport is resized */
  resize?(width: number, height: number): void;
  /** Called when the theme is being destroyed (cleanup) */
  destroy?(): void;
}

declare global {
  interface Window {
    __ARINOVA_SDK__: ArinovaSDK;
    __ARINOVA_REGISTER_THEME__: (themeModule: { default?: ThemeModule } | ThemeModule) => void;
  }
}
