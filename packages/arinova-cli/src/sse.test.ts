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

  it("rejects truncated and malformed JSON events", async () => {
    const truncated = async () => {
      for await (const _event of parseSseStream(streamOf('data: {"type":"chunk"}'))) {
        // Drain.
      }
    };
    const malformed = async () => {
      for await (const _event of parseSseStream(streamOf("data: nope\n\n"))) {
        // Drain.
      }
    };
    await expect(truncated()).rejects.toThrow("Truncated SSE event");
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
});
