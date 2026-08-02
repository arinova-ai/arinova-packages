import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import packageJson from "../package.json" with { type: "json" };
import { ArinovaAgent, ArinovaApiError } from "./client.js";

// Derive the expected version from package.json — the same single source of
// truth the SDK reads at runtime — so this assertion never drifts from the
// published package version again.
const PKG_VERSION = packageJson.version;
const TASK_CONTRACT_SOURCE = readFileSync(
  new URL("../../../contract-fixtures/agent-task-payload.json", import.meta.url),
  "utf8",
);
const TASK_CONTRACT = JSON.parse(TASK_CONTRACT_SOURCE) as {
  requiredKeys: string[];
  optionalKeys: string[];
  typedSdkKeys: string[];
};
const TASK_CONTRACT_SHA256 = "69825ac4ca4147f382ba7a4d21b54a2a738cc3861a00cae26f0ed5dd6d2f656e";

it("pins and preserves the shared server task-payload contract", () => {
  expect(createHash("sha256").update(TASK_CONTRACT_SOURCE).digest("hex")).toBe(TASK_CONTRACT_SHA256);
  const agent = new ArinovaAgent({ serverUrl: "ws://localhost:9999", botToken: "ari_test" });
  const a = agent as unknown as {
    handleTask: (data: Record<string, unknown>) => void;
  };
  let captured: Record<string, unknown> | undefined;
  agent.onTask((ctx) => { captured = ctx as unknown as Record<string, unknown>; });
  const payload = Object.fromEntries(
    [...TASK_CONTRACT.requiredKeys, ...TASK_CONTRACT.optionalKeys].map((key) => [key, null]),
  );
  Object.assign(payload, {
    type: "task",
    taskId: "task-1",
    conversationId: "conv-1",
    content: "hello",
    availableSkills: [],
  });
  a.handleTask(payload);
  expect(Object.keys(captured!.raw as Record<string, unknown>).sort())
    .toEqual([...TASK_CONTRACT.requiredKeys, ...TASK_CONTRACT.optionalKeys].sort());
  for (const key of TASK_CONTRACT.typedSdkKeys) {
    expect(captured).toHaveProperty(key);
  }
});

describe("API client request builders", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sendMessage falls back to HTTP with auth and JSON body when websocket is closed", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const agent = new ArinovaAgent({
      serverUrl: "wss://chat.example.test",
      botToken: "ari_bot_token",
    });

    await agent.sendMessage("conv-1", "Hello");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://chat.example.test/api/v1/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer ari_bot_token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ conversationId: "conv-1", content: "Hello" }),
        signal: expect.any(AbortSignal),
      },
    );
  });

  it("uses the injected logger and can be silenced", () => {
    const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    const agent = new ArinovaAgent({
      serverUrl: "wss://chat.example.test",
      botToken: "ari_bot_token",
      logger,
    });
    agent.disconnect();
    expect(logger.warn).toHaveBeenCalledWith("[arinova-agent-sdk] stopped: disconnect() called");
  });

  it("sendMessage includes backend error text in failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("invalid conversation", { status: 404 }),
    );
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:21001",
      botToken: "ari_bot_token",
    });

    await expect(agent.sendMessage("missing", "Hello")).rejects.toThrow(
      "sendMessage failed (404): invalid conversation",
    );
  });

  it("uploadFile posts multipart body with conversation id, file, and bearer auth", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "att-1",
          url: "/uploads/report.txt",
          fileName: "report.txt",
          fileType: "text/plain",
          fileSize: 5,
        }),
        { status: 200 },
      ),
    );
    const agent = new ArinovaAgent({
      serverUrl: "wss://chat.example.test/",
      botToken: "ari_bot_token",
    });

    const result = await agent.uploadFile(
      "conv-1",
      new Uint8Array([104, 101, 108, 108, 111]),
      "report.txt",
    );

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://chat.example.test/api/v1/files/upload");
    expect(options?.method).toBe("POST");
    expect(options?.headers).toEqual({ Authorization: "Bearer ari_bot_token" });
    const body = options?.body as FormData;
    expect(body.get("conversationId")).toBe("conv-1");
    const uploaded = body.get("file") as File;
    expect(uploaded.name).toBe("report.txt");
    expect(uploaded.type).toBe("text/plain");
    expect(result.url).toBe("/uploads/report.txt");
  });

  it("uploadFile surfaces backend error text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("file too large", { status: 413 }),
    );
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:21001",
      botToken: "ari_bot_token",
    });

    await expect(
      agent.uploadFile("conv-1", new Uint8Array([1]), "huge.bin"),
    ).rejects.toThrow("Upload failed (413): file too large");
  });

  it("rejects duplicate keys in successful REST JSON responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response('{"url":"/first","url":"/second","fileName":"x.txt","fileType":"text/plain","fileSize":1}'),
    );
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:21001",
      botToken: "ari_bot_token",
    });

    await expect(
      agent.uploadFile("conv-1", new Uint8Array([1]), "x.txt"),
    ).rejects.toThrow("uploadFile returned malformed JSON: JSON object contains duplicate key: url");
  });

  it("fetchHistory builds paginated request with bearer auth and returns backend metadata", async () => {
    const response = {
      messages: [
        {
          id: "msg-1",
          conversationId: "conv-1",
          seq: 7,
          role: "user",
          content: "hello",
          status: "completed",
          createdAt: "2026-06-10T00:00:00.000Z",
          updatedAt: "2026-06-10T00:00:01.000Z",
        },
      ],
      hasMore: true,
      nextCursor: "msg-1",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(response), { status: 200 }),
    );
    const agent = new ArinovaAgent({
      serverUrl: "wss://chat.example.test/",
      botToken: "ari_bot_token",
    });

    const result = await agent.fetchHistory("conv-1", {
      before: "msg-9",
      after: "msg-2",
      around: "msg-5",
      limit: 25,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://chat.example.test/api/v1/messages/conv-1?before=msg-9&after=msg-2&around=msg-5&limit=25",
      {
        method: "GET",
        headers: { Authorization: "Bearer ari_bot_token" },
        signal: expect.any(AbortSignal),
      },
    );
    expect(result).toEqual(response);
  });

  it("fetchHistory surfaces backend error text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("cursor expired", { status: 400 }),
    );
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:21001",
      botToken: "ari_bot_token",
    });

    await expect(
      agent.fetchHistory("conv-1", { before: "bad-cursor" }),
    ).rejects.toThrow("fetchHistory failed (400): cursor expired");
  });

  it("throws ArinovaApiError with status and parsed body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "No access" } }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const agent = new ArinovaAgent({
      serverUrl: "wss://chat.example.test",
      botToken: "ari_bot_token",
    });
    const promise = agent.listBoards();
    await expect(promise).rejects.toBeInstanceOf(ArinovaApiError);
    await expect(promise).rejects.toMatchObject({
      status: 403,
      body: { error: { code: "FORBIDDEN", message: "No access" } },
    });
  });

  it("maps queryMemory results and normalizes reported origins", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([
        {
          id: "m1",
          category: "preference",
          summary: "Uses dark mode",
          detail: "Always",
          score: 0.9,
          source: "shared-from-4A04A28F",
        },
        {
          id: "m2",
          category: "system",
          summary: "Seed",
          detail: null,
          score: 0.5,
          source: "system",
        },
      ]), { status: 200 }),
    );
    const agent = new ArinovaAgent({
      serverUrl: "wss://chat.example.test",
      botToken: "ari_bot_token",
    });
    await expect(agent.queryMemory({ query: "theme", limit: 2 })).resolves.toEqual([
      {
        content: "Uses dark mode\nAlways",
        category: "preference",
        score: 0.9,
        origin: "shared-from-4a04a28f",
      },
      { content: "Seed", category: "system", score: 0.5, origin: "system" },
    ]);
  });

  it("uses notebook-scoped note APIs without a fake conversation id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ notes: [], hasMore: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "n1", title: "Note" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messageId: "m1", noteId: "n1", title: "Note", preview: "Preview", tags: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const agent = new ArinovaAgent({
      serverUrl: "wss://chat.example.test",
      botToken: "ari_bot_token",
    });
    await agent.listNotes({ limit: 10 });
    await agent.createNote({ title: "Note" });
    await agent.deleteNote("n1");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://chat.example.test/api/v1/notes?limit=10",
      "https://chat.example.test/api/v1/notes",
      "https://chat.example.test/api/v1/notes/n1",
    ]);
  });

  it("keeps attacker-controlled identifiers inside one encoded URL segment", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(JSON.stringify({ id: "ok" }), { status: 200 }));
    const agent = new ArinovaAgent({
      serverUrl: "wss://chat.example.test",
      botToken: "ari_bot_token",
    });

    await agent.updateNote("../kanban/cards/card-1", { title: "safe" });
    await agent.updateCard("card/../../notes/secret", { title: "safe" });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://chat.example.test/api/v1/notes/%2E%2E%2Fkanban%2Fcards%2Fcard-1",
      "https://chat.example.test/api/v1/kanban/cards/card%2F%2E%2E%2F%2E%2E%2Fnotes%2Fsecret",
    ]);
    await expect(agent.deleteNote("..")).rejects.toThrow(
      "noteId must be a non-empty URL path segment",
    );
  });

  it("builds the complete boards, columns, cards, labels, and skill REST surface", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init = {}) => {
      const url = String(input);
      calls.push({ url, init });
      const method = init.method ?? "GET";
      const isVoid =
        method === "DELETE" ||
        url.endsWith("/archive") ||
        url.endsWith("/columns/reorder") ||
        (method === "POST" && (url.endsWith("/notes") || url.endsWith("/labels")));
      return isVoid
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(method === "GET" ? [] : {}), { status: 200 });
    });
    const agent = new ArinovaAgent({
      serverUrl: "wss://chat.example.test",
      botToken: "ari_bot_token",
    });

    await agent.listBoards();
    await agent.createBoard({ name: "Roadmap" });
    await agent.updateBoard("board/1", { name: "Plan" });
    await agent.archiveBoard("board/1");
    await agent.listColumns("board/1");
    await agent.createColumn("board/1", { name: "Todo" });
    await agent.updateColumn("column/1", { name: "Doing" });
    await agent.deleteColumn("column/1");
    await agent.reorderColumns("board/1", ["column/1"]);
    await agent.listCards({ search: "hello world", limit: 5, offset: 2 });
    await agent.createCard({ title: "Card" });
    await agent.updateCard("card/1", { title: "Updated" });
    await agent.completeCard("card/1");
    await agent.listArchivedCards("board/1", { page: 2, limit: 5 });
    await agent.addCardCommit("card/1", { commitHash: "abc123" });
    await agent.listCardCommits("card/1");
    await agent.linkCardNote("card/1", "note/1");
    await agent.unlinkCardNote("card/1", "note/1");
    await agent.listCardNotes("card/1");
    await agent.listLabels("board/1");
    await agent.createLabel("board/1", { name: "Urgent" });
    await agent.updateLabel("label/1", { name: "Later" });
    await agent.deleteLabel("label/1");
    await agent.addCardLabel("card/1", "label/1");
    await agent.removeCardLabel("card/1", "label/1");
    await agent.fetchSkillPrompt("draw/../safe");

    expect(calls).toHaveLength(26);
    expect(calls.map(({ url, init }) => `${init.method} ${url}`)).toContain(
      "GET https://chat.example.test/api/v1/skills/draw%2F%2E%2E%2Fsafe/prompt",
    );
    expect(calls.map(({ url }) => url).every((url) => !url.includes("/../"))).toBe(true);
    await expect(agent.fetchSkillPrompt("..")).rejects.toThrow(
      "skillSlug must be a non-empty URL path segment",
    );
  });

  it("wraps network failures and supports bounded timeout and retry options", async () => {
    const agent = new ArinovaAgent({
      serverUrl: "wss://chat.example.test",
      botToken: "ari_bot_token",
    });
    const request = (agent as unknown as {
      request: <T>(method: string, path: string, options: Record<string, unknown>) => Promise<T>;
    }).request.bind(agent);

    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("network down"));
    await expect(request("GET", "/network", { errorLabel: "Network" }))
      .rejects.toMatchObject({
        name: "ArinovaApiError",
        status: 0,
        message: expect.stringContaining("network down"),
      });

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response("busy", {
        status: 503,
        headers: { "Retry-After": "0" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    await expect(request<{ ok: boolean }>("GET", "/retry", { retries: 1 }))
      .resolves.toEqual({ ok: true });

    vi.mocked(globalThis.fetch).mockImplementationOnce(async (_input, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener(
        "abort",
        () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      )),
    );
    await expect(request("GET", "/timeout", { timeoutMs: 5 }))
      .rejects.toMatchObject({ status: 0, message: expect.stringContaining("timed out") });
  });
});

// ── Per-conversation queue tests (real ArinovaAgent) ─────────

describe("per-conversation task queue", () => {
  // Helper: create an ArinovaAgent and access internals via `any` cast
  function createAgent(maxQueuedTasks = 100) {
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:9999",
      botToken: "ari_test",
      concurrencyMode: "per-conversation",
      maxQueuedTasks,
    });
    const a = agent as unknown as {
      taskHandler: ((ctx: unknown) => Promise<void>) | null;
      handleTask: (data: Record<string, unknown>) => void;
      cleanup: () => void;
      cleanupForReconnect: () => void;
      flushPendingChunkEvents: () => void;
      flushPendingTerminalEvents: () => void;
      sendChunkEvent: (event: Record<string, unknown>) => void;
      activeConversationTasks: Map<string, string>;
      conversationQueues: Map<string, Array<Record<string, unknown>>>;
      taskAbortControllers: Map<string, AbortController>;
      pendingChunkEvents: Array<Record<string, unknown>>;
      pendingTerminalEvents: Array<Record<string, unknown>>;
      ws: { readyState: number; send: ReturnType<typeof vi.fn> } | null;
      send: (event: Record<string, unknown>) => void;
      pendingActionCalls: Map<string, unknown>;
      authenticated: boolean;
    };
    // Stub send() — no real WS
    a.send = vi.fn();
    return { agent, a };
  }

  // Dummy handler that blocks until signal is aborted (simulates long-running task)
  const blockingHandler = async (ctx: { signal: AbortSignal }) => {
    await new Promise<void>((resolve) => {
      if (ctx.signal.aborted) { resolve(); return; }
      ctx.signal.addEventListener("abort", () => resolve(), { once: true });
    });
  };

  it("same conversation queues second task instead of executing", () => {
    const { a } = createAgent();
    a.taskHandler = blockingHandler as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "t1", conversationId: "conv-A", content: "first" });
    a.handleTask({ taskId: "t2", conversationId: "conv-A", content: "second" });

    expect(a.taskAbortControllers.has("t1")).toBe(true);
    expect(a.taskAbortControllers.has("t2")).toBe(false); // queued, not started
    expect(a.conversationQueues.get("conv-A")?.length).toBe(1);
  });

  it("forwards agent-sender identity (senderAgentId/senderAgentName) to the task context", () => {
    const { a } = createAgent();
    let captured: Record<string, unknown> | null = null;
    a.taskHandler = (async (ctx: Record<string, unknown>) => {
      captured = ctx;
    }) as unknown as typeof a.taskHandler;

    a.handleTask({
      taskId: "t1",
      conversationId: "conv-A",
      content: "hi",
      senderUsername: "ripple0129",
      senderAgentId: "agent-linda",
      senderAgentName: "Linda",
      availableSkills: [{ slug: "draw", name: "Draw", slashCommand: "/draw", description: "Draw an image" }],
      agentMemories: [{ summary: "raw memory" }],
      metadata: { chainDepth: 2 },
    });

    expect(captured).not.toBeNull();
    // Agent identity is forwarded so the consumer can attribute the real sender
    expect(captured!.senderAgentId).toBe("agent-linda");
    expect(captured!.senderAgentName).toBe("Linda");
    // Human fields still pass through unchanged
    expect(captured!.senderUsername).toBe("ripple0129");
    expect(captured!.availableSkills).toEqual([
      { slug: "draw", name: "Draw", slashCommand: "/draw", description: "Draw an image" },
    ]);
    expect(captured!.raw).toMatchObject({
      agentMemories: [{ summary: "raw memory" }],
      metadata: { chainDepth: 2 },
    });
  });

  it("different conversations run in parallel", () => {
    const { a } = createAgent();
    a.taskHandler = blockingHandler as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "t1", conversationId: "conv-A", content: "a" });
    a.handleTask({ taskId: "t2", conversationId: "conv-B", content: "b" });

    expect(a.taskAbortControllers.has("t1")).toBe(true);
    expect(a.taskAbortControllers.has("t2")).toBe(true);
    expect(a.activeConversationTasks.size).toBe(2);
  });

  it("processNextTask dequeues after sendComplete", () => {
    const { a } = createAgent();
    let savedCtx: { sendComplete: (s: string) => void } | null = null;
    a.taskHandler = (async (ctx: { sendComplete: (s: string) => void }) => {
      savedCtx = ctx;
    }) as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "t1", conversationId: "conv-A", content: "first" });
    a.handleTask({ taskId: "t2", conversationId: "conv-A", content: "second" });

    expect(a.activeConversationTasks.get("conv-A")).toBe("t1");
    expect(a.conversationQueues.get("conv-A")?.length).toBe(1);

    // Complete t1 — should auto-start t2
    savedCtx!.sendComplete("done");
    expect(a.activeConversationTasks.get("conv-A")).toBe("t2");
    expect(a.conversationQueues.has("conv-A")).toBe(false);
  });

  it("cancel queued task removes from queue without aborting active", () => {
    const { a } = createAgent();
    a.taskHandler = blockingHandler as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "t1", conversationId: "conv-A", content: "first" });
    a.handleTask({ taskId: "t2", conversationId: "conv-A", content: "second" });
    a.handleTask({ taskId: "t3", conversationId: "conv-A", content: "third" });

    // Simulate cancel_task for queued t2
    const queue = a.conversationQueues.get("conv-A")!;
    const idx = queue.findIndex((t) => t.taskId === "t2");
    queue.splice(idx, 1);

    expect(a.conversationQueues.get("conv-A")?.length).toBe(1);
    expect(a.taskAbortControllers.has("t1")).toBe(true); // active untouched
  });

  it("cleanup aborts active tasks and does NOT start queued tasks", () => {
    const { a } = createAgent();
    const handlerCalls: string[] = [];
    a.taskHandler = (async (ctx: { taskId: string }) => {
      handlerCalls.push(ctx.taskId);
      // Block forever
      await new Promise(() => {});
    }) as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "t1", conversationId: "conv-A", content: "a" });
    a.handleTask({ taskId: "t2", conversationId: "conv-A", content: "b" });

    expect(handlerCalls).toEqual(["t1"]); // only t1 started

    const c1 = a.taskAbortControllers.get("t1")!;
    a.cleanup();

    expect(c1.signal.aborted).toBe(true);
    expect(a.taskAbortControllers.size).toBe(0);
    expect(a.activeConversationTasks.size).toBe(0);
    expect(a.conversationQueues.size).toBe(0);
    // Critical: t2 should NOT have been started by cleanup's abort
    expect(handlerCalls).toEqual(["t1"]);
  });

  it("full cleanup clears buffered chunks and terminal events", () => {
    const { a } = createAgent();
    a.pendingChunkEvents.push({ type: "agent_chunk", taskId: "stale", chunk: "stale chunk" });
    a.pendingTerminalEvents.push({ type: "agent_complete", taskId: "stale", content: "stale done" });

    a.cleanup();

    expect(a.pendingChunkEvents).toEqual([]);
    expect(a.pendingTerminalEvents).toEqual([]);
  });

  it("reconnect cleanup preserves active tasks and queued work", () => {
    const { a } = createAgent();
    const handlerCalls: string[] = [];
    a.taskHandler = (async (ctx: { taskId: string }) => {
      handlerCalls.push(ctx.taskId);
      await new Promise(() => {});
    }) as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "t1", conversationId: "conv-A", content: "a" });
    a.handleTask({ taskId: "t2", conversationId: "conv-A", content: "b" });

    const c1 = a.taskAbortControllers.get("t1")!;
    a.cleanupForReconnect();

    expect(c1.signal.aborted).toBe(false);
    expect(a.taskAbortControllers.has("t1")).toBe(true);
    expect(a.activeConversationTasks.get("conv-A")).toBe("t1");
    expect(a.conversationQueues.get("conv-A")?.[0]?.taskId).toBe("t2");
    expect(handlerCalls).toEqual(["t1"]);
  });

  it("task callAction sends attributed action_call and resolves action_result", async () => {
    const { a } = createAgent();
    let savedCtx: {
      callAction: (action: string, args: Record<string, unknown>) => Promise<unknown>;
    } | null = null;
    a.taskHandler = (async (ctx: typeof savedCtx) => {
      savedCtx = ctx;
    }) as unknown as typeof a.taskHandler;

    const wireSend = vi.fn();
    a.ws = { readyState: 1, send: wireSend };
    a.authenticated = true;
    a.handleTask({ taskId: "task-1", conversationId: "conv-A", content: "a" });

    const promise = savedCtx!.callAction("arinova.kanban.create_card", { title: "Hello" });
    const frame = JSON.parse(wireSend.mock.calls[0][0]);
    expect(frame).toMatchObject({
      type: "action_call",
      action: "arinova.kanban.create_card",
      arguments: { title: "Hello" },
      taskId: "task-1",
      conversationId: "conv-A",
      messageId: "task-1",
    });

    a.handleActionResult({
      type: "action_result",
      id: frame.id,
      action: "arinova.kanban.create_card",
      status: "success",
      result: { cardId: "card-1" },
      traceId: "trace-1",
    });

    await expect(promise).resolves.toMatchObject({
      callId: frame.id,
      action: "arinova.kanban.create_card",
      status: "success",
      result: { cardId: "card-1" },
      traceId: "trace-1",
    });
  });

  it("buffers terminal events while disconnected and flushes after reconnect", () => {
    const { a } = createAgent();
    let savedCtx: { sendComplete: (content: string) => void } | null = null;
    a.taskHandler = (async (ctx: { sendComplete: (content: string) => void }) => {
      savedCtx = ctx;
    }) as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "t1", conversationId: "conv-A", content: "a" });
    savedCtx!.sendComplete("done while offline");

    expect(a.pendingTerminalEvents).toEqual([
      { type: "agent_complete", taskId: "t1", content: "done while offline" },
    ]);

    const send = vi.fn();
    a.ws = { readyState: 1, send };
    a.authenticated = true;
    a.flushPendingTerminalEvents();

    expect(send).toHaveBeenCalledWith(JSON.stringify({
      type: "agent_complete",
      taskId: "t1",
      content: "done while offline",
    }));
    expect(a.pendingTerminalEvents).toEqual([]);
  });

  it("buffers chunks while disconnected and flushes them before terminal events", () => {
    const { a } = createAgent();
    let savedCtx: {
      sendChunk: (delta: string) => void;
      sendComplete: (content: string) => void;
    } | null = null;
    a.taskHandler = (async (ctx: {
      sendChunk: (delta: string) => void;
      sendComplete: (content: string) => void;
    }) => {
      savedCtx = ctx;
    }) as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "t1", conversationId: "conv-A", content: "a" });
    savedCtx!.sendChunk("hello ");
    savedCtx!.sendChunk("world");
    savedCtx!.sendComplete("hello world");

    expect(a.pendingChunkEvents).toEqual([
      { type: "agent_chunk", taskId: "t1", chunk: "hello " },
      { type: "agent_chunk", taskId: "t1", chunk: "world" },
    ]);
    expect(a.pendingTerminalEvents).toEqual([
      { type: "agent_complete", taskId: "t1", content: "hello world" },
    ]);

    const send = vi.fn();
    a.ws = { readyState: 1, send };
    a.authenticated = true;
    a.flushPendingChunkEvents();
    a.flushPendingTerminalEvents();

    expect(send.mock.calls.map(([payload]) => JSON.parse(payload))).toEqual([
      { type: "agent_chunk", taskId: "t1", chunk: "hello " },
      { type: "agent_chunk", taskId: "t1", chunk: "world" },
      { type: "agent_complete", taskId: "t1", content: "hello world" },
    ]);
    expect(a.pendingChunkEvents).toEqual([]);
    expect(a.pendingTerminalEvents).toEqual([]);
  });

  it("caps offline chunks and discards chunks older than reconnect grace", () => {
    const { a } = createAgent();
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    for (let i = 0; i < 1_005; i++) {
      a.sendChunkEvent({ type: "agent_chunk", taskId: "t1", chunk: String(i) });
    }
    expect(a.pendingChunkEvents).toHaveLength(1_000);
    expect(a.pendingChunkEvents[0]?.chunk).toBe("5");

    now.mockReturnValue(60_001);
    const send = vi.fn();
    a.ws = { readyState: 1, send };
    a.authenticated = true;
    a.flushPendingChunkEvents();
    expect(send.mock.calls.map(([payload]) => JSON.parse(payload))).toEqual([{
      type: "agent_stream_gap",
      taskId: "t1",
      reason: "offline_chunk_buffer_expired",
    }]);
    expect(a.pendingChunkEvents).toEqual([]);
  });

  it("re-buffers unsent chunk and terminal events when a flush write fails", () => {
    const { a } = createAgent();
    a.sendChunkEvent({ type: "agent_chunk", taskId: "t1", chunk: "one" });
    a.pendingTerminalEvents.push({ type: "agent_complete", taskId: "t1", content: "one" });
    a.authenticated = true;
    a.ws = { readyState: 1, send: vi.fn(() => { throw new Error("wire failed"); }) };
    expect(() => a.flushPendingChunkEvents()).toThrow("wire failed");
    expect(a.pendingChunkEvents).toHaveLength(1);

    a.ws = { readyState: 1, send: vi.fn(() => { throw new Error("wire failed"); }) };
    expect(() => a.flushPendingTerminalEvents()).toThrow("wire failed");
    expect(a.pendingTerminalEvents).toHaveLength(1);
  });

  it("reports action progress and tool calls synchronously", () => {
    const { agent, a } = createAgent();
    expect(agent.reportToolCall({
      sessionId: "s1",
      turnId: "turn-1",
      seqOrder: 0,
      toolName: "search",
      input: {},
      success: true,
    })).toBeUndefined();
    agent.reportActionProgress("call-1", "arinova.search", { percent: 50 }, {
      taskId: "t1",
      conversationId: "conv-A",
    });
    expect(a.send).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: "tool_call_report" }));
    expect(a.send).toHaveBeenNthCalledWith(2, {
      type: "action_progress",
      id: "call-1",
      action: "arinova.search",
      progress: { percent: 50 },
      taskId: "t1",
      conversationId: "conv-A",
    });
  });

  it("rolls back action calls on send errors, timeout, and disconnect", async () => {
    vi.useFakeTimers();
    const first = createAgent();
    first.a.ws = { readyState: 1, send: vi.fn(() => { throw new Error("send failed"); }) };
    first.a.authenticated = true;
    await expect(first.agent.callAction("bad.send", {}, { callId: "c1" })).rejects.toThrow("send failed");
    expect(first.a.pendingActionCalls.size).toBe(0);

    const second = createAgent();
    second.a.ws = { readyState: 1, send: vi.fn() };
    second.a.authenticated = true;
    const timedOut = second.agent.callAction("slow", {}, { callId: "c2", timeoutMs: 10 });
    const timedOutExpectation = expect(timedOut).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(10);
    await timedOutExpectation;
    expect(second.a.pendingActionCalls.size).toBe(0);

    const third = createAgent();
    third.a.ws = { readyState: 1, send: vi.fn() };
    third.a.authenticated = true;
    const reconnecting = third.agent.callAction("waiting", {}, { callId: "c3" });
    third.a.cleanupForReconnect();
    await expect(reconnecting).rejects.toThrow(/cancelled by connection lost/);

    const fourth = createAgent();
    fourth.a.ws = { readyState: 1, send: vi.fn() };
    fourth.a.authenticated = true;
    const disconnected = fourth.agent.callAction("waiting", {}, { callId: "c4" });
    fourth.a.cleanup();
    await expect(disconnected).rejects.toThrow(/cancelled by disconnect/);
    vi.useRealTimers();
  });

  it("abort emits agent_error with reason:cancelled so rust-server can broadcast stream_end", () => {
    const { a } = createAgent();
    a.taskHandler = blockingHandler as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "t1", conversationId: "conv-A", content: "hello" });

    const c1 = a.taskAbortControllers.get("t1")!;
    c1.abort();

    expect(a.pendingTerminalEvents).toContainEqual({
      type: "agent_error",
      taskId: "t1",
      error: "cancelled",
      reason: "cancelled",
    });
  });

  it("queue overflow rejects the incoming task at maxQueuedTasks", () => {
    const { a } = createAgent(10);
    a.taskHandler = blockingHandler as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "t0", conversationId: "conv-A", content: "active" });

    // Fill queue to the configured maxQueuedTasks.
    for (let i = 1; i <= 10; i++) {
      a.handleTask({ taskId: `t${i}`, conversationId: "conv-A", content: `msg${i}` });
    }
    expect(a.conversationQueues.get("conv-A")?.length).toBe(10);

    // Push one more — it is rejected without disturbing queued work.
    a.handleTask({ taskId: "t11", conversationId: "conv-A", content: "overflow" });
    expect(a.conversationQueues.get("conv-A")?.length).toBe(10);

    const queue = a.conversationQueues.get("conv-A")!;
    expect(queue[0].taskId).toBe("t1");
    expect(queue[queue.length - 1].taskId).toBe("t10");

    // Verify overflow error was sent
    expect(a.send).toHaveBeenCalledWith({ type: "agent_error", taskId: "t11", error: "queue_overflow" });
  });

  it("rejects invalid tasks, missing handlers, duplicates, and maxQueuedTasks zero", () => {
    const missingHandler = createAgent();
    missingHandler.a.handleTask({ taskId: "t1", conversationId: "conv-1", content: "hello" });
    expect(missingHandler.a.send).toHaveBeenCalledWith({
      type: "agent_error", taskId: "t1", error: "no_task_handler",
    });
    missingHandler.a.handleTask({ conversationId: "conv-1", content: "hello" });
    expect(missingHandler.a.send).toHaveBeenCalledWith({
      type: "agent_error", error: "missing_task_id",
    });

    const guarded = createAgent(0);
    const handled: string[] = [];
    guarded.a.taskHandler = (async (ctx: { taskId: string }) => {
      handled.push(ctx.taskId);
      await new Promise(() => {});
    }) as unknown as typeof guarded.a.taskHandler;
    guarded.a.handleTask({ taskId: "missing-content", conversationId: "conv-1" });
    guarded.a.handleTask({ taskId: "active", conversationId: "conv-1", content: "one" });
    guarded.a.handleTask({ taskId: "active", conversationId: "conv-1", content: "duplicate" });
    guarded.a.handleTask({ taskId: "queued", conversationId: "conv-1", content: "two" });
    expect(handled).toEqual(["active"]);
    expect(guarded.a.send).toHaveBeenCalledWith({
      type: "agent_error", taskId: "missing-content", error: "missing_content",
    });
    expect(guarded.a.send).toHaveBeenCalledWith({
      type: "agent_error", taskId: "queued", error: "queue_overflow",
    });
  });
});

// ── agent-wide queue tests (real ArinovaAgent) ───────────────

describe("agent-wide task queue", () => {
  function createAgentWide(maxConsecutive = 2, maxQueuedTasks = 100) {
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:9999",
      botToken: "ari_test",
      concurrencyMode: "agent-wide",
      maxConsecutivePerConversation: maxConsecutive,
      maxQueuedTasks,
    });
    const a = agent as unknown as {
      taskHandler: ((ctx: unknown) => Promise<void>) | null;
      handleTask: (data: Record<string, unknown>) => void;
      activeConversationTasks: Map<string, string>;
      conversationQueues: Map<string, Array<Record<string, unknown>>>;
      taskAbortControllers: Map<string, AbortController>;
      send: (event: Record<string, unknown>) => void;
    };
    a.send = vi.fn();
    return { agent, a };
  }

  const blockingHandler = async (ctx: { signal: AbortSignal }) => {
    await new Promise<void>((resolve) => {
      if (ctx.signal.aborted) { resolve(); return; }
      ctx.signal.addEventListener("abort", () => resolve(), { once: true });
    });
  };

  it("uses agent-wide serialization by default", () => {
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:9999",
      botToken: "ari_test",
    });
    const a = agent as unknown as {
      taskHandler: ((ctx: unknown) => Promise<void>) | null;
      handleTask: (data: Record<string, unknown>) => void;
      taskAbortControllers: Map<string, AbortController>;
      conversationQueues: Map<string, Array<Record<string, unknown>>>;
      send: ReturnType<typeof vi.fn>;
    };
    a.send = vi.fn();
    a.taskHandler = blockingHandler as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "a1", conversationId: "conv-A", content: "first" });
    a.handleTask({ taskId: "b1", conversationId: "conv-B", content: "second" });

    expect([...a.taskAbortControllers.keys()]).toEqual(["a1"]);
    expect(a.conversationQueues.get("conv-B")?.map((task) => task.taskId)).toEqual(["b1"]);
  });

  it("caps aggregate queued tasks across distinct conversations", () => {
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:9999",
      botToken: "ari_test",
      maxQueuedTasks: 3,
    });
    const a = agent as unknown as {
      taskHandler: ((ctx: unknown) => Promise<void>) | null;
      handleTask: (data: Record<string, unknown>) => void;
      conversationQueues: Map<string, Array<Record<string, unknown>>>;
      send: ReturnType<typeof vi.fn>;
    };
    a.send = vi.fn();
    a.taskHandler = blockingHandler as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "active", conversationId: "conv-active", content: "" });
    for (let index = 1; index <= 4; index++) {
      a.handleTask({
        taskId: `queued-${index}`,
        conversationId: `conv-${index}`,
        content: "",
      });
    }

    expect([...a.conversationQueues.values()].flat()).toHaveLength(3);
    expect(a.conversationQueues.has("conv-4")).toBe(false);
    expect(a.send).toHaveBeenCalledWith({
      type: "agent_error",
      taskId: "queued-4",
      error: "queue_overflow",
    });
  });

  it("cross-conv second task queues instead of running in parallel", () => {
    const { a } = createAgentWide();
    a.taskHandler = blockingHandler as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "a1", conversationId: "conv-A", content: "first" });
    a.handleTask({ taskId: "b1", conversationId: "conv-B", content: "second" });

    // Under the agent-wide lock, b1 on a different conv still queues
    // instead of starting in parallel — the Gina-regression fix.
    expect(a.taskAbortControllers.has("a1")).toBe(true);
    expect(a.taskAbortControllers.has("b1")).toBe(false);
    expect(a.conversationQueues.get("conv-B")?.length).toBe(1);
    expect(a.activeConversationTasks.size).toBe(1);
  });

  it("does not starve a third conv when A/B have perpetual backlog", () => {
    const { a } = createAgentWide(2);
    const ctxQueue: Array<{ taskId: string; sendComplete: (s: string) => void }> = [];
    a.taskHandler = (async (ctx: { taskId: string; sendComplete: (s: string) => void }) => {
      ctxQueue.push(ctx);
    }) as unknown as typeof a.taskHandler;

    // Seed: a1 runs immediately; a2/a3 queue on A, b1/b2 queue on B, c1 on C.
    a.handleTask({ taskId: "a1", conversationId: "conv-A", content: "" });
    a.handleTask({ taskId: "a2", conversationId: "conv-A", content: "" });
    a.handleTask({ taskId: "a3", conversationId: "conv-A", content: "" });
    a.handleTask({ taskId: "b1", conversationId: "conv-B", content: "" });
    a.handleTask({ taskId: "b2", conversationId: "conv-B", content: "" });
    a.handleTask({ taskId: "c1", conversationId: "conv-C", content: "" });

    // Drive completions and keep A/B backlog alive with one fresh arrival
    // each per iteration — this is the condition that causes A↔B ping-pong
    // in the buggy version, starving c1 indefinitely.
    const finished: string[] = [];
    let nextA = 4;
    let nextB = 3;
    for (let i = 0; i < 15; i++) {
      const ctx = ctxQueue.shift();
      if (!ctx) break;
      finished.push(ctx.taskId);
      ctx.sendComplete("");
      if (finished.includes("c1")) break;
      a.handleTask({ taskId: `a${nextA++}`, conversationId: "conv-A", content: "" });
      a.handleTask({ taskId: `b${nextB++}`, conversationId: "conv-B", content: "" });
    }

    expect(finished).toContain("c1");
  });

  it("task_queued emitted on queue push with correct queuePosition (and overflow path)", () => {
    const { a } = createAgentWide(2, 10);
    a.taskHandler = blockingHandler as unknown as typeof a.taskHandler;

    // t0 starts running; t1..t10 queue (queuePosition 0..9).
    a.handleTask({ taskId: "t0", conversationId: "conv-A", content: "" });
    for (let i = 1; i <= 10; i++) {
      a.handleTask({ taskId: `t${i}`, conversationId: "conv-A", content: "" });
    }

    expect(a.send).toHaveBeenCalledWith({ type: "task_queued", taskId: "t1", conversationId: "conv-A", queuePosition: 0, globalQueueSize: 1 });
    expect(a.send).toHaveBeenCalledWith({ type: "task_queued", taskId: "t5", conversationId: "conv-A", queuePosition: 4, globalQueueSize: 5 });
    expect(a.send).toHaveBeenCalledWith({ type: "task_queued", taskId: "t10", conversationId: "conv-A", queuePosition: 9, globalQueueSize: 10 });

    // Overflow: pushing t11 rejects the incoming task and preserves the queue.
    a.handleTask({ taskId: "t11", conversationId: "conv-A", content: "" });
    expect(a.send).toHaveBeenCalledWith({ type: "agent_error", taskId: "t11", error: "queue_overflow" });
    expect(a.conversationQueues.get("conv-A")?.length).toBe(10);
  });

  it("task_queued globalQueueSize spans multiple conversations", () => {
    const { a } = createAgentWide();
    a.taskHandler = blockingHandler as unknown as typeof a.taskHandler;

    // a1 runs, a2 queues under conv-A, b1 queues under conv-B.
    a.handleTask({ taskId: "a1", conversationId: "conv-A", content: "" });
    a.handleTask({ taskId: "a2", conversationId: "conv-A", content: "" });
    a.handleTask({ taskId: "b1", conversationId: "conv-B", content: "" });

    // a2 push — only a2 queued → globalQueueSize=1, queuePosition=0 (first in conv-A).
    expect(a.send).toHaveBeenCalledWith({ type: "task_queued", taskId: "a2", conversationId: "conv-A", queuePosition: 0, globalQueueSize: 1 });
    // b1 push — a2 in conv-A + b1 in conv-B → globalQueueSize=2, queuePosition=0 (first in conv-B).
    expect(a.send).toHaveBeenCalledWith({ type: "task_queued", taskId: "b1", conversationId: "conv-B", queuePosition: 0, globalQueueSize: 2 });
  });
});

describe("task execution modes", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("runs unbounded tasks concurrently", () => {
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:9999",
      botToken: "ari_test",
      concurrencyMode: "unbounded",
    });
    const a = agent as unknown as {
      handleTask: (data: Record<string, unknown>) => void;
      taskAbortControllers: Map<string, AbortController>;
      send: ReturnType<typeof vi.fn>;
    };
    a.send = vi.fn();
    agent.onTask(async () => await new Promise(() => {}));
    a.handleTask({ taskId: "t1", conversationId: "conv-1", content: "one" });
    a.handleTask({ taskId: "t2", conversationId: "conv-1", content: "two" });
    expect([...a.taskAbortControllers.keys()]).toEqual(["t1", "t2"]);
  });

  it("turns handler exceptions into agent_error", async () => {
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:9999",
      botToken: "ari_test",
    });
    const a = agent as unknown as {
      handleTask: (data: Record<string, unknown>) => void;
      pendingTerminalEvents: Array<Record<string, unknown>>;
    };
    agent.onTask(() => { throw new Error("handler exploded"); });
    a.handleTask({ taskId: "t1", conversationId: "conv-1", content: "one" });
    await Promise.resolve();
    await Promise.resolve();
    expect(a.pendingTerminalEvents).toContainEqual({
      type: "agent_error",
      taskId: "t1",
      error: "handler exploded",
    });
  });

  it("emits a per-task heartbeat every 60 seconds", () => {
    vi.useFakeTimers();
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:9999",
      botToken: "ari_test",
    });
    const a = agent as unknown as {
      handleTask: (data: Record<string, unknown>) => void;
      send: ReturnType<typeof vi.fn>;
    };
    a.send = vi.fn();
    agent.onTask(async () => await new Promise(() => {}));
    a.handleTask({ taskId: "t1", conversationId: "conv-1", content: "one" });
    vi.advanceTimersByTime(60_000);
    expect(a.send).toHaveBeenCalledWith({ type: "agent_heartbeat", taskId: "t1" });
  });
});

// ── Auth retry state machine tests ───────────────────────────

describe("auth retry state machine", () => {
  function createAgent() {
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:9999",
      botToken: "ari_test",
    });
    const a = agent as unknown as {
      handleAuthError: (rawError: unknown) => void;
      doConnect: () => void;
      stopped: boolean;
      authErrorCount: number;
      authRetryAttempt: number;
      authRetryTimer: ReturnType<typeof setTimeout> | null;
      connectReject: ((error: Error) => void) | null;
    };
    a.doConnect = vi.fn();
    return { agent, a };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not stop or count server-unreachable auth timeouts after 5 retries", () => {
    const { a } = createAgent();

    for (let i = 0; i < 5; i++) {
      a.handleAuthError("Authentication timeout");
    }

    expect(a.stopped).toBe(false);
    expect(a.authErrorCount).toBe(0);
    expect(a.authRetryAttempt).toBe(5);
    expect(a.authRetryTimer).not.toBeNull();
  });

  it("rejects connect and emits auth_failed after 5 real auth errors", () => {
    const { agent, a } = createAgent();
    const reject = vi.fn();
    const authFailed = vi.fn();
    a.connectReject = reject;
    agent.on("auth_failed", authFailed);

    for (let i = 0; i < 5; i++) {
      a.handleAuthError("Invalid bot token");
    }

    expect(a.authErrorCount).toBe(5);
    expect(a.stopped).toBe(true);
    expect(a.authRetryTimer).toBeNull();
    expect(reject).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Invalid bot token") }));
    expect(authFailed).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(a.doConnect).not.toHaveBeenCalled();
  });

  it("counts only real auth errors when retryable server errors are mixed in", () => {
    const { a } = createAgent();

    a.handleAuthError("Authentication timeout");
    a.handleAuthError("Invalid bot token");
    a.handleAuthError("503 Service Unavailable");
    a.handleAuthError("Bot token revoked");
    a.handleAuthError("Gateway timeout");

    expect(a.authRetryAttempt).toBe(5);
    expect(a.authErrorCount).toBe(2);
    expect(a.stopped).toBe(false);
    expect(a.authRetryTimer).not.toBeNull();
  });
});

// ── Pong watchdog tests ──────────────────────────────────────

describe("pong watchdog", () => {
  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    static instances: MockWebSocket[] = [];

    readyState = MockWebSocket.OPEN;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string | ArrayBuffer | Blob }) => void | Promise<void>) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED;
    });

    constructor(public readonly url: string) {
      MockWebSocket.instances.push(this);
    }
  }

  function createAgent(maxInboundFrameBytes?: number) {
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:9999",
      botToken: "ari_test",
      pingInterval: 1_000,
      pingTimeout: 2_500,
      maxInboundFrameBytes,
    });
    const a = agent as unknown as {
      cleanup: () => void;
      doConnect: () => void;
      ws: MockWebSocket | null;
      reconnectTimer: ReturnType<typeof setTimeout> | null;
    };
    return { agent, a };
  }

  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normal ping/pong does not force close", () => {
    const { a } = createAgent();
    a.doConnect();

    const ws = MockWebSocket.instances[0];
    ws.onopen?.();

    vi.advanceTimersByTime(1_000);
    ws.onmessage?.({ data: JSON.stringify({ type: "pong" }) });

    vi.advanceTimersByTime(1_000);
    expect(ws.close).not.toHaveBeenCalled();

    a.cleanup();
  });

  it("closes oversized inbound frames before JSON parsing", async () => {
    const { agent, a } = createAgent(32);
    const errors: Error[] = [];
    agent.on("error", (error) => errors.push(error));
    a.doConnect();
    const ws = MockWebSocket.instances[0];

    await ws.onmessage?.({ data: `{"type":"pong","padding":"${"x".repeat(64)}"}` });

    expect(ws.close).toHaveBeenCalledOnce();
    expect(errors[0]?.message).toContain("exceeds configured limit");
  });

  it("accepts a legitimate ArrayBuffer frame below the limit", async () => {
    const { a } = createAgent(128);
    a.doConnect();
    const ws = MockWebSocket.instances[0];

    await ws.onmessage?.({ data: new TextEncoder().encode('{"type":"pong"}').buffer });

    expect(ws.close).not.toHaveBeenCalled();
  });

  it("agent_auth declares action_call runtime capability", () => {
    const { a } = createAgent();
    a.doConnect();

    const ws = MockWebSocket.instances[0];
    ws.onopen?.();

    const auth = JSON.parse(ws.send.mock.calls[0][0]);
    expect(auth).toMatchObject({
      type: "agent_auth",
      botToken: "ari_test",
      runtime: {
        name: "arinova-agent-sdk",
        version: PKG_VERSION,
        language: "typescript",
      },
      capabilities: {
        actionCall: {
          supported: true,
          protocolVersion: "2026-05-05",
          canEmitFrames: true,
          supportsGetSchema: true,
        },
      },
    });

    a.cleanup();
  });

  it("auth_ok registers skill commands and starts their heartbeat", () => {
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:9999",
      botToken: "ari_test",
      skills: [{ id: "draw", name: "Draw", description: "Draw an image" }],
    });
    const a = agent as unknown as { doConnect: () => void; cleanup: () => void };
    a.doConnect();
    const ws = MockWebSocket.instances[0]!;
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ type: "auth_ok", agentId: "agent-1" }) });
    expect(ws.send.mock.calls.map(([frame]) => JSON.parse(frame))).toContainEqual({
      type: "register_commands",
      agentId: "agent-1",
      commands: [{ name: "draw", description: "Draw an image" }],
    });
    vi.advanceTimersByTime(60_000);
    expect(ws.send.mock.calls.map(([frame]) => JSON.parse(frame))).toContainEqual({
      type: "heartbeat_commands",
      agentId: "agent-1",
    });
    a.cleanup();
  });

  it("deduplicates error-plus-close and schedules one reconnect", () => {
    const { a } = createAgent();
    a.doConnect();
    const ws = MockWebSocket.instances[0]!;
    ws.onerror?.();
    ws.onclose?.();
    expect(a.reconnectTimer).not.toBeNull();
    vi.advanceTimersByTime(5_000);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("ignores a queued terminal callback from an old socket", () => {
    const { a } = createAgent();
    a.doConnect();
    const old = MockWebSocket.instances[0]!;
    const lateClose = old.onclose;
    a.doConnect();
    const current = MockWebSocket.instances[1]!;
    lateClose?.();
    expect(a.ws).toBe(current);
  });

  it("handles cancel_task through the real websocket branch", () => {
    const { agent, a } = createAgent();
    let signal: AbortSignal | undefined;
    agent.onTask(async (ctx) => {
      signal = ctx.signal;
      await new Promise(() => {});
    });
    a.doConnect();
    const ws = MockWebSocket.instances[0]!;
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ type: "auth_ok", agentId: "agent-1" }) });
    ws.onmessage?.({ data: JSON.stringify({
      type: "task",
      taskId: "task-1",
      conversationId: "conv-1",
      content: "work",
    }) });
    expect(signal?.aborted).toBe(false);
    ws.onmessage?.({ data: JSON.stringify({ type: "cancel_task", taskId: "task-1" }) });
    expect(signal?.aborted).toBe(true);
    expect(ws.send.mock.calls.map(([frame]) => JSON.parse(frame)).some(
      (frame) => frame.type === "agent_error" && frame.reason === "cancelled",
    )).toBe(true);
  });

  it("server stops pong and next watchdog check closes websocket", () => {
    const { a } = createAgent();
    a.doConnect();

    const ws = MockWebSocket.instances[0];
    ws.onopen?.();

    vi.advanceTimersByTime(1_000);
    ws.onmessage?.({ data: JSON.stringify({ type: "pong" }) });

    vi.advanceTimersByTime(3_000);
    expect(ws.close).toHaveBeenCalledTimes(1);

    a.cleanup();
  });

  it("first connection without pong uses onopen grace period before timeout", () => {
    const { a } = createAgent();
    a.doConnect();

    const ws = MockWebSocket.instances[0];
    ws.onopen?.();

    vi.advanceTimersByTime(2_000);
    expect(ws.close).not.toHaveBeenCalled();
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "ping" }));

    vi.advanceTimersByTime(1_000);
    expect(ws.close).toHaveBeenCalledTimes(1);

    a.cleanup();
  });

  it("rejects a real pending connect when disconnected before auth", async () => {
    const { agent } = createAgent();
    const connecting = agent.connect();
    expect(MockWebSocket.instances).toHaveLength(1);
    agent.disconnect();
    await expect(connecting).rejects.toThrow("disconnect() called");
  });

  it("deduplicates concurrent connect calls and resolves both on auth_ok", async () => {
    const { agent, a } = createAgent();
    const first = agent.connect();
    const second = agent.connect();
    expect(second).toBe(first);
    expect(MockWebSocket.instances).toHaveLength(1);
    const ws = MockWebSocket.instances[0];
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ type: "auth_ok", agentId: "agent-1" }) });
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    await expect(agent.connect()).resolves.toBeUndefined();
    expect(MockWebSocket.instances).toHaveLength(1);
    a.cleanup();
  });

  it("normalizes HTTPS server URLs before constructing WebSocket", () => {
    const agent = new ArinovaAgent({
      serverUrl: "https://chat.example.test/",
      botToken: "ari_test",
    });
    const connecting = agent.connect();
    expect(MockWebSocket.instances[0].url).toBe("wss://chat.example.test/ws/agent");
    agent.disconnect();
    void connecting.catch(() => {});
  });

  it("continues normal reconnect after an auth-retry socket drops", async () => {
    const { agent } = createAgent();
    const connecting = agent.connect();
    const first = MockWebSocket.instances[0];
    first.onopen?.();
    first.onmessage?.({ data: JSON.stringify({ type: "auth_error", error: "Invalid token" }) });
    await vi.advanceTimersByTimeAsync(5_000);
    const retry = MockWebSocket.instances[1];
    expect(retry).toBeDefined();
    retry.onopen?.();
    retry.onclose?.();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(MockWebSocket.instances).toHaveLength(3);
    agent.disconnect();
    await expect(connecting).rejects.toThrow("disconnect() called");
  });

  it("rejects the real connect promise after terminal auth failures", async () => {
    const { agent } = createAgent();
    const connecting = agent.connect();
    const rejected = expect(connecting).rejects.toThrow("Invalid bot token");
    const retryDelays = [5_000, 10_000, 20_000, 40_000];
    for (let attempt = 0; attempt < 5; attempt++) {
      const ws = MockWebSocket.instances[attempt];
      ws.onopen?.();
      ws.onmessage?.({ data: JSON.stringify({
        type: "auth_error",
        error: "Invalid bot token",
      }) });
      if (attempt < retryDelays.length) {
        await vi.advanceTimersByTimeAsync(retryDelays[attempt]);
      }
    }
    await rejected;
    expect(MockWebSocket.instances).toHaveLength(5);
  });

  it("keeps buffered task events behind auth on the reconnect wire", () => {
    const { a } = createAgent();
    const internals = a as unknown as {
      sendChunkEvent: (event: Record<string, unknown>) => void;
      sendTerminal: (event: Record<string, unknown>) => void;
    };
    internals.sendChunkEvent({ type: "agent_chunk", taskId: "t1", chunk: "one" });
    internals.sendTerminal({ type: "agent_complete", taskId: "t1", content: "one" });
    a.doConnect();
    const ws = MockWebSocket.instances[0];
    ws.onopen?.();
    expect(ws.send.mock.calls.map(([frame]) => JSON.parse(frame))).toEqual([
      expect.objectContaining({ type: "agent_auth" }),
    ]);
    ws.onmessage?.({ data: JSON.stringify({ type: "auth_ok", agentId: "agent-1" }) });
    expect(ws.send.mock.calls.map(([frame]) => JSON.parse(frame)).map((frame) => frame.type))
      .toEqual(["agent_auth", "agent_chunk", "agent_complete"]);
    a.cleanup();
  });

  it("isolates throwing listeners and supports deduplicated on/off", () => {
    const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:9999",
      botToken: "ari_test",
      logger,
    });
    const throwing = vi.fn(() => { throw new Error("listener failed"); });
    const healthy = vi.fn();
    const disconnected = vi.fn();
    agent.on("connected", throwing).on("connected", throwing).on("connected", healthy);
    agent.on("disconnected", disconnected);
    agent.connect();
    const ws = MockWebSocket.instances[0];
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ type: "auth_ok", agentId: "agent-1" }) });
    expect(throwing).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("listener failed"));
    agent.off("connected", healthy);
    ws.onmessage?.({ data: JSON.stringify({ type: "auth_ok", agentId: "agent-1" }) });
    expect(healthy).toHaveBeenCalledTimes(1);
    ws.onclose?.();
    expect(disconnected).toHaveBeenCalledTimes(1);
    agent.disconnect();
  });

  it("reports malformed frame variants without closing ordinary syntax errors", async () => {
    const { agent, a } = createAgent(256);
    const errors: Error[] = [];
    agent.on("error", (error) => errors.push(error));
    a.doConnect();
    const ws = MockWebSocket.instances[0];
    await ws.onmessage?.({ data: "not-json" });
    await ws.onmessage?.({ data: "null" });
    await ws.onmessage?.({ data: JSON.stringify({ type: "unknown" }) });
    await ws.onmessage?.({ data: new Blob([JSON.stringify({ type: "pong" })]) });
    expect(errors.map((error) => error.name)).toEqual(["SyntaxError", "SyntaxError"]);
    expect(ws.close).not.toHaveBeenCalled();
    a.cleanup();
  });

  it("cancels a queued task through the websocket and acknowledges terminal state", () => {
    const { agent, a } = createAgent();
    agent.onTask(async () => new Promise(() => {}));
    agent.connect();
    const ws = MockWebSocket.instances[0];
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ type: "auth_ok", agentId: "agent-1" }) });
    ws.onmessage?.({ data: JSON.stringify({
      type: "task", taskId: "active", conversationId: "conv-1", content: "one",
    }) });
    ws.onmessage?.({ data: JSON.stringify({
      type: "task", taskId: "queued", conversationId: "conv-1", content: "two",
    }) });
    ws.onmessage?.({ data: JSON.stringify({ type: "cancel_task", taskId: "queued" }) });
    expect(ws.send.mock.calls.map(([frame]) => JSON.parse(frame))).toContainEqual({
      type: "agent_error",
      taskId: "queued",
      error: "cancelled",
      reason: "cancelled",
    });
    agent.disconnect();
  });

  it("maps terminal action results and ignores missing or unknown call ids", async () => {
    const { agent, a } = createAgent();
    const connected = agent.connect();
    const ws = MockWebSocket.instances[0];
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ type: "auth_ok", agentId: "agent-1" }) });
    await connected;

    const calls = [
      { status: "error", error: { code: "DENIED", message: "no", details: { role: "viewer" } } },
      { status: "requires_confirmation", confirmation: {
        confirmationId: "confirm-1", title: "Confirm", summary: "Proceed?", expiresAt: "later",
      } },
      { status: "cancelled" },
    ] as const;
    const results: unknown[] = [];
    for (const [index, terminal] of calls.entries()) {
      const promise = agent.callAction("test.action", {}, { callId: `call-${index}` });
      ws.onmessage?.({ data: JSON.stringify({
        type: "action_result",
        id: `call-${index}`,
        action: "test.action",
        ...terminal,
      }) });
      const result = await promise;
      expect(result).toMatchObject({
        callId: `call-${index}`,
        status: terminal.status,
      });
      results.push(result);
    }
    expect(results[0]).toMatchObject({
      error: { code: "DENIED", message: "no", details: { role: "viewer" } },
    });
    expect(results[1]).toMatchObject({
      confirmation: { confirmationId: "confirm-1", title: "Confirm" },
    });
    ws.onmessage?.({ data: JSON.stringify({ type: "action_result", status: "success" }) });
    ws.onmessage?.({ data: JSON.stringify({
      type: "action_result", id: "unknown", status: "success",
    }) });
    expect((a as unknown as { pendingActionCalls: Map<string, unknown> }).pendingActionCalls.size)
      .toBe(0);
    a.cleanup();
  });
});

// ── no-conversation (platform cron/trigger) task tests ───────

describe("tasks without conversationId (cron/trigger wakeups)", () => {
  function createAgent(
    concurrencyMode: "per-conversation" | "agent-wide" = "agent-wide",
  ) {
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:9999",
      botToken: "ari_test",
      concurrencyMode,
    });
    const a = agent as unknown as {
      taskHandler: ((ctx: unknown) => Promise<void>) | null;
      handleTask: (data: Record<string, unknown>) => void;
      activeConversationTasks: Map<string, string>;
      conversationQueues: Map<string, Array<Record<string, unknown>>>;
      taskAbortControllers: Map<string, AbortController>;
      send: (event: Record<string, unknown>) => void;
    };
    a.send = vi.fn();
    return { agent, a };
  }

  const blockingHandler = async (ctx: { signal: AbortSignal }) => {
    await new Promise<void>((resolve) => {
      if (ctx.signal.aborted) { resolve(); return; }
      ctx.signal.addEventListener("abort", () => resolve(), { once: true });
    });
  };

  it("accepts a cron wakeup without message content", () => {
    const { a } = createAgent();
    let content: unknown = "unset";
    a.taskHandler = (async (ctx: { content?: string }) => {
      content = ctx.content;
    }) as unknown as typeof a.taskHandler;
    a.handleTask({ taskId: "cron-1", taskKind: "cron_wakeup" });
    expect(content).toBeUndefined();
  });

  it("passes undefined conversationId and the taskKind through to ctx", () => {
    const { a } = createAgent();
    let savedCtx: { conversationId?: string; taskKind?: string } | null = null;
    a.taskHandler = (async (ctx: typeof savedCtx) => {
      savedCtx = ctx;
    }) as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "t1", taskKind: "cron_wakeup", content: "wake up" });

    expect(savedCtx!.conversationId).toBeUndefined();
    expect(savedCtx!.taskKind).toBe("cron_wakeup");
  });

  it("keys scheduler maps on the sentinel, not undefined", () => {
    const { a } = createAgent();
    a.taskHandler = blockingHandler as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "t1", taskKind: "cron_wakeup", content: "wake up" });

    expect(a.activeConversationTasks.get("__no_conversation__")).toBe("t1");
    expect(a.activeConversationTasks.has(undefined as unknown as string)).toBe(false);
  });

  it("serialises concurrent no-conversation tasks under the sentinel queue", () => {
    const { a } = createAgent();
    a.taskHandler = blockingHandler as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "t1", taskKind: "cron_wakeup", content: "first" });
    a.handleTask({ taskId: "t2", taskKind: "trigger", content: "second" });

    expect(a.taskAbortControllers.has("t1")).toBe(true);
    expect(a.taskAbortControllers.has("t2")).toBe(false); // queued
    expect(a.conversationQueues.get("__no_conversation__")?.length).toBe(1);
  });

  it("drains the sentinel queue after sendComplete", () => {
    const { a } = createAgent();
    let savedCtx: { sendComplete: (s: string) => void } | null = null;
    a.taskHandler = (async (ctx: { sendComplete: (s: string) => void }) => {
      savedCtx = ctx;
    }) as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "t1", taskKind: "cron_wakeup", content: "first" });
    a.handleTask({ taskId: "t2", taskKind: "cron_wakeup", content: "second" });

    savedCtx!.sendComplete("done");
    expect(a.activeConversationTasks.get("__no_conversation__")).toBe("t2");
    expect(a.conversationQueues.has("__no_conversation__")).toBe(false);
  });

  it("rejects conversation-scoped APIs with a descriptive error", async () => {
    const { a } = createAgent();
    let savedCtx: {
      uploadFile: (f: Uint8Array, n: string) => Promise<unknown>;
      fetchHistory: () => Promise<unknown>;
    } | null = null;
    a.taskHandler = (async (ctx: typeof savedCtx) => {
      savedCtx = ctx;
    }) as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "t1", taskKind: "cron_wakeup", content: "wake up" });

    await expect(savedCtx!.uploadFile(new Uint8Array(), "f.txt")).rejects.toThrow(
      /uploadFile is unavailable.*cron_wakeup.*not bound to a conversation/,
    );
    await expect(savedCtx!.fetchHistory()).rejects.toThrow(
      /fetchHistory is unavailable/,
    );
  });

  it("does not interfere with real conversations in per-conversation mode", () => {
    const { a } = createAgent("per-conversation");
    a.taskHandler = blockingHandler as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "t1", taskKind: "cron_wakeup", content: "wake up" });
    a.handleTask({ taskId: "t2", conversationId: "conv-A", content: "chat" });

    // Both run: the wakeup occupies the sentinel slot, conv-A its own
    expect(a.taskAbortControllers.has("t1")).toBe(true);
    expect(a.taskAbortControllers.has("t2")).toBe(true);
  });
});

// ── onboarding seed pass-through (OB-11 AC8.7) ───────────────

describe("onboarding seed (auth_ok pass-through)", () => {
  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    static instances: MockWebSocket[] = [];

    readyState = MockWebSocket.OPEN;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED;
    });

    constructor(public readonly url: string) {
      MockWebSocket.instances.push(this);
    }
  }

  function createAgent() {
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:9999",
      botToken: "ari_test",
      pingInterval: 1_000,
      pingTimeout: 2_500,
    });
    const a = agent as unknown as { doConnect: () => void; cleanup: () => void };
    return { agent, a };
  }

  const validSeed = {
    kind: "first_touch_opening",
    seedId: "onboarding:tok_123",
    agentId: "agent-1",
    action: "create_onboarding_conversation_and_send_first_message",
    prompt: "Introduce yourself using the onboarding knowledge.",
  };

  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function authOk(extra: Record<string, unknown>): string {
    return JSON.stringify({ type: "auth_ok", agentId: "agent-1", ...extra });
  }

  it("surfaces a valid onboardingSeed before connect() resolves", async () => {
    const { agent, a } = createAgent();
    const connected = agent.connect(); // connect() drives doConnect() internally

    const ws = MockWebSocket.instances[0];
    ws.onopen?.();
    expect(agent.getOnboardingSeed()).toBeNull();

    ws.onmessage?.({ data: authOk({ onboardingSeed: validSeed }) });

    // connect() resolves on this auth_ok; the seed must already be observable.
    await connected;
    expect(agent.getOnboardingSeed()).toEqual(validSeed);

    a.cleanup();
  });

  it("returns null when auth_ok carries no seed (e.g. reconnect / old server)", () => {
    const { agent, a } = createAgent();
    a.doConnect();

    const ws = MockWebSocket.instances[0];
    ws.onopen?.();
    ws.onmessage?.({ data: authOk({}) });

    expect(agent.getOnboardingSeed()).toBeNull();

    a.cleanup();
  });

  it("clears a previously-seen seed on a reconnect auth_ok without one", () => {
    const { agent, a } = createAgent();
    a.doConnect();

    const ws = MockWebSocket.instances[0];
    ws.onopen?.();
    ws.onmessage?.({ data: authOk({ onboardingSeed: validSeed }) });
    expect(agent.getOnboardingSeed()).toEqual(validSeed);

    // Reconnect: server (OB-10 first-connect gate) omits the seed.
    ws.onmessage?.({ data: authOk({}) });
    expect(agent.getOnboardingSeed()).toBeNull();

    a.cleanup();
  });

  it("drops a malformed seed (missing fields / unknown kind)", () => {
    const { agent, a } = createAgent();
    a.doConnect();

    const ws = MockWebSocket.instances[0];
    ws.onopen?.();

    // Unknown kind
    ws.onmessage?.({ data: authOk({ onboardingSeed: { ...validSeed, kind: "something_else" } }) });
    expect(agent.getOnboardingSeed()).toBeNull();

    // Missing prompt
    const { prompt: _omit, ...noPrompt } = validSeed;
    ws.onmessage?.({ data: authOk({ onboardingSeed: noPrompt }) });
    expect(agent.getOnboardingSeed()).toBeNull();

    // Non-object
    ws.onmessage?.({ data: authOk({ onboardingSeed: "nope" }) });
    expect(agent.getOnboardingSeed()).toBeNull();

    a.cleanup();
  });

  // OB-3/OB-11 two-step claim: obt_* → claim_ok (token exchange, no seed) →
  // reconnect re-auths with the permanent ari_* token → that auth_ok carries the
  // first-touch seed. Proves the seed is actually reachable end-to-end.
  it("obt_* → claim_ok → re-auth with permanent token → auth_ok carries the seed", async () => {
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:9999",
      botToken: "obt_bootstrap",
      reconnectInterval: 50,
      pingInterval: 1_000,
      pingTimeout: 2_500,
    });
    const a = agent as unknown as { cleanup: () => void };

    const claimed: Array<{ agentId: string | null; permanentToken: string }> = [];
    agent.on("token_claimed", (d) => claimed.push(d));

    const connected = agent.connect();

    // 1) The first socket authenticates with the bootstrap obt_* token.
    const ws1 = MockWebSocket.instances[0];
    ws1.onopen?.();
    const firstAuth = JSON.parse(ws1.send.mock.calls[0][0] as string);
    expect(firstAuth.type).toBe("agent_auth");
    expect(firstAuth.botToken).toBe("obt_bootstrap");

    // 2) Server exchanges the token via claim_ok (never carries a seed) and
    //    drops the socket. connect() must stay pending; seed must stay null.
    ws1.onmessage?.({
      data: JSON.stringify({
        type: "claim_ok",
        agentId: "agent-1",
        permanentToken: "ari_permanent",
        tokenId: "tok_123",
      }),
    });
    expect(claimed).toEqual([{ agentId: "agent-1", permanentToken: "ari_permanent" }]);
    expect(agent.getOnboardingSeed()).toBeNull();
    ws1.onclose?.();

    // 3) The scheduled reconnect re-auths with the permanent ari_* token.
    await vi.advanceTimersByTimeAsync(50);
    const ws2 = MockWebSocket.instances[1];
    expect(ws2).toBeDefined();
    ws2.onopen?.();
    const secondAuth = JSON.parse(ws2.send.mock.calls[0][0] as string);
    expect(secondAuth.type).toBe("agent_auth");
    expect(secondAuth.botToken).toBe("ari_permanent");

    // 4) The permanent-token auth_ok is the genuine first connect → carries the
    //    seed, and resolving connect() makes it observable to the consumer.
    ws2.onmessage?.({ data: authOk({ onboardingSeed: validSeed }) });
    await connected;
    expect(agent.getOnboardingSeed()).toEqual(validSeed);

    a.cleanup();
  });
});
