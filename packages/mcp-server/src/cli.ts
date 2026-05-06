#!/usr/bin/env node

import { parseConfig, redactConfig } from "./config.js";
import { ArinovaClient } from "./arinova-client.js";
import { ArinovaMcpServer } from "./server.js";
import { setLogLevel, logger } from "./logger.js";
import { ConfigError } from "./errors.js";

async function main(): Promise<void> {
  let config: ReturnType<typeof parseConfig>;
  try {
    config = parseConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`[arinova-mcp] Error: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  setLogLevel(config.logLevel);
  logger.info(`Starting arinova-mcp with config: ${JSON.stringify(redactConfig(config))}`);

  const client = new ArinovaClient(config);
  const server = new ArinovaMcpServer(config, client);

  let shutdownInitiated = false;

  async function shutdown(): Promise<void> {
    if (shutdownInitiated) return;
    shutdownInitiated = true;
    logger.info("Shutdown signal received");

    const drainTimeout = setTimeout(() => {
      logger.warn("Safety timeout reached; forcing exit");
      process.exit(1);
    }, config.actionTimeoutMs + 5_000);

    try {
      await server.shutdown();
    } finally {
      clearTimeout(drainTimeout);
    }

    process.exit(0);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.stdin.on("close", shutdown);

  await server.start();
}

main().catch((err) => {
  process.stderr.write(
    `[arinova-mcp] Fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
