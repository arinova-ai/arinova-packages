import { Command } from "commander";
import { get, post, patch, del } from "../client.js";
import { printResult, printError, printSuccess, table } from "../output.js";

export function registerCommunity(program: Command): void {
  const community = program.command("community").description("Community management");

  community
    .command("list")
    .description("List your communities")
    .action(async () => {
      try {
        const data = await get("/api/v1/creator/community");
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
      } catch (err) {
        printError(err);
      }
    });

  community
    .command("create")
    .description("Create a new community")
    .requiredOption("--name <name>", "Community name")
    .option("--type <type>", "Type (community or lounge)", "community")
    .option("--description <desc>", "Description")
    .action(async (opts: { name: string; type: string; description?: string }) => {
      try {
        const data = await post("/api/v1/communities", {
          name: opts.name,
          type: opts.type,
          description: opts.description ?? "",
        });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  community
    .command("update <id>")
    .description("Update a community")
    .option("--name <name>", "New name")
    .option("--description <desc>", "New description")
    .action(async (id: string, opts: { name?: string; description?: string }) => {
      try {
        const body: Record<string, unknown> = {};
        if (opts.name) body.name = opts.name;
        if (opts.description) body.description = opts.description;
        const data = await patch(`/api/v1/communities/${id}`, body);
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  community
    .command("delete <id>")
    .description("Delete a community")
    .action(async (id: string) => {
      try {
        await del(`/api/v1/communities/${id}`);
        printSuccess(`Community ${id} deleted.`);
      } catch (err) {
        printError(err);
      }
    });

  community
    .command("add-agent <communityId> <agentId>")
    .description("Add an agent to a community")
    .action(async (communityId: string, agentId: string) => {
      try {
        const data = await post(`/api/v1/communities/${communityId}/agents`, {
          agent_id: agentId,
        });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  community
    .command("remove-agent <communityId> <agentId>")
    .description("Remove an agent from a community")
    .action(async (communityId: string, agentId: string) => {
      try {
        await del(`/api/v1/communities/${communityId}/agents/${agentId}`);
        printSuccess(`Agent ${agentId} removed from community ${communityId}.`);
      } catch (err) {
        printError(err);
      }
    });

  community
    .command("list-members <communityId>")
    .description("List members of a community")
    .action(async (communityId: string) => {
      try {
        const data = await get(`/api/v1/communities/${communityId}/members`);
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  community
    .command("list-agents <communityId>")
    .description("List agents in a community")
    .action(async (communityId: string) => {
      try {
        const data = await get(`/api/v1/communities/${communityId}/agents`);
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  community
    .command("unpublish <id>")
    .description("Unpublish a community")
    .action(async (id: string) => {
      try {
        const data = await patch(`/api/v1/communities/${id}`, { status: "draft" });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  // ── Lounge shortcut ──────────────────────────────────────────

  const lounge = program.command("lounge").description("Lounge management");

  lounge
    .command("unpublish <id>")
    .description("Unpublish a lounge")
    .action(async (id: string) => {
      try {
        const data = await patch(`/api/v1/communities/${id}`, { status: "draft" });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });
}
