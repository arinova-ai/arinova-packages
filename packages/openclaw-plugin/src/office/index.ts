import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { registerHooks as registerOfficeHooks, setForwardTarget } from "./hooks.js";
import { officeState } from "./state.js";
import type { CoreConfig } from "../types.js";
import { normalizeTrustedApiUrl } from "../api-endpoint.js";
import {
  clearForwardTargets,
  setForwardTargets,
  type OfficeForwardTarget,
} from "./forwarder.js";
import { handleSSEConnection } from "./sse.js";

// Re-export public API
export { officeState } from "./state.js";
export { handleSSEConnection } from "./sse.js";
export { ingestHookEvent } from "./hooks.js";
export type { AgentState, AgentStatus, TokenUsage, OfficeStatusEvent, InternalEvent, InternalEventType } from "./types.js";
export { getForwardMetrics } from "./forwarder.js";

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

export function configureFromChannelConfig(
  config: CoreConfig,
  logger?: (message: string) => void,
): void {
  const channel = config.channels?.["openclaw-arinova-ai"];
  const nextTargets = new Map<string, OfficeForwardTarget>();
  const addTarget = (
    accountId: string,
    apiUrl: string | undefined,
    token: string | undefined,
  ) => {
    if (!apiUrl?.trim() || !token?.trim()) return;
    try {
      const base = normalizeTrustedApiUrl(apiUrl.trim());
      nextTargets.set(accountId, {
        url: new URL("/api/office/event", base).toString(),
        token: token.trim(),
      });
    } catch (error) {
      logger?.(`openclaw-arinova-ai: office forwarding disabled for ${accountId}: ${String(error)}`);
    }
  };
  addTarget("default", channel?.apiUrl, channel?.botToken);
  for (const [accountId, account] of Object.entries(channel?.accounts ?? {})) {
    addTarget(
      accountId,
      account?.apiUrl ?? channel?.apiUrl,
      account?.botToken ?? channel?.botToken,
    );
  }
  setForwardTargets(nextTargets, logger);
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
  clearForwardTargets();
}

/**
 * Register office hooks with the OpenClaw plugin API and start the tick loop.
 * Called from the main arinova plugin's register().
 *
 * Hook forwarding can be configured separately through configure().
 */
export function registerOffice(api: OpenClawPluginApi): void {
  registerOfficeHooks(api);
  api.registerHttpRoute({
    path: "/plugins/openclaw-arinova-ai/office/status",
    auth: "gateway",
    match: "exact",
    handler: (_request, response) => {
      handleSSEConnection(response);
      return true;
    },
  });
  configureFromChannelConfig(
    api.config as CoreConfig,
    (message) => api.logger.warn(message),
  );
  initialize();
}
