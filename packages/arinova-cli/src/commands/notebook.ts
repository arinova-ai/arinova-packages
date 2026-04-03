import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";

export function registerNotebookCommands(program: Command): void {
  const notebook = program.command("notebook").description("Notebook management");

  notebook.command("list").description("List all notebooks").action(async () => {
    const { token, apiUrl } = getOpts(notebook);
    output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/notebooks`, token }));
  });

  notebook.command("create")
    .description("Create a new notebook")
    .requiredOption("--name <name>", "Notebook name")
    .action(async (opts: { name: string }) => {
      const { token, apiUrl } = getOpts(notebook);
      output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/notebooks`, token, body: { name: opts.name } }));
    });

  notebook.command("rename")
    .description("Rename a notebook")
    .requiredOption("--id <id>", "Notebook ID")
    .requiredOption("--name <name>", "New name")
    .action(async (opts: { id: string; name: string }) => {
      const { token, apiUrl } = getOpts(notebook);
      output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/v1/notebooks/${opts.id}`, token, body: { name: opts.name } }));
    });

  notebook.command("archive")
    .description("Archive a notebook")
    .requiredOption("--id <id>", "Notebook ID")
    .action(async (opts: { id: string }) => {
      const { token, apiUrl } = getOpts(notebook);
      output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/v1/notebooks/${opts.id}`, token, body: { archived: true } }));
    });

  notebook.command("delete")
    .description("Delete an archived notebook")
    .requiredOption("--id <id>", "Notebook ID")
    .action(async (opts: { id: string }) => {
      const { token, apiUrl } = getOpts(notebook);
      output(await apiCall({ method: "DELETE", url: `${apiUrl}/api/v1/notebooks/${opts.id}`, token }));
    });
}
