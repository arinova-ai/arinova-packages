import type { Command } from "commander";

// Unknown leaves are side effects by default. This allowlist contains
// observation-only commands plus init/build leaves whose effects stay local
// and never issue an API request.
const READ_ONLY_COMMANDS = new Set([
  "agent-manifest",
  "agents",
  "build",
  "categories",
  "completion",
  "content",
  "credit",
  "duplicates",
  "function-executions",
  "get",
  "history",
  "hub-data",
  "info",
  "init",
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
