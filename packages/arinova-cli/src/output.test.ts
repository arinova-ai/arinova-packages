import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printResult, printSuccess, setJsonMode, table } from "./output.js";

describe("CLI output formatting", () => {
  beforeEach(() => {
    setJsonMode(false);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    setJsonMode(false);
    vi.restoreAllMocks();
  });

  it("prints pretty object output while skipping null fields", () => {
    printResult({
      id: "item-1",
      missing: null,
      nested: { ok: true },
      tags: ["a", "b"],
    });

    expect(console.log).toHaveBeenCalledWith("id: item-1");
    expect(console.log).not.toHaveBeenCalledWith("missing: null");
    expect(console.log).toHaveBeenCalledWith("nested:");
    expect(console.log).toHaveBeenCalledWith("  ok: true");
    expect(console.log).toHaveBeenCalledWith("tags: a, b");
  });

  it("prints JSON output when JSON mode is enabled", () => {
    setJsonMode(true);

    printSuccess("Saved");
    printResult({ ok: true });

    expect(console.log).toHaveBeenNthCalledWith(1, JSON.stringify({ ok: true, message: "Saved" }));
    expect(console.log).toHaveBeenNthCalledWith(2, JSON.stringify({ ok: true }, null, 2));
  });

  it("formats tables with padded columns", () => {
    table([
      { id: "1", name: "Alpha" },
      { id: "200", name: "B" },
    ], [
      { key: "id", label: "ID" },
      { key: "name", label: "Name" },
    ]);

    expect(console.log).toHaveBeenCalledWith("ID   Name ");
    expect(console.log).toHaveBeenCalledWith("---  -----");
    expect(console.log).toHaveBeenCalledWith("1    Alpha");
    expect(console.log).toHaveBeenCalledWith("200  B    ");
  });
});
