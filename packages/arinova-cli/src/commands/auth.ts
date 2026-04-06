import { Command } from "commander";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig, saveConfig, setProfile, getEndpoint, getEnvironmentLabel, resolveApiKey, resolveProfileName, getProfile, listProfiles } from "../config.js";
import { printResult, printError, printSuccess } from "../output.js";

export function registerAuth(program: Command): void {
  const auth = program.command("auth").description("Authentication commands");

  auth
    .command("login")
    .description("Log in via browser (creates a user profile with your username)")
    .option("-p, --port <port>", "Local callback port", "9876")
    .action(async function (this: Command, opts: { port: string }) {
      const port = parseInt(opts.port, 10);
      // Derive web URL from API endpoint (strip "api." prefix)
      const apiEndpoint = getEndpoint();
      const endpoint = apiEndpoint.replace("://api.", "://");

      console.log("Opening browser for authentication...");
      console.log(`Waiting for callback on http://localhost:${port} ...\n`);

      const keyPromise = new Promise<string>((resolve, reject) => {
        const server = createServer((req: IncomingMessage, res: ServerResponse) => {
          const url = new URL(req.url || "/", `http://localhost:${port}`);
          if (url.pathname === "/callback") {
            const key = url.searchParams.get("key");
            if (key && key.startsWith("ari_")) {
              res.writeHead(200, { "Content-Type": "text/html" });
              res.end("<html><body><h2>Authentication successful!</h2><p>You can close this tab.</p></body></html>");
              server.close();
              resolve(key);
            } else {
              res.writeHead(400, { "Content-Type": "text/html" });
              res.end("<html><body><h2>Invalid key</h2></body></html>");
              server.close();
              reject(new Error("Received invalid key from browser"));
            }
          } else {
            res.writeHead(404);
            res.end("Not found");
          }
        });

        server.listen(port, () => {
          const loginUrl = `${endpoint}/creator/cli-auth?callback=http://localhost:${port}/callback`;
          // Open browser
          const open =
            process.platform === "darwin" ? "open" :
            process.platform === "win32" ? "start" : "xdg-open";
          import("node:child_process").then(({ exec }) => {
            exec(`${open} "${loginUrl}"`);
          });
          console.log(`If the browser didn't open, visit:\n  ${loginUrl}\n`);
        });

        setTimeout(() => {
          server.close();
          reject(new Error("Login timed out after 120 seconds"));
        }, 120_000);
      });

      try {
        const key = await keyPromise;

        // Fetch username to use as profile name
        let profileName = "user";
        try {
          const res = await fetch(`${apiEndpoint}/api/v1/creator/api-keys/whoami`, {
            headers: { Authorization: `Bearer ${key}` },
          });
          if (res.ok) {
            const data = await res.json() as Record<string, unknown>;
            const name = (data.username ?? data.name ?? "") as string;
            if (name) profileName = name.toLowerCase().replace(/\s+/g, "-");
          }
        } catch { /* use default name */ }

        setProfile(profileName, { type: "user", apiKey: key });

        printSuccess(`Logged in! Profile '${profileName}' created (user, key: ${key.slice(0, 12)}...)`);
        console.log(`\nTo use: arinova --profile ${profileName} <command>`);
      } catch (err) {
        printError(err);
      }
    });

  auth
    .command("logout")
    .description("Remove the current profile's API key")
    .action(() => {
      const profileFlag = program.optsWithGlobals().profile as string | undefined;
      try {
        const name = resolveProfileName(profileFlag);
        const profile = getProfile(name);
        if (!profile) {
          printError(new Error(`Profile '${name}' not found.`));
          return;
        }
        // Remove the profile entirely
        const { removeProfile } = require("../config.js") as typeof import("../config.js");
        removeProfile(name);
        printSuccess(`Profile '${name}' removed.`);
      } catch {
        printError(new Error("No active profile to log out from."));
      }
    });

  auth
    .command("set-token <key>")
    .description("Set a bot token for the current profile (requires --profile)")
    .action((key: string) => {
      const profileFlag = program.optsWithGlobals().profile as string | undefined;
      if (!profileFlag) {
        printError(new Error("Must specify --profile <name> when setting a bot token.\nExample: arinova --profile linda auth set-token ari_xxx"));
        return;
      }
      if (!key.startsWith("ari_")) {
        printError(new Error("Invalid key format. Expected key starting with ari_"));
        return;
      }
      const name = profileFlag;
      setProfile(name, { type: "bot", apiKey: key });
      printSuccess(`Bot profile '${name}' saved (key: ${key.slice(0, 12)}...)`);
      console.log(`\nTo use: arinova --profile ${name} <command>`);
    });

  // Keep set-key as hidden alias for backwards compat
  auth
    .command("set-key <key>", { hidden: true })
    .description("(deprecated) Use 'auth set-token' instead")
    .action((key: string) => {
      console.error("Warning: 'set-key' is deprecated. Use 'arinova --profile <name> auth set-token <key>' instead.\n");
      const profileFlag = program.optsWithGlobals().profile as string | undefined;
      if (!key.startsWith("ari_")) {
        printError(new Error("Invalid key format. Expected key starting with ari_"));
        return;
      }
      const name = profileFlag ?? process.env.ARINOVA_PROFILE ?? "default";
      setProfile(name, { type: "bot", apiKey: key });
      printSuccess(`Profile '${name}' saved (key: ${key.slice(0, 12)}...)`);
    });

  auth
    .command("whoami")
    .description("Show current identity and environment")
    .action(async () => {
      try {
        const profileFlag = program.optsWithGlobals().profile as string | undefined;
        const tokenFlag = program.optsWithGlobals().token as string | undefined;
        const { apiKey, profileName, source } = resolveApiKey({ token: tokenFlag, profile: profileFlag });
        const env = getEnvironmentLabel();
        const endpoint = getEndpoint();

        const identity: Record<string, unknown> = {
          profile: profileName,
          source,
          environment: env,
          endpoint,
          keyPrefix: `${apiKey.slice(0, 12)}...`,
        };

        // Try to resolve actual identity from server
        // Try bot endpoint first
        try {
          const botRes = await fetch(`${endpoint}/api/agent/me`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (botRes.ok) {
            const bot = await botRes.json() as Record<string, unknown>;
            identity.identityType = "bot";
            identity.agentName = bot.name;
            identity.agentId = bot.id;
            printResult(identity);
            return;
          }
        } catch { /* fall through */ }

        // Try user endpoint
        try {
          const userRes = await fetch(`${endpoint}/api/v1/creator/api-keys/whoami`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (userRes.ok) {
            const user = await userRes.json() as Record<string, unknown>;
            identity.identityType = "user";
            identity.userName = user.name ?? user.username;
            identity.userId = user.id ?? user.userId;
            printResult(identity);
            return;
          }
        } catch { /* fall through */ }

        identity.status = "unauthorized — token may be expired or revoked";
        printResult(identity);
      } catch (err) {
        printError(err);
      }
    });

  const config = program.command("config").description("Configuration commands");

  config
    .command("set <key> <value>")
    .description("Set a config value (endpoint)")
    .action((key: string, value: string) => {
      if (key !== "endpoint") {
        printError(new Error(`Unknown config key: ${key}. Supported: endpoint`));
        return;
      }
      try { new URL(value); } catch {
        printError(new Error("Invalid URL format"));
        return;
      }
      if (!value.startsWith("https://") && !value.startsWith("http://localhost")) {
        printError(new Error("Endpoint must use HTTPS (or http://localhost for dev)"));
        return;
      }
      const cfg = loadConfig();
      cfg.endpoint = value.replace(/\/+$/, "");
      saveConfig(cfg);
      printSuccess(`endpoint set to ${cfg.endpoint}`);
    });

  config
    .command("show")
    .description("Show current configuration")
    .action(() => {
      const profiles = listProfiles();
      printResult({
        environment: getEnvironmentLabel(),
        endpoint: getEndpoint(),
        profiles: profiles.length > 0
          ? Object.fromEntries(profiles.map((p) => [p.name, { type: p.profile.type, key: `${p.profile.apiKey.slice(0, 12)}...` }]))
          : "(none)",
      });
    });
}
