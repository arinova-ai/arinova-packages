import type {
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
  SkillPrompt,
  ShareNoteResult,
} from "../types.js";
import { delayWithSignal, httpRetryDelayMs, toHttpBaseUrl } from "../transport.js";
import { encodePathSegment } from "./path.js";
import { parseJsonWithoutDuplicateKeys } from "./json.js";

export class ArinovaApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ArinovaApiError";
    this.status = status;
    this.body = body;
  }
}

export abstract class ArinovaRestClient {
  protected readonly serverUrl: string;
  protected botToken: string;

  protected constructor(serverUrl: string, botToken: string) {
    this.serverUrl = serverUrl;
    this.botToken = botToken;
  }

  private get httpUrl(): string {
    return toHttpBaseUrl(this.serverUrl);
  }

  protected async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      response?: "json" | "void";
      errorLabel?: string;
      malformedJsonLabel?: string;
      signal?: AbortSignal;
      timeoutMs?: number;
      retries?: number;
    } = {},
  ): Promise<T> {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const deadline = Date.now() + timeoutMs;
    const retries = options.retries ?? 0;
    let response: Response | undefined;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (Date.now() >= deadline) {
        throw new ArinovaApiError(
          `${options.errorLabel ?? "Request"} failed: timed out after ${timeoutMs}ms`,
          0,
          null,
        );
      }
      const controller = new AbortController();
      const onAbort = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.signal?.aborted) controller.abort(options.signal.reason);
      const remaining = Math.max(1, deadline - Date.now());
      const timer = setTimeout(() => controller.abort(), remaining);
      timer.unref?.();
      const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
      try {
        response = await fetch(`${this.httpUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.botToken}`,
            ...(!isForm && options.body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...options.headers,
          },
          ...(options.body !== undefined
            ? { body: isForm ? options.body as FormData : JSON.stringify(options.body) }
            : {}),
          signal: controller.signal,
        });
        if (
          !(response.status === 429 || (response.status >= 500 && response.status <= 599)) ||
          attempt >= retries
        ) break;
        await response.body?.cancel();
        await delayWithSignal(
          Math.min(
            httpRetryDelayMs(response.headers, attempt),
            Math.max(0, deadline - Date.now()),
          ),
          options.signal,
        );
      } catch (err) {
        if (options.signal?.aborted) {
          throw new ArinovaApiError(
            `${options.errorLabel ?? "Request"} aborted`,
            0,
            { cause: err instanceof Error ? err.message : String(err) },
          );
        }
        if (attempt >= retries || Date.now() >= deadline) {
          throw new ArinovaApiError(
            `${options.errorLabel ?? "Request"} failed: ${controller.signal.aborted ? `timed out after ${timeoutMs}ms` : err instanceof Error ? err.message : String(err)}`,
            0,
            { cause: err instanceof Error ? err.message : String(err) },
          );
        }
        await delayWithSignal(
          Math.min(
            100 * 2 ** attempt + Math.floor(Math.random() * 50),
            Math.max(0, deadline - Date.now()),
          ),
          options.signal,
        );
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
      }
    }
    if (!response) {
      throw new ArinovaApiError(`${options.errorLabel ?? "Request"} failed`, 0, null);
    }
    if (!response.ok) {
      const text = await response.text();
      let body: unknown = text;
      if (text) {
        try {
          body = parseJsonWithoutDuplicateKeys(text);
        } catch {
          // Preserve non-JSON bodies as text.
        }
      }
      const detail = typeof body === "string" ? body : JSON.stringify(body);
      throw new ArinovaApiError(
        `${options.errorLabel ?? "Request"} failed (${response.status})${detail ? `: ${detail}` : ""}`,
        response.status,
        body,
      );
    }
    if (options.response === "void" || response.status === 204) return undefined as T;
    const text = await response.text();
    try {
      return parseJsonWithoutDuplicateKeys(text) as T;
    } catch (error) {
      throw new ArinovaApiError(
        `${options.malformedJsonLabel ?? options.errorLabel ?? "Request"} returned malformed JSON: ${error instanceof Error ? error.message : String(error)}`,
        response.status,
        text,
      );
    }
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
    const mime = fileType || mimeFromFileName(fileName);
    const formData = new FormData();
    formData.append("conversationId", conversationId);
    const blob = new Blob([new Uint8Array(file) as unknown as ArrayBuffer], { type: mime });
    formData.append("file", blob, fileName);

    return this.request<UploadResult>("POST", "/api/v1/files/upload", {
      body: formData,
      errorLabel: "Upload",
      malformedJsonLabel: "uploadFile",
    });
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
    const params = new URLSearchParams();
    if (options?.before) params.set("before", options.before);
    if (options?.after) params.set("after", options.after);
    if (options?.around) params.set("around", options.around);
    if (options?.limit != null) params.set("limit", String(options.limit));

    const qs = params.toString();
    return this.request<FetchHistoryResult>(
      "GET",
      `/api/v1/messages/${encodePathSegment(conversationId, "conversationId")}${qs ? `?${qs}` : ""}`,
      { errorLabel: "fetchHistory" },
    );
  }

  /** List notes in the authenticated owner's notebook. */
  async listNotes(options?: ListNotesOptions): Promise<ListNotesResult> {
    const params = new URLSearchParams();
    if (options?.before) params.set("before", options.before);
    if (options?.limit != null) params.set("limit", String(options.limit));
    if (options?.offset != null) params.set("offset", String(options.offset));
    if (options?.tags?.length) params.set("tags", options.tags.join(","));
    if (options?.archived) params.set("archived", "true");

    const qs = params.toString();
    return this.request<ListNotesResult>(
      "GET",
      `/api/v1/notes${qs ? `?${qs}` : ""}`,
      { errorLabel: "listNotes" },
    );
  }

  /** Create a note in the authenticated owner's notebook. */
  async createNote(body: CreateNoteBody): Promise<Note> {
    return this.request<Note>("POST", "/api/v1/notes", {
      body,
      errorLabel: "createNote",
    });
  }

  /** Update a note in the authenticated owner's notebook. */
  async updateNote(noteId: string, body: UpdateNoteBody): Promise<Note> {
    return this.request<Note>("PATCH", `/api/v1/notes/${encodePathSegment(noteId, "noteId")}`, {
      body,
      errorLabel: "updateNote",
    });
  }

  /** Delete a note from the authenticated owner's notebook. */
  async deleteNote(noteId: string): Promise<void> {
    await this.request<void>("DELETE", `/api/v1/notes/${encodePathSegment(noteId, "noteId")}`, {
      response: "void",
      errorLabel: "deleteNote",
    });
  }

  /** Share a note into a conversation and return the created message preview. */
  async shareNote(conversationId: string, noteId: string): Promise<ShareNoteResult> {
    return this.request<ShareNoteResult>(
      "POST",
      `/api/v1/notes/${encodePathSegment(noteId, "noteId")}/share`,
      { body: { conversationId }, errorLabel: "shareNote" },
    );
  }

  // ── Kanban API ────────────────────────────────────────────────

  /**
   * List the owner's kanban boards.
   * Returns an array of boards with id, name, and createdAt.
   */
  async listBoards(): Promise<KanbanBoard[]> {
    return this.request<KanbanBoard[]>("GET", "/api/v1/kanban/boards", {
      errorLabel: "listBoards",
    });
  }

  /**
   * Create a kanban card on the owner's board.
   * The card is automatically assigned to the calling agent.
   * @param body - Card title and optional description, priority, column.
   */
  async createCard(body: CreateCardBody): Promise<KanbanCard> {
    return this.request<KanbanCard>("POST", "/api/v1/kanban/cards", {
      body,
      errorLabel: "createCard",
    });
  }

  /**
   * Update a kanban card.
   * @param cardId - The card ID to update.
   * @param body - Fields to update (title, description, priority, columnId, sortOrder).
   */
  async updateCard(cardId: string, body: UpdateCardBody): Promise<KanbanCard> {
    return this.request<KanbanCard>("PATCH", `/api/v1/kanban/cards/${encodePathSegment(cardId, "cardId")}`, {
      body,
      errorLabel: "updateCard",
    });
  }

  /**
   * Create a new kanban board.
   * @param body - Board name and optional initial columns.
   */
  async createBoard(body: CreateBoardBody): Promise<KanbanBoard> {
    return this.request<KanbanBoard>("POST", "/api/v1/kanban/boards", {
      body,
      errorLabel: "createBoard",
    });
  }

  /**
   * Update a kanban board.
   * @param boardId - The board ID to update.
   * @param body - Fields to update.
   */
  async updateBoard(boardId: string, body: UpdateBoardBody): Promise<KanbanBoard> {
    return this.request<KanbanBoard>("PATCH", `/api/v1/kanban/boards/${encodePathSegment(boardId, "boardId")}`, {
      body,
      errorLabel: "updateBoard",
    });
  }

  /**
   * Archive a kanban board.
   * @param boardId - The board ID to archive.
   */
  async archiveBoard(boardId: string): Promise<void> {
    await this.request<void>("POST", `/api/v1/kanban/boards/${encodePathSegment(boardId, "boardId")}/archive`, {
      response: "void",
      errorLabel: "archiveBoard",
    });
  }

  /**
   * List columns for a board.
   * @param boardId - The board ID.
   */
  async listColumns(boardId: string): Promise<KanbanColumn[]> {
    return this.request<KanbanColumn[]>("GET", `/api/v1/kanban/boards/${encodePathSegment(boardId, "boardId")}/columns`, {
      errorLabel: "listColumns",
    });
  }

  /**
   * Create a column in a board.
   * @param boardId - The board ID.
   * @param body - Column name and optional sort order.
   */
  async createColumn(boardId: string, body: CreateColumnBody): Promise<KanbanColumn> {
    return this.request<KanbanColumn>("POST", `/api/v1/kanban/boards/${encodePathSegment(boardId, "boardId")}/columns`, {
      body,
      errorLabel: "createColumn",
    });
  }

  /**
   * Update a column.
   * @param columnId - The column ID to update.
   * @param body - Fields to update (name, sortOrder).
   */
  async updateColumn(columnId: string, body: UpdateColumnBody): Promise<KanbanColumn> {
    return this.request<KanbanColumn>("PATCH", `/api/v1/kanban/columns/${encodePathSegment(columnId, "columnId")}`, {
      body,
      errorLabel: "updateColumn",
    });
  }

  /**
   * Delete a column.
   * @param columnId - The column ID to delete.
   */
  async deleteColumn(columnId: string): Promise<void> {
    await this.request<void>("DELETE", `/api/v1/kanban/columns/${encodePathSegment(columnId, "columnId")}`, {
      response: "void",
      errorLabel: "deleteColumn",
    });
  }

  /**
   * Reorder columns in a board.
   * @param boardId - The board ID.
   * @param columnIds - Ordered array of column IDs.
   */
  async reorderColumns(boardId: string, columnIds: string[]): Promise<void> {
    await this.request<void>("POST", `/api/v1/kanban/boards/${encodePathSegment(boardId, "boardId")}/columns/reorder`, {
      body: { columnIds },
      response: "void",
      errorLabel: "reorderColumns",
    });
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
    const params = new URLSearchParams();
    if (options?.search) params.set("search", options.search);
    if (options?.limit != null) params.set("limit", String(options.limit));
    if (options?.offset != null) params.set("offset", String(options.offset));
    const qs = params.toString();

    return this.request<KanbanCard[]>("GET", `/api/v1/kanban/cards${qs ? `?${qs}` : ""}`, {
      errorLabel: "listCards",
    });
  }

  /**
   * Mark a card as complete (moves it to the Done column).
   * @param cardId - The card ID to complete.
   */
  async completeCard(cardId: string): Promise<KanbanCard> {
    return this.request<KanbanCard>("POST", `/api/v1/kanban/cards/${encodePathSegment(cardId, "cardId")}/complete`, {
      errorLabel: "completeCard",
    });
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
    const params = new URLSearchParams();
    if (options?.page != null) params.set("page", String(options.page));
    if (options?.limit != null) params.set("limit", String(options.limit));

    const qs = params.toString();
    return this.request<ArchivedCardsResult>(
      "GET",
      `/api/v1/kanban/boards/${encodePathSegment(boardId, "boardId")}/archived-cards${qs ? `?${qs}` : ""}`,
      { errorLabel: "listArchivedCards" },
    );
  }

  /**
   * Add a commit link to a card.
   * @param cardId - The card ID.
   * @param body - Commit hash and optional message.
   */
  async addCardCommit(cardId: string, body: AddCommitBody): Promise<CardCommit> {
    return this.request<CardCommit>("POST", `/api/v1/kanban/cards/${encodePathSegment(cardId, "cardId")}/commits`, {
      body,
      errorLabel: "addCardCommit",
    });
  }

  /**
   * List commits linked to a card.
   * @param cardId - The card ID.
   */
  async listCardCommits(cardId: string): Promise<CardCommit[]> {
    return this.request<CardCommit[]>("GET", `/api/v1/kanban/cards/${encodePathSegment(cardId, "cardId")}/commits`, {
      errorLabel: "listCardCommits",
    });
  }

  /**
   * Link a note to a card.
   * @param cardId - The card ID.
   * @param noteId - The note ID to link.
   */
  async linkCardNote(cardId: string, noteId: string): Promise<void> {
    await this.request<void>("POST", `/api/v1/kanban/cards/${encodePathSegment(cardId, "cardId")}/notes`, {
      body: { noteId },
      response: "void",
      errorLabel: "linkCardNote",
    });
  }

  /**
   * Unlink a note from a card.
   * @param cardId - The card ID.
   * @param noteId - The note ID to unlink.
   */
  async unlinkCardNote(cardId: string, noteId: string): Promise<void> {
    await this.request<void>("DELETE", `/api/v1/kanban/cards/${encodePathSegment(cardId, "cardId")}/notes/${encodePathSegment(noteId, "noteId")}`, {
      response: "void",
      errorLabel: "unlinkCardNote",
    });
  }

  /**
   * List notes linked to a card.
   * @param cardId - The card ID.
   */
  async listCardNotes(cardId: string): Promise<CardNote[]> {
    return this.request<CardNote[]>("GET", `/api/v1/kanban/cards/${encodePathSegment(cardId, "cardId")}/notes`, {
      errorLabel: "listCardNotes",
    });
  }

  // ── Label API ────────────────────────────────────────────────

  /**
   * List labels for a board.
   * @param boardId - The board ID.
   */
  async listLabels(boardId: string): Promise<KanbanLabel[]> {
    return this.request<KanbanLabel[]>("GET", `/api/v1/kanban/boards/${encodePathSegment(boardId, "boardId")}/labels`, {
      errorLabel: "listLabels",
    });
  }

  /**
   * Create a label on a board.
   * @param boardId - The board ID.
   * @param body - Label name and optional color.
   */
  async createLabel(boardId: string, body: CreateLabelBody): Promise<KanbanLabel> {
    return this.request<KanbanLabel>("POST", `/api/v1/kanban/boards/${encodePathSegment(boardId, "boardId")}/labels`, {
      body,
      errorLabel: "createLabel",
    });
  }

  /**
   * Update a label.
   * @param labelId - The label ID to update.
   * @param body - Fields to update (name, color).
   */
  async updateLabel(labelId: string, body: UpdateLabelBody): Promise<KanbanLabel> {
    return this.request<KanbanLabel>("PATCH", `/api/v1/kanban/labels/${encodePathSegment(labelId, "labelId")}`, {
      body,
      errorLabel: "updateLabel",
    });
  }

  /**
   * Delete a label.
   * @param labelId - The label ID to delete.
   */
  async deleteLabel(labelId: string): Promise<void> {
    await this.request<void>("DELETE", `/api/v1/kanban/labels/${encodePathSegment(labelId, "labelId")}`, {
      response: "void",
      errorLabel: "deleteLabel",
    });
  }

  /**
   * Add a label to a card.
   * @param cardId - The card ID.
   * @param labelId - The label ID to add.
   */
  async addCardLabel(cardId: string, labelId: string): Promise<void> {
    await this.request<void>("POST", `/api/v1/kanban/cards/${encodePathSegment(cardId, "cardId")}/labels`, {
      body: { labelId },
      response: "void",
      errorLabel: "addCardLabel",
    });
  }

  /**
   * Remove a label from a card.
   * @param cardId - The card ID.
   * @param labelId - The label ID to remove.
   */
  async removeCardLabel(cardId: string, labelId: string): Promise<void> {
    await this.request<void>("DELETE", `/api/v1/kanban/cards/${encodePathSegment(cardId, "cardId")}/labels/${encodePathSegment(labelId, "labelId")}`, {
      response: "void",
      errorLabel: "removeCardLabel",
    });
  }

  // ── Memory API ───────────────────────────────────────────────

  /**
   * Search agent memories using hybrid search (embedding + keyword + recency).
   * @param options - Query string and optional limit.
   */
  async queryMemory(options: QueryMemoryOptions): Promise<MemoryEntry[]> {
    const params = new URLSearchParams();
    params.set("q", options.query);
    if (options.limit != null) params.set("limit", String(options.limit));

    const raw = await this.request<Array<{
      id: string;
      category: string;
      summary: string;
      detail: string | null;
      score: number;
      source?: string;
    }>>("GET", `/api/v1/memories/search?${params}`, { errorLabel: "queryMemory" });

    if (!Array.isArray(raw)) {
      throw new ArinovaApiError("queryMemory returned a non-array response", 200, raw);
    }

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
    return this.request<SkillPrompt>(
      "GET",
      `/api/v1/skills/${encodePathSegment(skillSlug, "skillSlug")}/prompt`,
      { errorLabel: "fetchSkillPrompt" },
    );
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

function normalizeMemoryOrigin(source: string | undefined): MemoryOrigin | undefined {
  if (!source) return undefined;
  if (source === "user") return "self";
  if (source === "system") return "system";
  const match = source.match(/^shared-from-([0-9a-fA-F]{8})$/);
  if (match) return `shared-from-${match[1]!.toLowerCase()}`;
  return undefined;
}
