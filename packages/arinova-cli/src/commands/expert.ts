import { Command } from "commander";
import { get, post, patch, del, upload } from "../client.js";
import { printResult, printError, printSuccess, table } from "../output.js";

export function registerExpert(program: Command): void {
  const expert = program.command("expert").description("Expert management");

  expert
    .command("list")
    .description("List your experts")
    .action(async () => {
      try {
        const data = await get("/api/v1/creator/agents");
        const experts = (data as Record<string, unknown>).listings ?? (data as Record<string, unknown>).agents ?? data;
        if (Array.isArray(experts)) {
          table(experts as Record<string, unknown>[], [
            { key: "id", label: "ID" },
            { key: "agent_name", label: "Name" },
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

  expert
    .command("create")
    .description("Create a new expert")
    .requiredOption("--name <name>", "Expert name")
    .option("--description <desc>", "Description")
    .option("--category <cat>", "Category", "general")
    .option("--model <model>", "Model", "claude-sonnet-4-20250514")
    .option("--system-prompt <prompt>", "System prompt")
    .action(
      async (opts: {
        name: string;
        description?: string;
        category: string;
        model: string;
        systemPrompt?: string;
      }) => {
        try {
          const data = await post("/api/v1/creator/agents/create", {
            agent_name: opts.name,
            description: opts.description ?? "",
            category: opts.category,
            model: opts.model,
            system_prompt: opts.systemPrompt ?? "",
          });
          printResult(data);
        } catch (err) {
          printError(err);
        }
      },
    );

  expert
    .command("update <id>")
    .description("Update an expert")
    .option("--name <name>", "New name")
    .option("--description <desc>", "New description")
    .option("--category <cat>", "New category")
    .option("--model <model>", "New model")
    .option("--system-prompt <prompt>", "New system prompt")
    .action(
      async (
        id: string,
        opts: {
          name?: string;
          description?: string;
          category?: string;
          model?: string;
          systemPrompt?: string;
        },
      ) => {
        try {
          const body: Record<string, unknown> = {};
          if (opts.name) body.agent_name = opts.name;
          if (opts.description) body.description = opts.description;
          if (opts.category) body.category = opts.category;
          if (opts.model) body.model = opts.model;
          if (opts.systemPrompt) body.system_prompt = opts.systemPrompt;
          const data = await patch(`/api/v1/creator/agents/${id}`, body);
          printResult(data);
        } catch (err) {
          printError(err);
        }
      },
    );

  expert
    .command("delete <id>")
    .description("Delete an expert")
    .action(async (id: string) => {
      try {
        await del(`/api/v1/creator/agents/${id}`);
        printSuccess(`Expert ${id} deleted.`);
      } catch (err) {
        printError(err);
      }
    });

  expert
    .command("upload-kb <expertId> <file>")
    .description("Upload a knowledge base file")
    .action(async (expertId: string, file: string) => {
      try {
        const data = await upload(
          `/api/v1/creator/agents/${expertId}/knowledge-base`,
          file,
          "file",
        );
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  expert
    .command("delete-kb <expertId> <kbId>")
    .description("Delete a knowledge base entry")
    .action(async (expertId: string, kbId: string) => {
      try {
        await del(`/api/v1/creator/agents/${expertId}/knowledge-base/${kbId}`);
        printSuccess(`Knowledge base ${kbId} deleted.`);
      } catch (err) {
        printError(err);
      }
    });

  expert
    .command("publish <id>")
    .description("Publish an expert (set status to active)")
    .action(async (id: string) => {
      try {
        const data = await patch(`/api/v1/creator/agents/${id}`, { status: "active" });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  expert
    .command("unpublish <id>")
    .description("Unpublish an expert (set status to draft)")
    .action(async (id: string) => {
      try {
        const data = await patch(`/api/v1/creator/agents/${id}`, { status: "draft" });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });
}
