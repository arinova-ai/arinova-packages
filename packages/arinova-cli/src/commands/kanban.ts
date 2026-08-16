import type { Command } from "commander";
import { ApiError, encodePathSegment, resolveClient } from "../client.js";
import { parseJsonArray } from "../json-options.js";
import { printResult } from "../output.js";
import {
  collectAllPages,
  DEFAULT_PAGE_LIMIT,
  addPaginationOptions,
  pageLimit,
  paginationQuery,
} from "../pagination.js";

const e = encodePathSegment;

export function registerKanbanCommands(program: Command): void {
  const kanban = program.command("kanban").description("Kanban board commands");

  const board = kanban.command("board").description("Board management");
  board.command("list").action(async () => {
    printResult(await resolveClient(board).get("/api/v1/kanban/boards"));
  });
  board.command("create").requiredOption("--name <name>", "Board name").action(async (opts: { name: string }) => {
    printResult(await resolveClient(board).post("/api/v1/kanban/boards", { name: opts.name }));
  });
  board.command("update").requiredOption("--board-id <id>", "Board ID").requiredOption("--name <name>", "New name").option("--auto-archive-days <n>", "Auto-archive days (0=off)").action(async (opts: { boardId: string; name: string; autoArchiveDays?: string }) => {
    const body: Record<string, unknown> = { name: opts.name };
    if (opts.autoArchiveDays != null) body.autoArchiveDays = parseInt(opts.autoArchiveDays);
    printResult(await resolveClient(board).patch(`/api/v1/kanban/boards/${e(opts.boardId)}`, body));
  });
  board.command("archive").requiredOption("--board-id <id>", "Board ID").action(async (opts: { boardId: string }) => {
    printResult(await resolveClient(board).post(`/api/v1/kanban/boards/${e(opts.boardId)}/archive`));
  });
  board.command("unarchive").requiredOption("--board-id <id>", "Board ID").action(async (opts: { boardId: string }) => {
    printResult(await resolveClient(board).post(`/api/v1/kanban/boards/${e(opts.boardId)}/unarchive`));
  });
  board.command("archived-cards").requiredOption("--board-id <id>", "Board ID").action(async (opts: { boardId: string }) => {
    printResult(await resolveClient(board).get(`/api/v1/kanban/boards/${e(opts.boardId)}/archived-cards`));
  });
  board.command("delete").requiredOption("--board-id <id>", "Board ID").description("Delete an archived board (must be archived first)").action(async (opts: { boardId: string }) => {
    printResult(await resolveClient(board).delete(`/api/v1/kanban/boards/${e(opts.boardId)}`));
  });

  const column = kanban.command("column").description("Column management");
  column.command("list").requiredOption("--board-id <id>", "Board ID").action(async (opts: { boardId: string }) => {
    printResult(await resolveClient(column).get(`/api/v1/kanban/boards/${e(opts.boardId)}/columns`));
  });
  column.command("create").requiredOption("--board-id <id>", "Board ID").requiredOption("--name <name>", "Column name").action(async (opts: { boardId: string; name: string }) => {
    printResult(await resolveClient(column).post(`/api/v1/kanban/boards/${e(opts.boardId)}/columns`, { name: opts.name }));
  });
  column.command("reorder").requiredOption("--board-id <id>", "Board ID").requiredOption("--column-ids <ids>", "Comma-separated column IDs in desired order").action(async (opts: { boardId: string; columnIds: string }) => {
    printResult(await resolveClient(column).post(
      `/api/v1/kanban/boards/${e(opts.boardId)}/columns/reorder`,
      { columnIds: opts.columnIds.split(",").map((value) => value.trim()) },
    ));
  });
  column.command("update")
    .requiredOption("--column-id <id>", "Column ID")
    .option("--name <name>", "Column name")
    .option("--sort-order <n>", "Sort order")
    .option("--wip-limit <n>", "WIP limit")
    .option("--column-type <type>", "Column type")
    .action(async (opts: { columnId: string; name?: string; sortOrder?: string; wipLimit?: string; columnType?: string }) => {
      printResult(await resolveClient(column).patch(`/api/v1/kanban/columns/${e(opts.columnId)}`, {
        name: opts.name,
        sortOrder: opts.sortOrder == null ? undefined : Number(opts.sortOrder),
        wipLimit: opts.wipLimit == null ? undefined : Number(opts.wipLimit),
        columnType: opts.columnType,
      }));
    });
  column.command("delete").requiredOption("--column-id <id>", "Column ID").action(async (opts: { columnId: string }) => {
    printResult(await resolveClient(column).delete(`/api/v1/kanban/columns/${e(opts.columnId)}`));
  });

  const card = kanban.command("card").description("Card management");
  addPaginationOptions(card.command("list")
    .description("List cards using the server-side search filter.")
    .option("--search <query>", "Server-side card search query"), {
      mode: "offset",
      allowAll: true,
    })
    .action(async (opts: { search?: string; limit?: number; offset?: number; all?: boolean }) => {
      const client = resolveClient(card);
      const searchTrimmed = opts.search?.trim();
      const startOffset = opts.offset ?? 0;
      if (opts.limit === 0) {
        printResult([]);
        return;
      }

      const fetchPage = async (offset: number, limit: number) => {
        const params = new URLSearchParams();
        if (searchTrimmed) params.set("search", searchTrimmed);
        params.set("limit", String(limit));
        params.set("offset", String(offset));
        const page = await client.get(`/api/v1/kanban/cards?${params.toString()}`);
        return Array.isArray(page) ? page as Record<string, unknown>[] : [];
      };

      if (!opts.all) {
        printResult(await fetchPage(startOffset, pageLimit(opts.limit, DEFAULT_PAGE_LIMIT)));
        return;
      }

      const pageSize = pageLimit(opts.limit, 100);
      printResult(await collectAllPages(startOffset, async (offset) => {
        const items = await fetchPage(offset, pageSize);
        return {
          items,
          next: items.length < pageSize ? undefined : offset + items.length,
        };
      }, {
        retries: 2,
        retryBaseDelayMs: 100,
        retryMaxDelayMs: 1_000,
        interPageDelayMs: 50,
        shouldRetry: (error) => error instanceof ApiError
          && (error.status === 429 || error.status >= 500),
      }));
    });
  card.command("create").requiredOption("--title <title>", "Card title").option("--board-id <id>", "Board ID").option("--column-name <name>", "Column name").option("--description <desc>", "Description").action(async (opts: { title: string; boardId?: string; columnName?: string; description?: string }) => {
    printResult(await resolveClient(card).post("/api/v1/kanban/cards", {
      title: opts.title,
      boardId: opts.boardId,
      columnName: opts.columnName,
      description: opts.description,
    }));
  });
  card.command("update").requiredOption("--card-id <id>", "Card ID").option("--title <text>", "New title").option("--description <text>", "New description").option("--column-id <id>", "Move to column").action(async (opts: { cardId: string; title?: string; description?: string; columnId?: string }) => {
    printResult(await resolveClient(card).patch(`/api/v1/kanban/cards/${e(opts.cardId)}`, {
      title: opts.title,
      description: opts.description,
      columnId: opts.columnId,
    }));
  });
  card.command("complete").requiredOption("--card-id <id>", "Card ID").action(async (opts: { cardId: string }) => {
    printResult(await resolveClient(card).post(`/api/v1/kanban/cards/${e(opts.cardId)}/complete`));
  });
  card.command("delete").requiredOption("--card-id <id>", "Card ID").action(async (opts: { cardId: string }) => {
    printResult(await resolveClient(card).delete(`/api/v1/kanban/cards/${e(opts.cardId)}`));
  });
  card.command("move").requiredOption("--card-id <id>", "Card ID").requiredOption("--column-name <name>", "Target column name").action(async (opts: { cardId: string; columnName: string }) => {
    printResult(await resolveClient(card).patch(`/api/v1/kanban/cards/${e(opts.cardId)}`, { columnName: opts.columnName }));
  });
  card.command("add-commit").requiredOption("--card-id <id>", "Card ID").requiredOption("--sha <sha>", "Commit SHA").requiredOption("--message <msg>", "Commit message").option("--url <url>", "Commit URL").action(async (opts: { cardId: string; sha: string; message: string; url?: string }) => {
    printResult(await resolveClient(card).post(`/api/v1/kanban/cards/${e(opts.cardId)}/commits`, {
      commitHash: opts.sha,
      message: opts.message,
      url: opts.url,
    }));
  });
  card.command("link-note").description("Link a note to a card").requiredOption("--card-id <id>", "Card ID").requiredOption("--note-id <id>", "Note ID").action(async (opts: { cardId: string; noteId: string }) => {
    printResult(await resolveClient(card).post(`/api/v1/kanban/cards/${e(opts.cardId)}/notes`, { noteId: opts.noteId }));
  });
  card.command("unlink-note").description("Unlink a note from a card").requiredOption("--card-id <id>", "Card ID").requiredOption("--note-id <id>", "Note ID").action(async (opts: { cardId: string; noteId: string }) => {
    printResult(await resolveClient(card).delete(`/api/v1/kanban/cards/${e(opts.cardId)}/notes/${e(opts.noteId)}`));
  });
  card.command("notes").description("List linked notes").requiredOption("--card-id <id>", "Card ID").action(async (opts: { cardId: string }) => {
    printResult(await resolveClient(card).get(`/api/v1/kanban/cards/${e(opts.cardId)}/notes`));
  });
  card.command("commits").description("List linked commits").requiredOption("--card-id <id>", "Card ID").action(async (opts: { cardId: string }) => {
    printResult(await resolveClient(card).get(`/api/v1/kanban/cards/${e(opts.cardId)}/commits`));
  });
  const comment = card.command("comment").description("Card comments");
  addPaginationOptions(comment.command("list").requiredOption("--card-id <id>", "Card ID"), {
    mode: "offset",
  }).action(async (opts: { cardId: string; limit?: number; offset?: number }) => {
    printResult(await resolveClient(comment).get(
      `/api/v1/kanban/cards/${e(opts.cardId)}/comments${paginationQuery(opts)}`,
    ));
  });
  comment.command("add").requiredOption("--card-id <id>", "Card ID").requiredOption("--content <text>", "Comment content").action(async (opts: { cardId: string; content: string }) => {
    printResult(await resolveClient(comment).post(`/api/v1/kanban/cards/${e(opts.cardId)}/comments`, { content: opts.content }));
  });
  comment.command("get").argument("<comment-id>", "Comment ID").action(async (commentId: string) => {
    printResult(await resolveClient(comment).get(`/api/v1/kanban/comments/${e(commentId)}`));
  });
  const cardLabel = card.command("label").description("Card labels");
  cardLabel.command("add").requiredOption("--card-id <id>", "Card ID").requiredOption("--label-id <id>", "Label ID").action(async (opts: { cardId: string; labelId: string }) => {
    printResult(await resolveClient(cardLabel).post(`/api/v1/kanban/cards/${e(opts.cardId)}/labels`, { labelId: opts.labelId }));
  });
  cardLabel.command("remove").requiredOption("--card-id <id>", "Card ID").requiredOption("--label-id <id>", "Label ID").action(async (opts: { cardId: string; labelId: string }) => {
    printResult(await resolveClient(cardLabel).delete(`/api/v1/kanban/cards/${e(opts.cardId)}/labels/${e(opts.labelId)}`));
  });
  card.command("bulk-move").requiredOption("--moves <json>", "JSON array of {cardId,toColumnId}").action(async (opts: { moves: string }) => {
    printResult(await resolveClient(card).post("/api/v1/kanban/cards/bulk-move", {
      moves: parseJsonArray(opts.moves, "--moves"),
    }));
  });

  const label = kanban.command("label").description("Label management");
  label.command("list").requiredOption("--board-id <id>", "Board ID").action(async (opts: { boardId: string }) => {
    printResult(await resolveClient(label).get(`/api/v1/kanban/boards/${e(opts.boardId)}/labels`));
  });
  label.command("create").requiredOption("--board-id <id>", "Board ID").requiredOption("--name <name>", "Label name").requiredOption("--color <color>", "Color hex").action(async (opts: { boardId: string; name: string; color: string }) => {
    printResult(await resolveClient(label).post(`/api/v1/kanban/boards/${e(opts.boardId)}/labels`, {
      name: opts.name,
      color: opts.color,
    }));
  });
  label.command("update").requiredOption("--label-id <id>", "Label ID").option("--name <name>").option("--color <color>").action(async (opts: { labelId: string; name?: string; color?: string }) => {
    printResult(await resolveClient(label).patch(`/api/v1/kanban/labels/${e(opts.labelId)}`, {
      name: opts.name,
      color: opts.color,
    }));
  });
  label.command("delete").requiredOption("--label-id <id>", "Label ID").action(async (opts: { labelId: string }) => {
    printResult(await resolveClient(label).delete(`/api/v1/kanban/labels/${e(opts.labelId)}`));
  });
}
