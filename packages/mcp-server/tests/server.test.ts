import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { McpServerConfig } from "../src/config.js";
import { ArinovaClient, EXPECTED_ACTION_PROTOCOL_VERSION } from "../src/arinova-client.js";
import { ArinovaMcpServer, PACKAGE_VERSION } from "../src/server.js";
import packageJson from "../package.json" with { type: "json" };
import { mapManifestToTools } from "../src/tool-mapping.js";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PassThrough } from "node:stream";

function makeConfig(overrides?: Partial<McpServerConfig>): McpServerConfig {
  return {
    botToken: "ari_test",
    serverUrl: "wss://chat.example.com",
    apiUrl: "https://chat.example.com",
    apiUrlDerived: true,
    transport: "stdio",
    actionTimeoutMs: 60000,
    manifestTimeoutMs: 15000,
    startupMode: "lazy",
    maxConcurrentActions: 2,
    actionQueueLimit: 4,
    actionQueueWaitMs: 30000,
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
        compatible: null,
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

    it("coalesces concurrent manifest refreshes into one limited operation", async () => {
      let releaseManifest!: (response: Response) => void;
      const manifestResponse = new Promise<Response>((resolve) => {
        releaseManifest = resolve;
      });
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith("/api/v1/actions/agent-manifest")) {
          return manifestResponse;
        }
        return new Response("not found", { status: 404 });
      });
      vi.stubGlobal("fetch", fetchMock);
      const c = new ArinovaClient(makeConfig({ maxConcurrentActions: 1 }));

      const first = c.loadManifest();
      const second = c.loadManifest();
      const third = c.loadManifest();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(fetchMock).toHaveBeenCalledTimes(1);

      releaseManifest(jsonResponse({
        manifestVersion: EXPECTED_ACTION_PROTOCOL_VERSION,
        actions: [],
      }));
      const mappings = await Promise.all([first, second, third]);
      expect(mappings[0]).toBe(mappings[1]);
      expect(mappings[1]).toBe(mappings[2]);
      expect(c.inFlightCount).toBe(0);
    });

    it("queues manifest refresh behind an in-flight action", async () => {
      const c = new ArinovaClient(makeConfig({
        maxConcurrentActions: 1,
        actionQueueLimit: 2,
      }));
      let manifestCalls = 0;
      let releaseAction!: () => void;
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/v1/actions/agent-manifest")) {
          manifestCalls++;
          return jsonResponse({
            manifestVersion: EXPECTED_ACTION_PROTOCOL_VERSION,
            actions: [],
          });
        }
        if (url.endsWith("/api/v1/actions/call")) {
          await new Promise<void>((resolve) => {
            releaseAction = resolve;
          });
          return jsonResponse({
            id: "c1",
            action: "test",
            status: "success",
          });
        }
        return new Response("not found", { status: 404 });
      }));
      await c.connect();

      const action = c.callAction("test", {});
      await new Promise((resolve) => setTimeout(resolve, 0));
      const refresh = c.loadManifest();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(manifestCalls).toBe(1);
      expect(c.inFlightCount).toBe(1);

      releaseAction();
      await action;
      await refresh;
      expect(manifestCalls).toBe(2);
      expect(c.inFlightCount).toBe(0);
    });

    it("times out a queued semaphore waiter", async () => {
      const c = new ArinovaClient(makeConfig({
        maxConcurrentActions: 1,
        actionQueueLimit: 1,
        actionQueueWaitMs: 5,
      }));
      await c.connect();
      installFetchMock(async () => new Promise((resolve) => setTimeout(
        () => resolve(jsonResponse({ id: "c1", action: "test", status: "success" })),
        30,
      )));
      const first = c.callAction("test", {});
      await new Promise((resolve) => setTimeout(resolve, 0));
      await expect(c.callAction("test", {})).rejects.toMatchObject({
        code: "QUEUE_TIMEOUT",
      });
      await first;
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

    it("aborts an in-flight HTTP request", async () => {
      await client.connect();
      installFetchMock(async (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(
          Object.assign(new Error("aborted"), { name: "AbortError" }),
        ));
      }));
      const call = client.callAction("test", {});
      await new Promise((resolve) => setTimeout(resolve, 0));
      client.disconnect();
      await expect(call).rejects.toMatchObject({ code: "ABORTED" });
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

    it("preserves structured backend error fields", async () => {
      installFetchMock(async () => jsonResponse({
        error: {
          code: "TOKEN_EXPIRED",
          message: "Token expired",
          details: { expiredAt: "2026-08-01T00:00:00Z" },
        },
      }, { status: 401 }));
      await client.connect();
      await expect(client.callAction("test", {}, { callId: "call-error" }))
        .rejects.toMatchObject({
          code: "TOKEN_EXPIRED",
          message: "Token expired",
          statusCode: 401,
          details: { expiredAt: "2026-08-01T00:00:00Z" },
          callId: "call-error",
        });
    });

    it("does not stringify non-string error messages", async () => {
      installFetchMock(async () => jsonResponse({ message: { nested: true } }, {
        status: 400,
      }));
      await client.connect();
      await expect(client.callAction("test", {})).rejects.toMatchObject({
        code: "HTTP_ACTION_CALL_FAILED",
        message: "HTTP action call failed (400)",
        statusCode: 400,
      });
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

    it("does not reuse taskId as messageId and generates a UUID call id", async () => {
      let payload: Record<string, unknown> | undefined;
      installFetchMock(async (_input, init) => {
        payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse({ action: "test", status: "success" });
      });
      await client.connect();
      const result = await client.callAction("test", {}, { taskId: "task-1" });
      expect(payload?.messageId).toBeNull();
      expect(payload?.id).toMatch(/^mcp_[0-9a-f-]{36}$/);
      expect(result.callId).toBe(payload?.id);
    });

    it("enforces maxArgumentsBytes against the arguments, not the envelope", async () => {
      let actionFetches = 0;
      installFetchMock(async () => {
        actionFetches++;
        return jsonResponse({ id: "fixed", action: "test", status: "success" });
      });
      await client.connect();
      await expect(client.callAction(
        "test",
        { a: "0123456789" },
        { callId: "fixed" },
        10,
      )).rejects.toMatchObject({ code: "ARGUMENTS_TOO_LARGE", callId: "fixed" });
      expect(actionFetches).toBe(0);

      // Envelope overhead (callId, null option fields, …) must not eat into
      // the caller's argument budget: tiny args pass even with a tiny limit.
      await expect(client.callAction("test", {}, { callId: "fixed" }, 10))
        .resolves.toMatchObject({ status: "success" });
      expect(actionFetches).toBe(1);
    });

    it("maps an unknown backend status to error", async () => {
      installFetchMock(async () => jsonResponse({
        id: "call-future",
        action: "test",
        status: "future_status",
      }));
      await client.connect();
      await expect(client.callAction("test", {})).resolves.toMatchObject({
        callId: "call-future",
        status: "error",
      });
    });
  });

  it("recovers from a 304 without cache and negotiates manifest version", async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input, init) => {
      calls.push(init ?? {});
      if (calls.length === 1) return new Response(null, { status: 304 });
      if (calls.length === 2) return jsonResponse({
        manifestVersion: EXPECTED_ACTION_PROTOCOL_VERSION,
        actions: [],
      }, { headers: { ETag: '"fresh"' } });
      return new Response(null, { status: 304 });
    }));
    const c = new ArinovaClient(makeConfig());
    await c.loadManifest();
    await c.loadManifest();
    expect(calls).toHaveLength(3);
    expect((calls[1].headers as Record<string, string>)["If-None-Match"])
      .toBeUndefined();
    expect((calls[2].headers as Record<string, string>)["If-None-Match"])
      .toBe('"fresh"');
    expect(c.getHealthData().protocolVersion).toEqual({
      expected: EXPECTED_ACTION_PROTOCOL_VERSION,
      backend: null,
      compatible: null,
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

  it("reports the package.json version to MCP clients", () => {
    expect(PACKAGE_VERSION).toBe(packageJson.version);
  });

  it("loads action tools before returning the first tool list", async () => {
    const dynamicTool = mapManifestToTools({
      manifestVersion: "1",
      actions: [{ name: "arinova.message.send", version: "1", inputSchema: {
        type: "object", properties: { conversationId: { type: "string" } },
      } }],
    }).tools[0];
    const mapping = {
      tools: [dynamicTool],
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

  it("does not register arinova_upload_file before the backend upload bridge exists", async () => {
    const fakeClient = {
      connect: vi.fn(async () => {}),
      getToolMapping: vi.fn(() => ({ tools: [], skippedActions: [] })),
      loadManifest: vi.fn(async () => ({ tools: [], skippedActions: [] })),
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
    const uploadCall = await (server as unknown as {
      handleToolCall: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
    }).handleToolCall("arinova_upload_file", { path: "/tmp/file.png" });

    expect(tools.map((tool) => tool.name)).not.toContain("arinova_upload_file");
    expect(parseTextResult(uploadCall)).toMatchObject({
      body: { error: { code: "UNKNOWN_TOOL" } },
      isError: true,
    });
    expect(fakeClient.callAction).not.toHaveBeenCalled();
  });

  it("maps registered tool calls to action calls with max execution timeout", async () => {
    const dynamicTool = mapManifestToTools({
      manifestVersion: "1",
      actions: [{ name: "arinova.message.send", version: "1", maxExecutionMs: 1234 }],
    }).tools[0];
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
    (server as unknown as { dynamicTools: Map<string, unknown> }).dynamicTools =
      new Map([[dynamicTool.name, dynamicTool]]);

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
      undefined,
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

  it("rejects unknown tools and schema-invalid arguments before calling the client", async () => {
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
    const dynamicTool = mapManifestToTools({
      manifestVersion: "1",
      actions: [{ name: "arinova.small", version: "1", inputSchema: {
        type: "object",
        required: ["value"],
        properties: { value: { type: "string", maxLength: 3 } },
      } }],
    }).tools[0];
    (server as unknown as { dynamicTools: Map<string, unknown> }).dynamicTools =
      new Map([[dynamicTool.name, dynamicTool]]);

    const unknown = await (server as unknown as {
      handleToolCall: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
    }).handleToolCall("missing_tool", {});
    const invalid = await (server as unknown as {
      handleToolCall: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
    }).handleToolCall("arinova_small", { value: "too long" });

    expect(parseTextResult(unknown)).toMatchObject({
      body: { error: { code: "UNKNOWN_TOOL" } },
      isError: true,
    });
    expect(parseTextResult(invalid)).toMatchObject({
      body: {
        action: "arinova.small",
        error: { code: "INVALID_ARGUMENTS" },
      },
      isError: true,
    });
    expect(fakeClient.callAction).not.toHaveBeenCalled();
  });

  it("detects and announces same-count tool-to-action rebindings", async () => {
    const oldTool = mapManifestToTools({
      manifestVersion: "1",
      actions: [{ name: "arinova.same.tool", version: "1", description: "Old action" }],
    }).tools[0];
    const newTool = {
      ...oldTool,
      description: "New action",
      actionName: "arinova_same_tool",
    };
    const mapping = {
      tools: [newTool],
      skippedActions: [],
    };
    const fakeClient = {
      loadManifest: vi.fn(async () => mapping),
      getManifestInfo: vi.fn(() => ({ state: "loaded" })),
      getHealthData: vi.fn(() => ({})),
      callAction: vi.fn(async (action: string) => ({
        callId: "call-rebound",
        action,
        status: "success",
        result: {},
      })),
      drain: vi.fn(),
      disconnect: vi.fn(),
    };
    const server = new ArinovaMcpServer(
      makeConfig(),
      fakeClient as unknown as ArinovaClient,
    );
    (server as unknown as { dynamicTools: Map<string, unknown> }).dynamicTools =
      new Map([[oldTool.name, oldTool]]);
    const sendToolListChanged = vi.fn(async () => {});
    (
      server as unknown as {
        server: { sendToolListChanged: () => Promise<void> };
      }
    ).server = { sendToolListChanged };

    const refresh = await (server as unknown as {
      handleToolCall: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
    }).handleToolCall("arinova_refresh_manifest", {});
    await (server as unknown as {
      handleToolCall: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
    }).handleToolCall("arinova_same_tool", {});

    expect(parseTextResult(refresh).body.toolListChanged).toBe(true);
    expect(sendToolListChanged).toHaveBeenCalledTimes(1);
    expect(fakeClient.callAction).toHaveBeenCalledWith(
      "arinova_same_tool",
      {},
      { timeoutMs: undefined },
      undefined,
    );
  });

  it("serves list and call handlers through a real MCP transport", async () => {
    const mapping = mapManifestToTools({
      manifestVersion: "1",
      actions: [{ name: "arinova.message.send", version: "1", inputSchema: {
        type: "object",
        required: ["content"],
        properties: { content: { type: "string" } },
      } }],
    });
    const fakeClient = {
      connect: vi.fn(async () => {}),
      getToolMapping: vi.fn(() => mapping),
      loadManifest: vi.fn(async () => mapping),
      getHealthData: vi.fn(() => ({ connection: "connected" })),
      getManifestInfo: vi.fn(() => ({})),
      callAction: vi.fn(async (action: string) => ({
        callId: "call-real",
        action,
        status: "success" as const,
        result: { sent: true },
      })),
      drain: vi.fn(),
      disconnect: vi.fn(),
    };
    const server = new ArinovaMcpServer(
      makeConfig(),
      fakeClient as unknown as ArinovaClient,
    );
    const client = new McpClient({ name: "vitest", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connectTransport(serverTransport),
      client.connect(clientTransport),
    ]);

    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toContain("arinova_message_send");
    const called = await client.callTool({
      name: "arinova_message_send",
      arguments: {
        content: "hello",
        _arinova: {
          callId: "call-option",
          taskId: "task-1",
          conversationId: "conversation-1",
          messageId: "message-1",
          parentCallId: "parent-1",
          reason: "integration test",
          metadata: { source: "vitest" },
          dryRun: true,
          timeoutMs: 222,
        },
      },
    });
    expect(JSON.parse((called.content[0] as { text: string }).text)).toMatchObject({
      ok: true,
      callId: "call-real",
      result: { sent: true },
    });
    expect(fakeClient.callAction).toHaveBeenCalledWith(
      "arinova.message.send",
      { content: "hello" },
      {
        callId: "call-option",
        taskId: "task-1",
        conversationId: "conversation-1",
        messageId: "message-1",
        parentCallId: "parent-1",
        reason: "integration test",
        metadata: { source: "vitest" },
        dryRun: true,
        timeoutMs: 222,
      },
      undefined,
    );
    await client.close();
    await server.shutdown();
  });

  it("registers handlers on the real stdio transport without logger stdout writes", async () => {
    const mapping = mapManifestToTools({ manifestVersion: "1", actions: [] });
    const fakeClient = {
      connect: vi.fn(async () => {}),
      getToolMapping: vi.fn(() => mapping),
      loadManifest: vi.fn(async () => mapping),
      getHealthData: vi.fn(() => ({ connection: "connected" })),
      getManifestInfo: vi.fn(() => ({})),
      callAction: vi.fn(),
      drain: vi.fn(async () => {}),
      disconnect: vi.fn(),
    };
    const server = new ArinovaMcpServer(
      makeConfig(),
      fakeClient as unknown as ArinovaClient,
    );
    const input = new PassThrough();
    const output = new PassThrough();
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const messages: Array<Record<string, unknown>> = [];
    let buffered = "";
    output.on("data", (chunk) => {
      buffered += chunk.toString();
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) if (line) messages.push(JSON.parse(line));
    });
    await server.connectTransport(new StdioServerTransport(input, output));
    input.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "stdio-vitest", version: "1" },
      },
    })}\n`);
    await vi.waitFor(() => expect(messages.some((message) => message.id === 1)).toBe(true));
    input.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
    await vi.waitFor(() => expect(messages.some((message) => message.id === 2)).toBe(true));
    const listed = messages.find((message) => message.id === 2) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(listed.result.tools.map((tool) => tool.name)).toEqual([
      "arinova_health",
      "arinova_refresh_manifest",
    ]);
    expect(stdout).not.toHaveBeenCalled();
    await server.shutdown();
  });
});
