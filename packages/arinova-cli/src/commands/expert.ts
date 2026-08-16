import type { Command } from "commander";
import { registerUnavailableCommand } from "../unavailable-command.js";

export function registerExpert(program: Command): void {
  registerUnavailableCommand(program, {
    name: "expert",
    description: "Expert management (currently unavailable)",
    message: "expert management is unavailable because its public v1 contract was removed. Use an agent plus a published skill package instead.",
    subcommands: [
      "list",
      "create",
      "update",
      "delete",
      "upload-kb",
      "delete-kb",
      "publish",
      "unpublish",
    ],
  });
}
