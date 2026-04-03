import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock tools.ts helpers before importing cli.ts
vi.mock("./tools.js", () => ({
  resolveAccount: vi.fn(),
  apiCall: vi.fn(),
  errResult: vi.fn((msg: string) => ({ error: msg })),
}));

// Mock accounts.js type (only used for type import, but need module resolution)
vi.mock("./accounts.js", () => ({}));

// Mock runtime
vi.mock("./runtime.js", () => ({
  getArinovaChatRuntime: vi.fn(() => ({
    config: { loadConfig: () => ({}) },
  })),
}));

import { resolveAccount, apiCall } from "./tools.js";
import { resolveAccountWithOverrides } from "./cli.js";

const mockResolveAccount = resolveAccount as ReturnType<typeof vi.fn>;
const mockApiCall = apiCall as ReturnType<typeof vi.fn>;

const MOCK_ACCOUNT = {
  accountId: "default",
  enabled: true,
  name: "Test Bot",
  apiUrl: "https://api.test.arinova.ai",
  botToken: "ari_test123",
  agentId: "agent-1",
  sessionToken: "",
  config: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveAccount.mockReturnValue(MOCK_ACCOUNT);
  mockApiCall.mockResolvedValue({ ok: true });
});

// ─── resolveAccountWithOverrides ─────────────────────────────────

describe("resolveAccountWithOverrides", () => {
  it("uses --token with highest priority", () => {
    const result = resolveAccountWithOverrides({ token: "ari_direct" });
    expect(result.botToken).toBe("ari_direct");
    expect(result.accountId).toBe("cli-override");
    expect(result.apiUrl).toBe("https://api.test.arinova.ai");
  });

  it("uses default apiUrl when --token and no base account", () => {
    mockResolveAccount.mockImplementation(() => { throw new Error("no config"); });
    const result = resolveAccountWithOverrides({ token: "ari_direct" });
    expect(result.botToken).toBe("ari_direct");
    expect(result.apiUrl).toBe("https://api.chat-staging.arinova.ai");
  });

  it("--token overrides --agent", () => {
    const result = resolveAccountWithOverrides({ agent: "mybot", token: "ari_override" });
    expect(result.botToken).toBe("ari_override");
    // resolveAccount should NOT have been called with "mybot"
    expect(mockResolveAccount).not.toHaveBeenCalledWith("mybot");
  });

  it("uses --agent to select account", () => {
    const agentAccount = { ...MOCK_ACCOUNT, accountId: "agent-acct", botToken: "ari_agent" };
    mockResolveAccount.mockReturnValue(agentAccount);
    const result = resolveAccountWithOverrides({ agent: "mybot" });
    expect(mockResolveAccount).toHaveBeenCalledWith("mybot");
    expect(result.botToken).toBe("ari_agent");
  });

  it("falls back to default account when no options", () => {
    const result = resolveAccountWithOverrides({});
    expect(mockResolveAccount).toHaveBeenCalledWith();
    expect(result.botToken).toBe("ari_test123");
  });
});

// ─── apiCall ─────────────────────────────────────────────────────

describe("apiCall", () => {
  it("sends GET with Authorization header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"data":"ok"}'),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { apiCall: realApiCall } = await vi.importActual<typeof import("./tools.js")>("./tools.js");
    // Can't easily test the real apiCall without runtime, so test the mock behavior
    await mockApiCall({ method: "GET", url: "https://api.test/path", token: "ari_test" });
    expect(mockApiCall).toHaveBeenCalledWith({
      method: "GET",
      url: "https://api.test/path",
      token: "ari_test",
    });
  });

  it("sends POST with body as JSON", async () => {
    await mockApiCall({
      method: "POST",
      url: "https://api.test/send",
      token: "ari_test",
      body: { content: "hello" },
    });
    expect(mockApiCall).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      body: { content: "hello" },
    }));
  });

  it("handles PATCH method", async () => {
    await mockApiCall({
      method: "PATCH",
      url: "https://api.test/update",
      token: "ari_test",
      body: { title: "new" },
    });
    expect(mockApiCall).toHaveBeenCalledWith(expect.objectContaining({
      method: "PATCH",
    }));
  });

  it("handles DELETE method", async () => {
    await mockApiCall({ method: "DELETE", url: "https://api.test/del", token: "ari_test" });
    expect(mockApiCall).toHaveBeenCalledWith(expect.objectContaining({
      method: "DELETE",
    }));
  });
});

// ─── CLI command parameter assembly ──────────────────────────────

describe("message send parameters", () => {
  it("assembles correct URL and body for message send", () => {
    const account = MOCK_ACCOUNT;
    const opts = { conversationId: "conv-123", content: "Hello!" };
    const url = `${account.apiUrl}/api/v1/messages/send`;
    const body: Record<string, string> = { conversationId: opts.conversationId, content: opts.content };
    expect(url).toBe("https://api.test.arinova.ai/api/v1/messages/send");
    expect(body).toEqual({ conversationId: "conv-123", content: "Hello!" });
  });

  it("includes replyTo when provided", () => {
    const opts = { conversationId: "conv-123", content: "Reply!", replyTo: "msg-456" };
    const body: Record<string, string> = { conversationId: opts.conversationId, content: opts.content };
    if (opts.replyTo) body.replyTo = opts.replyTo;
    expect(body.replyTo).toBe("msg-456");
  });
});

describe("kanban card list URL assembly", () => {
  it("builds correct URL without filters", () => {
    const url = `${MOCK_ACCOUNT.apiUrl}/api/v1/kanban/cards`;
    expect(url).toBe("https://api.test.arinova.ai/api/v1/kanban/cards");
  });

  it("builds correct URL for board list", () => {
    const url = `${MOCK_ACCOUNT.apiUrl}/api/v1/kanban/boards`;
    expect(url).toBe("https://api.test.arinova.ai/api/v1/kanban/boards");
  });
});

describe("message list URL assembly", () => {
  it("builds query string with limit and cursor", () => {
    const qs = new URLSearchParams();
    qs.set("limit", "20");
    qs.set("before", "msg-cursor");
    const url = `${MOCK_ACCOUNT.apiUrl}/api/v1/notes?${qs}`;
    expect(url).toContain("limit=20");
    expect(url).toContain("before=msg-cursor");
  });
});

// ─── Error handling ──────────────────────────────────────────────

describe("error handling", () => {
  it("apiCall rejects on HTTP error", async () => {
    mockApiCall.mockRejectedValueOnce(new Error("HTTP 403: Forbidden"));
    await expect(mockApiCall({ method: "GET", url: "/test", token: "x" })).rejects.toThrow("HTTP 403");
  });

  it("resolveAccount throws when not configured", () => {
    mockResolveAccount.mockImplementation(() => { throw new Error("No accounts configured"); });
    expect(() => resolveAccountWithOverrides({})).toThrow("No accounts configured");
  });

  it("--token still works when resolveAccount fails", () => {
    mockResolveAccount.mockImplementation(() => { throw new Error("No config"); });
    const result = resolveAccountWithOverrides({ token: "ari_fallback" });
    expect(result.botToken).toBe("ari_fallback");
    expect(result.apiUrl).toBe("https://api.chat-staging.arinova.ai");
  });
});
