import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { McpServerConfig } from "../src/config.js";
import { ArinovaClient, EXPECTED_ACTION_PROTOCOL_VERSION } from "../src/arinova-client.js";

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

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
}

function installFetchMock(
  actionHandler?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): void {
  const manifest = {
    manifestVersion: EXPECTED_ACTION_PROTOCOL_VERSION,
    actions: [],
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/actions/agent-manifest")) {
        return jsonResponse(manifest, { headers: { ETag: '"test"' } });
      }
      if (url.endsWith("/api/v1/actions/call")) {
        if (actionHandler) return actionHandler(input, init);
        return jsonResponse({
          type: "action_result",
          id: "c1",
          action: "test",
          status: "success",
          result: {},
        });
      }
      return new Response("not found", { status: 404 });
    }),
  );
}

describe("ArinovaClient", () => {
  let client: ArinovaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    installFetchMock();
    client = new ArinovaClient(makeConfig());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

      expect(health.protocolVersion).toEqual({
        expected: EXPECTED_ACTION_PROTOCOL_VERSION,
        backend: null,
      });
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

      installFetchMock(async () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve(jsonResponse({
                  id: "c1",
                  action: "test",
                  status: "success",
                })),
              100,
            ),
          )
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

      let actionResolved = false;
      installFetchMock(async () =>
          new Promise((resolve) => {
            setTimeout(() => {
              actionResolved = true;
              resolve(jsonResponse({
                id: "c1",
                action: "test",
                status: "success",
              }));
            }, 50);
          })
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

      installFetchMock(async () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve(jsonResponse({
                  id: "c1",
                  action: "test",
                  status: "success",
                })),
              50,
            ),
          )
      );

      const call1 = c.callAction("test", {});
      await new Promise((r) => setTimeout(r, 0));
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

    it("rejects action that acquired semaphore during drain", async () => {
      const config = makeConfig({ maxConcurrentActions: 1, actionQueueLimit: 1 });
      const c = new ArinovaClient(config);
      await c.connect();

      installFetchMock(async () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve(jsonResponse({
                  id: "c1",
                  action: "test",
                  status: "success",
                })),
              50,
            ),
          )
      );

      const call1 = c.callAction("test", {});
      await new Promise((r) => setTimeout(r, 0));

      const callRejection = c.callAction("test", {}).catch((e: Error) => e);
      await c.drain(5000);
      await call1;

      const err = await callRejection;
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain("shutting down");
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

  describe("error normalization", () => {
    it("maps non-2xx action response to HTTP_ACTION_CALL_FAILED", async () => {
      installFetchMock(async () =>
        jsonResponse(
          { message: "Unauthorized" },
          { status: 401, statusText: "Unauthorized" },
        ),
      );
      await client.connect();

      await expect(client.callAction("test", {})).rejects.toThrow("Unauthorized");
    });

    it("maps aborted HTTP action call to TIMEOUT", async () => {
      installFetchMock(async (_input, init) =>
        new Promise((resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
          setTimeout(
            () =>
              resolve(jsonResponse({
                id: "c1",
                action: "test",
                status: "success",
              })),
            50,
          );
        }),
      );
      client = new ArinovaClient(makeConfig({ actionTimeoutMs: 5 }));
      await client.connect();

      await expect(client.callAction("test", {})).rejects.toThrow(
        "Action timed out after 5ms",
      );
    });
  });
});
