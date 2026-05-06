import { ConfigError } from "./errors.js";
import { logger, type LogLevel } from "./logger.js";

export interface McpServerConfig {
  botToken: string;
  serverUrl: string;
  apiUrl: string;
  apiUrlDerived: boolean;
  transport: "stdio";
  actionTimeoutMs: number;
  startupMode: "lazy" | "strict";
  maxConcurrentActions: number;
  actionQueueLimit: number;
  logLevel: LogLevel;
}

interface CliFlags {
  botToken?: string;
  serverUrl?: string;
  apiUrl?: string;
  startupMode?: "strict";
  logLevel?: LogLevel;
}

const VALID_LOG_LEVELS = new Set<string>(["debug", "info", "warn", "error"]);

function parseCliFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--token":
        flags.botToken = next;
        i++;
        break;
      case "--server-url":
        flags.serverUrl = next;
        i++;
        break;
      case "--api-url":
        flags.apiUrl = next;
        i++;
        break;
      case "--strict-startup":
        flags.startupMode = "strict";
        break;
      case "--log-level":
        if (next && VALID_LOG_LEVELS.has(next)) {
          flags.logLevel = next as LogLevel;
        }
        i++;
        break;
    }
  }
  return flags;
}

export function deriveApiUrl(serverUrl: string): string {
  return serverUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

function strip(s: string): string {
  return s.replace(/\/+$/, "");
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function parseConfig(argv: string[] = process.argv.slice(2)): McpServerConfig {
  const cli = parseCliFlags(argv);

  const botToken = cli.botToken ?? process.env.ARINOVA_BOT_TOKEN;
  if (!botToken) {
    throw new ConfigError(
      "Bot token is required. Set ARINOVA_BOT_TOKEN or pass --token.",
    );
  }

  const serverUrl = strip(
    cli.serverUrl ?? process.env.ARINOVA_SERVER_URL ?? "",
  );
  if (!serverUrl) {
    throw new ConfigError(
      "Server URL is required. Set ARINOVA_SERVER_URL or pass --server-url.",
    );
  }

  const explicitApiUrl = cli.apiUrl ?? process.env.ARINOVA_API_URL;
  const apiUrl = explicitApiUrl
    ? strip(explicitApiUrl)
    : deriveApiUrl(serverUrl);
  const apiUrlDerived = !explicitApiUrl;

  if (apiUrlDerived) {
    logger.warn(
      `ARINOVA_API_URL not set; derived "${apiUrl}" from server URL. Set ARINOVA_API_URL explicitly if WS and HTTP hosts differ.`,
    );
  }

  const startupModeRaw =
    cli.startupMode ?? process.env.ARINOVA_STARTUP_MODE ?? "lazy";
  const startupMode =
    startupModeRaw === "strict" ? "strict" : ("lazy" as const);

  const logLevel = (cli.logLevel ??
    (VALID_LOG_LEVELS.has(process.env.ARINOVA_LOG_LEVEL ?? "")
      ? (process.env.ARINOVA_LOG_LEVEL as LogLevel)
      : "warn")) as LogLevel;

  return {
    botToken,
    serverUrl,
    apiUrl,
    apiUrlDerived,
    transport: "stdio",
    actionTimeoutMs: parsePositiveInt(
      process.env.ARINOVA_ACTION_TIMEOUT_MS,
      60_000,
    ),
    startupMode,
    maxConcurrentActions: parsePositiveInt(
      process.env.ARINOVA_MAX_CONCURRENT_ACTIONS,
      4,
    ),
    actionQueueLimit: parsePositiveInt(
      process.env.ARINOVA_ACTION_QUEUE_LIMIT,
      32,
    ),
    logLevel,
  };
}

export function redactConfig(config: McpServerConfig): Record<string, unknown> {
  return {
    serverUrl: config.serverUrl,
    apiUrl: config.apiUrl,
    apiUrlDerived: config.apiUrlDerived,
    transport: config.transport,
    actionTimeoutMs: config.actionTimeoutMs,
    startupMode: config.startupMode,
    maxConcurrentActions: config.maxConcurrentActions,
    actionQueueLimit: config.actionQueueLimit,
    logLevel: config.logLevel,
    botToken: "***",
  };
}
