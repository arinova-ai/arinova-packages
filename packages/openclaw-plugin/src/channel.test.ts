import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendMessageArinovaChat: vi.fn(),
}));
const runtimeMocks = vi.hoisted(() => ({
  setAgentInstance: vi.fn(),
  removeAgentInstance: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn() },
}));
const sdkMocks = vi.hoisted(() => ({
  instances: [] as Array<{
    options: unknown;
    handlers: Map<string, (...args: any[]) => void>;
    onTask: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("./send.js", () => ({
  sendMessageArinovaChat: mocks.sendMessageArinovaChat,
}));

vi.mock("./runtime.js", () => ({
  getArinovaChatRuntime: () => ({
    logging: { getChildLogger: () => runtimeMocks.logger },
    channel: {
      activity: { record: vi.fn() },
      text: {
        chunkMarkdownText: (text: string, limit: number) => [text.slice(0, limit)],
      },
    },
  }),
  setAgentInstance: runtimeMocks.setAgentInstance,
  removeAgentInstance: runtimeMocks.removeAgentInstance,
}));

vi.mock("@arinova-ai/agent-sdk", () => ({
  ArinovaAgent: function (this: unknown, options: unknown) {
    const handlers = new Map<string, (...args: any[]) => void>();
    const instance = {
      options,
      handlers,
      onTask: vi.fn(),
      on: vi.fn((event: string, handler: (...args: any[]) => void) => handlers.set(event, handler)),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    };
    sdkMocks.instances.push(instance);
    return instance;
  },
}));

import { arinovaChatPlugin } from "./channel.js";
import { ArinovaChatConfigSchema } from "./config-schema.js";

const plugin = arinovaChatPlugin as any;

const cfg = {
  channels: {
    "openclaw-arinova-ai": {
      enabled: true,
      apiUrl: "https://api.chat.arinova.ai",
      botToken: "ari_default",
      agentId: "agent-default",
      dmPolicy: "allowlist",
      allowFrom: ["UserA"],
      accounts: {
        named: {
          enabled: true,
          apiUrl: "https://api.chat-staging.arinova.ai",
          botToken: "ari_named",
          agentId: "agent-named",
          dmPolicy: "open",
          allowFrom: ["UserB"],
        },
      },
    },
  },
};

describe("arinovaChatPlugin channel contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdkMocks.instances.length = 0;
    runtimeMocks.removeAgentInstance.mockReturnValue(undefined);
    mocks.sendMessageArinovaChat.mockResolvedValue({ messageId: "msg-1", ok: true });
  });

  it("normalizes pairing and allow-from entries", () => {
    expect(plugin.pairing.normalizeAllowEntry("Arinova:UserA")).toBe("usera");
    expect(plugin.config.formatAllowFrom({
      cfg,
      allowFrom: [" openclaw-arinova-ai:UserA ", "arinova:UserB", ""],
    })).toEqual(["usera", "userb"]);
  });

  it("declares direct and group chat with block streaming display support", () => {
    expect(plugin.capabilities.chatTypes).toEqual(["direct", "group"]);
    expect(plugin.capabilities.blockStreaming).toBe(true);
  });

  it("returns actionable pairing approval commands", () => {
    const policy = plugin.security.resolveDmPolicy({
      cfg,
      accountId: "default",
      account: {
        accountId: "default",
        config: { dmPolicy: "pairing" },
      },
    });

    expect(policy.approveHint).toContain("openclaw pairing list openclaw-arinova-ai");
    expect(policy.approveHint).toContain("openclaw pairing approve openclaw-arinova-ai <code>");
  });

  it("rejects allowlist policy without any allowed senders", () => {
    const result = ArinovaChatConfigSchema.safeParse({
      dmPolicy: "allowlist",
      allowFrom: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("requires");
    }
  });

  it("accepts and strips legacy credential keys from existing configs", () => {
    const result = ArinovaChatConfigSchema.safeParse({
      botToken: "bot-1",
      allowFrom: ["*"],
      email: "old@example.com",
      password: "hunter2",
      sessionToken: "legacy-session",
      accounts: {
        second: {
          botToken: "bot-2",
          allowFrom: ["*"],
          email: "old2@example.com",
          sessionToken: "legacy-session-2",
        },
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("email");
      expect(result.data).not.toHaveProperty("password");
      expect(result.data).not.toHaveProperty("sessionToken");
      expect(result.data.accounts?.second).not.toHaveProperty("email");
      expect(result.data.accounts?.second).not.toHaveProperty("sessionToken");
    }
  });

  it("describes configured and missing account secrets without leaking values", () => {
    expect(plugin.config.describeAccount({
      accountId: "named",
      enabled: true,
      name: "Named",
      apiUrl: "https://api.chat-staging.arinova.ai",
      botToken: "ari_secret",
      agentId: "agent-1",
      config: {},
    })).toMatchObject({
      accountId: "named",
      configured: true,
      apiUrl: "[set]",
      botToken: "[set]",
    });

    expect(plugin.config.describeAccount({
      accountId: "missing",
      enabled: true,
      name: "Missing",
      apiUrl: "",
      botToken: "",
      agentId: "",
      config: {},
    })).toMatchObject({
      configured: false,
      apiUrl: "[missing]",
      botToken: "[missing]",
    });
  });

  it("resolves DM policy paths for default and named accounts", () => {
    const defaultPolicy = plugin.security.resolveDmPolicy({
      cfg,
      accountId: "default",
      account: {
        accountId: "default",
        enabled: true,
        name: "Default",
        apiUrl: "https://api.chat.arinova.ai",
        botToken: "ari_default",
        agentId: "agent-default",
        config: { dmPolicy: "allowlist", allowFrom: ["UserA"] },
      },
    });
    const namedPolicy = plugin.security.resolveDmPolicy({
      cfg,
      accountId: "named",
      account: {
        accountId: "named",
        enabled: true,
        name: "Named",
        apiUrl: "https://api.chat-staging.arinova.ai",
        botToken: "ari_named",
        agentId: "agent-named",
        config: { dmPolicy: "open", allowFrom: ["UserB"] },
      },
    });

    expect(defaultPolicy).toMatchObject({
      policy: "allowlist",
      allowFrom: ["UserA"],
      policyPath: "channels.openclaw-arinova-ai.dmPolicy",
    });
    expect(defaultPolicy.normalizeEntry("arinova:UserA")).toBe("usera");
    expect(namedPolicy).toMatchObject({
      policy: "open",
      policyPath: "channels.openclaw-arinova-ai.accounts.named.dmPolicy",
    });
  });

  it("builds setup config for default and named accounts", () => {
    const defaultConfig = plugin.setup.applyAccountConfig({
      cfg: {},
      accountId: "default",
      input: {
        name: "Default Bot",
        apiUrl: "https://api.default.test",
        agentId: "agent-default",
      },
    });
    const namedConfig = plugin.setup.applyAccountConfig({
      cfg: {},
      accountId: "named",
      input: {
        name: "Named Bot",
        apiUrl: "https://api.chat-staging.arinova.ai",
        agentId: "agent-named",
      },
    });

    expect(defaultConfig.channels?.["openclaw-arinova-ai"]).toMatchObject({
      enabled: true,
      name: "Default Bot",
      apiUrl: "https://api.default.test",
      agentId: "agent-default",
    });
    expect(namedConfig.channels?.["openclaw-arinova-ai"]?.accounts?.named).toMatchObject({
      enabled: true,
      name: "Named Bot",
      apiUrl: "https://api.chat-staging.arinova.ai",
      agentId: "agent-named",
    });
  });

  it("sends text and media through the Arinova message API", async () => {
    await expect(plugin.outbound.sendText({
      cfg,
      to: "conv-1",
      text: "hello",
      accountId: "named",
    })).resolves.toMatchObject({ channel: "openclaw-arinova-ai", messageId: "msg-1" });

    await plugin.outbound.sendMedia({
      cfg,
      to: "conv-1",
      text: "image",
      mediaUrl: "https://cdn.example.test/a.png",
      accountId: "named",
    });

    expect(mocks.sendMessageArinovaChat).toHaveBeenNthCalledWith(1, "conv-1", "hello", {
      accountId: "named",
    });
    expect(mocks.sendMessageArinovaChat).toHaveBeenNthCalledWith(
      2,
      "conv-1",
      "image\n\n![](https://cdn.example.test/a.png)",
      { accountId: "named" },
    );
  });

  it("builds redacted account status snapshots", () => {
    expect(plugin.status.buildAccountSnapshot({
      account: {
        accountId: "named",
        enabled: true,
        name: "Named",
        apiUrl: "https://api.chat-staging.arinova.ai",
        botToken: "ari_secret",
        agentId: "agent-named",
        config: {},
      },
      runtime: {
        accountId: "named",
        running: true,
        lastStartAt: 10,
        lastStopAt: null,
        lastError: null,
        lastInboundAt: 20,
        lastOutboundAt: 30,
      },
    })).toMatchObject({
      accountId: "named",
      configured: true,
      apiUrl: "[set]",
      botToken: "[set]",
      running: true,
      mode: "websocket",
      lastInboundAt: 20,
      lastOutboundAt: 30,
    });
  });

  it("settles gateway lifetime on auth failure and removes the live instance", async () => {
    const controller = new AbortController();
    const account = plugin.config.resolveAccount(cfg, "named");
    const lifetime = plugin.gateway.startAccount({
      account,
      accountId: "named",
      cfg,
      abortSignal: controller.signal,
      setStatus: vi.fn(),
      runtime: { log: vi.fn(), error: vi.fn(), exit: vi.fn() },
    });
    await Promise.resolve();
    const agent = sdkMocks.instances[0]!;

    agent.handlers.get("auth_failed")?.();

    await expect(lifetime).rejects.toThrow("authentication failed");
    expect(runtimeMocks.removeAgentInstance).toHaveBeenCalledWith("named", agent);
    expect(agent.disconnect).toHaveBeenCalledOnce();
  });

  it("disconnects and removes the instance when gateway aborts or stops", async () => {
    const controller = new AbortController();
    const account = plugin.config.resolveAccount(cfg, "named");
    const lifetime = plugin.gateway.startAccount({
      account,
      accountId: "named",
      cfg,
      abortSignal: controller.signal,
      setStatus: vi.fn(),
      runtime: { log: vi.fn(), error: vi.fn(), exit: vi.fn() },
    });
    await Promise.resolve();
    const agent = sdkMocks.instances[0]!;
    controller.abort();
    await expect(lifetime).resolves.toBeUndefined();
    expect(agent.disconnect).toHaveBeenCalledOnce();

    runtimeMocks.removeAgentInstance.mockReturnValue(agent);
    await plugin.gateway.stopAccount({ account });
    expect(runtimeMocks.removeAgentInstance).toHaveBeenLastCalledWith("named");
    expect(agent.disconnect).toHaveBeenCalledTimes(2);
  });
});
