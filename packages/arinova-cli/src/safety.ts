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
  if (!DESTRUCTIVE_COMMANDS.has(command.name())) return;
  const path: string[] = [];
  for (let current: Command | null = command; current; current = current.parent) {
    if (current.name()) path.unshift(current.name());
  }
  throw new ConfirmationRequiredError(path.join(" "));
}
