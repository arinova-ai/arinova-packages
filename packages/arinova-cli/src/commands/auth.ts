import { Command } from "commander";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { loadConfig, saveConfig, setProfile, removeProfile, getEndpoint, getEnvironmentLabel, resolveApiKey, resolveProfileName, getProfile, listProfiles } from "../config.js";
import { printResult, printSuccess, printNote } from "../output.js";
import { ApiClient } from "../client.js";
import { normalizeApiEndpoint } from "../endpoint.js";

const LOGIN_TIMEOUT_MS = 120_000;

function statesMatch(received: string | null, expected: string): boolean {
  if (!received) return false;
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length
    && timingSafeEqual(receivedBytes, expectedBytes);
}

export function waitForLoginCallback(
  port: number,
  expectedState: string,
  timeoutMs = LOGIN_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, key?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      server.close();
      if (error) reject(error);
      else resolve(key!);
    };
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
      if (
        req.method !== "GET"
        || url.pathname !== "/callback"
        || !statesMatch(url.searchParams.get("state"), expectedState)
      ) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      const key = url.searchParams.get("key");
      if (!key || !key.startsWith("ari_")) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<html><body><h2>Invalid key</h2></body></html>");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<html><body><h2>Authentication successful!</h2><p>You can close this tab.</p></body></html>");
      finish(undefined, key);
    });
    server.once("error", (error) => finish(error));
    server.listen(port, "127.0.0.1");
    const abort = () => finish(new Error("Login cancelled"));
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(
      () => finish(new Error("Login timed out after 120 seconds")),
      timeoutMs,
    );
  });
}

export function registerAuth(program: Command): void {
  const auth = program.command("auth").description("Authentication commands");

  auth
    .command("login")
    .description("Log in via browser (creates a user profile with your username)")
    .option("-p, --port <port>", "Local callback port", "9876")
    .action(async function (this: Command, opts: { port: string }) {
      const port = Number(opts.port);
      if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error("Callback port must be an integer from 1 to 65535");
        return;
      }
      const apiEndpoint = getEndpoint();
      const webEndpoint = new URL(apiEndpoint);
      if (webEndpoint.hostname.startsWith("api.")) {
        webEndpoint.hostname = webEndpoint.hostname.slice(4);
      }
      const callback = `http://127.0.0.1:${port}/callback`;
      const state = randomBytes(32).toString("hex");

      printNote("Opening browser for authentication...");
      printNote(`Waiting for callback on ${callback} ...\n`);

      const callbackController = new AbortController();
      const keyPromise = waitForLoginCallback(
        port,
        state,
        LOGIN_TIMEOUT_MS,
        callbackController.signal,
      );
      try {
        const registrationResponse = await fetch(
          `${apiEndpoint.replace(/\/+$/, "")}/api/creator/cli-auth/requests`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callback }),
          },
        );
        if (!registrationResponse.ok) {
          const detail = await registrationResponse.text();
          throw new Error(`Unable to register CLI authorization request (${registrationResponse.status})${detail ? `: ${detail}` : ""}`);
        }
        const registration = await registrationResponse.json() as { nonce?: unknown };
        if (typeof registration.nonce !== "string" || !/^[a-f0-9]{64}$/.test(registration.nonce)) {
          throw new Error("Server returned an invalid CLI authorization nonce");
        }
        const loginUrl = new URL("/creator/cli-auth", webEndpoint);
        loginUrl.searchParams.set("callback", callback);
        loginUrl.searchParams.set("nonce", registration.nonce);
        loginUrl.searchParams.set("state", state);
        const open =
          process.platform === "darwin" ? "open" :
          process.platform === "win32" ? "cmd" : "xdg-open";
        const args = process.platform === "win32"
          ? ["/c", "start", "", loginUrl.toString()]
          : [loginUrl.toString()];
        spawn(open, args, { detached: true, stdio: "ignore" }).unref();
        printNote(`If the browser didn't open, visit:\n  ${loginUrl.toString()}\n`);
        const key = await keyPromise;

        // Fetch username to use as profile name
        const data = (await new ApiClient({
          endpoint: apiEndpoint,
          token: key,
        }).get("/api/v1/creator/api-keys/whoami")) as Record<string, unknown>;
        const name = data.username ?? data.name;
        if (typeof name !== "string" || !name.trim()) {
          throw new Error("Authenticated account did not return a valid profile name");
        }
        const profileName = name.toLowerCase().replace(/\s+/g, "-");

        setProfile(profileName, { type: "user", apiKey: key });

        printSuccess(`Logged in! Profile '${profileName}' created (user, key stored securely)`);
        printNote(`\nTo use: arinova --profile ${profileName} <command>`);
      } catch (err) {
        callbackController.abort();
        await keyPromise.catch(() => undefined);
        throw err;
      }
    });

  auth
    .command("logout")
    .description("Remove the current profile's API key")
    .action(() => {
      const profileFlag = program.optsWithGlobals().profile as string | undefined;
      const name = resolveProfileName(profileFlag);
      if (!getProfile(name)) {
        throw new Error(`Profile '${name}' not found.`);
      }
      removeProfile(name);
      printSuccess(`Profile '${name}' removed.`);
    });

  auth
    .command("set-token <key>")
    .description("Set a bot token for the current profile (requires --profile)")
    .action((key: string) => {
      const profileFlag = program.optsWithGlobals().profile as string | undefined;
      const profileName = profileFlag ?? process.env.ARINOVA_PROFILE;
      if (!profileName) {
        throw new Error("Must specify --profile <name> when setting a bot token.\nExample: arinova --profile linda auth set-token ari_xxx");
        return;
      }
      if (!key.startsWith("ari_")) {
        throw new Error("Invalid key format. Expected key starting with ari_");
        return;
      }
      const name = profileName;
      setProfile(name, { type: "bot", apiKey: key });
      printSuccess(`Bot profile '${name}' saved (key stored securely)`);
      printNote(`\nTo use: arinova --profile ${name} <command>`);
    });

  // Keep set-key as hidden alias for backwards compat
  auth
    .command("set-key <key>", { hidden: true })
    .description("(deprecated) Use 'auth set-token' instead")
    .action((key: string) => {
      console.error("Warning: 'set-key' is deprecated. Use 'arinova --profile <name> auth set-token <key>' instead.\n");
      const profileFlag = program.optsWithGlobals().profile as string | undefined;
      if (!key.startsWith("ari_")) {
        throw new Error("Invalid key format. Expected key starting with ari_");
        return;
      }
      const name = profileFlag ?? process.env.ARINOVA_PROFILE ?? "default";
      setProfile(name, { type: "bot", apiKey: key });
      printSuccess(`Profile '${name}' saved (key stored securely)`);
    });

  auth
    .command("whoami")
    .description("Show current identity and environment")
    .action(async () => {
      const profileFlag = program.optsWithGlobals().profile as string | undefined;
      const tokenFlag = program.optsWithGlobals().token as string | undefined;
      const endpointFlag = program.optsWithGlobals().apiUrl as string | undefined;
      const { apiKey, profileName, source } = resolveApiKey({ token: tokenFlag, profile: profileFlag });
      const env = getEnvironmentLabel();
      const endpoint = (endpointFlag ?? getEndpoint()).replace(/\/+$/, "");

      const identity: Record<string, unknown> = {
        profile: profileName,
        source,
        environment: env,
        endpoint,
        key: "<redacted>",
      };

      // Try to resolve actual identity from server
      // Try bot endpoint first
      try {
        const bot = (await new ApiClient({
          endpoint,
          token: apiKey,
        }).get("/api/agent/me")) as Record<string, unknown>;
        identity.identityType = "bot";
        identity.agentName = bot.name;
        identity.agentId = bot.id;
        printResult(identity);
        return;
      } catch { /* fall through */ }

      // Try user endpoint
      try {
        const user = (await new ApiClient({
          endpoint,
          token: apiKey,
        }).get("/api/v1/creator/api-keys/whoami")) as Record<string, unknown>;
        identity.identityType = "user";
        identity.userName = user.name ?? user.username;
        identity.userId = user.id ?? user.userId;
        printResult(identity);
        return;
      } catch { /* fall through */ }

      identity.status = "unauthorized — token may be expired or revoked";
      printResult(identity);
    });

  const config = program.command("config").description("Configuration commands");

  config
    .command("set <key> <value>")
    .description("Set a config value (endpoint)")
    .action((key: string, value: string) => {
      if (key !== "endpoint") {
        throw new Error(`Unknown config key: ${key}. Supported: endpoint`);
        return;
      }
      const cfg = loadConfig();
      cfg.endpoint = normalizeApiEndpoint(value);
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
          ? Object.fromEntries(profiles.map((p) => [p.name, { type: p.profile.type, key: "<redacted>" }]))
          : "(none)",
      });
    });
}
