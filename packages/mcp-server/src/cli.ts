#!/usr/bin/env node

import { parseConfig, redactConfig } from "./config.js";
import { ArinovaClient } from "./arinova-client.js";
import { ArinovaMcpServer } from "./server.js";
import { setLogLevel, logger } from "./logger.js";
import { ConfigError } from "./errors.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { realpathSync } from "node:fs";

export interface ShutdownRuntime {
  on(event: "SIGTERM" | "SIGINT", listener: () => void): unknown;
  stdin: { on(event: "close", listener: () => void): unknown };
  exit(code: number): unknown;
}

export function installShutdownHandlers(
  server: Pick<ArinovaMcpServer, "shutdown">,
  actionTimeoutMs: number,
  runtime: ShutdownRuntime = process,
): () => Promise<void> {
  let shutdownInitiated = false;

  async function shutdown(): Promise<void> {
    if (shutdownInitiated) return;
    shutdownInitiated = true;
    logger.info("Shutdown signal received");

    const drainTimeout = setTimeout(() => {
      logger.warn("Safety timeout reached; forcing exit");
      runtime.exit(1);
    }, actionTimeoutMs + 5_000);

    try {
      await server.shutdown();
    } finally {
      clearTimeout(drainTimeout);
    }

    runtime.exit(0);
  }

  runtime.on("SIGTERM", shutdown);
  runtime.on("SIGINT", shutdown);
  runtime.stdin.on("close", shutdown);
  return shutdown;
}

export async function main(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  let config: ReturnType<typeof parseConfig>;
  try {
    config = parseConfig(argv);
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`[arinova-mcp] Error: ${err.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  setLogLevel(config.logLevel);
  logger.info(`Starting arinova-mcp with config: ${JSON.stringify(redactConfig(config))}`);

  const client = new ArinovaClient(config);
  const server = new ArinovaMcpServer(config, client);

  installShutdownHandlers(server, config.actionTimeoutMs);

  await server.start();
}

function toCanonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

export function isDirectExecution(
  moduleUrl = import.meta.url,
  entrypoint = process.argv[1],
): boolean {
  if (!entrypoint) return false;
  // npm bin entrypoints are symlinks (.bin/arinova-mcp -> dist/cli.js), so
  // both sides must be resolved to their real paths before comparing.
  return toCanonicalPath(fileURLToPath(moduleUrl)) === toCanonicalPath(resolve(entrypoint));
}

export function reportFatalError(err: unknown): void {
  process.stderr.write(
    `[arinova-mcp] Fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
}

if (isDirectExecution()) {
  main().catch((err) => {
    reportFatalError(err);
    // The stdio transport keeps the event loop alive after a fatal startup
    // error; exit explicitly so the host does not see a zombie that later
    // closes stdin and exits 0.
    process.exit(1);
  });
}
