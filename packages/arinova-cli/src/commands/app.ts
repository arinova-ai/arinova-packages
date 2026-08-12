import { Command } from "commander";
import { get, post, put, del, encodePathSegment } from "../client.js";
import { printResult, printSuccess, printNote, table } from "../output.js";

export function registerApp(program: Command): void {
  const app = program.command("app").description("OAuth App management");

  app
    .command("list")
    .description("List your OAuth apps")
    .action(async () => {
      const data = await get("/api/v1/developer/apps");
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
      "Create an OAuth app (public/PKCE client). Its Client ID can also be used as a managed Space manifest id."
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
    .action(
      async (opts: {
        name: string;
        redirectUri: string;
        clientId?: string;
        externalUrl?: string;
        description?: string;
        category: string;
      }) => {
        const data = await post("/api/v1/developer/apps", {
          name: opts.name,
          clientId: opts.clientId,
          description: opts.description,
          category: opts.category,
          externalUrl: opts.externalUrl,
          redirectUri: opts.redirectUri,
        });
        printResult(data);
        const d = data as Record<string, unknown>;
        if (d.clientId) {
          printNote(`\n  Client ID:    ${d.clientId}`);
          printNote(`  Redirect URI: ${(d.redirectUri as string) ?? opts.redirectUri}`);
          printNote("  Type:         Public (PKCE) — no client_secret needed");
        }
      }
    );

  app
    .command("show <id>")
    .description("Show OAuth app details")
    .action(async (id: string) => {
      const data = await get(`/api/v1/developer/apps/${encodePathSegment(id)}`);
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
        const data = await put(`/api/v1/developer/apps/${encodePathSegment(id)}`, body);
        printResult(data);
      }
    );

  app
    .command("delete <id>")
    .description("Delete an OAuth app")
    .action(async (id: string) => {
      await del(`/api/v1/developer/apps/${encodePathSegment(id)}`);
      printSuccess(`App ${id} deleted.`);
    });
}
