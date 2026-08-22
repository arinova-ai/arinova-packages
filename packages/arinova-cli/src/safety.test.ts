import { Command } from "commander";
import { describe, expect, it } from "vitest";
import {
  ConfirmationRequiredError,
  requireNonInteractiveConfirmation,
} from "./safety.js";
import { registerCompletion } from "./completion.js";
import { registerFileCommands } from "./commands/file.js";

function command(name: string, yes = false): Command {
  const root = new Command().name("arinova").option("--yes");
  if (yes) root.setOptionValue("yes", true);
  return root.command(name);
}

function nestedCommand(path: string[], options: Record<string, unknown> = {}): Command {
  const root = new Command().name("arinova").option("--yes");
  let current = root;
  for (const name of path) current = current.command(name);
  for (const [key, value] of Object.entries(options)) current.setOptionValue(key, value);
  return current;
}

describe("non-interactive confirmation", () => {
  it("fails closed for destructive commands", () => {
    expect(() =>
      requireNonInteractiveConfirmation(command("delete"), { isTTY: false }),
    ).toThrow(ConfirmationRequiredError);
    expect(() =>
      requireNonInteractiveConfirmation(command("remove-agent"), {
        isTTY: false,
      }),
    ).toThrow(ConfirmationRequiredError);
  });

  it("accepts --yes and allows explicitly read-only commands", () => {
    expect(() =>
      requireNonInteractiveConfirmation(command("delete", true), {
        isTTY: false,
      }),
    ).not.toThrow();
    expect(() =>
      requireNonInteractiveConfirmation(command("list"), { isTTY: false }),
    ).not.toThrow();
  });

  it.each(["init", "build"])("allows local Space %s without --yes", (name) => {
    expect(() =>
      requireNonInteractiveConfirmation(nestedCommand(["space", name]), {
        isTTY: false,
      }),
    ).not.toThrow();
  });

  it.each([
    [["community", "add-agent"], {}],
    [["file", "batch"], { op: "delete" }],
    [["file", "batch"], { op: "copy" }],
    [["image", "project", "public-share", "create"], {}],
    [["image", "project", "member", "add"], {}],
    [["image", "project", "agent-permissions", "set"], {}],
    [["memory", "grant", "set"], {}],
    [["memory", "import", "confirm"], {}],
  ] as const)("fails closed for uncovered side-effect path %j", (path, options) => {
    expect(() =>
      requireNonInteractiveConfirmation(nestedCommand([...path], options), {
        isTTY: false,
      }),
    ).toThrow(ConfirmationRequiredError);
  });

  it("fails closed for an unclassified future command", () => {
    expect(() =>
      requireNonInteractiveConfirmation(
        nestedCommand(["future", "new-command"]),
        { isTTY: false },
      ),
    ).toThrow(ConfirmationRequiredError);
  });

  it("uses the real program tree for completion and the POST file URL leaf", () => {
    const root = new Command().name("arinova").option("--yes");
    registerCompletion(root);
    registerFileCommands(root);
    const completion = root.commands.find((item) => item.name() === "completion")!;
    const file = root.commands.find((item) => item.name() === "file")!;
    const url = file.commands.find((item) => item.name() === "url")!;
    expect(() => requireNonInteractiveConfirmation(completion, { isTTY: false })).not.toThrow();
    expect(() => requireNonInteractiveConfirmation(url, { isTTY: false })).toThrow(ConfirmationRequiredError);
  });
});
