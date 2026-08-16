import type { Command } from "commander";
import { UnsupportedCommandError } from "./client.js";

interface UnavailableCommandOptions {
  name: string;
  description: string;
  message: string;
  subcommands: string[];
}

export function registerUnavailableCommand(
  program: Command,
  options: UnavailableCommandOptions,
): void {
  const unavailable = (): never => {
    throw new UnsupportedCommandError(options.message);
  };
  const root = program.command(options.name)
    .description(options.description)
    .addHelpText("after", `\nMigration: ${options.message}\n`)
    .action(unavailable);
  for (const name of options.subcommands) {
    root.command(name)
      .description("Show the migration notice without issuing a request")
      .allowUnknownOption(true)
      .allowExcessArguments(true)
      .action(unavailable);
  }
}
