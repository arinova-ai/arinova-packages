import type { Command } from "commander";

// Unknown leaves are side effects by default. This allowlist contains only
// commands whose handlers are expected to observe state without changing
// remote or local durable state.
const READ_ONLY_COMMANDS = new Set([
  "agent-manifest",
  "agents",
  "categories",
  "content",
  "credit",
  "duplicates",
  "function-executions",
  "get",
  "history",
  "hub-data",
  "info",
  "installed",
  "list",
  "list-agents",
  "list-members",
  "manifest",
  "my-generations",
  "overview",
  "payload",
  "pending",
  "profile",
  "prompt",
  "published",
  "query",
  "revenue",
  "runs",
  "search",
  "show",
  "stats",
  "status",
  "suggestions",
  "usage",
  "url",
  "versions",
  "whoami",
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
  if (READ_ONLY_COMMANDS.has(command.name())) return;
  throw new ConfirmationRequiredError(commandPath);
}
