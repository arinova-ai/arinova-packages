import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServerConfig } from "../src/config.js";
import { ArinovaClient } from "../src/arinova-client.js";
import { ActionExecutionError } from "../src/errors.js";

vi.mock("@arinova-ai/agent-sdk", () => {
  return {
    ArinovaAgent: vi.fn().mockImplementation(() => ({
      on: vi.fn().mockReturnThis(),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      callAction: vi.fn(),
    })),
  };
});

function makeConfig(overrides?: Partial<McpServerConfig>): McpServerConfig {
  return {
    botToken: "ari_test",
    serverUrl: "wss://chat.example.com",
    apiUrl: "https://chat.example.com",
    apiUrlDerived: true,
    transport: "stdio",
    actionTimeoutMs: 60000,
    startupMode: "lazy",
    maxConcurrentActions: 2,
    actionQueueLimit: 4,
    logLevel: "error",
    ...overrides,
  };
}

describe("ArinovaClient", () => {
  let client: ArinovaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new ArinovaClient(makeConfig());
  });

  describe("health data", () => {
    it("reports initial state", () => {
      const health = client.getHealthData();

      expect(health.process).toBe("running");
      expect(health.connection).toBe("not_connected");
      expect(health.manifest).toBe("not_loaded");
      expect(health.manifestVersion).toBeNull();
      expect(health.actionCount).toBe(0);
      expect(health.queueDepth).toBe(0);
    });
  });

  describe("concurrency", () => {
    it("rejects when queue is full", async () => {
      const config = makeConfig({
        maxConcurrentActions: 1,
        actionQueueLimit: 1,
      });
      const c = new ArinovaClient(config);

      await c.connect();

      const { ArinovaAgent } = await import("@arinova-ai/agent-sdk");
      const mockAgent = vi.mocked(ArinovaAgent).mock.results.at(-1)?.value;
      mockAgent.callAction.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          callId: "c1",
          action: "test",
          status: "success",
        }), 100)),
      );

      const call1 = c.callAction("test", {});
      const call2 = c.callAction("test", {});

      await expect(c.callAction("test", {})).rejects.toThrow("queue is full");

      await Promise.all([call1, call2]);
    });
  });

  describe("disconnect", () => {
    it("rejects new calls after disconnect", async () => {
      await client.connect();
      client.disconnect();

      await expect(client.callAction("test", {})).rejects.toThrow(
        "shutting down",
      );
    });

    it("cancels queued calls on disconnect", async () => {
      const config = makeConfig({ maxConcurrentActions: 1, actionQueueLimit: 2 });
      const c = new ArinovaClient(config);
      await c.connect();

      const { ArinovaAgent } = await import("@arinova-ai/agent-sdk");
      const mockAgent = vi.mocked(ArinovaAgent).mock.results.at(-1)?.value;
      mockAgent.callAction.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          callId: "c1",
          action: "test",
          status: "success",
        }), 500)),
      );

      const call1 = c.callAction("test", {});
      const call2 = c.callAction("test", {});

      c.disconnect();

      await expect(call2).rejects.toThrow("shutting down");
      await call1;
    });
  });

  describe("connection state", () => {
    it("rejects calls when not connected", async () => {
      await expect(client.callAction("test", {})).rejects.toThrow(
        "connection state is not_connected",
      );
    });
  });
});
