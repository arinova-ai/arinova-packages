import { afterEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "./output.js";
import { parseSseStream, renderSseStream } from "./sse.js";

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("SSE transport", () => {
  afterEach(() => {
    setJsonMode(false);
    vi.restoreAllMocks();
  });
  it("parses partial LF and CRLF events", async () => {
    const events = [];
    for await (const event of parseSseStream(streamOf(
      'data: {"type":"chu',
      'nk","content":"Hi"}\n\n',
      'data: {"type":"done","content":"Hi"}\r\n\r\n',
    ))) {
      events.push(event);
    }
    expect(events).toEqual([
      { type: "chunk", content: "Hi" },
      { type: "done", content: "Hi" },
    ]);
  });

  it("preserves server error events for the renderer", async () => {
    const events = [];
    for await (const event of parseSseStream(streamOf(
      'data: {"type":"error","message":"provider failed"}\n\n',
    ))) {
      events.push(event);
    }
    expect(events).toEqual([{ type: "error", message: "provider failed" }]);
  });

  it("flushes a complete final block and rejects malformed JSON events", async () => {
    const finalEvents = [];
    for await (const event of parseSseStream(streamOf('data: {"type":"chunk"}'))) {
      finalEvents.push(event);
    }
    const malformed = async () => {
      for await (const _event of parseSseStream(streamOf("data: nope\n\n"))) {
        // Drain.
      }
    };
    expect(finalEvents).toEqual([{ type: "chunk" }]);
    await expect(malformed()).rejects.toThrow("Invalid JSON");
  });

  it("sanitizes streamed terminal text while preserving Unicode and newlines", async () => {
    const originalTty = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await renderSseStream(streamOf(
        'data: {"type":"chunk","content":"\\u001b[31m紅色\\u001b[0m\\u0007\\n下一行"}\n\n',
      ));
      expect(write).toHaveBeenNthCalledWith(1, "紅色\n下一行");
      expect(write).toHaveBeenNthCalledWith(2, "\n");
    } finally {
      Object.defineProperty(process.stdout, "isTTY", {
        value: originalTty,
        configurable: true,
      });
    }
  });

  it("ignores final keepalive comments and event fields", async () => {
    const events = [];
    for await (const event of parseSseStream(streamOf(
      'event: message\ndata: {"type":"done"}\n\n: keepalive',
    ))) events.push(event);
    expect(events).toEqual([{ type: "done" }]);
  });

  it("bounds an unterminated event buffer", async () => {
    const drain = async () => {
      for await (const _event of parseSseStream(streamOf(`data: ${"x".repeat(1024 * 1024)}`))) {
        // Drain.
      }
    };
    await expect(drain()).rejects.toThrow("SSE event exceeded 1048576 bytes");
  });
});
