import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureFromChannelConfig } from "./index.js";
import { ingestHookEvent } from "./hooks.js";
import {
  clearForwardTargets,
  resetForwardMetrics,
  waitForPendingForwards,
} from "./forwarder.js";

beforeEach(() => {
  vi.unstubAllGlobals();
  clearForwardTargets();
  resetForwardMetrics();
});

describe("office channel configuration", () => {
  it("wires per-account channel credentials to the office event endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    configureFromChannelConfig({
      channels: {
        "openclaw-arinova-ai": {
          apiUrl: "https://api.chat.arinova.ai",
          accounts: {
            ada: { botToken: "ari_ada" },
          },
        },
      },
    });

    ingestHookEvent("message_in", "session-1", "agent-1", {}, "ada");
    await waitForPendingForwards();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.chat.arinova.ai/api/office/event",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer ari_ada" }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("skips an untrusted configured endpoint and reports why", () => {
    const logger = vi.fn();
    configureFromChannelConfig({
      channels: {
        "openclaw-arinova-ai": {
          apiUrl: "https://attacker.example",
          botToken: "ari_secret",
        },
      },
    }, logger);
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("official Arinova API host"));
  });
});
