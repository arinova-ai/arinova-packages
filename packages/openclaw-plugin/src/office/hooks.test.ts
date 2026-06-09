import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const sendTelemetry = vi.fn();
const sendHud = vi.fn();
const getAgentInstance = vi.fn();

vi.mock("../runtime.js", () => ({
  getAgentInstance,
}));

const { ingestHookEvent, registerHooks, setForwardTarget } = await import("./hooks.js");
const { officeState } = await import("./state.js");

type Handler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => void;

function createApi() {
  const handlers = new Map<string, Handler>();
  const api = {
    on: vi.fn((eventName: string, handler: Handler) => {
      handlers.set(eventName, handler);
    }),
  } as unknown as OpenClawPluginApi;
  return { api, handlers };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-10T00:00:00.000Z"));
  getAgentInstance.mockReturnValue({ sendTelemetry, sendHud });
});

describe("office hook registration", () => {
  it("registers the supported hook listeners in a stable order", () => {
    const { api } = createApi();

    registerHooks(api);

    expect((api.on as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0])).toEqual([
      "session_start",
      "session_end",
      "llm_input",
      "llm_output",
      "after_tool_call",
      "message_received",
      "message_sent",
      "agent_end",
      "subagent_spawned",
      "subagent_ended",
    ]);
  });

  it("normalizes session hooks into office state and sends telemetry", () => {
    const events: unknown[] = [];
    const unsubscribe = officeState.subscribe((event) => events.push(event));
    const { handlers } = createApi();
    registerHooks({ on: vi.fn((name: string, handler: Handler) => handlers.set(name, handler)) } as unknown as OpenClawPluginApi);

    handlers.get("session_start")?.(
      { sessionId: "session-hooks-1", model: "gpt-4o", provider: "openai" },
      { agentId: "agent-hooks-1", accountId: "account-1" },
    );
    expect(events.at(-1)).toEqual(expect.objectContaining({
      agents: expect.arrayContaining([
        expect.objectContaining({ agentId: "agent-hooks-1", status: "working" }),
      ]),
    }));

    handlers.get("session_end")?.(
      { sessionId: "session-hooks-1", messageCount: 3, durationMs: 1200 },
      { agentId: "agent-hooks-1", accountId: "account-1" },
    );

    expect(events.at(-1)).toEqual(expect.objectContaining({ agents: [] }));
    expect(sendTelemetry).toHaveBeenCalledWith("session_start", {
      sessionId: "session-hooks-1",
      model: "gpt-4o",
      provider: "openai",
    });
    expect(sendTelemetry).toHaveBeenCalledWith("session_end", {
      sessionId: "session-hooks-1",
      messageCount: 3,
      durationMs: 1200,
    });
    unsubscribe();
  });

  it("maps tool errors to tool_result plus agent_error events", () => {
    const { handlers } = createApi();
    registerHooks({ on: vi.fn((name: string, handler: Handler) => handlers.set(name, handler)) } as unknown as OpenClawPluginApi);

    handlers.get("after_tool_call")?.(
      { toolName: "Read", durationMs: 25, error: "failed" },
      { agentId: "agent-hooks-tool-error", sessionKey: "session-hooks-tool-error", accountId: "account-1" },
    );

    expect(officeState.snapshot().agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agentId: "agent-hooks-tool-error",
        status: "blocked",
      }),
    ]));
    expect(sendTelemetry).toHaveBeenCalledWith("tool_call", {
      sessionId: "session-hooks-tool-error",
      toolName: "Read",
      durationMs: 25,
      success: false,
      error: "failed",
    });
  });
});

describe("office hook telemetry and forwarding safety", () => {
  it("sends HUD context only when model limit and account agent are available", () => {
    const { handlers } = createApi();
    registerHooks({ on: vi.fn((name: string, handler: Handler) => handlers.set(name, handler)) } as unknown as OpenClawPluginApi);

    handlers.get("llm_output")?.(
      {
        sessionId: "session-hooks-llm",
        model: "gpt-4o",
        provider: "openai",
        usage: {
          inputTokens: 64_000,
          outputTokens: 10,
          cacheReadTokens: 2,
          cacheWriteTokens: 3,
          totalTokens: 64_015,
        },
      },
      { agentId: "agent-hooks-llm", accountId: "account-1" },
    );

    expect(sendTelemetry).toHaveBeenCalledWith("llm_output", {
      sessionId: "session-hooks-llm",
      model: "gpt-4o",
      provider: "openai",
      usage: {
        input: 64_000,
        output: 10,
        cacheRead: 2,
        cacheWrite: 3,
        total: 64_015,
      },
    });
    expect(sendHud).toHaveBeenCalledWith({
      context: { percent: 50, inputTokens: 64_000, maxTokens: 128_000 },
      model: "gpt-4o",
    });

    sendHud.mockClear();
    sendTelemetry.mockClear();
    getAgentInstance.mockReturnValue(null);
    handlers.get("llm_output")?.(
      { sessionId: "session-no-agent", model: "gpt-4o", usage: { inputTokens: 1 } },
      { agentId: "agent-no-agent", accountId: "missing-account" },
    );
    expect(sendTelemetry).not.toHaveBeenCalled();
    expect(sendHud).not.toHaveBeenCalled();
  });

  it("no-ops telemetry when account id is missing", () => {
    const { handlers } = createApi();
    registerHooks({ on: vi.fn((name: string, handler: Handler) => handlers.set(name, handler)) } as unknown as OpenClawPluginApi);

    handlers.get("session_start")?.(
      { sessionId: "session-no-account", model: "gpt-4o" },
      { agentId: "agent-no-account" },
    );

    expect(getAgentInstance).not.toHaveBeenCalled();
    expect(sendTelemetry).not.toHaveBeenCalled();
  });

  it("swallows forwarding fetch failures while still ingesting events", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    setForwardTarget("https://api.example.com/api/office/event", new Map([["default", "ari_token"]]));

    expect(() =>
      ingestHookEvent(
        "message_in",
        "session-forward",
        "agent-forward",
        { from: "human" },
        "unknown-account",
      ),
    ).not.toThrow();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/office/event",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer ari_token",
        },
      }),
    );
    expect(officeState.snapshot().agents).toEqual(expect.arrayContaining([
      expect.objectContaining({ agentId: "agent-forward" }),
    ]));
  });
});
