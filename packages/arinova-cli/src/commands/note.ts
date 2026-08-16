import type { Command } from "commander";
import { encodePathSegment, resolveClient } from "../client.js";
import { printResult } from "../output.js";
import { addPaginationOptions, paginationQuery } from "../pagination.js";
import { registerResourceCommands } from "../resource-commands.js";

const noteId = {
  kind: "option" as const,
  flags: "--note-id <id>",
  key: "noteId",
  description: "Note ID",
};

export function registerNoteCommands(program: Command): void {
  const note = registerResourceCommands(program, {
    name: "note",
    description: "Note commands",
    basePath: "/api/v1/notes",
    identifier: noteId,
    list: {
      pagination: { mode: "both", defaultLimit: 50 },
      configure(command) {
        command
          .option("--notebook-id <id>", "Filter by notebook")
          .option("--search <query>", "Search notes")
          .option("--tags <tags...>", "Filter by tags")
          .option("--archived", "List archived notes instead of active");
      },
      query: (options) => ({
        notebookId: options.notebookId,
        search: options.search,
        tags: options.tags?.join(","),
        archived: options.archived ? true : undefined,
      }),
    },
    create: {
      configure(command) {
        command
          .requiredOption("--notebook-id <id>", "Notebook ID")
          .requiredOption("--title <title>", "Note title")
          .option("--content <text>", "Note content")
          .option("--tags <tags...>", "Tags");
      },
      body: (options) => ({
        notebookId: options.notebookId,
        title: options.title,
        content: options.content,
        tags: options.tags,
      }),
    },
    show: {
      name: "get",
      identifier: { kind: "argument", syntax: "<note-id>" },
    },
    update: {
      configure(command) {
        command
          .option("--title <text>", "New title")
          .option("--content <text>", "New content");
      },
      body: (options) => ({ title: options.title, content: options.content }),
    },
    delete: {},
  });

  const thread = note.command("thread").description("Note thread messages");
  addPaginationOptions(thread.command("list").requiredOption("--note-id <id>", "Note ID"), {
    mode: "offset",
  }).action(async (options) => {
    printResult(await resolveClient(note).get(
      `/api/v1/notes/${encodePathSegment(options.noteId)}/thread${paginationQuery(options)}`,
    ));
  });
  thread.command("add")
    .requiredOption("--note-id <id>", "Note ID")
    .requiredOption("--content <text>", "Thread message")
    .action(async (options) => {
      printResult(await resolveClient(note).post(
        `/api/v1/notes/${encodePathSegment(options.noteId)}/thread`,
        { content: options.content },
      ));
    });

  addPaginationOptions(
    note.command("linked-cards").requiredOption("--note-id <id>", "Note ID"),
    { mode: "offset" },
  ).action(async (options) => {
    printResult(await resolveClient(note).get(
      `/api/v1/notes/${encodePathSegment(options.noteId)}/linked-cards${paginationQuery(options)}`,
    ));
  });
}
