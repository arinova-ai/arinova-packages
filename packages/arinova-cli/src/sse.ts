import { isJsonMode, sanitizeTerminalText } from "./output.js";

export type SseEvent = Record<string, unknown> & { type?: string; content?: string };

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let separator: RegExpExecArray | null;
      while ((separator = /\r?\n\r?\n/.exec(buffer)) !== null) {
        const block = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data || data === "[DONE]") continue;
        let event: unknown;
        try {
          event = JSON.parse(data);
        } catch {
          throw new Error("Invalid JSON in SSE data event");
        }
        if (!event || typeof event !== "object" || Array.isArray(event)) {
          throw new Error("Invalid SSE event payload");
        }
        yield event as SseEvent;
      }
      if (done) break;
    }
    if (buffer.trim()) throw new Error("Truncated SSE event");
  } finally {
    reader.releaseLock();
  }
}

export async function renderSseStream(stream: ReadableStream<Uint8Array>): Promise<void> {
  const ndjson = isJsonMode() || !process.stdout.isTTY;
  let wroteText = false;
  for await (const event of parseSseStream(stream)) {
    if (ndjson) {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    } else if (event.type === "chunk" && typeof event.content === "string") {
      process.stdout.write(sanitizeTerminalText(event.content));
      wroteText = true;
    }
    if (event.type === "error") {
      throw new Error(
        typeof event.message === "string" ? event.message : "Stream returned an error event",
      );
    }
  }
  if (!ndjson && wroteText) process.stdout.write("\n");
}
