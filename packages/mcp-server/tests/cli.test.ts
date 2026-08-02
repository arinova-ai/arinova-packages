import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installShutdownHandlers,
  isDirectExecution,
  main,
  reportFatalError,
  type ShutdownRuntime,
} from "../src/cli.js";

describe("CLI entrypoint", () => {
  const originalExitCode = process.exitCode;
  const originalToken = process.env.ARINOVA_BOT_TOKEN;

  afterEach(() => {
    process.exitCode = originalExitCode;
    if (originalToken === undefined) delete process.env.ARINOVA_BOT_TOKEN;
    else process.env.ARINOVA_BOT_TOKEN = originalToken;
    vi.restoreAllMocks();
  });

  it("reports ConfigError on stderr and sets exit code 1", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    delete process.env.ARINOVA_BOT_TOKEN;
    await main([]);
    expect(process.exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("Bot token is required"),
    );
  });

  it("only auto-runs for the executable module path", () => {
    expect(isDirectExecution("file:///tmp/cli.js", "/tmp/cli.js")).toBe(true);
    expect(isDirectExecution("file:///tmp/cli.js", "/tmp/other.js")).toBe(false);
    expect(isDirectExecution("file:///tmp/cli.js", undefined)).toBe(false);
  });

  it("reports fatal startup errors and sets exit code 1", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    reportFatalError(new Error("startup failed"));
    expect(stderr).toHaveBeenCalledWith(
      "[arinova-mcp] Fatal: startup failed\n",
    );
    expect(process.exitCode).toBe(1);
  });

  it("guards duplicate signals and exits after shutdown", async () => {
    const listeners = new Map<string, () => void>();
    const runtime = {
      on: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
      stdin: { on: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)) },
      exit: vi.fn(),
    } as unknown as ShutdownRuntime;
    const server = { shutdown: vi.fn(async () => {}) };
    installShutdownHandlers(server, 100, runtime);
    await Promise.all([listeners.get("SIGTERM")!(), listeners.get("SIGINT")!()]);
    expect(server.shutdown).toHaveBeenCalledTimes(1);
    expect(runtime.exit).toHaveBeenCalledWith(0);
  });

  it("forces exit when graceful shutdown exceeds the safety timeout", async () => {
    vi.useFakeTimers();
    const runtime = {
      on: vi.fn(),
      stdin: { on: vi.fn() },
      exit: vi.fn(),
    } as unknown as ShutdownRuntime;
    const server = { shutdown: vi.fn(() => new Promise<void>(() => {})) };
    const shutdown = installShutdownHandlers(server, 100, runtime);
    void shutdown();
    await vi.advanceTimersByTimeAsync(5_100);
    expect(runtime.exit).toHaveBeenCalledWith(1);
    vi.useRealTimers();
  });
});
