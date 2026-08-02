import type { Command } from "commander";
import {
  buildQuery,
  del,
  encodePathSegment,
  get,
  patch,
  post,
  put,
  resolveClient,
  UnsupportedCommandError,
} from "../client.js";
import { printResult } from "../output.js";
import { parseJsonArray, parseJsonOption } from "../json-options.js";
import { registerVersionCommands } from "../version-commands.js";

const e = encodePathSegment;

export function registerSlideCommands(program: Command): void {
  const slide = program.command("slide").description("Slide deck commands");
  const deck = slide.command("deck");
  deck.command("list").option("--include-archived").action(async (opts) => {
    printResult(await get(`/api/v1/slides/decks${buildQuery({
      includeArchived: opts.includeArchived,
    })}`));
  });
  deck.command("create")
    .requiredOption("--title <title>")
    .option("--description <text>")
    .option("--theme <json>")
    .option("--aspect-ratio <ratio>")
    .option("--template-id <id>")
    .option("--space-id <id>")
    .action(async (opts) => printResult(await post("/api/v1/slides/decks", {
      title: opts.title,
      description: opts.description,
      theme: parseJsonOption(opts.theme),
      defaultAspectRatio: opts.aspectRatio,
      templateId: opts.templateId,
      spaceId: opts.spaceId,
    })));
  deck.command("show").argument("<deck-id>").action(async (id: string) => {
    printResult(await get(`/api/v1/slides/decks/${e(id)}`));
  });
  deck.command("update").argument("<deck-id>")
    .option("--title <title>").option("--description <text>")
    .option("--theme <json>").option("--aspect-ratio <ratio>")
    .action(async (id: string, opts) => printResult(await patch(`/api/v1/slides/decks/${e(id)}`, {
      title: opts.title, description: opts.description, theme: parseJsonOption(opts.theme),
      defaultAspectRatio: opts.aspectRatio,
    })));
  deck.command("delete").argument("<deck-id>").action(async (id: string) => {
    printResult(await del(`/api/v1/slides/decks/${e(id)}`));
  });
  for (const name of ["archive", "unarchive"] as const) {
    deck.command(name).argument("<deck-id>").action(async (id: string) => {
      printResult(await post(`/api/v1/slides/decks/${e(id)}/${name}`));
    });
  }

  const item = slide.command("item").description("Slides in a deck");
  item.command("list").argument("<deck-id>").action(async (deckId: string) => {
    printResult(await get(`/api/v1/slides/decks/${e(deckId)}/slides`));
  });
  item.command("create").argument("<deck-id>")
    .option("--title <title>").option("--content <json>")
    .option("--speaker-notes <text>").option("--after-slide-id <id>")
    .action(async (deckId: string, opts) => printResult(await post(
      `/api/v1/slides/decks/${e(deckId)}/slides`,
      {
        title: opts.title,
        content: parseJsonOption(opts.content),
        speakerNotes: opts.speakerNotes,
        afterSlideId: opts.afterSlideId,
      },
    )));
  item.command("update").argument("<deck-id>").argument("<slide-id>")
    .requiredOption("--expected-version <n>")
    .option("--title <title>").option("--content <json>").option("--speaker-notes <text>")
    .action(async (deckId: string, slideId: string, opts) => printResult(await patch(
      `/api/v1/slides/decks/${e(deckId)}/slides/${e(slideId)}`,
      {
        title: opts.title,
        content: parseJsonOption(opts.content),
        speakerNotes: opts.speakerNotes,
        expectedVersion: Number(opts.expectedVersion),
      },
    )));
  item.command("delete").argument("<deck-id>").argument("<slide-id>")
    .action(async (deckId: string, slideId: string) => printResult(await del(
      `/api/v1/slides/decks/${e(deckId)}/slides/${e(slideId)}`,
    )));
  item.command("duplicate").argument("<deck-id>").argument("<slide-id>")
    .option("--title <title>")
    .action(async (deckId: string, slideId: string, opts) => printResult(await post(
      `/api/v1/slides/decks/${e(deckId)}/slides/${e(slideId)}/duplicate`, { title: opts.title },
    )));
  item.command("reorder").argument("<deck-id>")
    .requiredOption("--slide-ids <ids>")
    .action(async (deckId: string, opts: { slideIds: string }) => printResult(await post(
      `/api/v1/slides/decks/${e(deckId)}/slides/reorder`,
      { slideIds: opts.slideIds.split(",").map((id) => id.trim()).filter(Boolean) },
    )));

  const template = slide.command("template");
  template.command("list").option("--category <category>").action(async (opts) => {
    printResult(await get(`/api/v1/slides/templates${buildQuery(opts)}`));
  });
  template.command("show").argument("<template-id>").action(async (id: string) => {
    printResult(await get(`/api/v1/slides/templates/${e(id)}`));
  });

  const permissions = slide.command("agent-permissions");
  permissions.command("get").argument("<deck-id>").action(async (id: string) => {
    printResult(await get(`/api/v1/slides/decks/${e(id)}/agent-permissions`));
  });
  permissions.command("set").argument("<deck-id>").requiredOption("--agents <json>")
    .action(async (id: string, opts: { agents: string }) => {
      const agents = parseJsonArray(opts.agents, "--agents");
      printResult(await put(`/api/v1/slides/decks/${e(id)}/agent-permissions`, { agents }));
    });

  const member = slide.command("member").description("Not available in the current v1 router");
  for (const name of ["list", "add", "update", "remove"] as const) {
    member.command(name).action(() => {
      throw new UnsupportedCommandError("Slide deck member routes are not exposed by /api/v1");
    });
  }

  const exportCmd = slide.command("export");
  exportCmd.command("start").argument("<deck-id>")
    .option("--save-to-space-id <id>").option("--save-to-folder-id <id>")
    .action(async (id: string, opts) => printResult(await post(
      `/api/v1/slides/decks/${e(id)}/export`,
      { format: "pdf", ...opts },
    )));
  exportCmd.command("status").argument("<deck-id>").argument("<job-id>")
    .action(async (id: string, jobId: string) => printResult(await get(
      `/api/v1/slides/decks/${e(id)}/export/${e(jobId)}`,
    )));
  exportCmd.command("download").argument("<deck-id>").argument("<job-id>")
    .requiredOption("--output <path>").option("--force")
    .action(async (id: string, jobId: string, opts) => {
      await resolveClient(slide).download(
        `/api/v1/slides/decks/${e(id)}/export/${e(jobId)}/download`,
        opts.output, opts.force,
      );
    });

  registerVersionCommands(slide, {
    resourceArgument: "<deck-id>",
    basePath: (id) => `/api/v1/slides/decks/${e(id)}`,
  });
}
