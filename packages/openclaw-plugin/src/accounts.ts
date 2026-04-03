import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import type { ArinovaChatAccountConfig, CoreConfig } from "./types.js";

export type ResolvedArinovaChatAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  apiUrl: string;
  botToken: string;
  agentId: string;
  sessionToken: string;
  config: ArinovaChatAccountConfig;
};

function listConfiguredAccountIds(cfg: CoreConfig): string[] {
  const accounts = cfg.channels?.["openclaw-arinova-ai"]?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  const ids = new Set<string>();
  for (const key of Object.keys(accounts)) {
    if (!key) continue;
    ids.add(normalizeAccountId(key));
  }
  return [...ids];
}

export function listArinovaChatAccountIds(cfg: CoreConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return ids.toSorted((a, b) => a.localeCompare(b));
}

export function resolveDefaultArinovaChatAccountId(cfg: CoreConfig): string {
  const ids = listArinovaChatAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(
  cfg: CoreConfig,
  accountId: string,
): ArinovaChatAccountConfig | undefined {
  const accounts = cfg.channels?.["openclaw-arinova-ai"]?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return undefined;
  }
  const direct = accounts[accountId] as ArinovaChatAccountConfig | undefined;
  if (direct) return direct;
  const normalized = normalizeAccountId(accountId);
  const matchKey = Object.keys(accounts).find((key) => normalizeAccountId(key) === normalized);
  return matchKey ? (accounts[matchKey] as ArinovaChatAccountConfig | undefined) : undefined;
}

function mergeArinovaChatAccountConfig(
  cfg: CoreConfig,
  accountId: string,
): ArinovaChatAccountConfig {
  const { accounts: _ignored, ...base } = (cfg.channels?.["openclaw-arinova-ai"] ??
    {}) as ArinovaChatAccountConfig & { accounts?: unknown };
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

export function resolveArinovaChatAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): ResolvedArinovaChatAccount {
  const normalized = normalizeAccountId(params.accountId);
  const merged = mergeArinovaChatAccountConfig(params.cfg, normalized);
  const baseEnabled = params.cfg.channels?.["openclaw-arinova-ai"]?.enabled !== false;
  const accountEnabled = merged.enabled !== false;

  return {
    accountId: normalized,
    enabled: baseEnabled && accountEnabled,
    name: merged.name?.trim() || undefined,
    apiUrl: merged.apiUrl?.trim()?.replace(/\/$/, "") ?? "",
    botToken: merged.botToken?.trim() ?? "",
    agentId: merged.agentId ?? "",
    sessionToken: merged.sessionToken ?? "",
    config: merged,
  };
}
