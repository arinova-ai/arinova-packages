import type { Command } from "commander";
import { encodePathSegment, resolveClient } from "../client.js";
import { parseJsonOption } from "../json-options.js";
import { printResult } from "../output.js";
import { addPaginationOptions, paginationQuery } from "../pagination.js";
import { registerResourceCommands } from "../resource-commands.js";
import { registerVersionCommands } from "../version-commands.js";

const e = encodePathSegment;

export function registerFormCommands(program: Command): void {
  const form = registerResourceCommands(program, {
    name: "form",
    description: "Form commands",
    basePath: "/api/v1/forms",
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
          .option("--settings <json>")
          .option("--space-id <id>");
      },
      body: (options) => ({
        title: options.title,
        description: options.description,
        settings: parseJsonOption(options.settings),
        spaceId: options.spaceId,
      }),
    },
    show: {},
    update: {
      configure(command) {
        command
          .option("--title <title>")
          .option("--description <text>")
          .option("--settings <json>")
          .option("--cover-image-asset-id <id>")
          .option("--clear-cover");
      },
      body: (options) => ({
        title: options.title,
        description: options.description,
        settings: parseJsonOption(options.settings),
        coverImageAssetId: options.clearCover ? null : options.coverImageAssetId,
      }),
    },
    delete: {},
    actions: [
      { name: "publish" },
      { name: "close" },
      { name: "archive" },
      { name: "unarchive" },
    ],
  });

  form.command("responses").argument("<id>").action(async (id: string) => {
    printResult(await resolveClient(form).get(`/api/v1/forms/${e(id)}/responses`));
  });

  const field = form.command("field").description("Form fields");
  addPaginationOptions(field.command("list").argument("<form-id>"), {
    mode: "offset",
  }).action(async (formId: string, options) => {
    printResult(await resolveClient(form).get(
      `/api/v1/forms/${e(formId)}/fields${paginationQuery(options)}`,
    ));
  });
  field.command("add")
    .argument("<form-id>")
    .requiredOption("--type <type>")
    .requiredOption("--label <label>")
    .option("--help-text <text>")
    .option("--required")
    .option("--options <json>")
    .option("--validation <json>")
    .option("--sort-key <key>")
    .option("--image-asset-id <id>")
    .action(async (formId: string, options) => printResult(await resolveClient(form).post(
      `/api/v1/forms/${e(formId)}/fields`,
      {
        fieldType: options.type,
        label: options.label,
        helpText: options.helpText,
        required: options.required,
        options: parseJsonOption(options.options),
        validation: parseJsonOption(options.validation),
        sortKey: options.sortKey,
        imageAssetId: options.imageAssetId,
      },
    )));

  registerVersionCommands(form, {
    description: "Form versions",
    resourceArgument: "<form-id>",
    basePath: (id) => `/api/v1/forms/${e(id)}`,
  });
}
