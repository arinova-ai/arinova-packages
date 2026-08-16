import { describe, expect, it, vi } from "vitest";
import {
  ACTION_PROTOCOL_VERSION,
  bindWebSocketHandlers,
  createAgentAuthFrame,
  parseOnboardingSeed,
} from "./connect.js";

function fakeSocket(): WebSocket {
  return {
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
  } as unknown as WebSocket;
}

describe("connection helpers", () => {
  it("builds the versioned auth capability frame", () => {
    const runtime = { name: "sdk", version: "1.0.0", language: "typescript" };
    expect(createAgentAuthFrame("ari_token", runtime, [])).toMatchObject({
      type: "agent_auth",
      botToken: "ari_token",
      runtime,
      capabilities: { actionCall: { protocolVersion: ACTION_PROTOCOL_VERSION } },
    });
    expect(createAgentAuthFrame("ari_token", runtime, [{ name: "search" }])).toMatchObject({
      skills: [{ name: "search" }],
    });
  });

  it("accepts only complete first-touch onboarding seeds", () => {
    const seed = {
      kind: "first_touch_opening",
      seedId: "seed-1",
      agentId: "agent-1",
      action: "open",
      prompt: "Say hello",
    };
    expect(parseOnboardingSeed(seed)).toEqual(seed);
    expect(parseOnboardingSeed({ ...seed, prompt: 1 })).toBeNull();
    expect(parseOnboardingSeed({ ...seed, kind: "unknown" })).toBeNull();
    expect(parseOnboardingSeed(null)).toBeNull();
  });

  it("decodes frames, reports frame errors, and deduplicates terminal events", async () => {
    const socket = fakeSocket();
    const onOpen = vi.fn();
    const onFrame = vi.fn();
    const onFrameError = vi.fn();
    const onTerminal = vi.fn();
    let current = true;
    bindWebSocketHandlers({
      socket,
      maxInboundFrameBytes: 64,
      isCurrent: () => current,
      onOpen,
      onFrame,
      onFrameError,
      onTerminal,
    });

    socket.onopen!(new Event("open"));
    socket.onmessage!(new MessageEvent("message", { data: '{"type":"pong"}' }));
    await vi.waitFor(() => expect(onFrame).toHaveBeenCalledWith({ type: "pong" }));
    socket.onmessage!(new MessageEvent("message", { data: "not-json" }));
    await vi.waitFor(() => expect(onFrameError).toHaveBeenCalledWith(expect.any(SyntaxError)));
    socket.onerror!(new Event("error"));
    socket.onclose!(new CloseEvent("close"));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onTerminal).toHaveBeenCalledOnce();

    const stale = fakeSocket();
    current = false;
    bindWebSocketHandlers({
      socket: stale,
      maxInboundFrameBytes: 1,
      isCurrent: () => current,
      onOpen,
      onFrame,
      onFrameError,
      onTerminal,
    });
    stale.onerror!(new Event("error"));
    expect(onTerminal).toHaveBeenCalledOnce();
  });
});
