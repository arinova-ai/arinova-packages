import type { Command } from "commander";
import { parseJsonOption } from "../json-options.js";
import { registerResourceCommands } from "../resource-commands.js";

export function registerDocCommands(program: Command): void {
  registerResourceCommands(program, {
    name: "doc",
    description: "Document commands",
    basePath: "/api/v1/docs",
    list: {
      configure(command) {
        command.option("--include-archived").option("--search <query>");
      },
      query: (options) => ({
        includeArchived: options.includeArchived,
        search: options.search,
      }),
    },
    create: {
      configure(command) {
        command
          .requiredOption("--title <title>")
          .option("--content <json>", "Content JSON")
          .option("--page-settings <json>")
          .option("--space-id <id>");
      },
      body: (options) => ({
        title: options.title,
        contentJson: parseJsonOption(options.content),
        pageSettings: parseJsonOption(options.pageSettings),
        spaceId: options.spaceId,
      }),
    },
    show: {},
    update: {
      configure(command) {
        command
          .option("--title <title>")
          .option("--content <json>")
          .option("--page-settings <json>")
          .option("--expected-version <n>");
      },
      body: (options) => ({
        title: options.title,
        contentJson: parseJsonOption(options.content),
        pageSettings: parseJsonOption(options.pageSettings),
        expectedVersion: options.expectedVersion == null
          ? undefined
          : Number(options.expectedVersion),
      }),
    },
    delete: {},
    actions: [{ name: "archive" }, { name: "unarchive" }],
  });
}
