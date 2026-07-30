import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendMessageArinovaChat: vi.fn(),
}));

vi.mock("./send.js", () => ({
  sendMessageArinovaChat: mocks.sendMessageArinovaChat,
}));

vi.mock("./runtime.js", () => ({
  getArinovaChatRuntime: () => ({
    channel: {
      text: {
        chunkMarkdownText: (text: string, limit: number) => [text.slice(0, limit)],
      },
    },
  }),
  setAgentInstance: vi.fn(),
}));

vi.mock("@arinova-ai/agent-sdk", () => ({
  ArinovaAgent: class {},
}));

import { arinovaChatPlugin } from "./channel.js";
import { ArinovaChatConfigSchema } from "./config-schema.js";

const plugin = arinovaChatPlugin as any;

const cfg = {
  channels: {
    "openclaw-arinova-ai": {
      enabled: true,
      apiUrl: "https://api.example.test",
      botToken: "ari_default",
      agentId: "agent-default",
      dmPolicy: "allowlist",
      allowFrom: ["UserA"],
      accounts: {
        named: {
          enabled: true,
          apiUrl: "https://api.named.test",
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

  it("describes configured and missing account secrets without leaking values", () => {
    expect(plugin.config.describeAccount({
      accountId: "named",
      enabled: true,
      name: "Named",
      apiUrl: "https://api.named.test",
      botToken: "ari_secret",
      agentId: "agent-1",
      sessionToken: "",
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
      sessionToken: "",
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
        apiUrl: "https://api.example.test",
        botToken: "ari_default",
        agentId: "agent-default",
        sessionToken: "",
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
        apiUrl: "https://api.named.test",
        botToken: "ari_named",
        agentId: "agent-named",
        sessionToken: "",
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
        apiUrl: "https://api.named.test",
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
      apiUrl: "https://api.named.test",
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
        apiUrl: "https://api.named.test",
        botToken: "ari_secret",
        agentId: "agent-named",
        sessionToken: "",
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
});
