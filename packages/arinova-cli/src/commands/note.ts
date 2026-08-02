import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";
import { encodePathSegment } from "../client.js";
import { parseCount } from "../pagination.js";

export function registerNoteCommands(program: Command): void {
  const note = program.command("note").description("Note commands");

  note.command("list")
    .option("--notebook-id <id>", "Filter by notebook ID (defaults to your default notebook)")
    .option("--search <query>", "Search notes by title or content")
    .option("--limit <n>", "Max notes to return (default 20, max 50)", parseCount)
    .option("--offset <n>", "Skip first N notes (pagination)", parseCount)
    .option("--cursor <id>", "Fetch notes before this note ID (cursor pagination)")
    .option("--tags <tags...>", "Filter by tags")
    .option("--archived", "List archived notes instead of active")
    .action(async (opts: { notebookId?: string; search?: string; limit?: number; offset?: number; cursor?: string; tags?: string[]; archived?: boolean }) => {
      const { token, apiUrl } = getOpts(note);
      const params = new URLSearchParams();
      if (opts.notebookId) params.set("notebookId", opts.notebookId);
      if (opts.search) params.set("search", opts.search);
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.offset) params.set("offset", String(opts.offset));
      if (opts.cursor) params.set("before", opts.cursor);
      if (opts.tags) params.set("tags", opts.tags.join(","));
      if (opts.archived) params.set("archived", "true");
      const qs = params.toString() ? `?${params.toString()}` : "";
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/notes${qs}`, token }));
    });

  note.command("create")
    .requiredOption("--notebook-id <id>", "Notebook ID")
    .requiredOption("--title <title>", "Note title")
    .option("--content <text>", "Note content")
    .option("--tags <tags...>", "Tags")
    .action(async (opts: { notebookId: string; title: string; content?: string; tags?: string[] }) => {
      const { token, apiUrl } = getOpts(note);
      output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/notes`, token, body: {
        notebookId: opts.notebookId,
        title: opts.title,
        content: opts.content,
        tags: opts.tags,
      } }));
    });

  note.command("update")
    .requiredOption("--note-id <id>", "Note ID")
    .option("--title <text>", "New title")
    .option("--content <text>", "New content")
    .action(async (opts: { noteId: string; title?: string; content?: string }) => {
      const { token, apiUrl } = getOpts(note);
      output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/v1/notes/${encodePathSegment(opts.noteId)}`, token, body: { title: opts.title, content: opts.content } }));
    });

  note.command("delete")
    .requiredOption("--note-id <id>", "Note ID")
    .action(async (opts: { noteId: string }) => {
      const { token, apiUrl } = getOpts(note);
      output(await apiCall({ method: "DELETE", url: `${apiUrl}/api/v1/notes/${encodePathSegment(opts.noteId)}`, token }));
    });

  note.command("get")
    .argument("<note-id>", "Note ID")
    .action(async (noteId: string) => {
      const { token, apiUrl } = getOpts(note);
      output(await apiCall({
        method: "GET",
        url: `${apiUrl}/api/v1/notes/${encodePathSegment(noteId)}`,
        token,
      }));
    });

  const thread = note.command("thread").description("Note thread messages");
  thread.command("list")
    .requiredOption("--note-id <id>", "Note ID")
    .action(async (opts) => {
      const { token, apiUrl } = getOpts(note);
      output(await apiCall({
        method: "GET",
        url: `${apiUrl}/api/v1/notes/${encodePathSegment(opts.noteId)}/thread`,
        token,
      }));
    });
  thread.command("add")
    .requiredOption("--note-id <id>", "Note ID")
    .requiredOption("--content <text>", "Thread message")
    .action(async (opts) => {
      const { token, apiUrl } = getOpts(note);
      output(await apiCall({
        method: "POST",
        url: `${apiUrl}/api/v1/notes/${encodePathSegment(opts.noteId)}/thread`,
        token,
        body: { content: opts.content },
      }));
    });

  note.command("linked-cards")
    .requiredOption("--note-id <id>", "Note ID")
    .option("--limit <n>", "Max linked cards", parseCount)
    .option("--offset <n>", "Skip linked cards", parseCount)
    .action(async (opts) => {
      const { token, apiUrl } = getOpts(note);
      const query = new URLSearchParams();
      if (opts.limit !== undefined) query.set("limit", String(opts.limit));
      if (opts.offset !== undefined) query.set("offset", String(opts.offset));
      output(await apiCall({
        method: "GET",
        url: `${apiUrl}/api/v1/notes/${encodePathSegment(opts.noteId)}/linked-cards${query.size ? `?${query}` : ""}`,
        token,
      }));
    });
}
