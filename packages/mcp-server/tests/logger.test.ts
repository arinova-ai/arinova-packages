import { afterEach, describe, expect, it, vi } from "vitest";
import { logger, setLogLevel } from "../src/logger.js";

describe("logger", () => {
  afterEach(() => {
    setLogLevel("warn");
    vi.restoreAllMocks();
  });

  it("writes every enabled level to stderr and never stdout", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    setLogLevel("debug");

    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    expect(stderr).toHaveBeenCalledTimes(4);
    expect(stderr.mock.calls.map(([line]) => String(line))).toEqual([
      "[arinova-mcp] [DEBUG] debug message\n",
      "[arinova-mcp] [INFO] info message\n",
      "[arinova-mcp] [WARN] warn message\n",
      "[arinova-mcp] [ERROR] error message\n",
    ]);
    expect(stdout).not.toHaveBeenCalled();
  });

  it("filters messages below the configured level", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    setLogLevel("error");
    logger.debug("hidden");
    logger.warn("hidden");
    logger.error("shown");
    expect(stderr).toHaveBeenCalledTimes(1);
  });
});
