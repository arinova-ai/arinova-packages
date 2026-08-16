import { Command } from "commander";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { getEndpoint, resolveApiKey } from "../config.js";
import { ApiClient, ApiError } from "../client.js";
import { normalizeTrustedArinovaApiEndpoint } from "../endpoint.js";
import { printSuccess, printNote, printWarning } from "../output.js";

interface OpenclawAgent {
  id: string;
  name: string;
  workspace?: string;
}

interface OpenclawBinding {
  agentId: string;
  match: { channel: string; accountId: string };
}

interface OpenclawConfig {
  agents?: { list?: OpenclawAgent[]; defaults?: Record<string, unknown> };
  bindings?: OpenclawBinding[];
  channels?: Record<string, unknown>;
  plugins?: {
    entries?: Record<string, unknown>;
    installs?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

interface RemoteAgent {
  id: string;
  name?: string;
  agent_name?: string;
  botToken?: string;
  secret_token?: string;
  secretToken?: string;
  [key: string]: unknown;
}

interface OpenclawConfigWriteOps {
  writeFileSync: typeof writeFileSync;
  copyFileSync: typeof copyFileSync;
  chmodSync: typeof chmodSync;
}

export const OPENCLAW_BACKUP_RETENTION = 5;

export function writeConfigWithRollback(
  configPath: string,
  backupPath: string,
  serializedConfig: string,
  ops: OpenclawConfigWriteOps = { writeFileSync, copyFileSync, chmodSync },
): void {
  try {
    ops.writeFileSync(configPath, serializedConfig, {
      encoding: "utf-8",
      mode: 0o600,
    });
    ops.chmodSync(configPath, 0o600);
  } catch (err) {
    ops.copyFileSync(backupPath, configPath);
    ops.chmodSync(configPath, 0o600);
    throw err;
  }
}

export function secureAndPruneConfigBackups(
  configPath: string,
  keep = OPENCLAW_BACKUP_RETENTION,
): void {
  if (!Number.isSafeInteger(keep) || keep < 1) {
    throw new TypeError("Backup retention must be a positive safe integer");
  }
  const directory = dirname(configPath);
  const escapedName = basename(configPath).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const managedBackup = new RegExp(
    `^${escapedName}\\.\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z\\.bak$`,
  );
  const backups = readdirSync(directory)
    .filter((name) => managedBackup.test(name))
    .filter((name) => lstatSync(join(directory, name)).isFile())
    .sort()
    .reverse();
  for (const name of backups) {
    chmodSync(join(directory, name), 0o600);
  }
  for (const name of backups.slice(keep)) {
    unlinkSync(join(directory, name));
  }
}

export function registerSetupOpenclaw(program: Command): void {
  program
    .command("setup-openclaw")
    .description("One-click setup for OpenClaw workspace Arinova integration")
    .option("--workspace <path>", "Path to specific openclaw.json (default: ~/.openclaw/openclaw.json)")
    .option("--force", "Force reconfigure existing channel settings")
    .option("--dry-run", "Print the planned OpenClaw config changes without writing files")
    .option("--api-url <url>", "Arinova API URL for channel config")
    .action(async (opts: { workspace?: string; force?: boolean; dryRun?: boolean; apiUrl?: string }) => {
      // Resolve API base: local --api-url > global --api-url > auto-detect (version-based)
      const globalOpts = program.optsWithGlobals() as { apiUrl?: string };
      const apiBase = normalizeTrustedArinovaApiEndpoint(
        opts.apiUrl ?? globalOpts.apiUrl ?? getEndpoint(),
        "setup-openclaw API URL",
      );

      printNote(`Using API endpoint: ${apiBase}`);

      // 1. Check auth
      const authOpts = program.optsWithGlobals() as {
        token?: string;
        profile?: string;
      };
      let apiKey: string;
      try {
        apiKey = resolveApiKey({
          token: authOpts.token,
          profile: authOpts.profile,
        }).apiKey;
      } catch {
        throw new Error("No API key configured. Please run `arinova auth login` first");
      }
      const client = new ApiClient({ endpoint: apiBase, token: apiKey });
      const apiGet = (path: string) => client.get(path);
      const apiPost = (path: string, body?: unknown) => client.post(path, body);

      // 2. Find openclaw.json
      const configPath = opts.workspace ?? join(homedir(), ".openclaw", "openclaw.json");
      if (!existsSync(configPath)) {
        throw new Error(`openclaw.json not found at: ${configPath}`);
      }

      // 3. Read and parse
      let config: OpenclawConfig;
      try {
        config = JSON.parse(readFileSync(configPath, "utf-8")) as OpenclawConfig;
      } catch {
        throw new Error(`Failed to parse openclaw.json at: ${configPath}`);
      }

      // 4. Check plugin
      const hasPluginEntry = config.plugins?.entries?.["openclaw-arinova-ai"];
      const hasPluginInstall = config.plugins?.installs?.["openclaw-arinova-ai"];
      if (!hasPluginEntry && !hasPluginInstall) {
        throw new Error(
          "Arinova plugin not installed. Please run:\n  openclaw plugins install @arinova-ai/openclaw-arinova-ai",
        );
      }

      // 5. Get agents from openclaw config
      let agents = config.agents?.list ?? [];
      if (agents.length === 0 && config.agents?.defaults) {
        // Single-agent setup: only defaults defined, no list
        const defaults = config.agents.defaults as Record<string, unknown>;
        const name = (defaults.name as string) ?? "default";
        const id = (defaults.id as string) ?? "default";
        agents = [{ id, name, workspace: defaults.workspace as string | undefined }];
      }
      if (agents.length === 0) {
        throw new Error("No agents found in openclaw.json (no agents.list or agents.defaults)");
      }

      printNote(`Found ${agents.length} agent(s) in openclaw.json: ${agents.map((a) => a.name).join(", ")}`);

      // 6. Get existing bots from Arinova (use /api/agents for owned agents with name field)
      let remoteBots: RemoteAgent[] = [];
      let canCreateBots = true;
      try {
        const data = await apiGet("/api/agents");
        const raw = data as Record<string, unknown>;
        const list = raw.agents ?? data;
        if (Array.isArray(list)) {
          // Filter to entries that have at least an id and name
          remoteBots = (list as RemoteAgent[]).filter(
            (b) => b.id && (b.name || b.agent_name),
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        canCreateBots = !(err instanceof ApiError && (err.status === 401 || err.status === 403));
        printWarning(
          `Could not fetch existing bots from Arinova: ${message}. ${canCreateBots ? "Will create new bots." : "Authentication failed; new bots will not be created."}`,
        );
      }

      printNote(`Found ${remoteBots.length} existing bot(s) on Arinova`);

      // 7. Match agents to bots and collect tokens
      // channelApiUrl: the URL written into openclaw.json for the plugin
      const channelApiUrl = apiBase.startsWith("https://api.") ? apiBase : (() => {
        const endpoint = apiBase;
        // Convert chat.arinova.ai -> api.chat.arinova.ai
        // Convert chat-staging.arinova.ai -> api.chat-staging.arinova.ai
        try {
          const u = new URL(endpoint);
          if (!u.hostname.startsWith("api.")) {
            u.hostname = `api.${u.hostname}`;
          }
          return u.origin;
        } catch {
          return "https://api.chat.arinova.ai";
        }
      })();

      // Read existing channel config to check for already-configured agents
      const existingChannel = (config.channels?.["openclaw-arinova-ai"] ?? {}) as Record<string, unknown>;
      const existingAccounts = (existingChannel.accounts ?? {}) as Record<string, { enabled: boolean; botToken: string }>;

      const accountsConfig: Record<string, { enabled: boolean; botToken: string }> = {};
      const summary: { agent: string; action: string }[] = [];

      for (const agent of agents) {
        // Skip if already configured (unless --force)
        if (!opts.force && existingAccounts[agent.id]?.botToken) {
          accountsConfig[agent.id] = existingAccounts[agent.id];
          summary.push({ agent: agent.name, action: "skipped (already configured)" });
          continue;
        }

        // Try to match by name (case-insensitive)
        const match = remoteBots.find(
          (b) => (b.name ?? b.agent_name ?? "").toLowerCase() === agent.name.toLowerCase(),
        );

        let token: string | undefined;

        if (match) {
          token = match.botToken ?? match.secretToken ?? match.secret_token;
          if (token) {
            summary.push({ agent: agent.name, action: `matched existing bot "${match.name ?? match.agent_name}"` });
          }
        }

        if (!token) {
          if (!canCreateBots) {
            summary.push({ agent: agent.name, action: "skipped (bot lookup unauthorized)" });
            continue;
          }
          // Create a new bot
          printNote(`Creating bot for agent "${agent.name}"...`);
          try {
            const created = (await apiPost("/api/agents", {
              name: agent.name,
              description: "OpenClaw agent",
            })) as RemoteAgent;

            const raw = created as Record<string, unknown>;
            token = (raw.secretToken ?? raw.secret_token ?? raw.botToken ?? raw.bot_token) as string | undefined;
            if (!token) {
              // The token might be nested in agent/data
              const nested = raw.agent ?? raw.data;
              if (nested && typeof nested === "object") {
                const n = nested as Record<string, unknown>;
                token = (n.secretToken ?? n.secret_token ?? n.botToken ?? n.bot_token) as string | undefined;
              }
            }

            if (!token) {
              printWarning(`Bot created for "${agent.name}" but no token in response. You may need to retrieve it manually.`);
              printNote("  The response did not include a supported token field; raw response data was not printed.");
              summary.push({ agent: agent.name, action: "created bot (token not found in response)" });
              continue;
            }

            summary.push({ agent: agent.name, action: "created new bot" });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            printWarning(`Failed to create bot for "${agent.name}": ${msg}`);
            summary.push({ agent: agent.name, action: `failed: ${msg}` });
            continue;
          }
        }

        accountsConfig[agent.id] = { enabled: true, botToken: token };
      }

      if (opts.dryRun) {
        printSetupSummary(summary, channelApiUrl, Object.keys(accountsConfig).length, agents.length);
        printNote("\nDry run: openclaw.json was not modified.");
        printSuccess("OpenClaw Arinova integration dry run complete.");
        return;
      }

      // 8. Backup
      const backupPath = `${configPath}.${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
      copyFileSync(configPath, backupPath);
      chmodSync(backupPath, 0o600);
      printNote(`Backup saved to: ${backupPath}`);

      // 9. Write channels config
      if (!config.channels) {
        config.channels = {};
      }
      config.channels["openclaw-arinova-ai"] = {
        enabled: true,
        apiUrl: channelApiUrl,
        accounts: accountsConfig,
      };

      // 10. Ensure plugins.allow includes openclaw-arinova-ai
      if (!config.plugins) {
        config.plugins = {};
      }
      const allow = ((config.plugins as Record<string, unknown>).allow ?? []) as string[];
      if (!allow.includes("openclaw-arinova-ai")) {
        allow.push("openclaw-arinova-ai");
        (config.plugins as Record<string, unknown>).allow = allow;
      }

      // 11. Write bindings — ensure each agent has a binding
      if (!config.bindings) {
        config.bindings = [];
      }
      for (const agent of agents) {
        // Only add binding if the agent has an account configured
        if (!accountsConfig[agent.id]) continue;

        const exists = config.bindings.some(
          (b) =>
            b.agentId === agent.id &&
            b.match.channel === "openclaw-arinova-ai" &&
            b.match.accountId === agent.id,
        );
        if (!exists) {
          config.bindings.push({
            agentId: agent.id,
            match: { channel: "openclaw-arinova-ai", accountId: agent.id },
          });
          summary.push({ agent: agent.name, action: "added binding" });
        }
      }

      // 11. Write back; restore backup if writing fails.
      writeConfigWithRollback(configPath, backupPath, JSON.stringify(config, null, 2) + "\n");
      secureAndPruneConfigBackups(configPath);

      // 12. Print summary
      printSetupSummary(summary, channelApiUrl, Object.keys(accountsConfig).length, agents.length);
      printSuccess("OpenClaw Arinova integration setup complete!");
    });
}

function printSetupSummary(
  summary: { agent: string; action: string }[],
  channelApiUrl: string,
  configuredCount: number,
  agentCount: number,
): void {
  printNote("\n--- Setup Summary ---");
  for (const s of summary) {
    printNote(`  ${s.agent}: ${s.action}`);
  }
  printNote(`\nChannel API URL: ${channelApiUrl}`);
  printNote(`Agents configured: ${configuredCount}/${agentCount}`);
}
