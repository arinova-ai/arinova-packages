import type { Command } from "commander";

const DESTRUCTIVE_COMMANDS = new Set([
  "ack",
  "approve",
  "archive",
  "cancel",
  "close",
  "delete",
  "disable",
  "discard",
  "logout",
  "pause",
  "publish",
  "purchase",
  "reject",
  "remove",
  "remove-agent",
  "remove-image",
  "restore",
  "restore-batch",
  "rollback",
  "rotate-secret",
  "run",
  "test",
  "unarchive",
  "unfavorite",
  "uninstall",
  "unpublish",
]);

const DESTRUCTIVE_COMMAND_PATHS = new Set([
  "arinova community add-agent",
  "arinova image project public-share create",
  "arinova memory grant set",
]);

export class ConfirmationRequiredError extends Error {
  readonly code = "CONFIRMATION_REQUIRED";

  constructor(commandPath: string) {
    super(
      `Refusing non-interactive side effect '${commandPath}' without --yes.`,
    );
    this.name = "ConfirmationRequiredError";
  }
}

export function requireNonInteractiveConfirmation(
  command: Command,
  options: { isTTY?: boolean } = {},
): void {
  const isTTY = options.isTTY ?? Boolean(process.stdin.isTTY);
  if (isTTY || command.optsWithGlobals().yes) return;
  const path: string[] = [];
  for (let current: Command | null = command; current; current = current.parent) {
    if (current.name()) path.unshift(current.name());
  }
  const commandPath = path.join(" ");
  const destructiveBatchDelete =
    commandPath === "arinova file batch" && command.opts().op === "delete";
  if (
    !DESTRUCTIVE_COMMANDS.has(command.name()) &&
    !DESTRUCTIVE_COMMAND_PATHS.has(commandPath) &&
    !destructiveBatchDelete
  ) {
    return;
  }
  throw new ConfirmationRequiredError(commandPath);
}
