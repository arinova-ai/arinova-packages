import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleSSEConnection } from "./sse.js";
import { ingestHookEvent } from "./hooks.js";

type Handler = () => void;

function createResponse(results: boolean[] = []) {
  const handlers = new Map<string, Handler>();
  const write = vi.fn((_data: string) => results.shift() ?? true);
  return {
    response: {
      writeHead: vi.fn(),
      write,
      on: vi.fn((event: string, handler: Handler) => handlers.set(event, handler)),
    },
    handlers,
    write,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("office SSE", () => {
  it("writes headers, snapshots, heartbeats, and cleans up on errors", () => {
    const { response, handlers, write } = createResponse();
    handleSSEConnection(response);
    expect(response.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      "Content-Type": "text/event-stream",
    }));
    expect(write).toHaveBeenCalledWith(expect.stringMatching(/^data: /));
    vi.advanceTimersByTime(15_000);
    expect(write).toHaveBeenCalledWith(": ping\n\n");
    handlers.get("error")?.();
    const count = write.mock.calls.length;
    ingestHookEvent("message_in", "sse-clean", "sse-agent");
    expect(write).toHaveBeenCalledTimes(count);
  });

  it("coalesces updates while backpressured and flushes the latest on drain", () => {
    const { response, handlers, write } = createResponse([false, true]);
    handleSSEConnection(response);
    ingestHookEvent("message_in", "sse-one", "sse-agent-one");
    ingestHookEvent("message_in", "sse-two", "sse-agent-two");
    expect(write).toHaveBeenCalledTimes(1);
    handlers.get("drain")?.();
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]?.[0]).toContain("sse-agent-two");
    handlers.get("close")?.();
  });
});
