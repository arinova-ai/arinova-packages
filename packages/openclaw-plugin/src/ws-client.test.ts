import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWSClient, type AgentWSClientOptions } from "./ws-client.js";

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = 3;
  }

  receive(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  parseSent() {
    return this.sent.map((payload) => JSON.parse(payload) as Record<string, unknown>);
  }
}

describe("createWSClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  it("authenticates on open, emits connected, and sends keepalive pings", () => {
    const onConnected = vi.fn();
    const client = createWSClient({
      wsUrl: "wss://ws.test",
      agentId: "agent-1",
      secretToken: "secret",
      onTask: vi.fn(),
      onConnected,
    });

    client.connect();
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    ws.receive({ type: "auth_ok" });
    vi.advanceTimersByTime(30_000);

    expect(ws.url).toBe("wss://ws.test");
    expect(onConnected).toHaveBeenCalledTimes(1);
    expect(ws.parseSent()).toEqual([
      { type: "agent_auth", agentId: "agent-1", secretToken: "secret" },
      { type: "ping" },
    ]);
  });

  it("passes task payloads through and maps callbacks to websocket events", async () => {
    const onTask = vi.fn(async ({ sendChunk, sendComplete }: Parameters<Parameters<typeof createWSClient>[0]["onTask"]>[0]) => {
      sendChunk("partial");
      sendComplete("done", { mentions: ["agent-2"] });
    });
    const client = createWSClient({
      wsUrl: "wss://ws.test",
      agentId: "agent-1",
      secretToken: "secret",
      onTask,
    });

    client.connect();
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    ws.receive({
      type: "task",
      taskId: "task-1",
      conversationId: "conv-1",
      conversationType: "group",
      content: "hello",
      members: [{ agentId: "agent-2", agentName: "Agent Two" }],
    });
    await Promise.resolve();

    expect(onTask).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "task-1",
      conversationId: "conv-1",
      conversationType: "group",
      content: "hello",
      signal: expect.any(AbortSignal),
    }));
    expect(ws.parseSent()).toEqual([
      { type: "agent_auth", agentId: "agent-1", secretToken: "secret" },
      { type: "agent_chunk", taskId: "task-1", chunk: "partial" },
      { type: "agent_complete", taskId: "task-1", content: "done", mentions: ["agent-2"] },
    ]);
  });

  it("reports task errors and aborts the task signal", async () => {
    let signal: AbortSignal | undefined;
    const client = createWSClient({
      wsUrl: "wss://ws.test",
      agentId: "agent-1",
      secretToken: "secret",
      onTask: vi.fn((params: Parameters<AgentWSClientOptions["onTask"]>[0]) => {
        signal = params.signal;
        throw new Error("boom");
      }),
    });

    client.connect();
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    ws.receive({ type: "task", taskId: "task-1", conversationId: "conv-1", content: "hello" });
    await Promise.resolve();
    await Promise.resolve();

    expect(signal?.aborted).toBe(true);
    expect(ws.parseSent()).toContainEqual({ type: "agent_error", taskId: "task-1", error: "boom" });
  });

  it("reports malformed websocket messages through onError", () => {
    const onError = vi.fn();
    const client = createWSClient({
      wsUrl: "wss://ws.test",
      agentId: "agent-1",
      secretToken: "secret",
      onTask: vi.fn(),
      onError,
    });

    client.connect();
    const ws = FakeWebSocket.instances[0];
    ws.onmessage?.({ data: "{bad json" });

    expect(onError).toHaveBeenCalledWith(expect.any(SyntaxError));
  });

  it("does not reconnect after auth errors", () => {
    const onError = vi.fn();
    const onDisconnected = vi.fn();
    const client = createWSClient({
      wsUrl: "wss://ws.test",
      agentId: "agent-1",
      secretToken: "bad",
      onTask: vi.fn(),
      onError,
      onDisconnected,
    });

    client.connect();
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    ws.receive({ type: "auth_error", error: "invalid token" });
    ws.onclose?.();
    vi.advanceTimersByTime(5_000);

    expect(onError).toHaveBeenCalledWith(new Error("Agent auth failed: invalid token"));
    expect(onDisconnected).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("reconnects after normal close until disconnected", () => {
    const client = createWSClient({
      wsUrl: "wss://ws.test",
      agentId: "agent-1",
      secretToken: "secret",
      onTask: vi.fn(),
    });

    client.connect();
    FakeWebSocket.instances[0].onclose?.();
    vi.advanceTimersByTime(5_000);
    expect(FakeWebSocket.instances).toHaveLength(2);

    client.disconnect();
    FakeWebSocket.instances[1].onclose?.();
    vi.advanceTimersByTime(5_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});
