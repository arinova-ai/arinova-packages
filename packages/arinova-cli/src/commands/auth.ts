import { Command } from "commander";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig, saveConfig, getApiKey, getEndpoint } from "../config.js";
import { printResult, printError, printSuccess } from "../output.js";

export function registerAuth(program: Command): void {
  const auth = program.command("auth").description("Authentication commands");

  auth
    .command("login")
    .description("Log in via browser (opens Arinova to generate a CLI key)")
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
        const config = loadConfig();
        config.apiKey = key;
        saveConfig(config);
        printSuccess(`Logged in! API key saved (prefix: ${key.slice(0, 12)}...)`);
      } catch (err) {
        printError(err);
      }
    });

  auth
    .command("logout")
    .description("Remove stored API key")
    .action(() => {
      const config = loadConfig();
      if (!config.apiKey) {
        console.log("No API key configured. Already logged out.");
        return;
      }
      delete config.apiKey;
      saveConfig(config);
      printSuccess("Logged out. API key removed.");
    });

  auth
    .command("set-key <key>")
    .description("Set your API key")
    .action((key: string) => {
      if (!key.startsWith("ari_")) {
        printError(new Error("Invalid key format. Expected key starting with ari_"));
        return;
      }
      const config = loadConfig();
      config.apiKey = key;
      saveConfig(config);
      printSuccess(`API key saved (prefix: ${key.slice(0, 12)}...)`);
    });

  auth
    .command("whoami")
    .description("Show current user info")
    .action(async () => {
      try {
        const key = getApiKey();
        if (!key) {
          printError(new Error("No API key configured. Run: arinova auth login"));
          return;
        }
        const res = await fetch(`${getEndpoint()}/api/v1/creator/api-keys/whoami`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!res.ok) {
          const body = await res.text();
          printError(new Error(`API error ${res.status}: ${body}`));
          return;
        }
        const data = await res.json();
        printResult(data);
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
      const cfg = loadConfig();
      printResult({
        endpoint: cfg.endpoint ?? "https://chat.arinova.ai (default)",
        apiKey: cfg.apiKey ? `${cfg.apiKey.slice(0, 12)}...(set)` : "(not set)",
      });
    });
}
