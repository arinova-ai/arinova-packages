import { describe, expect, it } from "vitest";
import { readBoundedText, ResponseTooLargeError } from "./http.js";

describe("bounded HTTP response reader", () => {
  it("checks actual streamed bytes when Content-Length is absent", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("ab"));
        controller.enqueue(new TextEncoder().encode("cd"));
        controller.close();
      },
    });
    await expect(readBoundedText(new Response(body), 3)).rejects.toBeInstanceOf(
      ResponseTooLargeError,
    );
  });
});
