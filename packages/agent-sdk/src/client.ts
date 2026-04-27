import type {
  ArinovaAgentOptions,
  AgentSkill,
  TaskAttachment,
  TaskContext,
  TaskHandler,
  AgentEvent,
  AgentEventListener,
  UploadResult,
  FetchHistoryOptions,
  FetchHistoryResult,
  Note,
  ListNotesOptions,
  ListNotesResult,
  CreateNoteBody,
  UpdateNoteBody,
  KanbanBoard,
  KanbanColumn,
  KanbanCard,
  CreateBoardBody,
  UpdateBoardBody,
  CreateCardBody,
  UpdateCardBody,
  CreateColumnBody,
  UpdateColumnBody,
  AddCommitBody,
  CardCommit,
  CardNote,
  ArchivedCardsResult,
  KanbanLabel,
  CreateLabelBody,
  UpdateLabelBody,
  QueryMemoryOptions,
  MemoryEntry,
  MemoryOrigin,
  ShareNoteResult,
  SkillPrompt,
  ToolCallReport,
} from "./types.js";

const DEFAULT_RECONNECT_INTERVAL = 5_000;
const DEFAULT_PING_INTERVAL = 30_000;
const TASK_HEARTBEAT_INTERVAL = 60_000;
const MAX_QUEUE_SIZE = 10;
const AUTH_ERROR_MAX_RETRIES = 5;
const AUTH_ERROR_BASE_DELAY = 5_000; // 5s, 10s, 20s, 40s, 60s cap
const AUTH_ERROR_MAX_DELAY = 60_000;

export class ArinovaAgent {
  private readonly serverUrl: string;
  private readonly botToken: string;
  private readonly skills: AgentSkill[];
  private readonly reconnectInterval: number;
  private readonly pingInterval: number;
  private readonly concurrencyMode: "per-conversation" | "agent-wide" | "unbounded";
  private readonly maxConsecutive: number;

  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private commandHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private authRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private stoppedReason: string | null = null;
  private authErrorCount = 0;
  private authRetryAttempt = 0;
  private isAuthRetrying = false;
  private agentId: string | null = null;
  private taskHandler: TaskHandler | null = null;
  private taskAbortControllers: Map<string, AbortController> = new Map();
  private activeConversationTasks: Map<string, string> = new Map(); // conversationId → taskId
  private conversationQueues: Map<string, Array<Record<string, unknown>>> = new Map(); // conversationId → queued task data
  // agent-wide mode only: how many tasks have run back-to-back from a given
  // conv. Incremented in executeTask, reset when the scheduler rotates away.
  private consecutiveTaskCount: Map<string, number> = new Map();
  // agent-wide mode only: synchronous lock flag. handleTask flips this inside
  // the same sync frame as its queue/execute decision so two tasks arriving
  // back-to-back can't both observe an "empty Map" and race into parallel
  // execution (the hasLiveTask-read → executeTask-write window). executeTask
  // re-asserts it so the drain path (processNextTaskAgentWide → executeTask)
  // preserves the invariant "lock == a task is live under agent-wide mode".
  private agentWideLock = false;

  private listeners: Record<string, Array<(...args: unknown[]) => void>> = {
    connected: [],
    disconnected: [],
    error: [],
    auth_failed: [],
  };

  // Used to resolve/reject the connect() promise on first auth
  private connectResolve: (() => void) | null = null;
  private connectReject: ((err: Error) => void) | null = null;

  constructor(options: ArinovaAgentOptions) {
    this.serverUrl = options.serverUrl.replace(/\/$/, "");
    this.botToken = options.botToken;
    this.skills = options.skills ?? [];
    this.reconnectInterval = options.reconnectInterval ?? DEFAULT_RECONNECT_INTERVAL;
    this.pingInterval = options.pingInterval ?? DEFAULT_PING_INTERVAL;
    this.concurrencyMode = options.concurrencyMode ?? "per-conversation";
    this.maxConsecutive = options.maxConsecutivePerConversation ?? 2;
  }

  /** Register a task handler. Called when the server sends a task. */
  onTask(handler: TaskHandler): this {
    this.taskHandler = handler;
    return this;
  }

  /** Register an event listener. */
  on<T extends AgentEvent>(event: T, listener: AgentEventListener<T>): this {
    this.listeners[event]?.push(listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Connect to the Arinova server.
   * Returns a promise that resolves on successful auth, or rejects on auth failure.
   */
  connect(): Promise<void> {
    this.stopped = false;
    this.stoppedReason = null;
    this.authErrorCount = 0;
    this.authRetryAttempt = 0;
    this.isAuthRetrying = false;
    if (this.authRetryTimer) { clearTimeout(this.authRetryTimer); this.authRetryTimer = null; }
    return new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
      this.doConnect();
    });
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
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: "agent_send", conversationId, content });
      return;
    }

    // Fallback to HTTP
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/messages/send`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ conversationId, content }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`sendMessage failed (${res.status}): ${body}`);
    }
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
  sendHud(data: Record<string, unknown>): void {
    this.send({ type: "hud_update", data });
  }

  /**
   * Report a single tool call to the server over the existing WebSocket.
   * Intended to be called immediately after each tool finishes so the
   * server can build a real-time activity log. Silently no-ops if the
   * WebSocket is not connected.
   */
  async reportToolCall(report: ToolCallReport): Promise<void> {
    this.send({ type: "tool_call_report", report });
  }

  private emit(event: "connected" | "disconnected" | "auth_failed"): void;
  private emit(event: "error", error: Error): void;
  private emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners[event] ?? []) {
      listener(...args);
    }
  }

  private send(event: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  private cleanup(): void {
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
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    // Clear queues BEFORE aborting — abort triggers markFinished → processNextTask,
    // which would dequeue and start tasks during disconnect if queues aren't empty.
    this.conversationQueues.clear();
    this.activeConversationTasks.clear();
    for (const controller of this.taskAbortControllers.values()) {
      controller.abort();
    }
    this.taskAbortControllers.clear();
  }

  private stop(reason: string): void {
    this.stopped = true;
    this.stoppedReason = reason;
    console.warn(`[arinova-agent-sdk] stopped: ${reason}`);
  }

  private scheduleReconnect(): void {
    if (this.stopped) {
      console.warn(`[arinova-agent-sdk] reconnect skipped: stopped (${this.stoppedReason ?? "unknown"})`);
      return;
    }
    console.info(`[arinova-agent-sdk] scheduling reconnect in ${this.reconnectInterval}ms`);
    this.reconnectTimer = setTimeout(() => {
      if (this.stopped) {
        console.warn(`[arinova-agent-sdk] reconnect timer fired but agent is stopped (${this.stoppedReason ?? "unknown"})`);
        return;
      }
      console.info("[arinova-agent-sdk] reconnect timer fired");
      this.doConnect();
    }, this.reconnectInterval);
  }

  private doConnect(): void {
    if (this.stopped) {
      console.warn(`[arinova-agent-sdk] connect skipped: stopped (${this.stoppedReason ?? "unknown"})`);
      return;
    }
    this.cleanup();

    const wsUrl = `${this.serverUrl}/ws/agent`;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit("error", error);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      const authMsg: Record<string, unknown> = { type: "agent_auth", botToken: this.botToken };
      if (this.skills.length > 0) {
        authMsg.skills = this.skills;
      }
      this.send(authMsg);

      this.pingTimer = setInterval(() => {
        this.send({ type: "ping" });
      }, this.pingInterval);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data));

        if (data.type === "auth_ok") {
          this.agentId = data.agentId ?? null;
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

          // Resolve the connect() promise on first successful auth
          if (this.connectResolve) {
            this.connectResolve();
            this.connectResolve = null;
            this.connectReject = null;
          }
          return;
        }

        if (data.type === "auth_error") {
          this.handleAuthError(data.error);
          return;
        }

        if (data.type === "pong") {
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
              queue.splice(idx, 1);
              if (queue.length === 0) this.conversationQueues.delete(convId);
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
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    };

    this.ws.onerror = () => {
      // WebSocket errors are followed by close events
    };

    this.ws.onclose = () => {
      this.cleanup();
      this.emit("disconnected");
      // Skip this one close if auth retry already scheduled its own reconnect
      if (this.isAuthRetrying) {
        console.info("[arinova-agent-sdk] close handled by auth retry timer; skipping normal reconnect once");
        this.isAuthRetrying = false; // Only skip once — subsequent closes reconnect normally
        return;
      }
      this.scheduleReconnect();
    };
  }

  private handleAuthError(rawError: unknown): void {
    const errorMessage = typeof rawError === "string" ? rawError : String(rawError ?? "Unknown auth error");
    const isRetryableServerAuthError = this.isRetryableServerAuthError(errorMessage);

    this.authRetryAttempt++;
    if (!isRetryableServerAuthError) {
      this.authErrorCount++;
    }
    this.isAuthRetrying = true; // Prevent onclose from overriding backoff

    const error = isRetryableServerAuthError
      ? new Error(`Agent auth retryable server error (retry ${this.authRetryAttempt}, auth failures ${this.authErrorCount}/${AUTH_ERROR_MAX_RETRIES}): ${errorMessage}`)
      : new Error(`Agent auth failed (attempt ${this.authErrorCount}/${AUTH_ERROR_MAX_RETRIES}, retry ${this.authRetryAttempt}): ${errorMessage}`);
    this.emit("error", error);

    if (isRetryableServerAuthError) {
      console.warn(`[arinova-agent-sdk] auth retryable server error; not counting toward auth failure limit: ${errorMessage}`);
    } else if (this.authErrorCount >= AUTH_ERROR_MAX_RETRIES) {
      console.warn(`[arinova-agent-sdk] auth failure limit reached (${this.authErrorCount}/${AUTH_ERROR_MAX_RETRIES}); continuing retry with capped backoff`);
    }

    this.cleanup();
    this.scheduleAuthRetry();
  }

  private isRetryableServerAuthError(errorMessage: string): boolean {
    const message = errorMessage.toLowerCase();
    return (
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("not ready") ||
      message.includes("unavailable") ||
      message.includes("temporarily") ||
      message.includes("connection") ||
      message.includes("network") ||
      message.includes("econnrefused") ||
      message.includes("gateway") ||
      message.includes("502") ||
      message.includes("503") ||
      message.includes("504")
    );
  }

  private scheduleAuthRetry(): void {
    const delay = Math.min(
      AUTH_ERROR_BASE_DELAY * Math.pow(2, Math.max(this.authRetryAttempt - 1, 0)),
      AUTH_ERROR_MAX_DELAY
    );
    if (this.authRetryTimer) {
      clearTimeout(this.authRetryTimer);
      this.authRetryTimer = null;
    }
    console.info(`[arinova-agent-sdk] scheduling auth retry #${this.authRetryAttempt + 1} in ${delay}ms`);
    this.authRetryTimer = setTimeout(() => {
      this.authRetryTimer = null;
      if (this.stopped) {
        console.warn(`[arinova-agent-sdk] auth retry timer fired but agent is stopped (${this.stoppedReason ?? "unknown"})`);
        return;
      }
      console.info(`[arinova-agent-sdk] auth retry timer fired after retry #${this.authRetryAttempt}`);
      this.doConnect();
    }, delay);
  }

  /**
   * Upload a file to R2 storage via the agent upload endpoint.
   * @param conversationId - The conversation this upload belongs to.
   * @param file - File data as Buffer or Uint8Array.
   * @param fileName - Original file name (used for extension detection).
   * @param fileType - Optional MIME type (derived from extension if omitted).
   */
  async uploadFile(
    conversationId: string,
    file: Uint8Array,
    fileName: string,
    fileType?: string,
  ): Promise<UploadResult> {
    // Derive HTTP URL from WebSocket URL
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const mime = fileType || mimeFromFileName(fileName);
    const formData = new FormData();
    formData.append("conversationId", conversationId);
    const blob = new Blob([new Uint8Array(file) as unknown as ArrayBuffer], { type: mime });
    formData.append("file", blob, fileName);

    const res = await fetch(`${httpUrl}/api/v1/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Upload failed (${res.status}): ${body}`);
    }

    return res.json() as Promise<UploadResult>;
  }

  /**
   * Fetch conversation history via the agent messages endpoint.
   * @param conversationId - The conversation to fetch messages from.
   * @param options - Pagination options (before, after, around, limit).
   */
  async fetchHistory(
    conversationId: string,
    options?: FetchHistoryOptions,
  ): Promise<FetchHistoryResult> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const params = new URLSearchParams();
    if (options?.before) params.set("before", options.before);
    if (options?.after) params.set("after", options.after);
    if (options?.around) params.set("around", options.around);
    if (options?.limit != null) params.set("limit", String(options.limit));

    const qs = params.toString();
    const url = `${httpUrl}/api/v1/messages/${conversationId}${qs ? `?${qs}` : ""}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`fetchHistory failed (${res.status}): ${body}`);
    }

    return res.json() as Promise<FetchHistoryResult>;
  }

  /**
   * List notes in a conversation.
   * @param conversationId - The conversation to list notes from.
   * @param options - Pagination options (before, limit).
   */
  async listNotes(
    conversationId: string,
    options?: ListNotesOptions,
  ): Promise<ListNotesResult> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const params = new URLSearchParams();
    if (options?.before) params.set("before", options.before);
    if (options?.limit != null) params.set("limit", String(options.limit));
    if (options?.offset != null) params.set("offset", String(options.offset));
    if (options?.tags?.length) params.set("tags", options.tags.join(","));
    if (options?.archived) params.set("archived", "true");

    const qs = params.toString();
    const url = `${httpUrl}/api/v1/notes${qs ? `?${qs}` : ""}`;

    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.botToken}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`listNotes failed (${res.status}): ${body}`);
    }

    return res.json() as Promise<ListNotesResult>;
  }

  /**
   * Create a note in a conversation.
   * @param conversationId - The conversation to create the note in.
   * @param body - Note title and optional content.
   */
  async createNote(
    conversationId: string,
    body: CreateNoteBody,
  ): Promise<Note> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(
      `${httpUrl}/api/v1/notes`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`createNote failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<Note>;
  }

  /**
   * Update a note in a conversation.
   * @param conversationId - The conversation the note belongs to.
   * @param noteId - The note ID to update.
   * @param body - Fields to update (title and/or content).
   */
  async updateNote(
    conversationId: string,
    noteId: string,
    body: UpdateNoteBody,
  ): Promise<Note> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(
      `${httpUrl}/api/v1/notes/${noteId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${this.botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`updateNote failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<Note>;
  }

  /**
   * Delete a note from a conversation.
   * @param conversationId - The conversation the note belongs to.
   * @param noteId - The note ID to delete.
   */
  async deleteNote(
    conversationId: string,
    noteId: string,
  ): Promise<void> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(
      `${httpUrl}/api/v1/notes/${noteId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${this.botToken}` },
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`deleteNote failed (${res.status}): ${text}`);
    }
  }

  // ── Kanban API ────────────────────────────────────────────────

  /**
   * List the owner's kanban boards.
   * Returns an array of boards with id, name, and createdAt.
   */
  async listBoards(): Promise<KanbanBoard[]> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/boards`, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.botToken}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`listBoards failed (${res.status}): ${body}`);
    }

    return res.json() as Promise<KanbanBoard[]>;
  }

  /**
   * Create a kanban card on the owner's board.
   * The card is automatically assigned to the calling agent.
   * @param body - Card title and optional description, priority, column.
   */
  async createCard(body: CreateCardBody): Promise<KanbanCard> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/cards`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`createCard failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<KanbanCard>;
  }

  /**
   * Update a kanban card.
   * @param cardId - The card ID to update.
   * @param body - Fields to update (title, description, priority, columnId, sortOrder).
   */
  async updateCard(cardId: string, body: UpdateCardBody): Promise<KanbanCard> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/cards/${cardId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`updateCard failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<KanbanCard>;
  }

  /**
   * Create a new kanban board.
   * @param body - Board name and optional initial columns.
   */
  async createBoard(body: CreateBoardBody): Promise<KanbanBoard> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/boards`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`createBoard failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<KanbanBoard>;
  }

  /**
   * Update a kanban board.
   * @param boardId - The board ID to update.
   * @param body - Fields to update.
   */
  async updateBoard(boardId: string, body: UpdateBoardBody): Promise<KanbanBoard> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/boards/${boardId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`updateBoard failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<KanbanBoard>;
  }

  /**
   * Archive a kanban board.
   * @param boardId - The board ID to archive.
   */
  async archiveBoard(boardId: string): Promise<void> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/boards/${boardId}/archive`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.botToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`archiveBoard failed (${res.status}): ${text}`);
    }
  }

  /**
   * List columns for a board.
   * @param boardId - The board ID.
   */
  async listColumns(boardId: string): Promise<KanbanColumn[]> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/boards/${boardId}/columns`, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.botToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`listColumns failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<KanbanColumn[]>;
  }

  /**
   * Create a column in a board.
   * @param boardId - The board ID.
   * @param body - Column name and optional sort order.
   */
  async createColumn(boardId: string, body: CreateColumnBody): Promise<KanbanColumn> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/boards/${boardId}/columns`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`createColumn failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<KanbanColumn>;
  }

  /**
   * Update a column.
   * @param columnId - The column ID to update.
   * @param body - Fields to update (name, sortOrder).
   */
  async updateColumn(columnId: string, body: UpdateColumnBody): Promise<KanbanColumn> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/columns/${columnId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`updateColumn failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<KanbanColumn>;
  }

  /**
   * Delete a column.
   * @param columnId - The column ID to delete.
   */
  async deleteColumn(columnId: string): Promise<void> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/columns/${columnId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.botToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`deleteColumn failed (${res.status}): ${text}`);
    }
  }

  /**
   * Reorder columns in a board.
   * @param boardId - The board ID.
   * @param columnIds - Ordered array of column IDs.
   */
  async reorderColumns(boardId: string, columnIds: string[]): Promise<void> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/boards/${boardId}/columns/reorder`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ columnIds }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`reorderColumns failed (${res.status}): ${text}`);
    }
  }

  /**
   * List kanban cards for the agent's owner.
   * @param options - Pagination and search options.
   */
  async listCards(options?: {
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<KanbanCard[]> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const params = new URLSearchParams();
    if (options?.search) params.set("search", options.search);
    if (options?.limit != null) params.set("limit", String(options.limit));
    if (options?.offset != null) params.set("offset", String(options.offset));
    const qs = params.toString();

    const res = await fetch(`${httpUrl}/api/v1/kanban/cards${qs ? `?${qs}` : ""}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.botToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`listCards failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<KanbanCard[]>;
  }

  /**
   * Mark a card as complete (moves it to the Done column).
   * @param cardId - The card ID to complete.
   */
  async completeCard(cardId: string): Promise<KanbanCard> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/cards/${cardId}/complete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.botToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`completeCard failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<KanbanCard>;
  }

  /**
   * List archived cards for a board.
   * @param boardId - The board ID.
   * @param options - Pagination options (page, limit).
   */
  async listArchivedCards(
    boardId: string,
    options?: { page?: number; limit?: number },
  ): Promise<ArchivedCardsResult> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const params = new URLSearchParams();
    if (options?.page != null) params.set("page", String(options.page));
    if (options?.limit != null) params.set("limit", String(options.limit));

    const qs = params.toString();
    const url = `${httpUrl}/api/v1/kanban/boards/${boardId}/archived-cards${qs ? `?${qs}` : ""}`;

    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.botToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`listArchivedCards failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<ArchivedCardsResult>;
  }

  /**
   * Add a commit link to a card.
   * @param cardId - The card ID.
   * @param body - Commit hash and optional message.
   */
  async addCardCommit(cardId: string, body: AddCommitBody): Promise<CardCommit> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/cards/${cardId}/commits`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`addCardCommit failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<CardCommit>;
  }

  /**
   * List commits linked to a card.
   * @param cardId - The card ID.
   */
  async listCardCommits(cardId: string): Promise<CardCommit[]> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/cards/${cardId}/commits`, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.botToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`listCardCommits failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<CardCommit[]>;
  }

  /**
   * Link a note to a card.
   * @param cardId - The card ID.
   * @param noteId - The note ID to link.
   */
  async linkCardNote(cardId: string, noteId: string): Promise<void> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/cards/${cardId}/notes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ noteId }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`linkCardNote failed (${res.status}): ${text}`);
    }
  }

  /**
   * Unlink a note from a card.
   * @param cardId - The card ID.
   * @param noteId - The note ID to unlink.
   */
  async unlinkCardNote(cardId: string, noteId: string): Promise<void> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/cards/${cardId}/notes/${noteId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.botToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`unlinkCardNote failed (${res.status}): ${text}`);
    }
  }

  /**
   * List notes linked to a card.
   * @param cardId - The card ID.
   */
  async listCardNotes(cardId: string): Promise<CardNote[]> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/cards/${cardId}/notes`, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.botToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`listCardNotes failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<CardNote[]>;
  }

  // ── Label API ────────────────────────────────────────────────

  /**
   * List labels for a board.
   * @param boardId - The board ID.
   */
  async listLabels(boardId: string): Promise<KanbanLabel[]> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/boards/${boardId}/labels`, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.botToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`listLabels failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<KanbanLabel[]>;
  }

  /**
   * Create a label on a board.
   * @param boardId - The board ID.
   * @param body - Label name and optional color.
   */
  async createLabel(boardId: string, body: CreateLabelBody): Promise<KanbanLabel> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/boards/${boardId}/labels`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`createLabel failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<KanbanLabel>;
  }

  /**
   * Update a label.
   * @param labelId - The label ID to update.
   * @param body - Fields to update (name, color).
   */
  async updateLabel(labelId: string, body: UpdateLabelBody): Promise<KanbanLabel> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/labels/${labelId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`updateLabel failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<KanbanLabel>;
  }

  /**
   * Delete a label.
   * @param labelId - The label ID to delete.
   */
  async deleteLabel(labelId: string): Promise<void> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/labels/${labelId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.botToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`deleteLabel failed (${res.status}): ${text}`);
    }
  }

  /**
   * Add a label to a card.
   * @param cardId - The card ID.
   * @param labelId - The label ID to add.
   */
  async addCardLabel(cardId: string, labelId: string): Promise<void> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/cards/${cardId}/labels`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ labelId }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`addCardLabel failed (${res.status}): ${text}`);
    }
  }

  /**
   * Remove a label from a card.
   * @param cardId - The card ID.
   * @param labelId - The label ID to remove.
   */
  async removeCardLabel(cardId: string, labelId: string): Promise<void> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(`${httpUrl}/api/v1/kanban/cards/${cardId}/labels/${labelId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.botToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`removeCardLabel failed (${res.status}): ${text}`);
    }
  }

  // ── Memory API ───────────────────────────────────────────────

  /**
   * Search agent memories using hybrid search (embedding + keyword + recency).
   * @param options - Query string and optional limit.
   */
  async queryMemory(options: QueryMemoryOptions): Promise<MemoryEntry[]> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const params = new URLSearchParams();
    params.set("q", options.query);
    if (options.limit != null) params.set("limit", String(options.limit));

    const res = await fetch(`${httpUrl}/api/v1/memories/search?${params}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.botToken}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`queryMemory failed (${res.status}): ${body}`);
    }

    const raw = (await res.json()) as Array<{
      id: string;
      category: string;
      summary: string;
      detail: string | null;
      score: number;
      source?: string;
    }>;

    return raw.map((r) => {
      const entry: MemoryEntry = {
        content: r.summary + (r.detail ? `\n${r.detail}` : ""),
        category: r.category,
        score: r.score,
      };
      const origin = normalizeMemoryOrigin(r.source);
      if (origin !== undefined) {
        entry.origin = origin;
      }
      return entry;
    });
  }

  // ── Skill Prompt API ─────────────────────────────────────────

  /**
   * Fetch the full prompt content for an installed skill by slug.
   * Use this when the agent decides to trigger a skill from availableSkills.
   * @param skillSlug - The skill slug (e.g. "draw", "proactive-agent").
   */
  async fetchSkillPrompt(skillSlug: string): Promise<SkillPrompt> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(
      `${httpUrl}/api/v1/skills/${encodeURIComponent(skillSlug)}/prompt`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${this.botToken}` },
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`fetchSkillPrompt failed (${res.status}): ${body}`);
    }

    return (await res.json()) as SkillPrompt;
  }

  // ── Note Share API ───────────────────────────────────────────

  /**
   * Share a note as a message in a conversation.
   * Creates a rich preview card visible to all conversation members.
   * @param conversationId - The conversation to share into.
   * @param noteId - The note ID to share.
   */
  async shareNote(
    conversationId: string,
    noteId: string,
  ): Promise<ShareNoteResult> {
    const httpUrl = this.serverUrl
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:");

    const res = await fetch(
      `${httpUrl}/api/v1/notes/${noteId}/share`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.botToken}` },
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`shareNote failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<ShareNoteResult>;
  }

  private handleTask(data: Record<string, unknown>): void {
    if (!this.taskHandler) return;

    const conversationId = data.conversationId as string;

    // Unbounded: no serialisation, run every task immediately.
    if (this.concurrencyMode === "unbounded") {
      this.executeTask(data);
      return;
    }

    // agent-wide: any live task (in any conv) forces queueing. The flag is
    // checked and flipped in one sync frame so cross-conv arrivals can't both
    // decide "not queued" before either one has set the Map entries that
    // hasLiveTask() would otherwise rely on.
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
      const activeTaskId = this.activeConversationTasks.get(conversationId);
      shouldQueue = !!(activeTaskId && this.taskAbortControllers.has(activeTaskId));
    }

    if (shouldQueue) {
      let queue = this.conversationQueues.get(conversationId);
      if (!queue) {
        queue = [];
        this.conversationQueues.set(conversationId, queue);
      }
      // Overflow: drop oldest queued task when queue is full
      if (queue.length >= MAX_QUEUE_SIZE) {
        const dropped = queue.shift()!;
        this.send({ type: "agent_error", taskId: dropped.taskId as string, error: "queue_overflow" });
      }
      queue.push(data);
      // Notify the server that this task has been queued (not yet running).
      // The rust-server side maps this onto its stream_queued broadcast so
      // the web/iOS clients can render a "position N in queue" indicator.
      // globalQueueSize spans every conv's queue — the UI uses it for the
      // "跨 conv 前面 N 則" cross-conversation count.
      let globalQueueSize = 0;
      for (const q of this.conversationQueues.values()) globalQueueSize += q.length;
      this.send({
        type: "task_queued",
        taskId: data.taskId as string,
        conversationId,
        queuePosition: queue.length - 1,
        globalQueueSize,
      });
      return;
    }

    this.executeTask(data);
  }

  /** True if any conv currently has an active (non-finished) task. */
  private hasLiveTask(): boolean {
    for (const taskId of this.activeConversationTasks.values()) {
      if (this.taskAbortControllers.has(taskId)) return true;
    }
    return false;
  }

  private executeTask(data: Record<string, unknown>): void {
    if (!this.taskHandler) return;

    const taskId = data.taskId as string;
    const conversationId = data.conversationId as string;
    const abortController = new AbortController();
    this.taskAbortControllers.set(taskId, abortController);
    this.activeConversationTasks.set(conversationId, taskId);

    // agent-wide scheduler bookkeeping: count consecutive runs from this
    // conv so processNextTask can rotate when the cap is reached. Also
    // re-assert the lock — the drain path (markFinished → processNextTask
    // → processNextTaskAgentWide → executeTask) releases the lock before
    // the drain, so without this the next task would start with the flag
    // cleared and a concurrent arrival could bypass the queue.
    if (this.concurrencyMode === "agent-wide") {
      this.agentWideLock = true;
      const prev = this.consecutiveTaskCount.get(conversationId) ?? 0;
      this.consecutiveTaskCount.set(conversationId, prev + 1);
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
      this.activeConversationTasks.delete(conversationId);
      // Release the agent-wide lock before draining — processNextTask may
      // synchronously call executeTask for the next queued task, which
      // re-acquires the lock. If no task is drained, the lock stays false
      // and the next arrival is free to run.
      if (this.concurrencyMode === "agent-wide") {
        this.agentWideLock = false;
      }
      this.processNextTask(conversationId);
      return true;
    };

    const ctx: TaskContext = {
      taskId,
      userMessageId: data.userMessageId as string | undefined,
      conversationId,
      content: data.content as string,
      conversationType: data.conversationType as string | undefined,
      senderUserId: data.senderUserId as string | undefined,
      senderUsername: data.senderUsername as string | undefined,
      members: data.members as { agentId: string; agentName: string }[] | undefined,
      replyTo: data.replyTo as { role: string; content: string; senderAgentName?: string } | undefined,
      history: data.history as { role: string; content: string; senderAgentName?: string; senderUsername?: string; createdAt: string }[] | undefined,
      attachments: data.attachments as TaskAttachment[] | undefined,
      sendChunk: (delta: string) => {
        if (taskFinished) return;
        this.send({ type: "agent_chunk", taskId, chunk: delta });
      },
      sendComplete: (fullContent: string, options?: { mentions?: string[] }) => {
        if (!markFinished()) return;
        this.send({
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
        this.send(payload);
      },
      signal: abortController.signal,
      uploadFile: (file, fileName, fileType?) =>
        this.uploadFile(conversationId, file, fileName, fileType),
      fetchHistory: (options?) =>
        this.fetchHistory(conversationId, options),
    };

    // When task is aborted (user cancelled), immediately send cancellation
    // error so the server knows this agent is free for new tasks. The
    // reason:"cancelled" field lets rust-server distinguish cancellation
    // from other errors without string-matching error messages, so it can
    // broadcast stream_end{reason:cancelled} to clear client-side thinking
    // state even when the stream loop already exited.
    abortController.signal.addEventListener("abort", () => {
      if (!markFinished()) return;
      this.send({ type: "agent_error", taskId, error: "cancelled", reason: "cancelled" });
    }, { once: true });

    Promise.resolve(this.taskHandler(ctx)).catch((err) => {
      const errorMsg = err instanceof Error ? err.message : String(err);
      ctx.sendError(errorMsg);
    });
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

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
};

function mimeFromFileName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

/**
 * Normalize the rust-server `agent_memories.source` value into a
 * {@link MemoryOrigin}. Returns `undefined` when the input is missing or
 * doesn't match a known pattern, so the caller can leave `origin` off the
 * entry (forward-compat with servers that don't yet surface the column).
 *
 * - `'user'`                  → `'self'`
 * - `'system'`                → `'system'`
 * - `'shared-from-<8-hex>'`  → as-is (8-hex-suffix validated, lowercased)
 */
function normalizeMemoryOrigin(source: string | undefined): MemoryOrigin | undefined {
  if (!source) return undefined;
  if (source === "user") return "self";
  if (source === "system") return "system";
  const m = source.match(/^shared-from-([0-9a-fA-F]{8})$/);
  if (m) return `shared-from-${m[1]!.toLowerCase()}`;
  return undefined;
}
