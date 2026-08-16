import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearForwardTargets,
  forwardOfficeEvent,
  getForwardMetrics,
  resetForwardMetrics,
  setForwardTargets,
  waitForPendingForwards,
} from "./forwarder.js";

const event = {
  type: "message_in" as const,
  agentId: "agent-1",
  sessionId: "session-1",
  timestamp: 1,
  data: {},
};

beforeEach(() => {
  vi.unstubAllGlobals();
  clearForwardTargets();
  resetForwardMetrics();
});

describe("office event forwarder", () => {
  it("treats non-2xx responses as measured failures", async () => {
    const logger = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    setForwardTargets(new Map([["default", {
      url: "https://api.chat.arinova.ai/api/office/event",
      token: "ari_token",
    }]]), logger);

    forwardOfficeEvent(event);
    await waitForPendingForwards();

    expect(getForwardMetrics()).toMatchObject({ attempted: 1, failed: 1, succeeded: 0 });
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("HTTP 503"));
  });

  it("caps concurrent forwards and counts dropped events", async () => {
    const resolvers: Array<(response: Response) => void> = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => {
      resolvers.push(resolve);
    })));
    setForwardTargets(new Map([["default", {
      url: "https://api.chat.arinova.ai/api/office/event",
      token: "ari_token",
    }]]));

    for (let index = 0; index < 9; index += 1) forwardOfficeEvent(event);
    expect(getForwardMetrics()).toMatchObject({ attempted: 8, dropped: 1, inFlight: 8 });
    for (const resolve of resolvers) resolve(new Response(null, { status: 204 }));
    await waitForPendingForwards();
    expect(getForwardMetrics()).toMatchObject({ succeeded: 8, inFlight: 0 });
  });
});
