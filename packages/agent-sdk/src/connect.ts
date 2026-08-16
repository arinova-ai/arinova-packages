import type { AgentRuntimeInfo, AgentSkill, OnboardingSeed } from "./types.js";
import { decodeWebSocketFrame } from "./transport.js";

export const ACTION_PROTOCOL_VERSION = "2026-05-05";

export interface SocketBindingOptions {
  socket: WebSocket;
  maxInboundFrameBytes: number;
  isCurrent: () => boolean;
  onOpen: () => void;
  onFrame: (frame: Record<string, unknown>) => void | Promise<void>;
  onFrameError: (error: Error) => void;
  onTerminal: () => void;
}

export function createAgentAuthFrame(
  botToken: string,
  runtime: AgentRuntimeInfo,
  skills: readonly AgentSkill[],
): Record<string, unknown> {
  return {
    type: "agent_auth",
    botToken,
    runtime,
    capabilities: {
      actionCall: {
        supported: true,
        protocolVersion: ACTION_PROTOCOL_VERSION,
        canEmitFrames: true,
        supportsActionResultContinuation: true,
        supportsGetSchema: true,
        schemaCache: false,
      },
    },
    ...(skills.length > 0 ? { skills } : {}),
  };
}

export function parseOnboardingSeed(raw: unknown): OnboardingSeed | null {
  if (!raw || typeof raw !== "object") return null;
  const seed = raw as Record<string, unknown>;
  if (
    seed.kind !== "first_touch_opening"
    || typeof seed.seedId !== "string"
    || typeof seed.agentId !== "string"
    || typeof seed.action !== "string"
    || typeof seed.prompt !== "string"
  ) {
    return null;
  }
  return {
    kind: "first_touch_opening",
    seedId: seed.seedId,
    agentId: seed.agentId,
    action: seed.action,
    prompt: seed.prompt,
  };
}

/** Bind decoding/error/terminal mechanics while leaving protocol dispatch to the client. */
export function bindWebSocketHandlers(options: SocketBindingOptions): void {
  const { socket } = options;
  socket.onopen = options.onOpen;
  socket.onmessage = async (event) => {
    try {
      const decoded = decodeWebSocketFrame(event.data, options.maxInboundFrameBytes);
      await options.onFrame(decoded instanceof Promise ? await decoded : decoded);
    } catch (error) {
      options.onFrameError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  let terminalHandled = false;
  const onTerminal = () => {
    if (terminalHandled || !options.isCurrent()) return;
    terminalHandled = true;
    options.onTerminal();
  };
  socket.onerror = onTerminal;
  socket.onclose = onTerminal;
}
