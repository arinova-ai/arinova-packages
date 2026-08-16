import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestLimiter } from "../src/limiter.js";

afterEach(() => vi.useRealTimers());

describe("RequestLimiter", () => {
  it("admits queued work in FIFO order when capacity is released", async () => {
    const limiter = new RequestLimiter(1, 2, 1_000);
    await limiter.acquire();
    const second = limiter.acquire();
    expect(limiter.inFlightCount).toBe(1);
    expect(limiter.queueDepth).toBe(1);
    limiter.release();
    await second;
    expect(limiter.inFlightCount).toBe(1);
    expect(limiter.queueDepth).toBe(0);
    limiter.release();
    expect(limiter.inFlightCount).toBe(0);
  });

  it("rejects overflow and timed-out waiters", async () => {
    vi.useFakeTimers();
    const limiter = new RequestLimiter(1, 1, 10);
    await limiter.acquire();
    const waiting = limiter.acquire().catch((error) => error);
    await expect(limiter.acquire()).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await vi.advanceTimersByTimeAsync(10);
    await expect(waiting).resolves.toMatchObject({ code: "QUEUE_TIMEOUT" });
    expect(limiter.queueDepth).toBe(0);
    limiter.release();
  });

  it("rejects every queued waiter during shutdown", async () => {
    const limiter = new RequestLimiter(1, 2, 1_000);
    await limiter.acquire();
    const first = limiter.acquire().catch((error) => error);
    const second = limiter.acquire().catch((error) => error);
    limiter.rejectQueued("SHUTDOWN", "Server is shutting down");
    await expect(first).resolves.toMatchObject({ code: "SHUTDOWN" });
    await expect(second).resolves.toMatchObject({ code: "SHUTDOWN" });
    expect(limiter.queueDepth).toBe(0);
    limiter.release();
  });
});
