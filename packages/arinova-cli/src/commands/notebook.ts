import type { Command } from "commander";
import { encodePathSegment, resolveClient } from "../client.js";
import { printResult } from "../output.js";

export function registerNotebookCommands(program: Command): void {
  const notebook = program.command("notebook").description("Notebook management");

  notebook.command("list").description("List all notebooks").action(async () => {
    printResult(await resolveClient(notebook).get("/api/v1/notebooks"));
  });

  notebook.command("create")
    .description("Create a new notebook")
    .requiredOption("--name <name>", "Notebook name")
    .action(async (opts: { name: string }) => {
      printResult(await resolveClient(notebook).post("/api/v1/notebooks", { name: opts.name }));
    });

  notebook.command("rename")
    .description("Rename a notebook")
    .requiredOption("--id <id>", "Notebook ID")
    .requiredOption("--name <name>", "New name")
    .action(async (opts: { id: string; name: string }) => {
      printResult(await resolveClient(notebook).patch(
        `/api/v1/notebooks/${encodePathSegment(opts.id)}`,
        { name: opts.name },
      ));
    });

  notebook.command("archive")
    .description("Archive a notebook")
    .requiredOption("--id <id>", "Notebook ID")
    .action(async (opts: { id: string }) => {
      printResult(await resolveClient(notebook).post(
        `/api/v1/notebooks/${encodePathSegment(opts.id)}/archive`,
      ));
    });

  notebook.command("delete")
    .description("Delete an archived notebook")
    .requiredOption("--id <id>", "Notebook ID")
    .action(async (opts: { id: string }) => {
      printResult(await resolveClient(notebook).delete(
        `/api/v1/notebooks/${encodePathSegment(opts.id)}`,
      ));
    });

  notebook.command("show")
    .argument("<id>", "Notebook ID")
    .action(async (id: string) => {
      printResult(await resolveClient(notebook).get(
        `/api/v1/notebooks/${encodePathSegment(id)}`,
      ));
    });

  notebook.command("notes")
    .argument("<id>", "Notebook ID")
    .action(async (id: string) => {
      printResult(await resolveClient(notebook).get(
        `/api/v1/notebooks/${encodePathSegment(id)}/notes`,
      ));
    });

  notebook.command("unarchive")
    .requiredOption("--id <id>", "Notebook ID")
    .action(async (opts) => {
      printResult(await resolveClient(notebook).post(
        `/api/v1/notebooks/${encodePathSegment(opts.id)}/unarchive`,
      ));
    });
}
