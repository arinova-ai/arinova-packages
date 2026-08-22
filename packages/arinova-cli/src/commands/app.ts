import { Command } from "commander";
import { encodePathSegment, resolveClient } from "../client.js";
import { printNote, printResult, printSuccess, printWarning, table } from "../output.js";
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
          { key: "clientId", label: "Client ID" },
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
      "Create an OAuth app. Public/PKCE is the default; use --confidential for a service client."
    )
    .requiredOption("--name <name>", "App name")
    .requiredOption(
      "--redirect-uri <uri>",
      "OAuth redirect URI — the origin must match your app's callback URL"
    )
    .option("--client-id <id>", "Custom lowercase Client ID for a managed Space")
    .option("--external-url <url>", "Public website URL (separate from the OAuth redirect URI)")
    .option("--description <desc>", "Description")
    .option("--category <cat>", "Category (game, tool, social, etc.)", "other")
    .option(
      "--confidential",
      "Create a confidential client that receives a one-time client_secret"
    )
    .option(
      "--allowed-scopes <scopes>",
      "Comma-separated OAuth scopes (profile,email,agents,economy,wager,llm)"
    )
    .action(
      async (opts: {
        name: string;
        redirectUri: string;
        clientId?: string;
        externalUrl?: string;
        description?: string;
        category: string;
        confidential?: boolean;
        allowedScopes?: string;
      }) => {
        const allowedScopes = opts.allowedScopes == null
          ? undefined
          : [...new Set(opts.allowedScopes.split(",").map((scope) => scope.trim()).filter(Boolean))];
        if (allowedScopes?.length === 0) {
          throw new Error("--allowed-scopes must contain at least one scope");
        }
        const body: Record<string, unknown> = {
          name: opts.name,
          clientId: opts.clientId,
          description: opts.description,
          category: opts.category,
          externalUrl: opts.externalUrl,
          redirectUri: opts.redirectUri,
          isPublic: !opts.confidential,
        };
        if (allowedScopes) body.allowedScopes = allowedScopes;
        const data = await resolveClient(app).post("/api/v1/developer/apps", {
          ...body,
        });
        printResult(data);
        const d = data as Record<string, unknown>;
        if (d.clientId) {
          printNote(`\n  Client ID:    ${d.clientId}`);
          printNote(`  Redirect URI: ${(d.redirectUri as string) ?? opts.redirectUri}`);
          if (opts.confidential) {
            printNote("  Type:         Confidential service client");
            if (d.clientSecret) {
              printWarning(
                "Store the client_secret securely now. It is shown only once and cannot be retrieved later."
              );
            }
          } else {
            printNote("  Type:         Public (PKCE) — no client_secret needed");
          }
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
    .option("--external-url <url>", "New public website URL")
    .option("--description <desc>", "New description")
    .option("--category <cat>", "New category")
    .action(
      async (
        id: string,
        opts: {
          name?: string;
          redirectUri?: string;
          externalUrl?: string;
          description?: string;
          category?: string;
        }
      ) => {
        const body: Record<string, unknown> = {};
        if (opts.name) body.name = opts.name;
        if (opts.redirectUri) body.redirectUri = opts.redirectUri;
        if (opts.externalUrl) body.externalUrl = opts.externalUrl;
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
