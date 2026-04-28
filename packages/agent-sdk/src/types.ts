/** Skill metadata declared by the agent. */
export interface AgentSkill {
  /** Unique skill identifier (used as slash command, e.g. "draw"). */
  id: string;
  /** Human-readable skill name. */
  name: string;
  /** Short description of what the skill does. */
  description: string;
}

/** Options for creating an ArinovaAgent. */
export interface ArinovaAgentOptions {
  /** WebSocket server URL (e.g. "wss://chat.arinova.ai" or "ws://localhost:21001"). */
  serverUrl: string;
  /** Bot token from the Arinova dashboard. */
  botToken: string;
  /** Skills this agent supports — shown as slash commands to users. */
  skills?: AgentSkill[];
  /** Reconnect interval in ms (default: 5000). */
  reconnectInterval?: number;
  /** Ping interval in ms (default: 30000). */
  pingInterval?: number;
  /** Pong timeout in ms before forcing reconnect (default: 2 * pingInterval). */
  pingTimeout?: number;
  /**
   * Controls how the SDK serialises tasks when multiple arrive for the same agent.
   *
   * - `per-conversation` (default): one active task per conversationId; further
   *   tasks for the same conv queue, other convs run in parallel. Backward
   *   compatible with all pre-0.0.17 deployments.
   * - `agent-wide`: at most one active task across the whole agent; any incoming
   *   task is queued if another conv is already busy. The queue drains
   *   round-robin with a per-conv consecutive-run cap.
   * - `unbounded`: no gating, every task runs immediately. Intended for edge
   *   cases where the agent can truly handle unlimited parallelism.
   */
  concurrencyMode?: "per-conversation" | "agent-wide" | "unbounded";
  /**
   * In `agent-wide` mode, the max number of tasks that may run consecutively
   * from a single conversation before the scheduler rotates to another conv
   * with a non-empty queue. Default: 2. Ignored in other modes.
   */
  maxConsecutivePerConversation?: number;
}

/** Context passed to the task handler. */
export interface TaskContext {
  /** Unique task ID assigned by the server. */
  taskId: string;
  /** ID of the user message that triggered this task. */
  userMessageId?: string;
  /** Conversation ID this task belongs to. */
  conversationId: string;
  /** The user's message content. */
  content: string;
  /** Conversation type: "direct" or "group". */
  conversationType?: string;
  /** User ID of the human who sent the message. */
  senderUserId?: string;
  /** Username of the human who sent the message. */
  senderUsername?: string;
  /** Other agents in the conversation (for group conversations). */
  members?: { agentId: string; agentName: string }[];
  /** The message being replied to, if this is a reply. */
  replyTo?: { role: string; content: string; senderAgentName?: string };
  /** Recent conversation history (up to 5 messages before the current one). */
  history?: { role: string; content: string; senderAgentName?: string; senderUsername?: string; createdAt: string }[];
  /** Attachments from the user's message (images, files). Use the url to download. */
  attachments?: TaskAttachment[];
  /** Skills installed on this agent — use fetchSkillPrompt() to get the full prompt content. */
  availableSkills?: { slug: string; name: string; slashCommand: string | null; description: string }[];
  /** Send a streaming delta (new characters only) to the user. */
  sendChunk: (delta: string) => void;
  /** Mark the task as complete with the full response content. */
  sendComplete: (content: string, options?: { mentions?: string[] }) => void;
  /** Mark the task as failed with an error message. */
  sendError: (error: string) => void;
  /** AbortSignal that fires when the user cancels the stream. Check signal.aborted or listen to signal.addEventListener('abort', ...) to stop generation early. */
  signal: AbortSignal;
  /** Upload a file to R2 storage. Returns the public URL and file metadata. */
  uploadFile: (
    file: Uint8Array,
    fileName: string,
    fileType?: string,
  ) => Promise<UploadResult>;
  /** Fetch full conversation history with pagination. */
  fetchHistory: (options?: FetchHistoryOptions) => Promise<FetchHistoryResult>;
}

/** An attachment from the user's message. */
export interface TaskAttachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  /** Public URL to download the attachment. */
  url: string;
}

/** Result from uploading a file. */
export interface UploadResult {
  url: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

/** A message returned by fetchHistory(). */
export interface HistoryMessage {
  id: string;
  conversationId: string;
  seq: number;
  role: string;
  content: string;
  status: string;
  senderAgentId?: string;
  senderAgentName?: string;
  senderUserId?: string;
  senderUsername?: string;
  replyToId?: string;
  threadId?: string;
  createdAt: string;
  updatedAt: string;
  attachments?: TaskAttachment[];
}

/** Options for fetchHistory(). */
export interface FetchHistoryOptions {
  /** Fetch messages before this message ID (for backward pagination). */
  before?: string;
  /** Fetch messages after this message ID (for forward pagination). */
  after?: string;
  /** Fetch messages around this message ID. */
  around?: string;
  /** Max messages to return (default 50, max 100). */
  limit?: number;
}

/** Result from fetchHistory(). */
export interface FetchHistoryResult {
  messages: HistoryMessage[];
  hasMore: boolean;
  nextCursor?: string;
}

/** A conversation note. */
export interface Note {
  id: string;
  conversationId: string;
  creatorId: string;
  creatorType: "user" | "agent";
  creatorName: string;
  agentId?: string;
  agentName?: string;
  title: string;
  content: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

/** Options for listNotes(). */
export interface ListNotesOptions {
  /** Cursor: fetch notes created before this note ID. */
  before?: string;
  /** Max notes to return (default 20, max 50). */
  limit?: number;
  /** Skip first N notes (offset-based pagination). Ignored when `before` is set. */
  offset?: number;
  /** Filter by tags (AND logic). */
  tags?: string[];
  /** If true, list archived notes instead of active. */
  archived?: boolean;
}

/** Result from listNotes(). */
export interface ListNotesResult {
  notes: Note[];
  hasMore: boolean;
  nextCursor?: string;
}

/** Body for createNote(). */
export interface CreateNoteBody {
  title: string;
  content?: string;
  tags?: string[];
  /** Target notebook ID. If omitted, uses the conversation owner's default notebook. */
  notebookId?: string;
}

/** Body for updateNote(). */
export interface UpdateNoteBody {
  title?: string;
  content?: string;
  tags?: string[];
}

// ── Kanban types ──────────────────────────────────────────────

/** A kanban board. */
export interface KanbanBoard {
  id: string;
  name: string;
  createdAt: string;
}

/** A kanban column within a board. */
export interface KanbanColumn {
  id: string;
  boardId: string;
  name: string;
  sortOrder: number;
}

/** A kanban card. */
export interface KanbanCard {
  id: string;
  columnId: string;
  columnName?: string;
  title: string;
  description: string | null;
  priority: string | null;
  dueDate: string | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  archivedAt?: string | null;
}

/** Body for createCard(). */
export interface CreateCardBody {
  /** Title of the card (required). */
  title: string;
  /** Card description in markdown. */
  description?: string;
  /** Priority: "low", "medium", "high", or "urgent". */
  priority?: string;
  /** Column name to place the card in (e.g. "To Do"). If omitted, uses first column. */
  columnName?: string;
  /** Column ID to place the card in (takes precedence over columnName). */
  columnId?: string;
  /** Board ID to create the card on (if the owner has multiple boards). */
  boardId?: string;
}

/** Body for updateCard(). */
export interface UpdateCardBody {
  title?: string;
  description?: string;
  priority?: string;
  columnId?: string;
  sortOrder?: number;
}

/** Result from listBoards(). */
export interface ListBoardsResult {
  boards: KanbanBoard[];
  columns: KanbanColumn[];
  cards: KanbanCard[];
}

/** Body for createBoard(). */
export interface CreateBoardBody {
  name: string;
  columns?: { name: string }[];
}

/** Body for updateBoard(). */
export interface UpdateBoardBody {
  name: string;
}

/** Body for createColumn(). */
export interface CreateColumnBody {
  name: string;
  sortOrder?: number;
}

/** Body for updateColumn(). */
export interface UpdateColumnBody {
  name?: string;
  sortOrder?: number;
}

/** Body for addCardCommit(). */
export interface AddCommitBody {
  commitHash: string;
  message?: string;
}

/** A commit linked to a kanban card. */
export interface CardCommit {
  cardId: string;
  commitHash: string;
  message: string;
  createdAt: string;
}

/** A note linked to a kanban card. */
export interface CardNote {
  id: string;
  title: string;
  tags: string[];
  createdAt: string;
}

/** Paginated result from listArchivedCards(). */
export interface ArchivedCardsResult {
  cards: KanbanCard[];
  total: number;
  page: number;
  limit: number;
}

// ── Label types ──────────────────────────────────────────────

/** A kanban label. */
export interface KanbanLabel {
  id: string;
  boardId: string;
  name: string;
  color: string | null;
}

/** Body for createLabel(). */
export interface CreateLabelBody {
  name: string;
  color?: string;
}

/** Body for updateLabel(). */
export interface UpdateLabelBody {
  name?: string;
  color?: string;
}

// ── Memory types ──────────────────────────────────────────────

/**
 * Memory origin classification mirroring rust-server `agent_memories.source`.
 *
 * - `'self'`                   — written by this agent itself (DB `source='user'`)
 * - `'system'`                 — system seed (DB `source='system'`)
 * - `` `shared-from-${string}` `` — shared in from another agent; the suffix is
 *   the source agent's UUID first 8 hex (lowercase),
 *   e.g. `'shared-from-4a04a28f'`. Pattern is enforced server-side by
 *   `parse_shared_from` (rust-server card 84443d41).
 */
export type MemoryOrigin = "self" | "system" | `shared-from-${string}`;

/** Options for queryMemory(). */
export interface QueryMemoryOptions {
  /** Search keywords or semantic query (required). */
  query: string;
  /** Max results to return (default 10, max 20). */
  limit?: number;
}

/**
 * A memory search result entry.
 *
 * `origin` is optional for forward compatibility: the rust-server
 * `/api/v1/memories/search` endpoint does not yet surface the underlying
 * `source` column. Once it does, this field will be populated; until then
 * consumers should treat `undefined` as "unknown / not reported".
 */
export interface MemoryEntry {
  content: string;
  category: string;
  score: number;
  origin?: MemoryOrigin;
}

// ── Note share types ──────────────────────────────────────────

/** Result from shareNote(). */
export interface ShareNoteResult {
  messageId: string;
  noteId: string;
  title: string;
  preview: string;
  tags: string[];
}

/** Skill prompt content returned by fetchSkillPrompt(). */
export interface SkillPrompt {
  promptContent: string;
  promptTemplate: string;
  parameters: unknown[];
}

// ── Tool call report types ───────────────────────────────────

/** A single tool call report, emitted immediately after each tool completes. */
export interface ToolCallReport {
  /** Agent session ID (same as telemetry session_id). */
  sessionId: string;
  /** Turn ID — one UUID per sendMessage() call; shared across all tool calls in that turn. */
  turnId: string;
  /** 0-based order of this tool call within the turn. */
  seqOrder: number;
  /** Tool name (e.g. "bash", "read_file"). */
  toolName: string;
  /** Raw tool input as JSON-serialisable object. */
  input: Record<string, unknown>;
  /** Tool output (any JSON value) — omitted on failure or when not applicable. */
  output?: unknown;
  /** Duration in milliseconds. */
  durationMs?: number;
  /** Whether the tool call succeeded. */
  success: boolean;
  /** Error message if success === false. */
  error?: string;
  /** UUID of the user message that triggered this turn. Optional for backwards
   *  compatibility — older callers that don't thread a message UUID through
   *  will simply omit it and the server-side row keeps message_id NULL. */
  messageId?: string;
}

/** Task handler function. */
export type TaskHandler = (task: TaskContext) => void | Promise<void>;

/** Agent lifecycle event types. */
export type AgentEvent = "connected" | "disconnected" | "error" | "auth_failed";

/** Event listener signatures. */
export type AgentEventListener<T extends AgentEvent> = T extends "error"
  ? (error: Error) => void
  : () => void;
