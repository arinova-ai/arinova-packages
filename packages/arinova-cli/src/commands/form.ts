import type { Command } from "commander";
import { buildQuery, del, encodePathSegment, get, patch, post } from "../client.js";
import { printResult } from "../output.js";
import { parseJsonOption } from "../json-options.js";
import { registerVersionCommands } from "../version-commands.js";

const e = encodePathSegment;

export function registerFormCommands(program: Command): void {
  const form = program.command("form").description("Form commands");
  form.command("list").option("--include-archived").action(async (opts) => {
    printResult(await get(`/api/v1/forms${buildQuery({ includeArchived: opts.includeArchived })}`));
  });
  form.command("create")
    .requiredOption("--title <title>")
    .option("--description <text>")
    .option("--settings <json>")
    .option("--space-id <id>")
    .action(async (opts) => printResult(await post("/api/v1/forms", {
      title: opts.title, description: opts.description, settings: parseJsonOption(opts.settings), spaceId: opts.spaceId,
    })));
  form.command("show").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/forms/${e(id)}`));
  });
  form.command("update")
    .argument("<id>")
    .option("--title <title>")
    .option("--description <text>")
    .option("--settings <json>")
    .option("--cover-image-asset-id <id>")
    .option("--clear-cover")
    .action(async (id: string, opts) => printResult(await patch(`/api/v1/forms/${e(id)}`, {
      title: opts.title,
      description: opts.description,
      settings: parseJsonOption(opts.settings),
      coverImageAssetId: opts.clearCover ? null : opts.coverImageAssetId,
    })));
  form.command("delete").argument("<id>").action(async (id: string) => {
    printResult(await del(`/api/v1/forms/${e(id)}`));
  });
  for (const name of ["publish", "close", "archive", "unarchive"] as const) {
    form.command(name).argument("<id>").action(async (id: string) => {
      printResult(await post(`/api/v1/forms/${e(id)}/${name}`));
    });
  }
  form.command("responses").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/forms/${e(id)}/responses`));
  });

  const field = form.command("field").description("Form fields");
  field.command("list").argument("<form-id>").action(async (formId: string) => {
    printResult(await get(`/api/v1/forms/${e(formId)}/fields`));
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
    .action(async (formId: string, opts) => printResult(await post(`/api/v1/forms/${e(formId)}/fields`, {
      fieldType: opts.type,
      label: opts.label,
      helpText: opts.helpText,
      required: opts.required,
      options: parseJsonOption(opts.options),
      validation: parseJsonOption(opts.validation),
      sortKey: opts.sortKey,
      imageAssetId: opts.imageAssetId,
    })));

  registerVersionCommands(form, {
    description: "Form versions",
    resourceArgument: "<form-id>",
    basePath: (id) => `/api/v1/forms/${e(id)}`,
  });
}
