import type { Command } from "commander";
import { getOpts, output } from "../api.js";
import { ApiClient, buildQuery } from "../client.js";

function clientFor(command: Command): ApiClient {
  const { token, apiUrl } = getOpts(command);
  return new ApiClient({ endpoint: apiUrl, token });
}

export function registerSearchCommands(program: Command): void {
  const search = program
    .command("search")
    .description("Search Arinova resources")
    .option("-q, --query <keyword>", "Search keyword")
    .option("--limit <n>", "Max results per category")
    .action(async (opts: { query?: string; limit?: string }) => {
      if (!opts.query) throw new Error("--query is required");
      output(await clientFor(search).get(`/api/v1/search${buildQuery({
        q: opts.query, limit: opts.limit,
      })}`));
    });

  search.command("content")
    .description("Search indexed content with structured filters")
    .addHelpText("after", "\nRequired parent option:\n  -q, --query <keyword>  Search keyword")
    .option("--entity-types <types>", "Comma-separated entity types")
    .option("--date-from <date>")
    .option("--date-to <date>")
    .option("--author-id <id>")
    .option("--sort <sort>")
    .option("--file-type <type>")
    .option("--conversation-id <id>")
    .option("--has-attachment <boolean>")
    .action(async (opts: {
      entityTypes?: string; dateFrom?: string; dateTo?: string;
      authorId?: string; sort?: string; fileType?: string; conversationId?: string;
      hasAttachment?: string;
    }) => {
      const query = search.opts().query as string | undefined;
      if (!query) throw new Error("--query is required");
      if (opts.hasAttachment && !["true", "false"].includes(opts.hasAttachment)) {
        throw new Error("--has-attachment must be true or false");
      }
      output(await clientFor(search).get(`/api/v1/search/content${buildQuery({
        q: query,
        entity_types: opts.entityTypes,
        date_from: opts.dateFrom,
        date_to: opts.dateTo,
        author_id: opts.authorId,
        sort: opts.sort,
        file_type: opts.fileType,
        conversation_id: opts.conversationId,
        has_attachment: opts.hasAttachment,
      })}`));
    });
}
