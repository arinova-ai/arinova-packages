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
});
