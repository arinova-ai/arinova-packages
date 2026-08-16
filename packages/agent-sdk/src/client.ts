import type {
  ArinovaAgentOptions,
  AgentSkill,
  TaskAttachment,
  TaskContext,
  TaskHandler,
  AgentEvent,
  AgentEventListener,
  ToolCallReport,
  TaskUpdateData,
  ActionCallOptions,
  ActionCallResult,
  ActionProgressOptions,
  OnboardingSeed,
} from "./types.js";
import packageJson from "../package.json" with { type: "json" };
import {
  decodeWebSocketFrame,
  normalizeWebSocketBaseUrl,
  reconnectDelayMs,
  WS_OPEN,
} from "./transport.js";
import { taskConversationKey, validateTaskFrame } from "./scheduler.js";
import { ArinovaRestClient } from "./rest/client.js";
import {
  AUTH_ERROR_MAX_RETRIES,
  authRetryDelayMs,
  parseServerAuthError,
} from "./auth-retry.js";
export { ArinovaApiError } from "./rest/client.js";

const DEFAULT_RECONNECT_INTERVAL = 5_000;
const DEFAULT_PING_INTERVAL = 30_000;
const TASK_HEARTBEAT_INTERVAL = 60_000;
const ACTION_PROTOCOL_VERSION = "2026-05-05";
// Read the SDK version from package.json (single source of truth) so the
// version reported in agent_auth never drifts from the published package.
const SDK_VERSION = packageJson.version;
const DEFAULT_ACTION_TIMEOUT = 60_000;
const DEFAULT_MAX_QUEUED_TASKS = 100;
const DEFAULT_MAX_INBOUND_FRAME_BYTES = 1024 * 1024;
const MAX_PENDING_CHUNK_EVENTS = 1_000;
const MAX_PENDING_TERMINAL_EVENTS = 1_000;
const MAX_PENDING_CHUNK_AGE_MS = 60_000;

function noConversationError(api: string, taskKind: string | undefined): Error {
  return new Error(
    `${api} is unavailable: this task (taskKind=${taskKind ?? "unknown"}) is not bound to a conversation`,
  );
}

/**
 * Validate a raw `auth_ok.onboardingSeed` payload (OB-11 §5.7). The server is
 * authoritative; this guard only ensures we surface a well-formed seed and
 * silently drop anything malformed or of an unknown kind, so a partial/garbled
 * field never drives a seeded turn. Returns `null` when absent or invalid.
 */
function parseOnboardingSeed(raw: unknown): OnboardingSeed | null {
  if (!raw || typeof raw !== "object") return null;
  const seed = raw as Record<string, unknown>;
  if (seed.kind !== "first_touch_opening") return null;
  if (
    typeof seed.seedId !== "string" ||
    typeof seed.agentId !== "string" ||
    typeof seed.action !== "string" ||
    typeof seed.prompt !== "string"
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
export class ArinovaAgent extends ArinovaRestClient {
  private readonly skills: AgentSkill[];
  private readonly reconnectInterval: number;
  private readonly pingInterval: number;
  private readonly pingTimeout: number;
  private readonly concurrencyMode: "per-conversation" | "agent-wide" | "unbounded";
  private readonly maxConsecutive: number;
  private readonly maxQueuedTasks: number;
  private readonly maxInboundFrameBytes: number;
  private readonly logger: Pick<Console, "warn" | "info" | "error">;

  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastPongAt: number | null = null;
  private commandHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private authRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private stoppedReason: string | null = null;
  private authErrorCount = 0;
  private authRetryAttempt = 0;
  private isAuthRetrying = false;
  private authenticated = false;
  private tearingDown = false;
  private agentId: string | null = null;
  // Server-authored first-touch seed from the most recent permanent-token
  // `auth_ok` (OB-11 §5.7). Null on every connection except a genuine first
  // touch; the consumer reads it once after connect() resolves.
  private onboardingSeed: OnboardingSeed | null = null;
  private taskHandler: TaskHandler | null = null;
  private taskAbortControllers: Map<string, AbortController> = new Map();
  private activeConversationTasks: Map<string, string> = new Map(); // conversationId → taskId
  private conversationQueues: Map<string, Array<Record<string, unknown>>> = new Map(); // conversationId → queued task data
  private pendingChunkEvents: Array<Record<string, unknown>> = [];
  private pendingChunkTimes = new WeakMap<Record<string, unknown>, number>();
  private pendingTerminalEvents: Array<Record<string, unknown>> = [];
  private pendingActionCalls: Map<string, {
    resolve: (result: ActionCallResult) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();
  // agent-wide mode only: how many tasks have run back-to-back from a given
  // conv. Incremented in executeTask, reset when the scheduler rotates away.
  private consecutiveTaskCount: Map<string, number> = new Map();
  // agent-wide mode only: synchronous lock flag. handleTask flips this inside
  // the same sync frame as its queue/execute decision so two tasks arriving
  // back-to-back can't both observe an "empty Map" and race into parallel
  // execution (the scheduler-read → executeTask-write window). executeTask
  // re-asserts it so the drain path (processNextTaskAgentWide → executeTask)
  // preserves the invariant "lock == a task is live under agent-wide mode".
  private agentWideLock = false;

  private listeners: Record<string, Array<(...args: unknown[]) => void>> = {
    connected: [],
    disconnected: [],
    error: [],
    auth_failed: [],
    token_claimed: [],
  };

  // Used to resolve/reject the connect() promise on first auth
  private connectResolve: (() => void) | null = null;
  private connectReject: ((err: Error) => void) | null = null;
  private connectPromise: Promise<void> | null = null;

  constructor(options: ArinovaAgentOptions) {
    super(normalizeWebSocketBaseUrl(options.serverUrl), options.botToken);
    this.skills = options.skills ?? [];
    this.reconnectInterval = options.reconnectInterval ?? DEFAULT_RECONNECT_INTERVAL;
    this.pingInterval = options.pingInterval ?? DEFAULT_PING_INTERVAL;
    this.pingTimeout = options.pingTimeout ?? 2 * this.pingInterval;
    this.concurrencyMode = options.concurrencyMode ?? "agent-wide";
    this.maxConsecutive = options.maxConsecutivePerConversation ?? 2;
    this.maxQueuedTasks =
      Number.isSafeInteger(options.maxQueuedTasks) && (options.maxQueuedTasks ?? -1) >= 0
        ? options.maxQueuedTasks!
        : DEFAULT_MAX_QUEUED_TASKS;
    this.maxInboundFrameBytes =
      Number.isSafeInteger(options.maxInboundFrameBytes) && (options.maxInboundFrameBytes ?? 0) > 0
        ? options.maxInboundFrameBytes!
        : DEFAULT_MAX_INBOUND_FRAME_BYTES;
    this.logger = options.logger ?? console;
  }

  /** Register a task handler. Called when the server sends a task. */
  onTask(handler: TaskHandler): this {
    this.taskHandler = handler;
    return this;
  }

  /** Register an event listener. */
  on<T extends AgentEvent>(event: T, listener: AgentEventListener<T>): this {
    const typed = listener as (...args: unknown[]) => void;
    if (!this.listeners[event]?.includes(typed)) this.listeners[event]?.push(typed);
    return this;
  }

  /** Remove a previously registered event listener. */
  off<T extends AgentEvent>(event: T, listener: AgentEventListener<T>): this {
    const listeners = this.listeners[event];
    const index = listeners?.indexOf(listener as (...args: unknown[]) => void) ?? -1;
    if (index >= 0) listeners.splice(index, 1);
    return this;
  }

  /** Returns the agent ID assigned by the server after successful auth. */
  getAgentId(): string | null {
    return this.agentId;
  }

  /**
   * Returns the server-authored onboarding seed delivered on the most recent
   * permanent-token `auth_ok` (OB-11 §5.7), or `null` when none was present.
   *
   * Read this once after {@link connect} resolves: the seed is set before the
   * connect() promise resolves, so it is observable as soon as connect()
   * returns. It rides the existing `auth_ok` frame — there is no separate WS
   * event — and is absent on every connection except a genuine first touch.
   */
  getOnboardingSeed(): OnboardingSeed | null {
    return this.onboardingSeed;
  }

  /**
   * Connect to the Arinova server.
   * Returns a promise that resolves on successful auth, or rejects on auth failure.
   */
  connect(): Promise<void> {
    if (this.authenticated && this.ws?.readyState === WS_OPEN) {
      return Promise.resolve();
    }
    if (this.connectPromise) return this.connectPromise;
    this.stopped = false;
    this.stoppedReason = null;
    this.authErrorCount = 0;
    this.authRetryAttempt = 0;
    this.isAuthRetrying = false;
    if (this.authRetryTimer) { clearTimeout(this.authRetryTimer); this.authRetryTimer = null; }
    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
      this.doConnect();
    });
    return this.connectPromise;
  }

  /** Disconnect and stop reconnecting. */
  disconnect(): void {
    this.stop("disconnect() called");
    if (this.authRetryTimer) { clearTimeout(this.authRetryTimer); this.authRetryTimer = null; }
    this.cleanup();
  }

  /**
   * Send a proactive message to a conversation.
   * Uses WebSocket if connected, otherwise falls back to HTTP POST.
   */
  async sendMessage(conversationId: string, content: string): Promise<void> {
    // Try WebSocket first
    if (this.authenticated && this.ws && this.ws.readyState === WS_OPEN) {
      this.sendOrThrow({ type: "agent_send", conversationId, content });
      return;
    }

    await this.request<void>("POST", "/api/v1/messages/send", {
      body: { conversationId, content },
      response: "void",
      errorLabel: "sendMessage",
      headers: { "Idempotency-Key": generateCallId() },
      retries: 2,
    });
  }

  /** Send a message as a reply to an existing conversation message. */
  async replyToMessage(
    conversationId: string,
    content: string,
    replyTo: string,
  ): Promise<void> {
    if (this.authenticated && this.ws && this.ws.readyState === WS_OPEN) {
      this.sendOrThrow({ type: "agent_send", conversationId, content, replyTo });
      return;
    }

    await this.request<void>("POST", "/api/v1/messages/send", {
      body: { conversationId, content, replyTo },
      response: "void",
      errorLabel: "replyToMessage",
      headers: { "Idempotency-Key": generateCallId() },
      retries: 2,
    });
  }

  /**
   * Send a telemetry event to the server.
   * Silently no-ops if WebSocket is not connected.
   */
  sendTelemetry(event: string, data: Record<string, unknown>): void {
    this.send({ type: "agent_telemetry", event, data });
  }

  /**
   * Send HUD data to the server for display in the office HUD bar.
   * The server forwards this to the agent owner's frontend.
   */
  sendHud(data: Record<string, unknown>, conversationId?: string): void {
    const msg: Record<string, unknown> = { type: "hud_update", data };
    if (conversationId) msg.conversationId = conversationId;
    this.send(msg);
  }

  /**
   * Send a task lifecycle update to the server for the HUD activity log.
   * The server forwards this to the agent owner's frontend and persists
   * it in activity_logs.
   */
  sendTaskUpdate(agentName: string, data: TaskUpdateData): void {
    this.send({ type: "task_update", agentName, data });
  }

  /**
   * Report a single tool call to the server over the existing WebSocket.
   * Intended to be called immediately after each tool finishes so the
   * server can build a real-time activity log. Silently no-ops if the
   * WebSocket is not connected.
   */
  reportToolCall(report: ToolCallReport): void {
    this.send({ type: "tool_call_report", report });
  }

  /** Report progress for an in-flight action call. */
  reportActionProgress(
    callId: string,
    action: string,
    progress: Record<string, unknown>,
    options: ActionProgressOptions = {},
  ): void {
    this.send({
      type: "action_progress",
      id: callId,
      action,
      progress,
      ...(options.taskId ? { taskId: options.taskId } : {}),
      ...(options.conversationId ? { conversationId: options.conversationId } : {}),
    });
  }

  /**
   * Execute an Arinova platform action through the backend action_call protocol.
   * Prefer `task.callAction()` inside task handlers so task/conversation
   * attribution is filled automatically.
   */
  callAction(
    action: string,
    args: Record<string, unknown>,
    options: ActionCallOptions = {},
  ): Promise<ActionCallResult> {
    if (!this.authenticated || !this.ws || this.ws.readyState !== WS_OPEN) {
      return Promise.reject(new Error("action_call requires an active WebSocket connection"));
    }

    const callId = options.callId ?? generateCallId();
    const timeoutMs = options.timeoutMs ?? DEFAULT_ACTION_TIMEOUT;
    const frame: Record<string, unknown> = {
      type: "action_call",
      id: callId,
      action,
      arguments: args,
    };
    if (options.taskId) frame.taskId = options.taskId;
    if (options.conversationId) frame.conversationId = options.conversationId;
    if (options.messageId) frame.messageId = options.messageId;
    if (options.parentCallId) frame.parentCallId = options.parentCallId;
    if (options.reason) frame.reason = options.reason;
    if (options.metadata) frame.metadata = options.metadata;
    if (options.dryRun !== undefined) frame.dryRun = options.dryRun;

    return new Promise<ActionCallResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingActionCalls.delete(callId);
        reject(new Error(`action_call ${action} (${callId}) timed out`));
      }, timeoutMs);
      this.pendingActionCalls.set(callId, { resolve, reject, timer });
      try {
        this.sendOrThrow(frame);
      } catch (err) {
        clearTimeout(timer);
        this.pendingActionCalls.delete(callId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private emit(event: "connected" | "disconnected" | "auth_failed"): void;
  private emit(event: "error", error: Error): void;
  private emit(event: "token_claimed", data: { agentId: string | null; permanentToken: string }): void;
  private emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners[event] ?? []) {
      try {
        listener(...args);
      } catch (err) {
        this.logger.error(
          `[arinova-agent-sdk] ${event} listener failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private send(event: Record<string, unknown>): void {
    if (this.authenticated && this.ws && this.ws.readyState === WS_OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  private sendOrThrow(event: Record<string, unknown>): void {
    if (!this.authenticated || !this.ws || this.ws.readyState !== WS_OPEN) {
      throw new Error("WebSocket is not authenticated");
    }
    this.ws.send(JSON.stringify(event));
  }

  private sendBeforeAuth(event: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WS_OPEN) {
      throw new Error("WebSocket is not open");
    }
    this.ws.send(JSON.stringify(event));
  }

  private sendTerminal(event: Record<string, unknown>): void {
    if (this.tearingDown) return;
    if (this.authenticated && this.ws && this.ws.readyState === WS_OPEN) {
      this.ws.send(JSON.stringify(event));
      return;
    }
    this.pendingTerminalEvents.push(event);
    if (this.pendingTerminalEvents.length > MAX_PENDING_TERMINAL_EVENTS) {
      this.pendingTerminalEvents.splice(
        0,
        this.pendingTerminalEvents.length - MAX_PENDING_TERMINAL_EVENTS,
      );
    }
  }

  private sendChunkEvent(event: Record<string, unknown>): void {
    if (this.authenticated && this.ws && this.ws.readyState === WS_OPEN) {
      this.ws.send(JSON.stringify(event));
      return;
    }
    this.pendingChunkEvents.push(event);
    this.pendingChunkTimes.set(event, Date.now());
    if (this.pendingChunkEvents.length > MAX_PENDING_CHUNK_EVENTS) {
      this.pendingChunkEvents.splice(0, this.pendingChunkEvents.length - MAX_PENDING_CHUNK_EVENTS);
    }
  }

  private flushPendingChunkEvents(): void {
    if (!this.authenticated || !this.ws || this.ws.readyState !== WS_OPEN) return;
    const cutoff = Date.now() - MAX_PENDING_CHUNK_AGE_MS;
    const events = this.pendingChunkEvents.splice(0);
    const staleTaskIds = new Set<string>();
    for (let index = 0; index < events.length; index++) {
      const event = events[index];
      if ((this.pendingChunkTimes.get(event) ?? 0) < cutoff) {
        if (typeof event.taskId === "string") staleTaskIds.add(event.taskId);
        continue;
      }
      try {
        this.ws.send(JSON.stringify(event));
      } catch (err) {
        this.pendingChunkEvents.unshift(...events.slice(index));
        throw err;
      }
    }
    for (const taskId of staleTaskIds) {
      this.ws.send(JSON.stringify({
        type: "agent_stream_gap",
        taskId,
        reason: "offline_chunk_buffer_expired",
      }));
    }
  }

  private flushPendingTerminalEvents(): void {
    if (!this.authenticated || !this.ws || this.ws.readyState !== WS_OPEN) return;
    const events = this.pendingTerminalEvents.splice(0);
    for (let index = 0; index < events.length; index++) {
      try {
        this.ws.send(JSON.stringify(events[index]));
      } catch (err) {
        this.pendingTerminalEvents.unshift(...events.slice(index));
        throw err;
      }
    }
  }

  private cleanupConnection(closeSocket = true): void {
    this.authenticated = false;
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.commandHeartbeatTimer) {
      clearInterval(this.commandHeartbeatTimer);
      this.commandHeartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.ws;
    this.ws = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
    }
    if (closeSocket && socket) {
      try {
        socket.close();
      } catch {}
    }
  }

  private cleanup(reason = "disconnect"): void {
    this.cleanupConnection();
    this.tearingDown = true;
    // Clear queues BEFORE aborting — abort triggers markFinished → processNextTask,
    // which would dequeue and start tasks during disconnect if queues aren't empty.
    this.conversationQueues.clear();
    this.activeConversationTasks.clear();
    this.consecutiveTaskCount.clear();
    this.agentWideLock = false;
    for (const controller of this.taskAbortControllers.values()) {
      controller.abort();
    }
    this.taskAbortControllers.clear();
    this.pendingChunkEvents = [];
    this.pendingChunkTimes = new WeakMap();
    this.pendingTerminalEvents = [];
    this.tearingDown = false;
    this.rejectPendingActionCalls(reason);
  }

  private cleanupForReconnect(closeSocket = true): void {
    this.cleanupConnection(closeSocket);
    this.rejectPendingActionCalls("connection lost");
  }

  private cleanupAfterAuthFailure(): void {
    this.cleanup("auth failure");
  }

  private rejectPendingActionCalls(reason: string): void {
    for (const [callId, pending] of this.pendingActionCalls) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`action_call ${callId} cancelled by ${reason}`));
    }
    this.pendingActionCalls.clear();
  }

  private stop(reason: string): void {
    this.stopped = true;
    this.stoppedReason = reason;
    this.logger.warn(`[arinova-agent-sdk] stopped: ${reason}`);
    this.rejectConnect(new Error(`Connection stopped: ${reason}`));
  }

  private rejectConnect(error: Error): void {
    this.connectReject?.(error);
    this.connectResolve = null;
    this.connectReject = null;
    this.connectPromise = null;
  }

  private resolveConnect(): void {
    this.connectResolve?.();
    this.connectResolve = null;
    this.connectReject = null;
    this.connectPromise = null;
  }

  private scheduleReconnect(): void {
    if (this.stopped) {
      this.logger.warn(`[arinova-agent-sdk] reconnect skipped: stopped (${this.stoppedReason ?? "unknown"})`);
      return;
    }
    const delay = reconnectDelayMs(this.reconnectInterval, this.reconnectAttempt++);
    this.logger.info(`[arinova-agent-sdk] scheduling reconnect in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      if (this.stopped) {
        this.logger.warn(`[arinova-agent-sdk] reconnect timer fired but agent is stopped (${this.stoppedReason ?? "unknown"})`);
        return;
      }
      this.logger.info("[arinova-agent-sdk] reconnect timer fired");
      this.doConnect();
    }, delay);
  }

  private doConnect(): void {
    if (this.stopped) {
      this.logger.warn(`[arinova-agent-sdk] connect skipped: stopped (${this.stoppedReason ?? "unknown"})`);
      return;
    }
    this.isAuthRetrying = false;
    this.cleanupForReconnect();
    this.lastPongAt = null;

    const wsUrl = `${this.serverUrl}/ws/agent`;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit("error", error);
      this.scheduleReconnect();
      return;
    }
    const socket = this.ws;

    this.ws.onopen = () => {
      this.lastPongAt = Date.now(); // Treat onopen as alive proof until the first pong.
      const authMsg: Record<string, unknown> = {
        type: "agent_auth",
        botToken: this.botToken,
        runtime: {
          name: "arinova-agent-sdk",
          version: SDK_VERSION,
          language: "typescript",
          platform: "node",
        },
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
      };
      if (this.skills.length > 0) {
        authMsg.skills = this.skills;
      }
      this.sendBeforeAuth(authMsg);

      this.pingTimer = setInterval(() => {
        if (this.lastPongAt !== null && Date.now() - this.lastPongAt > this.pingTimeout) {
          this.logger.warn("[arinova-agent-sdk] pong timeout, forcing reconnect");
          this.cleanupForReconnect(false);
          try { socket.close(); } catch {}
          this.emit("disconnected");
          this.scheduleReconnect();
          return;
        }
        // The socket can sit in CLOSING before onclose fires (delayed TCP
        // teardown); a throw here would be an uncaughtException inside the
        // interval callback, so skip the ping and let onclose reconnect.
        if (this.ws && this.ws.readyState === WS_OPEN) {
          this.sendBeforeAuth({ type: "ping" });
        }
      }, this.pingInterval);
    };

    this.ws.onmessage = async (event) => {
      try {
        const decoded = decodeWebSocketFrame(
          event.data,
          this.maxInboundFrameBytes,
        );
        const data = decoded instanceof Promise ? await decoded : decoded;

        if (data.type === "auth_ok") {
          this.authenticated = true;
          this.agentId = typeof data.agentId === "string" ? data.agentId : null;

          // OB-11 AC8.7: surface the server-authored first-touch seed (if any)
          // before connect() resolves below, so a consumer reading it right
          // after `await connect()` sees it deterministically. Rides this
          // existing auth_ok frame — no extra WS event. Absent on reconnect.
          this.onboardingSeed = parseOnboardingSeed(data.onboardingSeed);

          // Retained for forward compatibility. The current server only sends
          // permanentToken on claim_ok, never auth_ok.
          if (typeof data.permanentToken === "string" && data.permanentToken) {
            this.botToken = data.permanentToken;
            this.emit("token_claimed", { agentId: this.agentId, permanentToken: data.permanentToken });
          }

          this.emit("connected");

          // Register SDK runtime commands from skills
          if (this.skills.length > 0 && this.agentId) {
            this.send({
              type: "register_commands",
              agentId: this.agentId,
              commands: this.skills.map((s) => ({
                name: s.id ?? s.name,
                description: s.description ?? "",
              })),
            });
          }

          // Start heartbeat to extend Redis TTL every 60s
          if (this.commandHeartbeatTimer) clearInterval(this.commandHeartbeatTimer);
          if (this.skills.length > 0 && this.agentId) {
            this.commandHeartbeatTimer = setInterval(() => {
              this.send({ type: "heartbeat_commands", agentId: this.agentId });
            }, 60_000);
          }

          // Auth succeeded — reset error state
          this.authErrorCount = 0;
          this.authRetryAttempt = 0;
          this.isAuthRetrying = false;
          this.reconnectAttempt = 0;

          // Resolve the connect() promise on first successful auth
          this.resolveConnect();
          this.flushPendingChunkEvents();
          this.flushPendingTerminalEvents();
          return;
        }

        if (data.type === "claim_ok") {
          // OB-3 onboarding claim: a bootstrap `obt_*` token is exchanged for a
          // permanent `ari_*` token on this *separate* frame (never `auth_ok`),
          // after which the server closes the socket (auth.rs returns `None`).
          // We adopt the permanent token and let the normal close→reconnect path
          // re-authenticate with it; that second connection is the genuine
          // permanent-token `auth_ok`, which is the first connect that carries
          // the onboarding seed (OB-11 §5.7). We deliberately do NOT resolve
          // connect() here and never parse a seed off `claim_ok` — claim is token
          // exchange only, and connect() must stay pending until the real
          // `auth_ok` so a consumer reading getOnboardingSeed() after it sees the
          // populated (or cleared) value from that frame.
          if (typeof data.permanentToken === "string" && data.permanentToken) {
            this.botToken = data.permanentToken;
            this.agentId =
              typeof data.agentId === "string" ? data.agentId : this.agentId;
            this.emit("token_claimed", {
              agentId: this.agentId,
              permanentToken: data.permanentToken,
            });
          }
          return;
        }

        if (data.type === "auth_error") {
          this.handleAuthError(data);
          return;
        }

        if (data.type === "pong") {
          this.lastPongAt = Date.now();
          return;
        }

        if (data.type === "action_result") {
          this.handleActionResult(data);
          return;
        }

        if (data.type === "task") {
          this.handleTask(data);
          return;
        }

        if (data.type === "cancel_task") {
          const taskId = data.taskId as string;

          // Check if the task is still queued (not yet started)
          for (const [convId, queue] of this.conversationQueues) {
            const idx = queue.findIndex((t) => t.taskId === taskId);
            if (idx !== -1) {
              const [cancelled] = queue.splice(idx, 1);
              if (queue.length === 0) this.conversationQueues.delete(convId);
              this.sendTerminal({
                type: "agent_error",
                taskId: cancelled.taskId,
                error: "cancelled",
                reason: "cancelled",
              });
              return;
            }
          }

          // Active task — abort it (processNextTask will be called via markFinished)
          const controller = this.taskAbortControllers.get(taskId);
          if (controller) {
            controller.abort();
            this.taskAbortControllers.delete(taskId);
          }
          return;
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.emit("error", error);
        if (error instanceof RangeError) {
          socket.close();
        }
      }
    };

    // Node 22's built-in (undici) WebSocket fires `error` without a follow-up
    // `close` on handshake failures, so both paths must drive the reconnect
    // flow. The flag dedupes when both events do fire (mid-session errors).
    let terminalHandled = false;
    const onTerminal = () => {
      if (terminalHandled) return;
      if (this.ws !== socket) return;
      terminalHandled = true;
      this.cleanupForReconnect(false);
      this.emit("disconnected");
      // Skip this one close if auth retry already scheduled its own reconnect
      if (this.isAuthRetrying) {
        this.logger.info("[arinova-agent-sdk] close handled by auth retry timer; skipping normal reconnect once");
        this.isAuthRetrying = false; // Only skip once — subsequent closes reconnect normally
        return;
      }
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      onTerminal();
    };

    this.ws.onclose = () => {
      onTerminal();
    };
  }

  private handleAuthError(rawFrame: unknown): void {
    const frame = isRecord(rawFrame) && (
      "error" in rawFrame || "code" in rawFrame || "retryable" in rawFrame
    ) ? rawFrame : { error: rawFrame };
    const authError = parseServerAuthError(frame);
    const errorMessage = authError.code
      ? `${authError.message} (${authError.code})`
      : authError.message;

    this.authRetryAttempt++;
    if (!authError.retryable) {
      this.authErrorCount++;
    }
    this.isAuthRetrying = true; // Prevent onclose from overriding backoff

    const error = authError.retryable
      ? new Error(`Agent auth retryable server error (retry ${this.authRetryAttempt}, auth failures ${this.authErrorCount}/${AUTH_ERROR_MAX_RETRIES}): ${errorMessage}`)
      : new Error(`Agent auth failed (attempt ${this.authErrorCount}/${AUTH_ERROR_MAX_RETRIES}, retry ${this.authRetryAttempt}): ${errorMessage}`);
    this.emit("error", error);

    if (authError.retryable) {
      this.logger.warn(`[arinova-agent-sdk] auth retryable server error (${this.authRetryAttempt}/${AUTH_ERROR_MAX_RETRIES} total attempts): ${errorMessage}`);
    }
    if (this.authRetryAttempt >= AUTH_ERROR_MAX_RETRIES) {
      this.logger.warn(`[arinova-agent-sdk] auth retry limit reached (${this.authRetryAttempt}/${AUTH_ERROR_MAX_RETRIES})`);
      this.emit("auth_failed");
      this.rejectConnect(error);
      if (this.authRetryTimer) {
        clearTimeout(this.authRetryTimer);
        this.authRetryTimer = null;
      }
      this.cleanupAfterAuthFailure();
      this.stop("authentication failed");
      return;
    }

    this.cleanupAfterAuthFailure();
    this.scheduleAuthRetry();
  }

  private scheduleAuthRetry(): void {
    const delay = authRetryDelayMs(this.authRetryAttempt);
    if (this.authRetryTimer) {
      clearTimeout(this.authRetryTimer);
      this.authRetryTimer = null;
    }
    this.logger.info(`[arinova-agent-sdk] scheduling auth retry #${this.authRetryAttempt + 1} in ${delay}ms`);
    this.authRetryTimer = setTimeout(() => {
      this.authRetryTimer = null;
      if (this.stopped) {
        this.logger.warn(`[arinova-agent-sdk] auth retry timer fired but agent is stopped (${this.stoppedReason ?? "unknown"})`);
        return;
      }
      this.logger.info(`[arinova-agent-sdk] auth retry timer fired after retry #${this.authRetryAttempt}`);
      this.doConnect();
    }, delay);
  }

  private handleActionResult(data: Record<string, unknown>): void {
    const callId = data.id as string | undefined;
    if (!callId) return;
    const pending = this.pendingActionCalls.get(callId);
    if (!pending) return;

    const status = String(data.status ?? "");
    if (!["success", "error", "requires_confirmation", "cancelled"].includes(status)) {
      return;
    }

    clearTimeout(pending.timer);
    this.pendingActionCalls.delete(callId);
    pending.resolve({
      callId,
      action: String(data.action ?? ""),
      status: status as ActionCallResult["status"],
      result: isRecord(data.result) ? data.result : null,
      error: isRecord(data.error)
        ? {
            code: String(data.error.code ?? "UNKNOWN"),
            message: String(data.error.message ?? ""),
            details: isRecord(data.error.details) ? data.error.details : undefined,
          }
        : null,
      confirmation: isRecord(data.confirmation)
        ? {
            confirmationId: String(data.confirmation.confirmationId ?? ""),
            title: String(data.confirmation.title ?? ""),
            summary: String(data.confirmation.summary ?? ""),
            expiresAt: String(data.confirmation.expiresAt ?? ""),
          }
        : null,
      traceId: typeof data.traceId === "string" ? data.traceId : undefined,
      actionVersion: typeof data.actionVersion === "string" ? data.actionVersion : undefined,
      dryRun: typeof data.dryRun === "boolean" ? data.dryRun : undefined,
    });
  }

  private handleTask(data: Record<string, unknown>): void {
    const validationError = validateTaskFrame(data);
    if (validationError) {
      this.send({
        type: "agent_error",
        ...(typeof data.taskId === "string" ? { taskId: data.taskId } : {}),
        error: validationError,
      });
      return;
    }
    if (!this.taskHandler) {
      this.send({
        type: "agent_error",
        taskId: data.taskId,
        error: "no_task_handler",
      });
      return;
    }

    const taskId = data.taskId as string;
    if (this.taskAbortControllers.has(taskId)) return;
    for (const queue of this.conversationQueues.values()) {
      if (queue.some((queued) => queued.taskId === taskId)) return;
    }

    // Platform wakeups (cron/trigger) carry no conversationId. They all
    // serialise under one sentinel key so per-conversation mode treats
    // them as a single "platform conversation" instead of keying Maps on
    // undefined.
    const convKey = taskConversationKey(data);

    // Unbounded: no serialisation, run every task immediately.
    if (this.concurrencyMode === "unbounded") {
      this.executeTask(data);
      return;
    }

    // agent-wide: any live task (in any conv) forces queueing. The flag is
    // checked and flipped in one sync frame so cross-conv arrivals can't both
    // decide "not queued" before either one has set the Map entries that
    // active-task map would otherwise rely on.
    // per-conversation: only a live task for THIS conv forces queueing.
    let shouldQueue: boolean;
    if (this.concurrencyMode === "agent-wide") {
      if (this.agentWideLock) {
        shouldQueue = true;
      } else {
        this.agentWideLock = true;
        shouldQueue = false;
      }
    } else {
      const activeTaskId = this.activeConversationTasks.get(convKey);
      shouldQueue = !!(activeTaskId && this.taskAbortControllers.has(activeTaskId));
    }

    if (shouldQueue) {
      let globalQueueSize = 0;
      for (const queued of this.conversationQueues.values()) {
        globalQueueSize += queued.length;
      }
      if (globalQueueSize >= this.maxQueuedTasks) {
        this.send({
          type: "agent_error",
          taskId: data.taskId as string,
          error: "queue_overflow",
        });
        return;
      }
      let queue = this.conversationQueues.get(convKey);
      if (!queue) {
        queue = [];
        this.conversationQueues.set(convKey, queue);
      }
      queue.push(data);
      // Notify the server that this task has been queued (not yet running).
      // The rust-server side maps this onto its stream_queued broadcast so
      // the web/iOS clients can render a "position N in queue" indicator.
      // globalQueueSize spans every conv's queue — the UI uses it for the
      // "跨 conv 前面 N 則" cross-conversation count.
      globalQueueSize = 0;
      for (const q of this.conversationQueues.values()) globalQueueSize += q.length;
      this.send({
        type: "task_queued",
        taskId: data.taskId as string,
        conversationId: data.conversationId as string | undefined,
        queuePosition: queue.length - 1,
        globalQueueSize,
      });
      return;
    }

    this.executeTask(data);
  }

  private executeTask(data: Record<string, unknown>): void {
    if (!this.taskHandler) return;

    const taskId = data.taskId as string;
    const conversationId = data.conversationId as string | undefined;
    const taskKind = data.taskKind as string | undefined;
    const convKey = taskConversationKey(data);
    const abortController = new AbortController();
    this.taskAbortControllers.set(taskId, abortController);
    this.activeConversationTasks.set(convKey, taskId);

    // agent-wide scheduler bookkeeping: count consecutive runs from this
    // conv so processNextTask can rotate when the cap is reached. Also
    // re-assert the lock — the drain path (markFinished → processNextTask
    // → processNextTaskAgentWide → executeTask) releases the lock before
    // the drain, so without this the next task would start with the flag
    // cleared and a concurrent arrival could bypass the queue.
    if (this.concurrencyMode === "agent-wide") {
      this.agentWideLock = true;
      const prev = this.consecutiveTaskCount.get(convKey) ?? 0;
      this.consecutiveTaskCount.set(convKey, prev + 1);
    }

    // Auto heartbeat: keep task alive while processing
    const heartbeatTimer = setInterval(() => {
      this.send({ type: "agent_heartbeat", taskId });
    }, TASK_HEARTBEAT_INTERVAL);
    const stopHeartbeat = () => clearInterval(heartbeatTimer);

    // Guard: ensure sendComplete/sendError only fires once per task.
    // After cancel_task, the background handler may still call sendComplete
    // when the LLM finishes — the guard prevents duplicate events.
    let taskFinished = false;
    const markFinished = () => {
      if (taskFinished) return false;
      taskFinished = true;
      stopHeartbeat();
      this.taskAbortControllers.delete(taskId);
      this.activeConversationTasks.delete(convKey);
      // Release the agent-wide lock before draining — processNextTask may
      // synchronously call executeTask for the next queued task, which
      // re-acquires the lock. If no task is drained, the lock stays false
      // and the next arrival is free to run.
      if (this.concurrencyMode === "agent-wide") {
        this.agentWideLock = false;
      }
      this.processNextTask(convKey);
      return true;
    };

    const ctx: TaskContext = {
      raw: Object.freeze({ ...data }),
      taskId,
      taskKind,
      userMessageId: data.userMessageId as string | undefined,
      conversationId,
      content: data.content as string,
      conversationType: data.conversationType as string | undefined,
      senderUserId: data.senderUserId as string | undefined,
      senderUsername: data.senderUsername as string | undefined,
      senderAgentId: data.senderAgentId as string | undefined,
      senderAgentName: data.senderAgentName as string | undefined,
      members: data.members as { agentId: string; agentName: string }[] | undefined,
      replyTo: data.replyTo as { role: string; content: string; senderAgentName?: string } | undefined,
      history: data.history as { role: string; content: string; senderAgentName?: string; senderUsername?: string; createdAt: string }[] | undefined,
      attachments: data.attachments as TaskAttachment[] | undefined,
      availableSkills: data.availableSkills as TaskContext["availableSkills"],
      sendChunk: (delta: string) => {
        if (taskFinished) return;
        this.sendChunkEvent({ type: "agent_chunk", taskId, chunk: delta });
      },
      sendComplete: (fullContent: string, options?: { mentions?: string[] }) => {
        if (!markFinished()) return;
        this.sendTerminal({
          type: "agent_complete",
          taskId,
          content: fullContent,
          ...(options?.mentions?.length ? { mentions: options.mentions } : {}),
        });
      },
      sendError: (error: string) => {
        if (!markFinished()) return;
        const payload: Record<string, unknown> = { type: "agent_error", taskId, error };
        if (error === "cancelled") payload.reason = "cancelled";
        this.sendTerminal(payload);
      },
      signal: abortController.signal,
      uploadFile: (file, fileName, fileType?) =>
        conversationId
          ? this.uploadFile(conversationId, file, fileName, fileType)
          : Promise.reject(noConversationError("uploadFile", taskKind)),
      fetchHistory: (options?) =>
        conversationId
          ? this.fetchHistory(conversationId, options)
          : Promise.reject(noConversationError("fetchHistory", taskKind)),
      callAction: (action, args, options) =>
        this.callAction(action, args, {
          ...options,
          taskId,
          conversationId,
          messageId: taskId,
        }),
    };

    // When task is aborted (user cancelled), immediately send cancellation
    // error so the server knows this agent is free for new tasks. The
    // reason:"cancelled" field lets rust-server distinguish cancellation
    // from other errors without string-matching error messages, so it can
    // broadcast stream_end{reason:cancelled} to clear client-side thinking
    // state even when the stream loop already exited.
    abortController.signal.addEventListener("abort", () => {
      if (!markFinished()) return;
      this.sendTerminal({ type: "agent_error", taskId, error: "cancelled", reason: "cancelled" });
    }, { once: true });

    try {
      const result = this.taskHandler(ctx);
      Promise.resolve(result).catch((err) => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        ctx.sendError(errorMsg);
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      ctx.sendError(errorMsg);
    }
  }

  private processNextTask(conversationId: string): void {
    if (this.concurrencyMode === "agent-wide") {
      this.processNextTaskAgentWide(conversationId);
      return;
    }
    // per-conversation (and unbounded — unbounded never queues, so this is
    // effectively a no-op for it).
    const queue = this.conversationQueues.get(conversationId);
    if (!queue || queue.length === 0) {
      this.conversationQueues.delete(conversationId);
      return;
    }
    const nextTask = queue.shift()!;
    if (queue.length === 0) this.conversationQueues.delete(conversationId);
    this.executeTask(nextTask);
  }

  /**
   * agent-wide scheduling: prefer to keep draining the conv that just
   * finished (up to maxConsecutive back-to-back), then rotate to any other
   * conv with a non-empty queue. When every queue is empty, stop.
   *
   * Starvation-fix: whenever we pick a conv via rotation, we move its queue
   * entry to the tail of conversationQueues (delete + re-insert) so the next
   * rotation's insertion-order scan finds a different conv first. Without
   * this, Map.keys() insertion order is stable and "pick first != finished"
   * ping-pongs between the two oldest keys while later ones starve.
   */
  private processNextTaskAgentWide(finishedConvId: string): void {
    const currentCount = this.consecutiveTaskCount.get(finishedConvId) ?? 0;
    const sameQueue = this.conversationQueues.get(finishedConvId);

    // Stay on the same conv if we still have budget AND more work queued.
    // No reshuffle needed: rotation skips finishedConvId regardless of where
    // its Map entry sits.
    if (sameQueue && sameQueue.length > 0 && currentCount < this.maxConsecutive) {
      const nextTask = sameQueue.shift()!;
      if (sameQueue.length === 0) this.conversationQueues.delete(finishedConvId);
      this.executeTask(nextTask);
      return;
    }

    // Rotating away from finishedConvId — reset its counter so next time it
    // gets picked it starts fresh.
    this.consecutiveTaskCount.delete(finishedConvId);

    // Look for another conv with a non-empty queue.
    let nextConvId: string | null = null;
    for (const convId of this.conversationQueues.keys()) {
      if (convId !== finishedConvId) {
        nextConvId = convId;
        break;
      }
    }

    // Only the just-finished conv still has work — run it even though we
    // hit the consecutive cap; starvation beats idle.
    if (!nextConvId) {
      if (sameQueue && sameQueue.length > 0) {
        nextConvId = finishedConvId;
      } else {
        return;
      }
    }

    const queue = this.conversationQueues.get(nextConvId)!;
    const nextTask = queue.shift()!;
    if (queue.length === 0) {
      this.conversationQueues.delete(nextConvId);
    } else {
      // Move this conv to the tail of insertion order — next rotation will
      // find a different conv first. Fairness across 3+ convs with ongoing
      // backlog depends on this reshuffle.
      this.conversationQueues.delete(nextConvId);
      this.conversationQueues.set(nextConvId, queue);
    }
    this.executeTask(nextTask);
  }
}

function generateCallId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `call_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `call_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
