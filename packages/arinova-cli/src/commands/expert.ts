import type { Command } from "commander";
import { UnsupportedCommandError } from "../client.js";

const MESSAGE =
  "expert management is unavailable because its public v1 contract was removed. No request was sent.";

function unsupported(): never {
  throw new UnsupportedCommandError(MESSAGE);
}

export function registerExpert(program: Command): void {
  const expert = program
    .command("expert")
    .description("Expert management (currently unavailable)");

  expert.command("list").action(unsupported);
  expert
    .command("create")
    .requiredOption("--name <name>", "Expert name")
    .option("--description <desc>", "Description")
    .option("--category <cat>", "Category")
    .option("--model <model>", "Model")
    .option("--system-prompt <prompt>", "System prompt")
    .action(unsupported);
  expert.command("update <id>").action(unsupported);
  expert.command("delete <id>").action(unsupported);
  expert.command("upload-kb <expertId> <file>").action(unsupported);
  expert.command("delete-kb <expertId> <kbId>").action(unsupported);
  expert.command("publish <id>").action(unsupported);
  expert.command("unpublish <id>").action(unsupported);
}
