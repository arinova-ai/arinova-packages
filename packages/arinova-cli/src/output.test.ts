import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client.js";
import {
  printError,
  printResult,
  printSuccess,
  setJsonMode,
  table,
} from "./output.js";

describe("CLI output formatting", () => {
  beforeEach(() => {
    setJsonMode(false);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    setJsonMode(false);
    vi.restoreAllMocks();
    process.exitCode = undefined;
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

  it("renders record lists as a human table", () => {
    printResult([
      { id: "1", name: "Alpha", nested: { ignored: true } },
      { id: "2", name: "Beta", nested: { ignored: true } },
    ]);

    expect(console.log).toHaveBeenCalledWith("id  name ");
    expect(console.log).toHaveBeenCalledWith("1   Alpha");
    expect(console.log).toHaveBeenCalledWith("2   Beta ");
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining("[object Object]"),
    );
  });

  it("prints a stable JSON error envelope to stderr", () => {
    setJsonMode(true);
    expect(() =>
      printError(
        new ApiError(409, {
          code: "CONFLICT",
          message: "Already exists",
          details: { id: "item-1" },
        }),
      ),
    ).toThrow();

    expect(console.error).toHaveBeenCalledWith(
      JSON.stringify(
        {
          error: {
            status: 409,
            code: "CONFLICT",
            message:
              'API error 409: {"code":"CONFLICT","message":"Already exists","details":{"id":"item-1"}}',
            details: { id: "item-1" },
          },
        },
        null,
        2,
      ),
    );
  });
});
