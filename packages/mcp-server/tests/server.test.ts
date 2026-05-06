import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServerConfig } from "../src/config.js";
import { ArinovaClient, EXPECTED_ACTION_PROTOCOL_VERSION } from "../src/arinova-client.js";

let capturedOnTask: ((task: unknown) => void) | null = null;

vi.mock("@arinova-ai/agent-sdk", () => {
  return {
    ArinovaAgent: vi.fn().mockImplementation(() => ({
      on: vi.fn().mockReturnThis(),
      onTask: vi.fn().mockImplementation(function (this: unknown, handler: (task: unknown) => void) {
        capturedOnTask = handler;
        return this;
      }),
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
    capturedOnTask = null;
    client = new ArinovaClient(makeConfig());
  });

  describe("task rejection", () => {
    it("registers an onTask handler", () => {
      expect(capturedOnTask).toBeTypeOf("function");
    });

    it("rejects incoming tasks with an error", () => {
      const sendError = vi.fn();
      const task = {
        taskId: "task_1",
        conversationId: "conv_1",
        content: "hello",
        sendError,
        sendChunk: vi.fn(),
        sendComplete: vi.fn(),
      };

      capturedOnTask!(task);

      expect(sendError).toHaveBeenCalledWith(
        expect.stringContaining("MCP bridge"),
      );
    });
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

    it("includes protocol version", () => {
      const health = client.getHealthData();

      expect(health.actionProtocolVersion).toBe(
        EXPECTED_ACTION_PROTOCOL_VERSION,
      );
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
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  callId: "c1",
                  action: "test",
                  status: "success",
                }),
              100,
            ),
          ),
      );

      const call1 = c.callAction("test", {});
      const call2 = c.callAction("test", {});

      await expect(c.callAction("test", {})).rejects.toThrow("queue is full");

      await Promise.all([call1, call2]);
    });
  });

  describe("drain", () => {
    it("waits for in-flight actions before completing", async () => {
      const config = makeConfig({ maxConcurrentActions: 2 });
      const c = new ArinovaClient(config);
      await c.connect();

      const { ArinovaAgent } = await import("@arinova-ai/agent-sdk");
      const mockAgent = vi.mocked(ArinovaAgent).mock.results.at(-1)?.value;
      let actionResolved = false;
      mockAgent.callAction.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              actionResolved = true;
              resolve({
                callId: "c1",
                action: "test",
                status: "success",
              });
            }, 50);
          }),
      );

      const actionPromise = c.callAction("test", {});
      // yield so callAction gets past acquireSemaphore and registers in-flight
      await new Promise((r) => setTimeout(r, 0));
      const drainPromise = c.drain(5000);

      await drainPromise;
      expect(actionResolved).toBe(true);
      expect(c.inFlightCount).toBe(0);
      await actionPromise;
    });

    it("cancels queued calls during drain", async () => {
      const config = makeConfig({
        maxConcurrentActions: 1,
        actionQueueLimit: 2,
      });
      const c = new ArinovaClient(config);
      await c.connect();

      const { ArinovaAgent } = await import("@arinova-ai/agent-sdk");
      const mockAgent = vi.mocked(ArinovaAgent).mock.results.at(-1)?.value;
      mockAgent.callAction.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  callId: "c1",
                  action: "test",
                  status: "success",
                }),
              50,
            ),
          ),
      );

      const call1 = c.callAction("test", {});
      const call2Rejection = c.callAction("test", {}).catch((err: Error) => err);

      await c.drain(5000);
      await call1;

      const err = await call2Rejection;
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain("shutting down");
    });

    it("rejects new calls after drain starts", async () => {
      await client.connect();
      await client.drain(100);

      await expect(client.callAction("test", {})).rejects.toThrow(
        "shutting down",
      );
    });
  });

  describe("disconnect", () => {
    it("rejects new calls after disconnect", async () => {
      await client.connect();
      client.disconnect();

      await expect(client.callAction("test", {})).rejects.toThrow(
        "connection state is disconnected",
      );
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
