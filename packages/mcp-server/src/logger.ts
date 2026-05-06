export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "warn";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function format(level: LogLevel, message: string): string {
  return `[arinova-mcp] [${level.toUpperCase()}] ${message}`;
}

export const logger = {
  debug(message: string): void {
    if (shouldLog("debug")) process.stderr.write(format("debug", message) + "\n");
  },
  info(message: string): void {
    if (shouldLog("info")) process.stderr.write(format("info", message) + "\n");
  },
  warn(message: string): void {
    if (shouldLog("warn")) process.stderr.write(format("warn", message) + "\n");
  },
  error(message: string): void {
    if (shouldLog("error")) process.stderr.write(format("error", message) + "\n");
  },
};
