import { describe, expect, it, vi } from "vitest";
import { OutboundFrames, type OutboundConnection } from "./outbound.js";

function setup(options: ConstructorParameters<typeof OutboundFrames>[1] = {}) {
  const send = vi.fn();
  const state: OutboundConnection = {
    authenticated: false,
    socket: { readyState: 1, send },
    tearingDown: false,
  };
  return { send, state, outbound: new OutboundFrames(() => state, options) };
}

describe("OutboundFrames", () => {
  it("distinguishes pre-authenticated and authenticated sends", () => {
    const { outbound, state, send } = setup();
    expect(outbound.send({ type: "ignored" })).toBe(false);
    expect(() => outbound.sendOrThrow({ type: "required" })).toThrow(/authenticated/);
    outbound.sendBeforeAuth({ type: "auth" });
    state.authenticated = true;
    expect(outbound.send({ type: "ready" })).toBe(true);
    expect(send.mock.calls.map(([value]) => JSON.parse(value))).toEqual([
      { type: "auth" },
      { type: "ready" },
    ]);
    state.socket = null;
    expect(() => outbound.sendBeforeAuth({})).toThrow(/not open/);
  });

  it("bounds and flushes terminal events while respecting teardown", () => {
    const { outbound, state, send } = setup({ maxPendingTerminal: 2 });
    outbound.sendTerminal({ id: 1 });
    outbound.sendTerminal({ id: 2 });
    outbound.sendTerminal({ id: 3 });
    state.tearingDown = true;
    outbound.sendTerminal({ id: 4 });
    state.tearingDown = false;
    outbound.flushTerminal();
    expect(send).not.toHaveBeenCalled();
    state.authenticated = true;
    outbound.flushTerminal();
    expect(send.mock.calls.map(([value]) => JSON.parse(value).id)).toEqual([2, 3]);
  });

  it("drops stale chunks with a stream gap and retains bounded fresh chunks", () => {
    let now = 100;
    const { outbound, state, send } = setup({
      maxPendingChunks: 2,
      maxChunkAgeMs: 10,
      now: () => now,
    });
    outbound.sendChunk({ type: "chunk", taskId: "dropped", chunk: "a" });
    now = 105;
    outbound.sendChunk({ type: "chunk", taskId: "stale", chunk: "b" });
    now = 110;
    outbound.sendChunk({ type: "chunk", taskId: "fresh", chunk: "c" });
    now = 116;
    state.authenticated = true;
    outbound.flushChunks();
    expect(send.mock.calls.map(([value]) => JSON.parse(value))).toEqual([
      { type: "chunk", taskId: "fresh", chunk: "c" },
      { type: "agent_stream_gap", taskId: "stale", reason: "offline_chunk_buffer_expired" },
    ]);
  });

  it("requeues unsent events when a socket send throws", () => {
    const { outbound, state, send } = setup();
    outbound.sendTerminal({ id: 1 });
    outbound.sendTerminal({ id: 2 });
    state.authenticated = true;
    send.mockImplementationOnce(() => { throw new Error("closed"); });
    expect(() => outbound.flushTerminal()).toThrow("closed");
    send.mockReset();
    outbound.flushTerminal();
    expect(send).toHaveBeenCalledTimes(2);

    state.authenticated = false;
    outbound.sendChunk({ taskId: "a" });
    state.authenticated = true;
    send.mockImplementationOnce(() => { throw new Error("closed"); });
    expect(() => outbound.flushChunks()).toThrow("closed");
    send.mockReset();
    outbound.flushChunks();
    expect(send).toHaveBeenCalledTimes(1);
    outbound.reset();
  });
});
