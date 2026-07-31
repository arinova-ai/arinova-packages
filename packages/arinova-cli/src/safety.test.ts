import { Command } from "commander";
import { describe, expect, it } from "vitest";
import {
  ConfirmationRequiredError,
  requireNonInteractiveConfirmation,
} from "./safety.js";

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

  it("accepts --yes and does not gate read-only commands", () => {
    expect(() =>
      requireNonInteractiveConfirmation(command("delete", true), {
        isTTY: false,
      }),
    ).not.toThrow();
    expect(() =>
      requireNonInteractiveConfirmation(command("list"), { isTTY: false }),
    ).not.toThrow();
  });

  it.each([
    [["community", "add-agent"], {}],
    [["file", "batch"], { op: "delete" }],
    [["image", "project", "public-share", "create"], {}],
    [["memory", "grant", "set"], {}],
  ] as const)("fails closed for uncovered side-effect path %j", (path, options) => {
    expect(() =>
      requireNonInteractiveConfirmation(nestedCommand([...path], options), {
        isTTY: false,
      }),
    ).toThrow(ConfirmationRequiredError);
  });

  it("does not gate a non-delete file batch operation", () => {
    expect(() =>
      requireNonInteractiveConfirmation(
        nestedCommand(["file", "batch"], { op: "copy" }),
        { isTTY: false },
      ),
    ).not.toThrow();
  });
});
