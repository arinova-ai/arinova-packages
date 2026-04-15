import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";

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
    output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/v1/kanban/boards/${opts.boardId}`, token, body }));
  });
  board.command("archive").requiredOption("--board-id <id>", "Board ID").action(async (opts: { boardId: string }) => {
    const { token, apiUrl } = getOpts(board);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/boards/${opts.boardId}/archive`, token }));
  });
  board.command("delete").requiredOption("--board-id <id>", "Board ID").description("Delete an archived board (must be archived first)").action(async (opts: { boardId: string }) => {
    const { token, apiUrl } = getOpts(board);
    output(await apiCall({ method: "DELETE", url: `${apiUrl}/api/v1/kanban/boards/${opts.boardId}`, token }));
  });

  // Column commands
  const column = kanban.command("column").description("Column management");
  column.command("list").requiredOption("--board-id <id>", "Board ID").action(async (opts: { boardId: string }) => {
    const { token, apiUrl } = getOpts(column);
    output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/kanban/boards/${opts.boardId}/columns`, token }));
  });
  column.command("create").requiredOption("--board-id <id>", "Board ID").requiredOption("--name <name>", "Column name").action(async (opts: { boardId: string; name: string }) => {
    const { token, apiUrl } = getOpts(column);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/boards/${opts.boardId}/columns`, token, body: { name: opts.name } }));
  });
  column.command("reorder").requiredOption("--board-id <id>", "Board ID").requiredOption("--column-ids <ids>", "Comma-separated column IDs in desired order").action(async (opts: { boardId: string; columnIds: string }) => {
    const { token, apiUrl } = getOpts(column);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/boards/${opts.boardId}/columns/reorder`, token, body: { columnIds: opts.columnIds.split(",").map((s) => s.trim()) } }));
  });

  // Card commands
  const card = kanban.command("card").description("Card management");
  card.command("list")
    .option("--search <query>", "Search cards by title or description")
    .option("--limit <n>", "Max cards to return (default 20)", parseInt)
    .option("--offset <n>", "Skip first N cards (pagination)", parseInt)
    .action(async (opts: { search?: string; limit?: number; offset?: number }) => {
      const { token, apiUrl } = getOpts(card);
      const params = new URLSearchParams();
      if (opts.search) params.set("search", opts.search);
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.offset) params.set("offset", String(opts.offset));
      const qs = params.toString() ? `?${params.toString()}` : "";
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/kanban/cards${qs}`, token }));
    });
  card.command("create").requiredOption("--title <title>", "Card title").option("--board-id <id>", "Board ID").option("--column-name <name>", "Column name").option("--description <desc>", "Description").action(async (opts: { title: string; boardId?: string; columnName?: string; description?: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/cards`, token, body: opts }));
  });
  card.command("update").requiredOption("--card-id <id>", "Card ID").option("--title <text>", "New title").option("--description <text>", "New description").option("--column-id <id>", "Move to column").action(async (opts: { cardId: string; title?: string; description?: string; columnId?: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/v1/kanban/cards/${opts.cardId}`, token, body: { title: opts.title, description: opts.description, columnId: opts.columnId } }));
  });
  card.command("complete").requiredOption("--card-id <id>", "Card ID").action(async (opts: { cardId: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/cards/${opts.cardId}/complete`, token }));
  });
  card.command("delete").requiredOption("--card-id <id>", "Card ID").action(async (opts: { cardId: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "DELETE", url: `${apiUrl}/api/v1/kanban/cards/${opts.cardId}`, token }));
  });
  card.command("move").requiredOption("--card-id <id>", "Card ID").requiredOption("--column-name <name>", "Target column name").action(async (opts: { cardId: string; columnName: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/v1/kanban/cards/${opts.cardId}`, token, body: { columnName: opts.columnName } }));
  });
  card.command("add-commit").requiredOption("--card-id <id>", "Card ID").requiredOption("--sha <sha>", "Commit SHA").requiredOption("--message <msg>", "Commit message").option("--url <url>", "Commit URL").action(async (opts: { cardId: string; sha: string; message: string; url?: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/cards/${opts.cardId}/commits`, token, body: { commitHash: opts.sha, message: opts.message, url: opts.url } }));
  });
  card.command("archive").description("Archive a card").requiredOption("--card-id <id>", "Card ID").action(async (opts: { cardId: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/v1/kanban/cards/${opts.cardId}`, token, body: { archived: true } }));
  });
  card.command("unarchive").description("Unarchive a card").requiredOption("--card-id <id>", "Card ID").action(async (opts: { cardId: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/v1/kanban/cards/${opts.cardId}`, token, body: { archived: false } }));
  });
  card.command("link-note").description("Link a note to a card").requiredOption("--card-id <id>", "Card ID").requiredOption("--note-id <id>", "Note ID").action(async (opts: { cardId: string; noteId: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/cards/${opts.cardId}/notes`, token, body: { noteId: opts.noteId } }));
  });
  card.command("unlink-note").description("Unlink a note from a card").requiredOption("--card-id <id>", "Card ID").requiredOption("--note-id <id>", "Note ID").action(async (opts: { cardId: string; noteId: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "DELETE", url: `${apiUrl}/api/v1/kanban/cards/${opts.cardId}/notes/${opts.noteId}`, token }));
  });

  // Label commands
  const label = kanban.command("label").description("Label management");
  label.command("list").requiredOption("--board-id <id>", "Board ID").action(async (opts: { boardId: string }) => {
    const { token, apiUrl } = getOpts(label);
    output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/kanban/boards/${opts.boardId}/labels`, token }));
  });
  label.command("create").requiredOption("--board-id <id>", "Board ID").requiredOption("--name <name>", "Label name").requiredOption("--color <color>", "Color hex").action(async (opts: { boardId: string; name: string; color: string }) => {
    const { token, apiUrl } = getOpts(label);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/kanban/boards/${opts.boardId}/labels`, token, body: { name: opts.name, color: opts.color } }));
  });
}
