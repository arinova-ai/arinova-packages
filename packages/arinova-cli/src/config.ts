import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type TokenType = "user" | "bot";

export interface Profile {
  type: TokenType;
  apiKey: string;
}

export interface CliConfig {
  profiles?: Record<string, Profile>;
  endpoint?: string;
  // Legacy fields (for migration)
  apiKey?: string;
  tokenType?: TokenType;
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

/** Migrate legacy config (single apiKey) to profile-based config */
export function migrateConfigIfNeeded(): void {
  const cfg = loadConfig();
  if (cfg.apiKey && !cfg.profiles) {
    const name = "migrated";
    cfg.profiles = {
      [name]: {
        type: cfg.tokenType ?? "user",
        apiKey: cfg.apiKey,
      },
    };
    delete cfg.apiKey;
    delete cfg.tokenType;
    saveConfig(cfg);
    console.error(`Note: Legacy config migrated to profile 'migrated'. Use --profile migrated or re-setup with 'arinova auth login'.`);
  }
}

// --- Profile helpers ---

export function getProfile(name: string): Profile | undefined {
  const cfg = loadConfig();
  return cfg.profiles?.[name];
}

export function setProfile(name: string, profile: Profile): void {
  const cfg = loadConfig();
  if (!cfg.profiles) cfg.profiles = {};
  cfg.profiles[name] = profile;
  saveConfig(cfg);
}

export function removeProfile(name: string): boolean {
  const cfg = loadConfig();
  if (!cfg.profiles?.[name]) return false;
  delete cfg.profiles[name];
  saveConfig(cfg);
  return true;
}

export function listProfiles(): { name: string; profile: Profile }[] {
  const cfg = loadConfig();
  if (!cfg.profiles) return [];
  return Object.entries(cfg.profiles).map(([name, profile]) => ({
    name,
    profile,
  }));
}

// --- Token resolution ---

/**
 * Resolve the active profile name.
 * Only accepts --profile flag. No env var, no default.
 */
export function resolveProfileName(flagValue?: string): string {
  if (flagValue) return flagValue;
  console.error("Error: --profile <name> is required.");
  console.error("       Run 'arinova profile list' to see available profiles.");
  process.exit(1);
}

/**
 * Resolve the API key for the active profile.
 * Also accepts --token flag as highest priority override.
 */
export function resolveApiKey(opts: { token?: string; profile?: string }): { apiKey: string; profileName: string; source: string } {
  // --token flag overrides everything
  if (opts.token) {
    return { apiKey: opts.token, profileName: "(--token override)", source: "flag" };
  }

  const name = resolveProfileName(opts.profile);
  const profile = getProfile(name);
  if (!profile) {
    console.error(`Error: Profile '${name}' not found. Run 'arinova profile list' to see available profiles.`);
    process.exit(1);
  }
  return { apiKey: profile.apiKey, profileName: name, source: "profile" };
}

// --- Endpoint ---

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

export function getEnvironmentLabel(): string {
  return isStaging() ? "staging" : "production";
}

// --- Legacy compat (used by some commands during migration) ---

export function getApiKey(): string | undefined {
  // Legacy compat — try old apiKey field, then first profile as fallback
  const cfg = loadConfig();
  if (cfg.apiKey) return cfg.apiKey;
  if (cfg.profiles) {
    const first = Object.values(cfg.profiles)[0];
    if (first) return first.apiKey;
  }
  return undefined;
}
