import { Command } from "commander";
import { encodePathSegment, resolveClient } from "../client.js";
import { printResult, printSuccess, printNote, table } from "../output.js";
import { addPaginationOptions, paginationQuery } from "../pagination.js";

export function registerApp(program: Command): void {
  const app = program.command("app").description("OAuth App management");

  addPaginationOptions(app
    .command("list")
    .description("List your OAuth apps"), { mode: "offset" })
    .action(async (options) => {
      const data = await resolveClient(app).get(
        `/api/v1/developer/apps${paginationQuery(options)}`,
      );
      const apps = (data as Record<string, unknown>).apps ?? data;
      if (Array.isArray(apps)) {
        table(apps as Record<string, unknown>[], [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "status", label: "Status" },
          { key: "category", label: "Category" },
        ]);
      } else {
        printResult(data);
      }
    });

  app
    .command("create")
    .description(
      "Create an OAuth app (public/PKCE client) for standalone login. To make an app embeddable inside Arinova, use 'arinova space create --url' instead — a Space and an OAuth app are separate things."
    )
    .requiredOption("--name <name>", "App name")
    .requiredOption(
      "--redirect-uri <uri>",
      "OAuth redirect URI — the origin must match your app's callback URL (required; the server otherwise stores a placeholder that breaks login)"
    )
    .option("--description <desc>", "Description")
    .option("--category <cat>", "Category (game, tool, social, etc.)", "other")
    .action(
      async (opts: {
        name: string;
        redirectUri: string;
        description?: string;
        category: string;
      }) => {
        const data = await resolveClient(app).post("/api/v1/developer/apps", {
          name: opts.name,
          description: opts.description,
          category: opts.category,
          externalUrl: opts.redirectUri,
        });
        printResult(data);
        const d = data as Record<string, unknown>;
        if (d.clientId) {
          printNote(`\n  Client ID:    ${d.clientId}`);
          printNote(`  Redirect URI: ${(d.externalUrl as string) ?? opts.redirectUri}`);
          printNote("  Type:         Public (PKCE) — no client_secret needed");
        }
      }
    );

  app
    .command("show <id>")
    .description("Show OAuth app details")
    .action(async (id: string) => {
      const data = await resolveClient(app).get(`/api/v1/developer/apps/${encodePathSegment(id)}`);
      printResult(data);
    });

  app
    .command("update <id>")
    .description("Update an OAuth app")
    .option("--name <name>", "New name")
    .option("--redirect-uri <uri>", "New redirect URI")
    .option("--description <desc>", "New description")
    .option("--category <cat>", "New category")
    .action(
      async (
        id: string,
        opts: {
          name?: string;
          redirectUri?: string;
          description?: string;
          category?: string;
        }
      ) => {
        const body: Record<string, unknown> = {};
        if (opts.name) body.name = opts.name;
        if (opts.redirectUri) body.externalUrl = opts.redirectUri;
        if (opts.description) body.description = opts.description;
        if (opts.category) body.category = opts.category;
        const data = await resolveClient(app).put(`/api/v1/developer/apps/${encodePathSegment(id)}`, body);
        printResult(data);
      }
    );

  app
    .command("delete <id>")
    .description("Delete an OAuth app")
    .action(async (id: string) => {
      await resolveClient(app).delete(`/api/v1/developer/apps/${encodePathSegment(id)}`);
      printSuccess(`App ${id} deleted.`);
    });
}
