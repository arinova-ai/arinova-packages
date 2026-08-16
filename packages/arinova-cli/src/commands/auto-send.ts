import type { Command } from "commander";
import { registerUnavailableCommand } from "../unavailable-command.js";

export function registerAutoSendCommands(program: Command): void {
  registerUnavailableCommand(program, {
    name: "auto-send",
    description: "Deprecated auto-send schedule commands",
    message: "auto-send is unavailable because its v1 API was retired. Migrate schedules to `arinova cron job`.",
    subcommands: ["list", "create", "update", "get", "cancel", "history"],
  });
}
