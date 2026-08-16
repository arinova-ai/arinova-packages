import { WS_OPEN } from "./transport.js";

const DEFAULT_MAX_PENDING_CHUNKS = 1_000;
const DEFAULT_MAX_PENDING_TERMINAL = 1_000;
const DEFAULT_MAX_CHUNK_AGE_MS = 60_000;

export interface FrameSocket {
  readyState: number;
  send(data: string): void;
}

export interface OutboundConnection {
  authenticated: boolean;
  socket: FrameSocket | null;
  tearingDown: boolean;
}

export interface OutboundOptions {
  maxPendingChunks?: number;
  maxPendingTerminal?: number;
  maxChunkAgeMs?: number;
  now?: () => number;
}

/** Sends authenticated frames and owns the bounded reconnect buffers. */
export class OutboundFrames {
  private pendingChunks: Record<string, unknown>[] = [];
  private pendingChunkTimes = new WeakMap<Record<string, unknown>, number>();
  private pendingTerminal: Record<string, unknown>[] = [];
  private readonly maxPendingChunks: number;
  private readonly maxPendingTerminal: number;
  private readonly maxChunkAgeMs: number;
  private readonly now: () => number;

  constructor(
    private readonly connection: () => OutboundConnection,
    options: OutboundOptions = {},
  ) {
    this.maxPendingChunks = options.maxPendingChunks ?? DEFAULT_MAX_PENDING_CHUNKS;
    this.maxPendingTerminal = options.maxPendingTerminal ?? DEFAULT_MAX_PENDING_TERMINAL;
    this.maxChunkAgeMs = options.maxChunkAgeMs ?? DEFAULT_MAX_CHUNK_AGE_MS;
    this.now = options.now ?? (() => Date.now());
  }

  send(event: Record<string, unknown>): boolean {
    const { authenticated, socket } = this.connection();
    if (!authenticated || socket?.readyState !== WS_OPEN) return false;
    socket.send(JSON.stringify(event));
    return true;
  }

  sendOrThrow(event: Record<string, unknown>): void {
    if (!this.send(event)) throw new Error("WebSocket is not authenticated");
  }

  sendBeforeAuth(event: Record<string, unknown>): void {
    const { socket } = this.connection();
    if (socket?.readyState !== WS_OPEN) throw new Error("WebSocket is not open");
    socket.send(JSON.stringify(event));
  }

  sendTerminal(event: Record<string, unknown>): void {
    if (this.connection().tearingDown) return;
    if (this.send(event)) return;
    this.pendingTerminal.push(event);
    this.trim(this.pendingTerminal, this.maxPendingTerminal);
  }

  sendChunk(event: Record<string, unknown>): void {
    if (this.send(event)) return;
    this.pendingChunks.push(event);
    this.pendingChunkTimes.set(event, this.now());
    this.trim(this.pendingChunks, this.maxPendingChunks);
  }

  flushChunks(): void {
    const { authenticated, socket } = this.connection();
    if (!authenticated || socket?.readyState !== WS_OPEN) return;
    const cutoff = this.now() - this.maxChunkAgeMs;
    const events = this.pendingChunks.splice(0);
    const staleTaskIds = new Set<string>();
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      if ((this.pendingChunkTimes.get(event) ?? 0) < cutoff) {
        if (typeof event.taskId === "string") staleTaskIds.add(event.taskId);
        continue;
      }
      try {
        socket.send(JSON.stringify(event));
      } catch (error) {
        this.pendingChunks.unshift(...events.slice(index));
        throw error;
      }
    }
    for (const taskId of staleTaskIds) {
      socket.send(JSON.stringify({
        type: "agent_stream_gap",
        taskId,
        reason: "offline_chunk_buffer_expired",
      }));
    }
  }

  flushTerminal(): void {
    const { authenticated, socket } = this.connection();
    if (!authenticated || socket?.readyState !== WS_OPEN) return;
    const events = this.pendingTerminal.splice(0);
    for (let index = 0; index < events.length; index += 1) {
      try {
        socket.send(JSON.stringify(events[index]));
      } catch (error) {
        this.pendingTerminal.unshift(...events.slice(index));
        throw error;
      }
    }
  }

  reset(): void {
    this.pendingChunks = [];
    this.pendingChunkTimes = new WeakMap();
    this.pendingTerminal = [];
  }

  private trim(events: Record<string, unknown>[], limit: number): void {
    if (events.length > limit) events.splice(0, events.length - limit);
  }
}
