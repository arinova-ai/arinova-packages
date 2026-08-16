import type { Command } from "commander";
import { encodePathSegment, resolveClient } from "../client.js";
import { parseJsonOption } from "../json-options.js";
import { printResult } from "../output.js";
import { addPaginationOptions, paginationQuery } from "../pagination.js";
import { registerResourceCommands } from "../resource-commands.js";
import { registerAgentPermissions, registerExportCommands } from "../resource-extras.js";
import { registerVersionCommands } from "../version-commands.js";

const e = encodePathSegment;

export function registerSlideCommands(program: Command): void {
  const slide = program.command("slide").description("Slide deck commands");
  registerResourceCommands(slide, {
    name: "deck",
    description: "Slide deck resources",
    basePath: "/api/v1/slides/decks",
    identifier: { kind: "argument", syntax: "<deck-id>" },
    list: {
      configure(command) {
        command.option("--include-archived");
      },
      query: (options) => ({ includeArchived: options.includeArchived }),
    },
    create: {
      configure(command) {
        command
          .requiredOption("--title <title>")
          .option("--description <text>")
          .option("--theme <json>")
          .option("--aspect-ratio <ratio>")
          .option("--template-id <id>")
          .option("--space-id <id>");
      },
      body: (options) => ({
        title: options.title,
        description: options.description,
        theme: parseJsonOption(options.theme),
        defaultAspectRatio: options.aspectRatio,
        templateId: options.templateId,
        spaceId: options.spaceId,
      }),
    },
    show: {},
    update: {
      configure(command) {
        command
          .option("--title <title>")
          .option("--description <text>")
          .option("--theme <json>")
          .option("--aspect-ratio <ratio>");
      },
      body: (options) => ({
        title: options.title,
        description: options.description,
        theme: parseJsonOption(options.theme),
        defaultAspectRatio: options.aspectRatio,
      }),
    },
    delete: {},
    actions: [{ name: "archive" }, { name: "unarchive" }],
  });

  const item = slide.command("item").description("Slides in a deck");
  addPaginationOptions(item.command("list").argument("<deck-id>"), {
    mode: "offset",
  }).action(async (deckId: string, options) => {
    printResult(await resolveClient(slide).get(
      `/api/v1/slides/decks/${e(deckId)}/slides${paginationQuery(options)}`,
    ));
  });
  item.command("create").argument("<deck-id>")
    .option("--title <title>").option("--content <json>")
    .option("--speaker-notes <text>").option("--after-slide-id <id>")
    .action(async (deckId: string, options) => printResult(await resolveClient(slide).post(
      `/api/v1/slides/decks/${e(deckId)}/slides`,
      {
        title: options.title,
        content: parseJsonOption(options.content),
        speakerNotes: options.speakerNotes,
        afterSlideId: options.afterSlideId,
      },
    )));
  item.command("update").argument("<deck-id>").argument("<slide-id>")
    .requiredOption("--expected-version <n>")
    .option("--title <title>").option("--content <json>").option("--speaker-notes <text>")
    .action(async (deckId: string, slideId: string, options) => printResult(
      await resolveClient(slide).patch(
        `/api/v1/slides/decks/${e(deckId)}/slides/${e(slideId)}`,
        {
          title: options.title,
          content: parseJsonOption(options.content),
          speakerNotes: options.speakerNotes,
          expectedVersion: Number(options.expectedVersion),
        },
      ),
    ));
  item.command("delete").argument("<deck-id>").argument("<slide-id>")
    .action(async (deckId: string, slideId: string) => printResult(
      await resolveClient(slide).delete(
        `/api/v1/slides/decks/${e(deckId)}/slides/${e(slideId)}`,
      ),
    ));
  item.command("duplicate").argument("<deck-id>").argument("<slide-id>")
    .option("--title <title>")
    .action(async (deckId: string, slideId: string, options) => printResult(
      await resolveClient(slide).post(
        `/api/v1/slides/decks/${e(deckId)}/slides/${e(slideId)}/duplicate`,
        { title: options.title },
      ),
    ));
  item.command("reorder").argument("<deck-id>").requiredOption("--slide-ids <ids>")
    .action(async (deckId: string, options: { slideIds: string }) => printResult(
      await resolveClient(slide).post(
        `/api/v1/slides/decks/${e(deckId)}/slides/reorder`,
        { slideIds: options.slideIds.split(",").map((id) => id.trim()).filter(Boolean) },
      ),
    ));

  const template = slide.command("template");
  addPaginationOptions(template.command("list").option("--category <category>"), {
    mode: "offset",
  }).action(async (options) => {
    const query = new URLSearchParams({ limit: String(options.limit) });
    if (options.offset !== undefined) query.set("offset", String(options.offset));
    if (options.category) query.set("category", options.category);
    printResult(await resolveClient(slide).get(`/api/v1/slides/templates?${query}`));
  });
  template.command("show").argument("<template-id>").action(async (id: string) => {
    printResult(await resolveClient(slide).get(`/api/v1/slides/templates/${e(id)}`));
  });

  registerAgentPermissions(slide, {
    resourceArgument: "<deck-id>",
    basePath: (id) => `/api/v1/slides/decks/${e(id)}`,
  });
  registerExportCommands(slide, {
    resourceArgument: "<deck-id>",
    basePath: (id) => `/api/v1/slides/decks/${e(id)}`,
    start: {
      configure(command) {
        command.option("--save-to-space-id <id>").option("--save-to-folder-id <id>");
      },
      body: (options) => ({
        format: "pdf",
        ...(options.saveToSpaceId ? { saveToSpaceId: options.saveToSpaceId } : {}),
        ...(options.saveToFolderId ? { saveToFolderId: options.saveToFolderId } : {}),
      }),
    },
  });
  registerVersionCommands(slide, {
    resourceArgument: "<deck-id>",
    basePath: (id) => `/api/v1/slides/decks/${e(id)}`,
  });
}
