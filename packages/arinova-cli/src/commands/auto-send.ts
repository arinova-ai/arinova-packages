import type { Command } from "commander";
import { UnsupportedCommandError } from "../client.js";
import { parseCount } from "../pagination.js";

const MESSAGE =
  "auto-send is unavailable because its v1 API was retired. Use platform cron commands when that migration is configured.";

function unsupported(): never {
  throw new UnsupportedCommandError(MESSAGE);
}

export function registerAutoSendCommands(program: Command): void {
  const autoSend = program
    .command("auto-send")
    .description("Deprecated auto-send schedule commands");

  autoSend
    .command("list")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .action(unsupported);
  autoSend
    .command("create")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--content <text>", "Message content")
    .requiredOption("--mode <mode>", "Mode: once or recurring")
    .option("--hours <n>", "Hours from now")
    .option("--minutes <n>", "Minutes from now")
    .option("--run-at <datetime>", "Absolute ISO 8601 time")
    .option("--interval <seconds>", "Recurring interval")
    .action(unsupported);
  autoSend.command("update").requiredOption("--id <id>", "Schedule ID").action(unsupported);
  autoSend.command("get").requiredOption("--id <id>", "Schedule ID").action(unsupported);
  autoSend.command("cancel").requiredOption("--id <id>", "Schedule ID").action(unsupported);
  autoSend
    .command("history")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .option("--limit <n>", "Max entries", parseCount)
    .action(unsupported);
}
