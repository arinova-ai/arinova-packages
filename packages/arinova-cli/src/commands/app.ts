import { Command } from "commander";
import { get, post, put, del } from "../client.js";
import { printResult, printError, printSuccess, table } from "../output.js";

export function registerApp(program: Command): void {
  const app = program.command("app").description("OAuth App management");

  app
    .command("list")
    .description("List your OAuth apps")
    .action(async () => {
      try {
        const data = await get("/api/v1/developer/apps");
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
      } catch (err) {
        printError(err);
      }
    });

  app
    .command("create")
    .description("Create a new OAuth app (public client, uses PKCE)")
    .requiredOption("--name <name>", "App name")
    .option("--redirect-uri <uri>", "Redirect URI")
    .option("--description <desc>", "Description")
    .option("--category <cat>", "Category (game, tool, social, etc.)", "other")
    .action(
      async (opts: {
        name: string;
        redirectUri?: string;
        description?: string;
        category: string;
      }) => {
        try {
          const data = await post("/api/v1/developer/apps", {
            name: opts.name,
            description: opts.description,
            category: opts.category,
            externalUrl: opts.redirectUri,
          });
          printResult(data);
          const d = data as Record<string, unknown>;
          if (d.clientId) {
            console.log(`\n  Client ID: ${d.clientId}`);
            console.log("  Type:      Public (PKCE) — no client_secret needed");
          }
        } catch (err) {
          printError(err);
        }
      }
    );

  app
    .command("show <id>")
    .description("Show OAuth app details")
    .action(async (id: string) => {
      try {
        const data = await get(`/api/v1/developer/apps/${id}`);
        printResult(data);
      } catch (err) {
        printError(err);
      }
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
        try {
          const body: Record<string, unknown> = {};
          if (opts.name) body.name = opts.name;
          if (opts.redirectUri) body.externalUrl = opts.redirectUri;
          if (opts.description) body.description = opts.description;
          if (opts.category) body.category = opts.category;
          const data = await put(`/api/v1/developer/apps/${id}`, body);
          printResult(data);
        } catch (err) {
          printError(err);
        }
      }
    );

  app
    .command("delete <id>")
    .description("Delete an OAuth app")
    .action(async (id: string) => {
      try {
        await del(`/api/v1/developer/apps/${id}`);
        printSuccess(`App ${id} deleted.`);
      } catch (err) {
        printError(err);
      }
    });
}
