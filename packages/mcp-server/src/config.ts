import { ConfigError } from "./errors.js";
import { logger, type LogLevel } from "./logger.js";

export interface McpServerConfig {
  botToken: string;
  serverUrl: string;
  apiUrl: string;
  apiUrlDerived: boolean;
  transport: "stdio";
  actionTimeoutMs: number;
  manifestTimeoutMs: number;
  startupMode: "lazy" | "strict";
  maxConcurrentActions: number;
  actionQueueLimit: number;
  actionQueueWaitMs: number;
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
    const value = next && !next.startsWith("--") ? next : undefined;
    switch (arg) {
      case "--token":
        flags.botToken = value;
        if (value) i++;
        break;
      case "--server-url":
        flags.serverUrl = value;
        if (value) i++;
        break;
      case "--api-url":
        flags.apiUrl = value;
        if (value) i++;
        break;
      case "--strict-startup":
        flags.startupMode = "strict";
        break;
      case "--log-level":
        if (value && VALID_LOG_LEVELS.has(value)) {
          flags.logLevel = value as LogLevel;
        }
        if (value) i++;
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

function validateUrl(value: string, name: string, protocols: string[]): void {
  if (!value) return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${name} must be a valid absolute URL.`);
  }
  if (!protocols.includes(url.protocol)) {
    throw new ConfigError(
      `${name} must use ${protocols.map((protocol) => protocol.replace(":", "")).join(" or ")}.`,
    );
  }
}

export function parseConfig(argv: string[] = process.argv.slice(2)): McpServerConfig {
  const cli = parseCliFlags(argv);

  const botToken = cli.botToken ?? process.env.ARINOVA_BOT_TOKEN;
  if (!botToken) {
    throw new ConfigError(
      "Bot token is required. Set ARINOVA_BOT_TOKEN or pass --token.",
    );
  }

  const explicitApiUrl = cli.apiUrl ?? process.env.ARINOVA_API_URL;
  const serverUrl = strip(
    cli.serverUrl ?? process.env.ARINOVA_SERVER_URL ?? "",
  );
  if (!serverUrl && !explicitApiUrl) {
    throw new ConfigError(
      "API URL is required. Set ARINOVA_API_URL, or set ARINOVA_SERVER_URL to derive it.",
    );
  }

  const apiUrl = explicitApiUrl
    ? strip(explicitApiUrl)
    : deriveApiUrl(serverUrl);
  const apiUrlDerived = !explicitApiUrl;
  validateUrl(apiUrl, "API URL", ["http:", "https:"]);
  validateUrl(serverUrl, "Server URL", ["ws:", "wss:"]);

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
    manifestTimeoutMs: parsePositiveInt(
      process.env.ARINOVA_MANIFEST_TIMEOUT_MS,
      15_000,
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
    actionQueueWaitMs: parsePositiveInt(
      process.env.ARINOVA_ACTION_QUEUE_WAIT_MS,
      30_000,
    ),
    logLevel,
  };
}

export function redactConfig(config: McpServerConfig): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      /token|secret|password|key/i.test(key) ? "***" : value,
    ]),
  );
}
