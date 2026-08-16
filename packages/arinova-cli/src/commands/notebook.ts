import type { Command } from "commander";
import { encodePathSegment, resolveClient } from "../client.js";
import { printResult } from "../output.js";
import { addPaginationOptions, paginationQuery } from "../pagination.js";
import { registerResourceCommands } from "../resource-commands.js";

const optionId = {
  kind: "option" as const,
  flags: "--id <id>",
  key: "id",
  description: "Notebook ID",
};

export function registerNotebookCommands(program: Command): void {
  const notebook = registerResourceCommands(program, {
    name: "notebook",
    description: "Notebook management",
    basePath: "/api/v1/notebooks",
    identifier: optionId,
    list: { description: "List all notebooks" },
    create: {
      description: "Create a new notebook",
      configure(command) {
        command.requiredOption("--name <name>", "Notebook name");
      },
      body: (options) => ({ name: options.name }),
    },
    show: {
      identifier: { kind: "argument", syntax: "<id>" },
    },
    update: {
      name: "rename",
      description: "Rename a notebook",
      configure(command) {
        command.requiredOption("--name <name>", "New name");
      },
      body: (options) => ({ name: options.name }),
    },
    delete: { description: "Delete an archived notebook" },
    actions: [
      { name: "archive", description: "Archive a notebook" },
      { name: "unarchive" },
    ],
  });

  addPaginationOptions(notebook.command("notes").argument("<id>"), {
    mode: "offset",
  }).action(async (id: string, options) => {
    printResult(await resolveClient(notebook).get(
      `/api/v1/notebooks/${encodePathSegment(id)}/notes${paginationQuery(options)}`,
    ));
  });
}
