import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { registerHooks as registerOfficeHooks, setForwardTarget } from "./hooks.js";
import { officeState } from "./state.js";

// Re-export public API
export { officeState } from "./state.js";
export { handleSSEConnection } from "./sse.js";
export { ingestHookEvent } from "./hooks.js";
export type { AgentState, AgentStatus, TokenUsage, OfficeStatusEvent, InternalEvent, InternalEventType } from "./types.js";
// Legacy aliases
export type { HookEvent, HookEventType } from "./types.js";

/** Idle-check interval handle */
let tickInterval: NodeJS.Timeout | null = null;

/** Returns true when the tick loop is running */
export function isHealthy(): boolean {
  return tickInterval !== null;
}

/**
 * Configure HTTP forwarding so every hook event is also POSTed to a remote
 * server (e.g. the Rust backend's POST /api/office/event endpoint).
 * Manual override — pass a single token that applies to all accounts.
 */
export function configure(opts: { forwardUrl: string; forwardToken: string }): void {
  setForwardTarget(opts.forwardUrl, new Map([["default", opts.forwardToken]]));
}

/**
 * Start the idle-check tick loop.
 * Call this from the server process so isHealthy() returns true and
 * events fed via ingestHookEvent() are properly aged out.
 */
export function initialize(): void {
  if (tickInterval) return; // Already running
  tickInterval = setInterval(() => {
    officeState.tick();
  }, 15_000);
}

/** Stop the tick loop. */
export function shutdown(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

/**
 * Register office hooks with the OpenClaw plugin API and start the tick loop.
 * Called from the main arinova plugin's register().
 *
 * Hook forwarding can be configured separately through configure().
 */
export function registerOffice(api: OpenClawPluginApi): void {
  registerOfficeHooks(api);
  initialize();
}
