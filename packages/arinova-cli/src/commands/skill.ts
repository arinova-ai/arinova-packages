import { Command } from "commander";
import { get, post, patch, del } from "../client.js";
import { printResult, printError, printSuccess, table } from "../output.js";

export function registerSkill(program: Command): void {
  const skill = program.command("skill").description("Custom skill management");

  skill
    .command("list")
    .description("List your custom skills")
    .action(async () => {
      try {
        const data = await get("/api/v1/skills/my");
        if (Array.isArray(data)) {
          table(data as Record<string, unknown>[], [
            { key: "id", label: "ID" },
            { key: "name", label: "Name" },
            { key: "slashCommand", label: "Command" },
            { key: "isPublic", label: "Public" },
          ]);
        } else {
          printResult(data);
        }
      } catch (err) {
        printError(err);
      }
    });

  skill
    .command("create")
    .description("Create a custom skill")
    .requiredOption("-n, --name <name>", "Skill name")
    .option("-d, --description <desc>", "Description")
    .option("-c, --command <cmd>", "Slash command (without //)")
    .requiredOption("-p, --prompt <template>", "Prompt template")
    .option("--public", "Share to Skill Hub")
    .action(async (opts) => {
      try {
        const data = await post("/api/v1/skills/custom", {
          name: opts.name,
          description: opts.description,
          command: opts.command,
          promptTemplate: opts.prompt,
          isPublic: opts.public ?? false,
        });
        printSuccess("Skill created");
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  skill
    .command("update <id>")
    .description("Update a custom skill")
    .option("-n, --name <name>", "Skill name")
    .option("-d, --description <desc>", "Description")
    .option("-c, --command <cmd>", "Slash command")
    .option("-p, --prompt <template>", "Prompt template")
    .option("--public", "Share to Skill Hub")
    .option("--private", "Make private")
    .action(async (id, opts) => {
      try {
        const body: Record<string, unknown> = {};
        if (opts.name) body.name = opts.name;
        if (opts.description) body.description = opts.description;
        if (opts.command) body.command = opts.command;
        if (opts.prompt) body.promptTemplate = opts.prompt;
        if (opts.public) body.isPublic = true;
        if (opts.private) body.isPublic = false;
        await patch(`/api/v1/skills/custom/${id}`, body);
        printSuccess("Skill updated");
      } catch (err) {
        printError(err);
      }
    });

  skill
    .command("delete <id>")
    .description("Delete a custom skill")
    .action(async (id) => {
      try {
        await del(`/api/v1/skills/custom/${id}`);
        printSuccess("Skill deleted");
      } catch (err) {
        printError(err);
      }
    });

  skill
    .command("install <skillId>")
    .description("Install a skill on an agent")
    .requiredOption("-a, --agent <agentId>", "Agent ID")
    .action(async (skillId, opts) => {
      try {
        await post(`/api/v1/skills/${skillId}/install`, { agentIds: [opts.agent] });
        printSuccess("Skill installed");
      } catch (err) {
        printError(err);
      }
    });

  skill
    .command("toggle <skillId>")
    .description("Toggle skill enabled/disabled on an agent")
    .requiredOption("-a, --agent <agentId>", "Agent ID")
    .option("--enable", "Enable the skill")
    .option("--disable", "Disable the skill")
    .action(async (skillId: string, opts: { agent: string; enable?: boolean; disable?: boolean }) => {
      try {
        const isEnabled = opts.disable ? false : opts.enable ? true : undefined;
        if (isEnabled === undefined) {
          printError("Specify --enable or --disable");
          return;
        }
        await patch(`/api/agents/${opts.agent}/skills/${skillId}`, { isEnabled });
        printSuccess(`Skill ${isEnabled ? "enabled" : "disabled"}`);
      } catch (err) {
        printError(err);
      }
    });

  skill
    .command("uninstall <skillId>")
    .description("Uninstall a skill from an agent")
    .requiredOption("-a, --agent <agentId>", "Agent ID")
    .action(async (skillId, opts) => {
      try {
        await del(`/api/v1/skills/${skillId}/uninstall?agentId=${opts.agent}`);
        printSuccess("Skill uninstalled");
      } catch (err) {
        printError(err);
      }
    });
}
