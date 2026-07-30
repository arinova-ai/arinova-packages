import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { renderCompletion } from "./completion.js";

describe("shell completion", () => {
  it("keeps bash and zsh command lists synchronized", () => {
    const program = new Command().name("arinova");
    program.command("note");
    program.command("chat");
    program.command("legacy", { hidden: true });

    expect(renderCompletion(program, "bash")).toContain("chat note");
    expect(renderCompletion(program, "zsh")).toContain("chat note");
    expect(renderCompletion(program, "bash")).not.toContain("legacy");
  });
});
