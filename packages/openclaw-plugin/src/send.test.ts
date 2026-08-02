import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  active: undefined as { sendMessage: ReturnType<typeof vi.fn> } | undefined,
  activity: vi.fn(),
  constructors: [] as Array<{ options: unknown; sendMessage: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }>,
}));

vi.mock("./runtime.js", () => ({
  getArinovaChatRuntime: () => ({
    config: { current: () => mocks.config },
    channel: { activity: { record: mocks.activity } },
  }),
  getAgentInstance: () => mocks.active,
}));

vi.mock("@arinova-ai/agent-sdk", () => ({
  ArinovaAgent: function (this: unknown, options: unknown) {
    const agent = {
      options,
      sendMessage: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    };
    mocks.constructors.push(agent);
    return agent;
  },
}));

import { sendMessageArinovaChat } from "./send.js";

function configure(accountId: string, overrides: Record<string, unknown> = {}) {
  mocks.config = {
    channels: {
      "openclaw-arinova-ai": {
        accounts: {
          [accountId]: {
            apiUrl: "https://api.test",
            botToken: "token",
            agentId: "00000000-0000-4000-8000-000000000001",
            ...overrides,
          },
        },
      },
    },
  };
}

describe("sendMessageArinovaChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.active = undefined;
    mocks.constructors.length = 0;
  });

  it("strips channel prefixes and prefers the connected SDK instance", async () => {
    configure("active");
    mocks.active = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    await sendMessageArinovaChat("arinova:conv-1", "hello", { accountId: "active" });
    expect(mocks.active.sendMessage).toHaveBeenCalledWith("conv-1", "hello");
    expect(mocks.constructors).toHaveLength(0);
  });

  it("rejects empty text and quietly skips an empty conversation target", async () => {
    configure("validation");
    await expect(sendMessageArinovaChat("conv", "  ", { accountId: "validation" }))
      .rejects.toThrow("non-empty");
    await expect(sendMessageArinovaChat("arinova:", "hello", { accountId: "validation" }))
      .resolves.toEqual({});
  });

  it("caches the HTTP fallback and replaces it when credentials change", async () => {
    configure("fallback");
    await sendMessageArinovaChat("conv-1", "one", { accountId: "fallback" });
    await sendMessageArinovaChat("conv-2", "two", { accountId: "fallback" });
    expect(mocks.constructors).toHaveLength(1);

    configure("fallback", { botToken: "new-token" });
    await sendMessageArinovaChat("conv-3", "three", { accountId: "fallback" });
    expect(mocks.constructors).toHaveLength(2);
    expect(mocks.constructors[0]!.disconnect).toHaveBeenCalledOnce();
    expect(mocks.constructors[1]!.options).toEqual({ serverUrl: "https://api.test", botToken: "new-token" });
  });

  it("fails closed when the HTTP fallback has no bot token", async () => {
    configure("missing-token", { botToken: "" });
    await expect(sendMessageArinovaChat("conv", "hello", { accountId: "missing-token" }))
      .rejects.toThrow("botToken missing");
  });
});
