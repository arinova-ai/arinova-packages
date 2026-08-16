import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";
import { buildQuery, encodePathSegment, resolveClient } from "../client.js";
import { appendFileToForm } from "../file-upload.js";
import { parseJsonArray, parseJsonOption } from "../json-options.js";
import { parseCount } from "../pagination.js";

type MemoryUpdateOptions = {
  id: string;
  category?: string;
  tier?: string;
  summary?: string;
  detail?: string;
};

const clientFor = resolveClient;

async function importForm(filePath: string, agentId: string, source?: string): Promise<FormData> {
  const form = new FormData();
  await appendFileToForm(form, "file", filePath);
  form.append("agent_id", agentId);
  if (source) form.append("source", source);
  return form;
}

export function registerMemoryCommands(program: Command): void {
  const memory = program.command("memory").description("Agent memory commands");

  memory.command("list")
    .description("List agent memories")
    .requiredOption("--agent <id>", "Agent ID")
    .option("--category <cat>", "Filter by category")
    .option("--tier <tier>", "Filter by tier (hot/warm/cold)")
    .option("--limit <n>", "Max results", parseCount, 20)
    .option("--offset <n>", "Results to skip", parseCount, 0)
    .option("--exclude-system", "Exclude system memories")
    .action(async (opts: {
      agent: string; category?: string; tier?: string; limit?: string;
      offset?: string; excludeSystem?: boolean;
    }) => {
      const client = clientFor(memory);
      output(await client.get(`/api/v1/memories${buildQuery({
        agent_id: opts.agent,
        category: opts.category,
        tier: opts.tier,
        limit: opts.limit,
        offset: opts.offset,
        exclude_system: opts.excludeSystem,
      })}`));
    });

  memory.command("create")
    .description("Create a memory")
    .requiredOption("--agent <id>", "Agent ID")
    .requiredOption("--category <cat>", "Category")
    .requiredOption("--summary <text>", "Memory summary")
    .option("--detail <text>", "Additional detail")
    .option("--pattern-key <key>", "Idempotent pattern key")
    .action(async (opts: {
      agent: string; category: string; summary: string; detail?: string; patternKey?: string;
    }) => {
      output(await clientFor(memory).post("/api/v1/memories", {
        agent_id: opts.agent,
        category: opts.category,
        summary: opts.summary,
        detail: opts.detail,
        pattern_key: opts.patternKey,
      }));
    });

  memory.command("get")
    .description("Get a memory")
    .argument("<id>", "Memory ID")
    .action(async (id: string) => {
      output(await clientFor(memory).get(`/api/v1/memories/${encodePathSegment(id)}`));
    });

  memory.command("update")
    .description("Update a memory")
    .argument("<id>", "Memory ID")
    .option("--category <cat>", "Category")
    .option("--tier <tier>", "Tier")
    .option("--summary <text>", "Summary")
    .option("--detail <text>", "Detail")
    .action(async (id: string, opts: Omit<MemoryUpdateOptions, "id">) => {
      output(await clientFor(memory).patch(`/api/v1/memories/${encodePathSegment(id)}`, {
        category: opts.category,
        tier: opts.tier,
        summary: opts.summary,
        detail: opts.detail,
      }));
    });

  memory.command("delete")
    .description("Delete a memory")
    .argument("<id>", "Memory ID")
    .action(async (id: string) => {
      output(await clientFor(memory).delete(`/api/v1/memories/${encodePathSegment(id)}`));
    });

  memory.command("query")
    .description("Semantic search across agent memories")
    .requiredOption("--query <text>", "Search query")
    .option("--agent <id>", "Agent ID")
    .option("--limit <n>", "Max results", parseCount, 10)
    .action(async (opts: { query: string; agent?: string; limit?: string }) => {
      const { token, apiUrl } = getOpts(memory);
      output(await apiCall({
        method: "GET",
        url: `${apiUrl}/api/v1/memories/search${buildQuery({
          q: opts.query, agentId: opts.agent, limit: opts.limit,
        })}`,
        token,
      }));
    });

  memory.command("cleanup")
    .description("Clean up an agent's memories")
    .requiredOption("--agent <id>", "Agent ID")
    .option("--max-memories <n>", "Maximum memories to retain")
    .action(async (opts: { agent: string; maxMemories?: string }) => {
      output(await clientFor(memory).post("/api/v1/memories/cleanup", {
        agentId: opts.agent,
        maxMemories: opts.maxMemories ? Number(opts.maxMemories) : undefined,
      }));
    });

  memory.command("export")
    .description("Export memories")
    .requiredOption("--agent <id>", "Agent ID")
    .requiredOption("--output <path>", "Output file")
    .option("--force", "Overwrite an existing output file")
    .action(async (opts: { agent: string; output: string; force?: boolean }) => {
      await clientFor(memory).download(
        `/api/v1/memories/export${buildQuery({ agent_id: opts.agent })}`,
        opts.output,
        opts.force,
      );
    });

  const grant = memory.command("grant").description("Memory sharing grants");
  grant.command("list")
    .requiredOption("--agent <id>", "Recipient agent ID")
    .action(async (opts: { agent: string }) => {
      output(await clientFor(grant).get(
        `/api/v1/memories/grants${buildQuery({ agent_id: opts.agent })}`,
      ));
    });
  grant.command("set")
    .requiredOption("--agent <id>", "Recipient agent ID")
    .requiredOption("--target-agent <id>", "Source agent ID")
    .requiredOption("--granted <boolean>", "Grant or revoke access")
    .action(async (opts: { agent: string; targetAgent: string; granted: string }) => {
      if (!["true", "false"].includes(opts.granted)) {
        throw new Error("--granted must be true or false");
      }
      output(await clientFor(grant).put("/api/v1/memories/grants", {
        agent_id: opts.agent,
        target_agent_id: opts.targetAgent,
        granted: opts.granted === "true",
      }));
    });

  const memoryImport = memory.command("import").description("Memory import capsules");
  for (const [name, path] of [
    ["preview", "/api/v1/memories/import/preview"],
    ["start", "/api/v1/memories/import"],
  ] as const) {
    memoryImport.command(name)
      .requiredOption("--agent <id>", "Target agent ID")
      .requiredOption("--file <path>", "Import file")
      .option("--source <source>", "Declared import source")
      .action(async (opts: { agent: string; file: string; source?: string }) => {
        output(await clientFor(memoryImport).upload(path, await importForm(opts.file, opts.agent, opts.source)));
      });
  }

  memoryImport.command("list")
    .option("--agent <id>", "Target agent ID")
    .action(async (opts: { agent?: string }) => {
      output(await clientFor(memoryImport).get(
        `/api/v1/memories/imports${buildQuery({ agent_id: opts.agent })}`,
      ));
    });

  for (const [name, method] of [["show", "GET"], ["discard", "DELETE"]] as const) {
    memoryImport.command(name).argument("<capsule-id>", "Import capsule ID")
      .action(async (capsuleId: string) => {
        const path = `/api/v1/memories/import/${encodePathSegment(capsuleId)}`;
        const client = clientFor(memoryImport);
        output(method === "GET" ? await client.get(path) : await client.delete(path));
      });
  }

  memoryImport.command("duplicates").argument("<capsule-id>", "Import capsule ID")
    .action(async (capsuleId: string) => {
      output(await clientFor(memoryImport).get(
        `/api/v1/memories/import/${encodePathSegment(capsuleId)}/duplicates`,
      ));
    });

  const entry = memoryImport.command("entry").description("Import entry operations");
  entry.command("update")
    .argument("<capsule-id>", "Import capsule ID")
    .argument("<entry-id>", "Import entry ID")
    .requiredOption("--patch <json>", "Patch object as JSON")
    .action(async (capsuleId: string, entryId: string, opts: { patch: string }) => {
      output(await clientFor(entry).patch(
        `/api/v1/memories/import/${encodePathSegment(capsuleId)}/entries/${encodePathSegment(entryId)}`,
        parseJsonOption(opts.patch, "--patch"),
      ));
    });
  entry.command("delete")
    .argument("<capsule-id>", "Import capsule ID")
    .argument("<entry-id>", "Import entry ID")
    .action(async (capsuleId: string, entryId: string) => {
      output(await clientFor(entry).delete(
        `/api/v1/memories/import/${encodePathSegment(capsuleId)}/entries/${encodePathSegment(entryId)}`,
      ));
    });

  memoryImport.command("confirm")
    .argument("<capsule-id>", "Import capsule ID")
    .requiredOption("--entries <json>", "Confirmation entries JSON array")
    .action(async (capsuleId: string, opts: { entries: string }) => {
      const entries = parseJsonArray(opts.entries, "--entries");
      output(await clientFor(memoryImport).post(
        `/api/v1/memories/import/${encodePathSegment(capsuleId)}/confirm`,
        { entries },
      ));
    });
  memoryImport.command("retry").argument("<capsule-id>", "Import capsule ID")
    .action(async (capsuleId: string) => {
      output(await clientFor(memoryImport).post(
        `/api/v1/memories/import/${encodePathSegment(capsuleId)}/retry`,
      ));
    });
}
