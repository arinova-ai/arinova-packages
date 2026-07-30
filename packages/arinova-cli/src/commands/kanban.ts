import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";
import { encodePathSegment, UnsupportedCommandError } from "../client.js";

const e = encodePathSegment;

function parseJsonArray(value: string, label: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Fall through to the stable validation error.
  }
  throw new Error(`${label} must be a JSON array`);
}

export function registerKanbanCommands(program: Command): void {
  const kanban = program.command("kanban").description("Kanban board commands");

  // Board commands
  const board = kanban.command("board").description("Board management");
  board.command("list").action(async () => {
    const { token, apiUrl } = getOpts(board);
    output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/kanban/boards`, token }));
  });
  board.command("create").requiredOption("--name <name>", "Board name").action(async (opts: { name: string }) => {
    const { token, apiUrl } = getOpts(board);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/boards`, token, body: { name: opts.name } }));
  });
  board.command("update").requiredOption("--board-id <id>", "Board ID").requiredOption("--name <name>", "New name").option("--auto-archive-days <n>", "Auto-archive days (0=off)").action(async (opts: { boardId: string; name: string; autoArchiveDays?: string }) => {
    const { token, apiUrl } = getOpts(board);
    const body: Record<string, unknown> = { name: opts.name };
    if (opts.autoArchiveDays != null) body.autoArchiveDays = parseInt(opts.autoArchiveDays);
    output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/v1/kanban/boards/${e(opts.boardId)}`, token, body }));
  });
  board.command("archive").requiredOption("--board-id <id>", "Board ID").action(async (opts: { boardId: string }) => {
    const { token, apiUrl } = getOpts(board);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/boards/${e(opts.boardId)}/archive`, token }));
  });
  board.command("unarchive").requiredOption("--board-id <id>", "Board ID").action(async (opts: { boardId: string }) => {
    const { token, apiUrl } = getOpts(board);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/boards/${e(opts.boardId)}/unarchive`, token }));
  });
  board.command("archived-cards").requiredOption("--board-id <id>", "Board ID").action(async (opts: { boardId: string }) => {
    const { token, apiUrl } = getOpts(board);
    output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/kanban/boards/${e(opts.boardId)}/archived-cards`, token }));
  });
  board.command("delete").requiredOption("--board-id <id>", "Board ID").description("Delete an archived board (must be archived first)").action(async (opts: { boardId: string }) => {
    const { token, apiUrl } = getOpts(board);
    output(await apiCall({ method: "DELETE", url: `${apiUrl}/api/v1/kanban/boards/${e(opts.boardId)}`, token }));
  });

  // Column commands
  const column = kanban.command("column").description("Column management");
  column.command("list").requiredOption("--board-id <id>", "Board ID").action(async (opts: { boardId: string }) => {
    const { token, apiUrl } = getOpts(column);
    output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/kanban/boards/${e(opts.boardId)}/columns`, token }));
  });
  column.command("create").requiredOption("--board-id <id>", "Board ID").requiredOption("--name <name>", "Column name").action(async (opts: { boardId: string; name: string }) => {
    const { token, apiUrl } = getOpts(column);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/boards/${e(opts.boardId)}/columns`, token, body: { name: opts.name } }));
  });
  column.command("reorder").requiredOption("--board-id <id>", "Board ID").requiredOption("--column-ids <ids>", "Comma-separated column IDs in desired order").action(async (opts: { boardId: string; columnIds: string }) => {
    const { token, apiUrl } = getOpts(column);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/boards/${e(opts.boardId)}/columns/reorder`, token, body: { columnIds: opts.columnIds.split(",").map((s) => s.trim()) } }));
  });
  column.command("update")
    .requiredOption("--column-id <id>", "Column ID")
    .option("--name <name>", "Column name")
    .option("--sort-order <n>", "Sort order")
    .option("--wip-limit <n>", "WIP limit")
    .option("--column-type <type>", "Column type")
    .action(async (opts: { columnId: string; name?: string; sortOrder?: string; wipLimit?: string; columnType?: string }) => {
      const { token, apiUrl } = getOpts(column);
      output(await apiCall({
        method: "PATCH", url: `${apiUrl}/api/v1/kanban/columns/${e(opts.columnId)}`, token,
        body: {
          name: opts.name,
          sortOrder: opts.sortOrder == null ? undefined : Number(opts.sortOrder),
          wipLimit: opts.wipLimit == null ? undefined : Number(opts.wipLimit),
          columnType: opts.columnType,
        },
      }));
    });
  column.command("delete").requiredOption("--column-id <id>", "Column ID").action(async (opts: { columnId: string }) => {
    const { token, apiUrl } = getOpts(column);
    output(await apiCall({ method: "DELETE", url: `${apiUrl}/api/v1/kanban/columns/${e(opts.columnId)}`, token }));
  });

  // Card commands
  const card = kanban.command("card").description("Card management");
  card.command("list")
    .description("List cards. --search matches ID prefix (4+ hex), title, or description.")
    .option("--search <query>", "Search by ID prefix (4+ hex), title, or description")
    .option("--limit <n>", "Max cards to return (default 200)", parseInt)
    .option("--offset <n>", "Skip first N cards (pagination)", parseInt)
    .option("--all", "Fetch all matching cards (paginates internally)")
    .action(async (opts: { search?: string; limit?: number; offset?: number; all?: boolean }) => {
      const { token, apiUrl } = getOpts(card);
      const searchTrimmed = opts.search?.trim();
      const isHexPrefix = !!searchTrimmed && /^[0-9a-f]{4,}$/i.test(searchTrimmed);
      // ID-prefix search needs full scan: server `search` only matches title/description.
      const fetchAll = opts.all === true || isHexPrefix;
      const target = fetchAll ? Number.POSITIVE_INFINITY : (opts.limit ?? 200);
      const startOffset = opts.offset ?? 0;
      const PAGE = 100; // server caps `limit` at 100 per request

      const collected: Record<string, unknown>[] = [];
      let cursor = startOffset;
      while (collected.length < target) {
        const remaining = target === Number.POSITIVE_INFINITY
          ? PAGE
          : Math.min(PAGE, target - collected.length);
        const params = new URLSearchParams();
        // Don't send hex prefix to server — it would yield zero hits via title/description ILIKE.
        if (searchTrimmed && !isHexPrefix) params.set("search", searchTrimmed);
        params.set("limit", String(remaining));
        params.set("offset", String(cursor));
        const page = await apiCall({
          method: "GET",
          url: `${apiUrl}/api/v1/kanban/cards?${params.toString()}`,
          token,
        });
        if (!Array.isArray(page) || page.length === 0) break;
        collected.push(...(page as Record<string, unknown>[]));
        if (page.length < remaining) break;
        cursor += page.length;
      }

      let result: Record<string, unknown>[] = collected;
      if (searchTrimmed && isHexPrefix) {
        const q = searchTrimmed.toLowerCase();
        result = collected.filter((c) => {
          const id = typeof c.id === "string" ? c.id.toLowerCase() : "";
          const title = typeof c.title === "string" ? c.title.toLowerCase() : "";
          const desc = typeof c.description === "string" ? c.description.toLowerCase() : "";
          return id.startsWith(q) || title.includes(q) || desc.includes(q);
        });
      }
      output(result);
    });
  card.command("create").requiredOption("--title <title>", "Card title").option("--board-id <id>", "Board ID").option("--column-name <name>", "Column name").option("--description <desc>", "Description").action(async (opts: { title: string; boardId?: string; columnName?: string; description?: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/cards`, token, body: opts }));
  });
  card.command("update").requiredOption("--card-id <id>", "Card ID").option("--title <text>", "New title").option("--description <text>", "New description").option("--column-id <id>", "Move to column").action(async (opts: { cardId: string; title?: string; description?: string; columnId?: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/v1/kanban/cards/${e(opts.cardId)}`, token, body: { title: opts.title, description: opts.description, columnId: opts.columnId } }));
  });
  card.command("complete").requiredOption("--card-id <id>", "Card ID").action(async (opts: { cardId: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/cards/${e(opts.cardId)}/complete`, token }));
  });
  card.command("delete").requiredOption("--card-id <id>", "Card ID").action(async (opts: { cardId: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "DELETE", url: `${apiUrl}/api/v1/kanban/cards/${e(opts.cardId)}`, token }));
  });
  card.command("move").requiredOption("--card-id <id>", "Card ID").requiredOption("--column-name <name>", "Target column name").action(async (opts: { cardId: string; columnName: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/v1/kanban/cards/${e(opts.cardId)}`, token, body: { columnName: opts.columnName } }));
  });
  card.command("add-commit").requiredOption("--card-id <id>", "Card ID").requiredOption("--sha <sha>", "Commit SHA").requiredOption("--message <msg>", "Commit message").option("--url <url>", "Commit URL").action(async (opts: { cardId: string; sha: string; message: string; url?: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/cards/${e(opts.cardId)}/commits`, token, body: { commitHash: opts.sha, message: opts.message, url: opts.url } }));
  });
  card.command("archive").description("Archive a card").requiredOption("--card-id <id>", "Card ID").action(async (opts: { cardId: string }) => {
    void opts;
    throw new UnsupportedCommandError("Card archive has no supported /api/v1 contract");
  });
  card.command("unarchive").description("Unarchive a card").requiredOption("--card-id <id>", "Card ID").action(async (opts: { cardId: string }) => {
    void opts;
    throw new UnsupportedCommandError("Card unarchive has no supported /api/v1 contract");
  });
  card.command("link-note").description("Link a note to a card").requiredOption("--card-id <id>", "Card ID").requiredOption("--note-id <id>", "Note ID").action(async (opts: { cardId: string; noteId: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/cards/${e(opts.cardId)}/notes`, token, body: { noteId: opts.noteId } }));
  });
  card.command("unlink-note").description("Unlink a note from a card").requiredOption("--card-id <id>", "Card ID").requiredOption("--note-id <id>", "Note ID").action(async (opts: { cardId: string; noteId: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "DELETE", url: `${apiUrl}/api/v1/kanban/cards/${e(opts.cardId)}/notes/${e(opts.noteId)}`, token }));
  });
  card.command("notes").description("List linked notes").requiredOption("--card-id <id>", "Card ID").action(async (opts: { cardId: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/kanban/cards/${e(opts.cardId)}/notes`, token }));
  });
  card.command("commits").description("List linked commits").requiredOption("--card-id <id>", "Card ID").action(async (opts: { cardId: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/kanban/cards/${e(opts.cardId)}/commits`, token }));
  });
  const comment = card.command("comment").description("Card comments");
  comment.command("list").requiredOption("--card-id <id>", "Card ID").option("--limit <n>").option("--offset <n>").action(async (opts: { cardId: string; limit?: string; offset?: string }) => {
    const { token, apiUrl } = getOpts(comment);
    const qs = new URLSearchParams();
    if (opts.limit) qs.set("limit", opts.limit);
    if (opts.offset) qs.set("offset", opts.offset);
    output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/kanban/cards/${e(opts.cardId)}/comments${qs.size ? `?${qs}` : ""}`, token }));
  });
  comment.command("add").requiredOption("--card-id <id>", "Card ID").requiredOption("--content <text>", "Comment content").action(async (opts: { cardId: string; content: string }) => {
    const { token, apiUrl } = getOpts(comment);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/cards/${e(opts.cardId)}/comments`, token, body: { content: opts.content } }));
  });
  comment.command("get").argument("<comment-id>", "Comment ID").action(async (commentId: string) => {
    const { token, apiUrl } = getOpts(comment);
    output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/kanban/comments/${e(commentId)}`, token }));
  });
  const cardLabel = card.command("label").description("Card labels");
  cardLabel.command("add").requiredOption("--card-id <id>", "Card ID").requiredOption("--label-id <id>", "Label ID").action(async (opts: { cardId: string; labelId: string }) => {
    const { token, apiUrl } = getOpts(cardLabel);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/cards/${e(opts.cardId)}/labels`, token, body: { labelId: opts.labelId } }));
  });
  cardLabel.command("remove").requiredOption("--card-id <id>", "Card ID").requiredOption("--label-id <id>", "Label ID").action(async (opts: { cardId: string; labelId: string }) => {
    const { token, apiUrl } = getOpts(cardLabel);
    output(await apiCall({ method: "DELETE", url: `${apiUrl}/api/v1/kanban/cards/${e(opts.cardId)}/labels/${e(opts.labelId)}`, token }));
  });
  cardLabel.command("list").requiredOption("--card-id <id>", "Card ID").action(async (opts: { cardId: string }) => {
    const { token, apiUrl } = getOpts(cardLabel);
    output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/kanban/cards/${e(opts.cardId)}`, token }));
  });
  card.command("bulk-move").requiredOption("--moves <json>", "JSON array of {cardId,toColumnId}").action(async (opts: { moves: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/cards/bulk-move`, token, body: { moves: parseJsonArray(opts.moves, "--moves") } }));
  });

  // Label commands
  const label = kanban.command("label").description("Label management");
  label.command("list").requiredOption("--board-id <id>", "Board ID").action(async (opts: { boardId: string }) => {
    const { token, apiUrl } = getOpts(label);
    output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/kanban/boards/${e(opts.boardId)}/labels`, token }));
  });
  label.command("create").requiredOption("--board-id <id>", "Board ID").requiredOption("--name <name>", "Label name").requiredOption("--color <color>", "Color hex").action(async (opts: { boardId: string; name: string; color: string }) => {
    const { token, apiUrl } = getOpts(label);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/boards/${e(opts.boardId)}/labels`, token, body: { name: opts.name, color: opts.color } }));
  });
  label.command("update").requiredOption("--label-id <id>", "Label ID").option("--name <name>").option("--color <color>").action(async (opts: { labelId: string; name?: string; color?: string }) => {
    const { token, apiUrl } = getOpts(label);
    output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/v1/kanban/labels/${e(opts.labelId)}`, token, body: { name: opts.name, color: opts.color } }));
  });
  label.command("delete").requiredOption("--label-id <id>", "Label ID").action(async (opts: { labelId: string }) => {
    const { token, apiUrl } = getOpts(label);
    output(await apiCall({ method: "DELETE", url: `${apiUrl}/api/v1/kanban/labels/${e(opts.labelId)}`, token }));
  });
}
