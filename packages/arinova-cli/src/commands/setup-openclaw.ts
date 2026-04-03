import { Command } from "commander";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getApiKey, getEndpoint } from "../config.js";
import { printSuccess, printError } from "../output.js";

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

export function registerSetupOpenclaw(program: Command): void {
  program
    .command("setup-openclaw")
    .description("One-click setup for OpenClaw workspace Arinova integration")
    .option("--workspace <path>", "Path to specific openclaw.json (default: ~/.openclaw/openclaw.json)")
    .option("--force", "Force reconfigure existing channel settings")
    .option("--api-url <url>", "Arinova API URL for channel config")
    .action(async (opts: { workspace?: string; force?: boolean; apiUrl?: string }) => {
      try {
        // Resolve API base: local --api-url > global --api-url > auto-detect (version-based)
        const globalOpts = program.optsWithGlobals() as { apiUrl?: string };
        const apiBase = (opts.apiUrl ?? globalOpts.apiUrl ?? getEndpoint()).replace(/\/+$/, "");

        // Helper functions that use resolved base
        const apiHeaders = (): Record<string, string> => {
          const key = getApiKey();
          return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
        };
        const apiGet = async (path: string): Promise<unknown> => {
          const res = await fetch(`${apiBase}${path}`, { method: "GET", headers: apiHeaders() });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        };
        const apiPost = async (path: string, body?: unknown): Promise<unknown> => {
          const res = await fetch(`${apiBase}${path}`, {
            method: "POST", headers: apiHeaders(),
            body: body != null ? JSON.stringify(body) : undefined,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        };

        console.log(`Using API endpoint: ${apiBase}`);

        // 1. Check auth
        const apiKey = getApiKey();
        if (!apiKey) {
          printError("No API key configured. Please run `arinova auth login` first");
          return; // printError exits, but for clarity
        }

        // 2. Find openclaw.json
        const configPath = opts.workspace ?? join(homedir(), ".openclaw", "openclaw.json");
        if (!existsSync(configPath)) {
          printError(`openclaw.json not found at: ${configPath}`);
          return;
        }

        // 3. Read and parse
        let config: OpenclawConfig;
        try {
          config = JSON.parse(readFileSync(configPath, "utf-8")) as OpenclawConfig;
        } catch {
          printError(`Failed to parse openclaw.json at: ${configPath}`);
          return;
        }

        // 4. Check plugin
        const hasPluginEntry = config.plugins?.entries?.["openclaw-arinova-ai"];
        const hasPluginInstall = config.plugins?.installs?.["openclaw-arinova-ai"];
        if (!hasPluginEntry && !hasPluginInstall) {
          printError(
            "Arinova plugin not installed. Please run:\n  openclaw plugins install @arinova-ai/openclaw-arinova-ai",
          );
          return;
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
          printError("No agents found in openclaw.json (no agents.list or agents.defaults)");
          return;
        }

        console.log(`Found ${agents.length} agent(s) in openclaw.json: ${agents.map((a) => a.name).join(", ")}`);

        // 6. Get existing bots from Arinova (use /api/agents for owned agents with name field)
        let remoteBots: RemoteAgent[] = [];
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
          console.log("Warning: Could not fetch existing bots from Arinova. Will create new bots.");
        }

        console.log(`Found ${remoteBots.length} existing bot(s) on Arinova`);

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
            // Create a new bot
            console.log(`Creating bot for agent "${agent.name}"...`);
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
                console.log(`Warning: Bot created for "${agent.name}" but no token in response. You may need to retrieve it manually.`);
                console.log("  Response:", JSON.stringify(created, null, 2));
                summary.push({ agent: agent.name, action: "created bot (token not found in response)" });
                continue;
              }

              summary.push({ agent: agent.name, action: "created new bot" });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.log(`Warning: Failed to create bot for "${agent.name}": ${msg}`);
              summary.push({ agent: agent.name, action: `failed: ${msg}` });
              continue;
            }
          }

          accountsConfig[agent.id] = { enabled: true, botToken: token };
        }

        // 8. Backup
        const backupPath = configPath + ".bak";
        copyFileSync(configPath, backupPath);
        console.log(`Backup saved to: ${backupPath}`);

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

        // 11. Write back
        writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

        // 12. Print summary
        console.log("\n--- Setup Summary ---");
        for (const s of summary) {
          console.log(`  ${s.agent}: ${s.action}`);
        }
        console.log(`\nChannel API URL: ${channelApiUrl}`);
        console.log(`Agents configured: ${Object.keys(accountsConfig).length}/${agents.length}`);
        printSuccess("OpenClaw Arinova integration setup complete!");
      } catch (err) {
        printError(err);
      }
    });
}
