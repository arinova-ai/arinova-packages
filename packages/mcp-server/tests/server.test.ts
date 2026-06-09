import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { McpServerConfig } from "../src/config.js";
import { ArinovaClient, EXPECTED_ACTION_PROTOCOL_VERSION } from "../src/arinova-client.js";
import { ArinovaMcpServer } from "../src/server.js";

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

  describe("HTTP action call request", () => {
    it("sends JSON-only action call body with auth headers and context options", async () => {
      let capturedInit: RequestInit | undefined;
      installFetchMock(async (_input, init) => {
        capturedInit = init;
        return jsonResponse({
          type: "action_result",
          id: "call-fixed",
          action: "arinova.message.send",
          status: "success",
          result: { messageId: "msg-1" },
          traceId: "trace-1",
          actionVersion: "1.2.3",
          dryRun: true,
        });
      });
      await client.connect();

      const result = await client.callAction(
        "arinova.message.send",
        { conversationId: "conv-1", content: "hello" },
        {
          callId: "call-fixed",
          taskId: "task-1",
          conversationId: "conv-1",
          messageId: "msg-1",
          parentCallId: "parent-1",
          reason: "test",
          metadata: { source: "vitest" },
          dryRun: true,
        },
      );

      expect(capturedInit?.method).toBe("POST");
      expect(capturedInit?.headers).toEqual({
        Authorization: "Bearer ari_test",
        "Content-Type": "application/json",
      });
      expect(capturedInit?.body).toBe(JSON.stringify({
        type: "action_call",
        id: "call-fixed",
        taskId: "task-1",
        conversationId: "conv-1",
        messageId: "msg-1",
        action: "arinova.message.send",
        arguments: { conversationId: "conv-1", content: "hello" },
        dryRun: true,
        reason: "test",
        metadata: { source: "vitest" },
        parentCallId: "parent-1",
      }));
      expect(result).toEqual({
        callId: "call-fixed",
        action: "arinova.message.send",
        status: "success",
        result: { messageId: "msg-1" },
        error: undefined,
        confirmation: undefined,
        traceId: "trace-1",
        actionVersion: "1.2.3",
        dryRun: true,
      });
    });

    it("keeps file references in JSON action arguments instead of multipart upload", async () => {
      let capturedInit: RequestInit | undefined;
      installFetchMock(async (_input, init) => {
        capturedInit = init;
        return jsonResponse({
          type: "action_result",
          id: "call-file-ref",
          action: "arinova.file.consume",
          status: "success",
          result: { ok: true },
        });
      });
      await client.connect();

      await client.callAction(
        "arinova.file.consume",
        {
          fileId: "file-1",
          attachmentId: "attachment-1",
          assetUrl: "https://cdn.example.test/file.png",
          url: "https://cdn.example.test/file.png",
        },
        { callId: "call-file-ref" },
      );

      expect(capturedInit?.headers).toEqual({
        Authorization: "Bearer ari_test",
        "Content-Type": "application/json",
      });
      expect(typeof capturedInit?.body).toBe("string");
      expect(capturedInit?.body).toBe(JSON.stringify({
        type: "action_call",
        id: "call-file-ref",
        taskId: null,
        conversationId: null,
        messageId: null,
        action: "arinova.file.consume",
        arguments: {
          fileId: "file-1",
          attachmentId: "attachment-1",
          assetUrl: "https://cdn.example.test/file.png",
          url: "https://cdn.example.test/file.png",
        },
        dryRun: false,
        reason: null,
        metadata: null,
        parentCallId: null,
      }));
    });

    it("normalizes non-JSON HTTP errors into ActionExecutionError", async () => {
      installFetchMock(async () => new Response("bad gateway", {
        status: 502,
        statusText: "Bad Gateway",
      }));
      await client.connect();

      await expect(client.callAction("arinova.message.send", {})).rejects.toMatchObject({
        code: "HTTP_ACTION_CALL_FAILED",
        message: "bad gateway",
      });
    });
  });
});

describe("ArinovaMcpServer", () => {
  function parseTextResult(result: { content: Array<{ text: string }>; isError?: boolean }) {
    return {
      body: JSON.parse(result.content[0].text) as Record<string, unknown>,
      isError: result.isError,
    };
  }

  it("loads action tools before returning the first tool list", async () => {
    const dynamicTool = {
      name: "arinova_message_send",
      description: "Arinova action: arinova.message.send.",
      inputSchema: {
        type: "object",
        properties: { conversationId: { type: "string" } },
      },
      actionName: "arinova.message.send",
    };
    const mapping = {
      tools: [dynamicTool],
      toolToAction: new Map([[dynamicTool.name, dynamicTool.actionName]]),
      skippedActions: [],
    };
    const fakeClient = {
      connect: vi.fn(async () => {}),
      getToolMapping: vi.fn(() => mapping),
      loadManifest: vi.fn(async () => mapping),
      getHealthData: vi.fn(() => ({})),
      getManifestInfo: vi.fn(() => ({})),
      callAction: vi.fn(),
      drain: vi.fn(),
      disconnect: vi.fn(),
    };
    const server = new ArinovaMcpServer(
      makeConfig(),
      fakeClient as unknown as ArinovaClient,
    );

    await (server as unknown as { ensureToolsLoaded: () => Promise<void> })
      .ensureToolsLoaded();
    const tools = (server as unknown as { getToolList: () => Array<{ name: string }> })
      .getToolList();

    expect(fakeClient.connect).toHaveBeenCalledTimes(1);
    expect(tools.map((tool) => tool.name)).toContain("arinova_health");
    expect(tools.map((tool) => tool.name)).toContain("arinova_refresh_manifest");
    expect(tools.map((tool) => tool.name)).toContain("arinova_message_send");
  });

  it("maps registered tool calls to action calls with max execution timeout", async () => {
    const dynamicTool = {
      name: "arinova_message_send",
      description: "Arinova action: arinova.message.send.",
      inputSchema: { type: "object", properties: {} },
      actionName: "arinova.message.send",
      maxExecutionMs: 1234,
    };
    const fakeClient = {
      getHealthData: vi.fn(() => ({})),
      getManifestInfo: vi.fn(() => ({})),
      callAction: vi.fn(async () => ({
        callId: "call-1",
        action: "arinova.message.send",
        status: "success",
        result: { messageId: "msg-1" },
      })),
      drain: vi.fn(),
      disconnect: vi.fn(),
    };
    const server = new ArinovaMcpServer(
      makeConfig(),
      fakeClient as unknown as ArinovaClient,
    );
    (server as unknown as { dynamicTools: unknown[] }).dynamicTools = [dynamicTool];

    const result = await (server as unknown as {
      handleToolCall: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
    }).handleToolCall("arinova_message_send", { content: "hello" });

    expect(fakeClient.callAction).toHaveBeenCalledWith(
      "arinova.message.send",
      { content: "hello" },
      { timeoutMs: 1234 },
    );
    expect(parseTextResult(result)).toEqual({
      body: {
        ok: true,
        status: "success",
        action: "arinova.message.send",
        callId: "call-1",
        result: { messageId: "msg-1" },
      },
      isError: undefined,
    });
  });

  it("rejects unknown tools and oversized arguments before calling the client", async () => {
    const fakeClient = {
      getHealthData: vi.fn(() => ({})),
      getManifestInfo: vi.fn(() => ({})),
      callAction: vi.fn(),
      drain: vi.fn(),
      disconnect: vi.fn(),
    };
    const server = new ArinovaMcpServer(
      makeConfig(),
      fakeClient as unknown as ArinovaClient,
    );
    (server as unknown as { dynamicTools: unknown[] }).dynamicTools = [{
      name: "arinova_small",
      description: "Small args",
      inputSchema: { type: "object", properties: {} },
      actionName: "arinova.small",
      maxArgumentsBytes: 8,
    }];

    const unknown = await (server as unknown as {
      handleToolCall: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
    }).handleToolCall("missing_tool", {});
    const oversized = await (server as unknown as {
      handleToolCall: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
    }).handleToolCall("arinova_small", { value: "too long" });

    expect(parseTextResult(unknown)).toMatchObject({
      body: { error: { code: "UNKNOWN_TOOL" } },
      isError: true,
    });
    expect(parseTextResult(oversized)).toMatchObject({
      body: {
        action: "arinova.small",
        error: { code: "ARGUMENTS_TOO_LARGE" },
      },
      isError: true,
    });
    expect(fakeClient.callAction).not.toHaveBeenCalled();
  });
});
