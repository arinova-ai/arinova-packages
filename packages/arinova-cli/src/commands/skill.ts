import type { Command } from "commander";
import { buildQuery, encodePathSegment, resolveClient } from "../client.js";
import { printResult, printSuccess, table } from "../output.js";
import { addPaginationOptions, paginationValues, parseCount } from "../pagination.js";

const e = encodePathSegment;

function parseCsv(value?: string): string[] | undefined {
  return value?.split(",").map((item) => item.trim()).filter(Boolean);
}

export function registerSkill(program: Command): void {
  const api = () => resolveClient(program);
  const skill = program.command("skill").description("Custom skill management");

  addPaginationOptions(skill.command("list").description("List your custom skills"), {
    mode: "offset",
  }).action(async (options) => {
    const data = await api().get(
      `/api/v1/skills/my${buildQuery(paginationValues(options))}`,
    );
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
  });

  skill.command("installed").description("List installed skills").action(async () => {
    printResult(await api().get("/api/v1/skills/installed"));
  });
  skill.command("prompt").argument("<slug>", "Skill slug").action(async (slug: string) => {
    printResult(await api().get(`/api/v1/skills/${e(slug)}/prompt`));
  });
  skill.command("published").description("List published skills").action(async () => {
    printResult(await api().get("/api/v1/skills/published"));
  });
  skill.command("hub-data").description("Get Skill Hub data").action(async () => {
    printResult(await api().get("/api/v1/skills/hub-data"));
  });

  skill.command("create")
    .description("Create a custom skill")
    .requiredOption("-n, --name <name>", "Skill name")
    .option("-d, --description <desc>", "Description")
    .option("-c, --command <cmd>", "Slash command")
    .requiredOption("-p, --prompt <template>", "Prompt template")
    .option("--public", "Share to Skill Hub")
    .action(async (opts) => {
      const data = await api().post("/api/v1/skills/custom", {
        name: opts.name,
        description: opts.description,
        command: opts.command,
        promptTemplate: opts.prompt,
        isPublic: opts.public ?? false,
      });
      printSuccess("Skill created");
      printResult(data);
    });

  skill.command("update").argument("<id>", "Skill ID")
    .option("-n, --name <name>")
    .option("-d, --description <desc>")
    .option("-c, --command <cmd>")
    .option("-p, --prompt <template>")
    .option("--public")
    .option("--private")
    .action(async (id: string, opts) => {
      const body: Record<string, unknown> = {};
      if (opts.name) body.name = opts.name;
      if (opts.description) body.description = opts.description;
      if (opts.command) body.command = opts.command;
      if (opts.prompt) body.promptTemplate = opts.prompt;
      if (opts.public) body.isPublic = true;
      if (opts.private) body.isPublic = false;
      printResult(await api().patch(`/api/v1/skills/custom/${e(id)}`, body));
    });
  skill.command("delete").argument("<id>", "Skill ID").action(async (id: string) => {
    await api().delete(`/api/v1/skills/custom/${e(id)}`);
    printSuccess("Skill deleted");
  });
  skill.command("publish").argument("<id>", "Custom skill ID").action(async (id: string) => {
    printResult(await api().post(`/api/v1/skills/custom/${e(id)}/publish`));
  });

  skill.command("install").argument("<skill-id>", "Skill ID")
    .requiredOption("-a, --agent <agent-id>", "Agent ID")
    .action(async (skillId: string, opts: { agent: string }) => {
      printResult(await api().post(`/api/v1/skills/${e(skillId)}/install`, { agentIds: [opts.agent] }));
    });
  skill.command("toggle").argument("<skill-id>", "Skill ID")
    .requiredOption("-a, --agent <agent-id>", "Agent ID")
    .option("--enable")
    .option("--disable")
    .action(async (skillId: string, opts: { agent: string; enable?: boolean; disable?: boolean }) => {
      const isEnabled = opts.disable ? false : opts.enable ? true : undefined;
      if (isEnabled === undefined) throw new Error("Specify --enable or --disable");
      await api().patch(`/api/agents/${e(opts.agent)}/skills/${e(skillId)}`, { isEnabled });
      printSuccess(`Skill ${isEnabled ? "enabled" : "disabled"}`);
    });
  skill.command("uninstall").argument("<skill-id>", "Skill ID")
    .requiredOption("-a, --agent <agent-id>", "Agent ID")
    .action(async (skillId: string, opts: { agent: string }) => {
      await api().delete(`/api/v1/skills/${e(skillId)}/uninstall${buildQuery({ agentId: opts.agent })}`);
      printSuccess("Skill uninstalled");
    });

  const suggestion = skill.command("suggestion").description("Skill suggestions");
  addPaginationOptions(suggestion.command("list").option("--dismissed"), {
    mode: "offset",
  }).action(async (options: { dismissed?: boolean; limit?: number; offset?: number }) => {
    const path = options.dismissed
      ? "/api/v1/skills/suggestions/dismissed"
      : "/api/v1/skills/suggestions";
    printResult(await api().get(`${path}${buildQuery(paginationValues(options))}`));
  });
  suggestion.command("dismiss").argument("<id>", "Suggestion ID").action(async (id: string) => {
    printResult(await api().patch(`/api/v1/skills/suggestions/${e(id)}`, { status: "dismissed" }));
  });
  suggestion.command("restore").argument("<id>", "Suggestion ID").action(async (id: string) => {
    printResult(await api().patch(`/api/v1/skills/suggestions/${e(id)}`, { status: "accepted" }));
  });
  suggestion.command("delete").argument("<id>", "Dismissed suggestion ID").action(async (id: string) => {
    printResult(await api().delete(`/api/v1/skills/suggestions/${e(id)}`));
  });

  skill.command("image-edit")
    .requiredOption("--image <key>", "Managed source image key")
    .requiredOption("--prompt <text>", "Edit prompt")
    .option("--mask <key>", "Managed mask image key")
    .option("--conversation-id <id>")
    .option("--project-id <id>")
    .action(async (opts: {
      image: string; prompt: string; mask?: string; conversationId?: string; projectId?: string;
    }) => {
      printResult(await api().post("/api/v1/skills/image-edit", {
        image: opts.image,
        prompt: opts.prompt,
        mask: opts.mask,
        conversationId: opts.conversationId,
        projectId: opts.projectId,
      }));
    });

  const skillPackage = program.command("skill-package").description("Skill package catalog");
  addPaginationOptions(skillPackage.command("list")
    .option("--search <query>")
    .option("--category <category>")
    .option("--primary-category <category>")
    .option("--tags <tags>")
    .option("--runtime <runtime>")
    .option("--sort <sort>")
    .option("--favorited")
    .option("--page <n>", "Page number", parseCount), { mode: "offset" })
    .action(async (opts) => {
      printResult(await api().get(`/api/v1/skill-packages${buildQuery({
        search: opts.search,
        category: opts.category,
        primaryCategory: opts.primaryCategory,
        tags: opts.tags,
        runtime: opts.runtime,
        sort: opts.sort,
        favorited: opts.favorited,
        page: opts.page,
        ...paginationValues(opts),
      })}`));
    });
  skillPackage.command("categories").option("--category <category>").action(async (opts) => {
    printResult(await api().get(`/api/v1/skill-packages/categories${buildQuery({ category: opts.category })}`));
  });
  skillPackage.command("show").argument("<package-id>").action(async (packageId: string) => {
    printResult(await api().get(`/api/v1/skill-packages/${e(packageId)}`));
  });
  skillPackage.command("installed").option("--agent <id>").action(async (opts: { agent?: string }) => {
    printResult(await api().get(`/api/v1/skill-packages/installed${buildQuery({ agentId: opts.agent })}`));
  });
  for (const [name, method] of [["favorite", "POST"], ["unfavorite", "DELETE"]] as const) {
    skillPackage.command(name).argument("<package-id>").action(async (packageId: string) => {
      const path = `/api/v1/skill-packages/${e(packageId)}/favorite`;
      printResult(method === "POST" ? await api().post(path) : await api().delete(path));
    });
  }
  for (const [name, method] of [["entry-favorite", "POST"], ["entry-unfavorite", "DELETE"]] as const) {
    skillPackage.command(name).argument("<entry-id>").action(async (entryId: string) => {
      const path = `/api/v1/skill-package-entries/${e(entryId)}/favorite`;
      printResult(method === "POST" ? await api().post(path) : await api().delete(path));
    });
  }
  skillPackage.command("install")
    .requiredOption("--version <version-id>")
    .requiredOption("--agent <agent-id>")
    .requiredOption("--idempotency-key <key>")
    .option("--entry-keys <keys>", "Comma-separated package entry keys")
    .option("--activation-mode <mode>")
    .action(async (opts) => {
      printResult(await api().post(`/api/v1/skill-package-versions/${e(opts.version)}/install`, {
        agentId: opts.agent,
        entryKeys: parseCsv(opts.entryKeys),
        activationMode: opts.activationMode,
        idempotencyKey: opts.idempotencyKey,
      }));
    });
  skillPackage.command("update-preview")
    .argument("<install-id>")
    .requiredOption("--target-version <version-id>")
    .action(async (installId: string, opts: { targetVersion: string }) => {
      printResult(await api().get(
        `/api/v1/agent-skill-packages/${e(installId)}/update-preview${buildQuery({
          targetVersionId: opts.targetVersion,
        })}`,
      ));
    });
  skillPackage.command("update")
    .argument("<install-id>")
    .requiredOption("--target-version <version-id>")
    .requiredOption("--idempotency-key <key>")
    .requiredOption("--confirm", "Confirm package version change")
    .option("--entry-keys <keys>")
    .option("--activation-mode <mode>")
    .action(async (installId: string, opts) => {
      printResult(await api().post(`/api/v1/agent-skill-packages/${e(installId)}/update`, {
        targetVersionId: opts.targetVersion,
        entryKeys: parseCsv(opts.entryKeys),
        activationMode: opts.activationMode,
        confirm: true,
        idempotencyKey: opts.idempotencyKey,
      }));
    });
  skillPackage.command("rollback")
    .argument("<install-id>")
    .requiredOption("--idempotency-key <key>")
    .requiredOption("--confirm", "Confirm package rollback")
    .option("--target-version <version-id>")
    .action(async (installId: string, opts) => {
      printResult(await api().post(`/api/v1/agent-skill-packages/${e(installId)}/rollback`, {
        targetVersionId: opts.targetVersion,
        confirm: true,
        idempotencyKey: opts.idempotencyKey,
      }));
    });
  for (const name of ["disable", "uninstall"] as const) {
    skillPackage.command(name)
      .argument("<install-id>")
      .requiredOption("--idempotency-key <key>")
      .action(async (installId: string, opts: { idempotencyKey: string }) => {
        printResult(await api().post(`/api/v1/agent-skill-packages/${e(installId)}/${name}`, {
          idempotencyKey: opts.idempotencyKey,
        }));
      });
  }
}
