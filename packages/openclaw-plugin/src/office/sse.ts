import { officeState } from "./state.js";
import type { OfficeStatusEvent } from "./types.js";

/**
 * Handle an SSE connection for `/office/status`.
 *
 * Sends an initial snapshot, then streams updates as they occur.
 * Compatible with Node.js http.ServerResponse or any writable
 * stream that supports SSE format.
 *
 * TODO (due 3/1): Integrate with the arinova-chat server's
 * HTTP router to expose as an actual endpoint.
 */
export function handleSSEConnection(
  res: {
    writeHead: (status: number, headers: Record<string, string>) => void;
    write: (data: string) => boolean;
    on: (event: string, handler: () => void) => void;
  },
): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Send initial snapshot
  const snapshot = officeState.snapshot();
  sendSSE(res, snapshot);

  // Subscribe to updates
  const unsubscribe = officeState.subscribe((event) => {
    sendSSE(res, event);
  });

  // Clean up on disconnect
  res.on("close", () => {
    unsubscribe();
  });
}

function sendSSE(
  res: { write: (data: string) => boolean },
  event: OfficeStatusEvent,
): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
