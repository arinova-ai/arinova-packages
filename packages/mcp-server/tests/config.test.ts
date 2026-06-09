import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseConfig, deriveApiUrl, redactConfig } from "../src/config.js";

describe("deriveApiUrl", () => {
  it("converts wss: to https:", () => {
    expect(deriveApiUrl("wss://chat.example.com")).toBe(
      "https://chat.example.com",
    );
  });

  it("converts ws: to http:", () => {
    expect(deriveApiUrl("ws://localhost:3000")).toBe("http://localhost:3000");
  });

  it("preserves path", () => {
    expect(deriveApiUrl("wss://chat.example.com/path")).toBe(
      "https://chat.example.com/path",
    );
  });
});

describe("parseConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ARINOVA_BOT_TOKEN;
    delete process.env.ARINOVA_SERVER_URL;
    delete process.env.ARINOVA_API_URL;
    delete process.env.ARINOVA_MCP_TRANSPORT;
    delete process.env.ARINOVA_ACTION_TIMEOUT_MS;
    delete process.env.ARINOVA_STARTUP_MODE;
    delete process.env.ARINOVA_MAX_CONCURRENT_ACTIONS;
    delete process.env.ARINOVA_ACTION_QUEUE_LIMIT;
    delete process.env.ARINOVA_LOG_LEVEL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws when bot token is missing", () => {
    process.env.ARINOVA_API_URL = "https://chat.example.com";
    expect(() => parseConfig([])).toThrow("Bot token is required");
  });

  it("throws when API URL cannot be resolved", () => {
    process.env.ARINOVA_BOT_TOKEN = "ari_test";
    expect(() => parseConfig([])).toThrow("API URL is required");
  });

  it("parses from env vars", () => {
    process.env.ARINOVA_BOT_TOKEN = "ari_test";
    process.env.ARINOVA_SERVER_URL = "wss://chat.example.com";

    const config = parseConfig([]);

    expect(config.botToken).toBe("ari_test");
    expect(config.serverUrl).toBe("wss://chat.example.com");
    expect(config.apiUrl).toBe("https://chat.example.com");
    expect(config.apiUrlDerived).toBe(true);
    expect(config.transport).toBe("stdio");
    expect(config.actionTimeoutMs).toBe(60000);
    expect(config.startupMode).toBe("lazy");
    expect(config.maxConcurrentActions).toBe(4);
    expect(config.actionQueueLimit).toBe(32);
    expect(config.logLevel).toBe("warn");
  });

  it("CLI flags override env vars", () => {
    process.env.ARINOVA_BOT_TOKEN = "ari_env";
    process.env.ARINOVA_SERVER_URL = "wss://env.example.com";

    const config = parseConfig([
      "--token",
      "ari_cli",
      "--server-url",
      "wss://cli.example.com",
      "--api-url",
      "https://api.cli.example.com",
    ]);

    expect(config.botToken).toBe("ari_cli");
    expect(config.serverUrl).toBe("wss://cli.example.com");
    expect(config.apiUrl).toBe("https://api.cli.example.com");
    expect(config.apiUrlDerived).toBe(false);
  });

  it("CLI log level overrides env log level and invalid CLI value is ignored", () => {
    process.env.ARINOVA_BOT_TOKEN = "ari_env";
    process.env.ARINOVA_SERVER_URL = "wss://env.example.com";
    process.env.ARINOVA_LOG_LEVEL = "error";

    expect(parseConfig(["--log-level", "debug"]).logLevel).toBe("debug");
    expect(parseConfig(["--log-level", "verbose"]).logLevel).toBe("error");
  });

  it("strips trailing slashes from URLs", () => {
    process.env.ARINOVA_BOT_TOKEN = "ari_test";
    process.env.ARINOVA_SERVER_URL = "wss://chat.example.com///";

    const config = parseConfig([]);

    expect(config.serverUrl).toBe("wss://chat.example.com");
  });

  it("uses explicit API URL without derivation", () => {
    process.env.ARINOVA_BOT_TOKEN = "ari_test";
    process.env.ARINOVA_SERVER_URL = "wss://chat.example.com";
    process.env.ARINOVA_API_URL = "https://api.example.com";

    const config = parseConfig([]);

    expect(config.apiUrl).toBe("https://api.example.com");
    expect(config.apiUrlDerived).toBe(false);
  });

  it("allows explicit API URL without server URL", () => {
    process.env.ARINOVA_BOT_TOKEN = "ari_test";
    process.env.ARINOVA_API_URL = "https://api.example.com";

    const config = parseConfig([]);

    expect(config.serverUrl).toBe("");
    expect(config.apiUrl).toBe("https://api.example.com");
    expect(config.apiUrlDerived).toBe(false);
  });

  it("parses --strict-startup flag", () => {
    const config = parseConfig([
      "--token",
      "ari_test",
      "--server-url",
      "wss://chat.example.com",
      "--strict-startup",
    ]);

    expect(config.startupMode).toBe("strict");
  });

  it("parses numeric env vars with fallback on invalid", () => {
    process.env.ARINOVA_BOT_TOKEN = "ari_test";
    process.env.ARINOVA_SERVER_URL = "wss://chat.example.com";
    process.env.ARINOVA_ACTION_TIMEOUT_MS = "not_a_number";
    process.env.ARINOVA_MAX_CONCURRENT_ACTIONS = "-5";

    const config = parseConfig([]);

    expect(config.actionTimeoutMs).toBe(60000);
    expect(config.maxConcurrentActions).toBe(4);
  });

  it("parses positive queue and timeout env vars", () => {
    process.env.ARINOVA_BOT_TOKEN = "ari_test";
    process.env.ARINOVA_SERVER_URL = "wss://chat.example.com";
    process.env.ARINOVA_ACTION_TIMEOUT_MS = "1500";
    process.env.ARINOVA_MAX_CONCURRENT_ACTIONS = "8";
    process.env.ARINOVA_ACTION_QUEUE_LIMIT = "64";

    const config = parseConfig([]);

    expect(config.actionTimeoutMs).toBe(1500);
    expect(config.maxConcurrentActions).toBe(8);
    expect(config.actionQueueLimit).toBe(64);
  });

  it("parses valid log level from env", () => {
    process.env.ARINOVA_BOT_TOKEN = "ari_test";
    process.env.ARINOVA_SERVER_URL = "wss://chat.example.com";
    process.env.ARINOVA_LOG_LEVEL = "debug";

    const config = parseConfig([]);

    expect(config.logLevel).toBe("debug");
  });

  it("falls back to warn on invalid log level", () => {
    process.env.ARINOVA_BOT_TOKEN = "ari_test";
    process.env.ARINOVA_SERVER_URL = "wss://chat.example.com";
    process.env.ARINOVA_LOG_LEVEL = "invalid";

    const config = parseConfig([]);

    expect(config.logLevel).toBe("warn");
  });

  it("redacts bot token while preserving operational config fields", () => {
    const config = parseConfig([
      "--token",
      "ari_secret",
      "--server-url",
      "wss://chat.example.com",
      "--strict-startup",
      "--log-level",
      "info",
    ]);

    expect(redactConfig(config)).toEqual({
      serverUrl: "wss://chat.example.com",
      apiUrl: "https://chat.example.com",
      apiUrlDerived: true,
      transport: "stdio",
      actionTimeoutMs: 60000,
      startupMode: "strict",
      maxConcurrentActions: 4,
      actionQueueLimit: 32,
      logLevel: "info",
      botToken: "***",
    });
  });
});
