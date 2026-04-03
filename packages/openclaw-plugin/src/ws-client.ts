/**
 * WebSocket client for Agent ↔ Backend communication (Pull model).
 * The agent connects OUT to the backend, so it doesn't need to expose any port.
 */

import type { UploadFn } from "./image-upload.js";

export type AgentWSClientOptions = {
  wsUrl: string;
  agentId: string;
  secretToken: string;
  onTask: (params: {
    taskId: string;
    conversationId: string;
    conversationType?: string;
    content: string;
    members?: { agentId: string; agentName: string }[];
    replyTo?: { role: string; content: string; senderAgentName?: string };
    history?: { role: string; content: string; senderAgentName?: string; createdAt: string }[];
    attachments?: { id: string; fileName: string; fileType: string; fileSize: number; url: string }[];
    sendChunk: (chunk: string) => void;
    sendComplete: (content: string, options?: { mentions?: string[] }) => void;
    sendError: (error: string) => void;
    signal: AbortSignal;
    uploadFile?: UploadFn;
  }) => void | Promise<void>;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
  abortSignal?: AbortSignal;
};

export type AgentWSClient = {
  connect: () => void;
  disconnect: () => void;
};

const RECONNECT_INTERVAL_MS = 5_000;
const PING_INTERVAL_MS = 30_000;

export function createWSClient(opts: AgentWSClientOptions): AgentWSClient {
  const { wsUrl, agentId, secretToken, onTask, onConnected, onDisconnected, onError, abortSignal } = opts;

  let ws: WebSocket | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function send(event: Record<string, unknown>) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  function cleanup() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      try { ws.close(); } catch {}
      ws = null;
    }
  }

  function scheduleReconnect() {
    if (stopped) return;
    reconnectTimer = setTimeout(() => {
      if (!stopped) connect();
    }, RECONNECT_INTERVAL_MS);
  }

  function connect() {
    if (stopped) return;
    cleanup();

    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      // Authenticate immediately
      send({ type: "agent_auth", agentId, secretToken });

      // Start ping keepalive
      pingTimer = setInterval(() => {
        send({ type: "ping" });
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data));

        if (data.type === "auth_ok") {
          onConnected?.();
          return;
        }

        if (data.type === "auth_error") {
          onError?.(new Error(`Agent auth failed: ${data.error}`));
          // Don't reconnect on auth error — it won't succeed
          stopped = true;
          cleanup();
          return;
        }

        if (data.type === "pong") {
          return;
        }

        if (data.type === "task") {
          const { taskId, conversationId, conversationType, content, members, replyTo, history, attachments } = data;
          const taskAbortController = new AbortController();
          const sendChunk = (chunk: string) => send({ type: "agent_chunk", taskId, chunk });
          const sendComplete = (finalContent: string, options?: { mentions?: string[] }) => {
            const msg: Record<string, unknown> = { type: "agent_complete", taskId, content: finalContent };
            if (options?.mentions?.length) msg.mentions = options.mentions;
            send(msg);
          };
          const sendError = (error: string) => {
            send({ type: "agent_error", taskId, error });
            taskAbortController.abort();
          };

          // Fire and forget — errors are caught inside
          Promise.resolve(
            onTask({
              taskId,
              conversationId,
              conversationType,
              content,
              members,
              replyTo,
              history,
              attachments,
              sendChunk,
              sendComplete,
              sendError,
              signal: taskAbortController.signal,
            })
          ).catch((err) => {
            const errorMsg = err instanceof Error ? err.message : String(err);
            sendError(errorMsg);
          });
          return;
        }
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    };

    ws.onerror = (event) => {
      // WebSocket errors are followed by close events, so we just log here
      onError?.(new Error(`WebSocket error: ${(event as { message?: string }).message ?? "unknown"}`));
    };

    ws.onclose = () => {
      cleanup();
      onDisconnected?.();
      scheduleReconnect();
    };
  }

  function disconnect() {
    stopped = true;
    cleanup();
  }

  // Honor abort signal
  if (abortSignal) {
    if (abortSignal.aborted) {
      stopped = true;
    } else {
      abortSignal.addEventListener("abort", disconnect, { once: true });
    }
  }

  return { connect, disconnect };
}
