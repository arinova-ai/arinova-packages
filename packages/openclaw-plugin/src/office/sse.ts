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

  let backpressured = !sendSSE(res, officeState.snapshot());
  let pending: OfficeStatusEvent | undefined;
  let cleanedUp = false;

  // Subscribe to updates
  const unsubscribe = officeState.subscribe((event) => {
    if (backpressured) {
      pending = event;
      return;
    }
    backpressured = !sendSSE(res, event);
  });

  const heartbeat = setInterval(() => {
    if (!backpressured) backpressured = !res.write(": ping\n\n");
  }, 15_000);
  heartbeat.unref?.();

  // Clean up on disconnect
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(heartbeat);
    unsubscribe();
  };
  res.on("drain", () => {
    backpressured = false;
    if (pending) {
      const event = pending;
      pending = undefined;
      backpressured = !sendSSE(res, event);
    }
  });
  res.on("close", cleanup);
  res.on("error", cleanup);
}

function sendSSE(
  res: { write: (data: string) => boolean },
  event: OfficeStatusEvent,
): boolean {
  return res.write(`data: ${JSON.stringify(event)}\n\n`);
}
