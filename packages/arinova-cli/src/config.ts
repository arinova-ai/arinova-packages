import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface CliConfig {
  apiKey?: string;
  endpoint?: string;
}

const CONFIG_DIR = join(homedir(), ".arinova-cli");
const CONFIG_FILE = join(CONFIG_DIR, "config");

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function loadConfig(): CliConfig {
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as CliConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: CliConfig): void {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: "utf-8", mode: 0o600 });
  chmodSync(CONFIG_FILE, 0o600);
}

const PRODUCTION_ENDPOINT = "https://api.chat.arinova.ai";
const STAGING_ENDPOINT = "https://api.chat-staging.arinova.ai";

/** Detect staging from package version (contains "-staging") */
export function isStaging(): boolean {
  try {
    const pkgPath = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return typeof pkg.version === "string" && pkg.version.includes("-staging");
  } catch {
    return false;
  }
}

export function getEndpoint(): string {
  // Priority: env var > config file > version-based auto-detect
  if (process.env.ARINOVA_ENDPOINT) {
    return process.env.ARINOVA_ENDPOINT.replace(/\/+$/, "");
  }
  const cfg = loadConfig();
  if (cfg.endpoint) return cfg.endpoint;
  return isStaging() ? STAGING_ENDPOINT : PRODUCTION_ENDPOINT;
}

export function getApiKey(): string | undefined {
  return loadConfig().apiKey;
}
