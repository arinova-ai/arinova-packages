import { Command } from "commander";
import { get, post, put, del, encodePathSegment, UnsupportedCommandError } from "../client.js";
import { printResult, printSuccess, table } from "../output.js";

export function registerCommunity(program: Command): void {
  const community = program.command("community").description("Community management");

  community
    .command("list")
    .description("List your communities")
    .action(async () => {
      const data = await get("/api/v1/communities");
      const communities = (data as Record<string, unknown>).communities ?? data;
      if (Array.isArray(communities)) {
        table(communities as Record<string, unknown>[], [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "type", label: "Type" },
          { key: "member_count", label: "Members" },
        ]);
      } else {
        printResult(data);
      }
    });

  community
    .command("show <id>")
    .description("Show a community")
    .action(async (id: string) => {
      printResult(await get(`/api/v1/communities/${encodePathSegment(id)}`));
    });

  community
    .command("create")
    .description("Create a new community")
    .requiredOption("--name <name>", "Community name")
    .option("--type <type>", "Type (community or lounge)", "community")
    .option("--description <desc>", "Description")
    .action(async (opts: { name: string; type: string; description?: string }) => {
      const data = await post("/api/v1/communities", {
        name: opts.name,
        type: opts.type,
        description: opts.description ?? "",
      });
      printResult(data);
    });

  community
    .command("update <id>")
    .description("Update a community")
    .option("--name <name>", "New name")
    .option("--description <desc>", "New description")
    .action(async (id: string, opts: { name?: string; description?: string }) => {
      const body: Record<string, unknown> = {};
      if (opts.name) body.name = opts.name;
      if (opts.description) body.description = opts.description;
      const data = await put(`/api/v1/communities/${encodePathSegment(id)}`, body);
      printResult(data);
    });

  community
    .command("delete <id>")
    .description("Delete a community")
    .action(async (id: string) => {
      await del(`/api/v1/communities/${encodePathSegment(id)}`);
      printSuccess(`Community ${id} deleted.`);
    });

  community
    .command("add-agent <communityId> <agentId>")
    .description("Add an agent to a community")
    .action(async (communityId: string, agentId: string) => {
      const data = await post(`/api/v1/communities/${encodePathSegment(communityId)}/agents`, {
        agentId,
      });
      printResult(data);
    });

  community
    .command("remove-agent <communityId> <agentId>")
    .description("Remove an agent from a community")
    .action(async (communityId: string, agentId: string) => {
      await del(`/api/v1/communities/${encodePathSegment(communityId)}/agents/${encodePathSegment(agentId)}`);
      printSuccess(`Agent ${agentId} removed from community ${communityId}.`);
    });

  community
    .command("list-members <communityId>")
    .description("List members of a community")
    .action(async (communityId: string) => {
      const data = await get(`/api/v1/communities/${encodePathSegment(communityId)}/members`);
      printResult(data);
    });

  community
    .command("list-agents <communityId>")
    .description("List agents in a community")
    .action(async (communityId: string) => {
      const data = await get(`/api/v1/communities/${encodePathSegment(communityId)}/agents`);
      printResult(data);
    });

  community
    .command("unpublish <id>")
    .description("Unpublish a community")
    .action(async (id: string) => {
      throw new UnsupportedCommandError(
        `Community ${id} cannot be unpublished through the current /api/v1 contract.`,
      );
    });

}
