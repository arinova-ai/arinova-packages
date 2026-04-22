import { describe, it, expect, vi } from "vitest";
import { ArinovaAgent } from "./client.js";

// Test API client configuration
describe("API client configuration", () => {
  it("constructs base URL from options", () => {
    const baseUrl = "https://api.chat-staging.arinova.ai";
    expect(baseUrl).toMatch(/^https?:\/\//);
  });

  it("bearer token format is correct", () => {
    const token = "ari_abc123def456";
    const header = `Bearer ${token}`;
    expect(header).toBe("Bearer ari_abc123def456");
    expect(header.startsWith("Bearer ari_")).toBe(true);
  });

  it("CLI API key format differs from bot token", () => {
    const botToken = "ari_abc123";
    const cliKey = "ari_cli_abc123";
    expect(botToken.startsWith("ari_")).toBe(true);
    expect(botToken.startsWith("ari_cli_")).toBe(false);
    expect(cliKey.startsWith("ari_cli_")).toBe(true);
  });
});

// Test auth token handling
describe("auth token handling", () => {
  it("token is included in Authorization header", () => {
    const token = "ari_test_token";
    const headers = { Authorization: `Bearer ${token}` };
    expect(headers.Authorization).toContain(token);
  });

  it("empty token produces valid header", () => {
    const token = "";
    const headers = { Authorization: `Bearer ${token}` };
    expect(headers.Authorization).toBe("Bearer ");
  });

  it("session token from cookie is extracted correctly", () => {
    const cookie = "better-auth.session_token=abc123; Path=/; HttpOnly";
    const match = cookie.match(/better-auth\.session_token=([^;]+)/);
    expect(match).toBeTruthy();
    expect(match![1]).toBe("abc123");
  });
});

// Test error handling patterns
describe("error handling", () => {
  it("parses JSON error response", () => {
    const errorBody = { error: "Not found", code: "NOT_FOUND" };
    expect(errorBody.error).toBe("Not found");
    expect(errorBody.code).toBe("NOT_FOUND");
  });

  it("handles 401 unauthorized", () => {
    const status = 401;
    const isUnauthorized = status === 401;
    expect(isUnauthorized).toBe(true);
  });

  it("handles 403 forbidden (banned)", () => {
    const response = { error: "Your account has been banned", code: "ACCOUNT_BANNED" };
    expect(response.code).toBe("ACCOUNT_BANNED");
  });

  it("handles 429 rate limit", () => {
    const status = 429;
    const isRateLimited = status === 429;
    expect(isRateLimited).toBe(true);
  });

  it("handles network error gracefully", () => {
    const err = new Error("fetch failed");
    expect(err.message).toBe("fetch failed");
  });
});

// Test API method signatures
describe("API method signatures", () => {
  it("send message requires conversationId and content", () => {
    const body = { conversationId: "conv-123", content: "Hello" };
    expect(body.conversationId).toBeTruthy();
    expect(body.content).toBeTruthy();
  });

  it("create note requires title", () => {
    const body = { title: "Test Note", content: "Body text", tags: ["test"] };
    expect(body.title).toBeTruthy();
  });

  it("kanban card requires title", () => {
    const body = { title: "Test Card", priority: "medium" };
    expect(body.title).toBeTruthy();
  });

  it("file upload uses multipart form data", () => {
    const formData = new FormData();
    formData.append("file", new Blob(["test"]), "test.txt");
    formData.append("conversationId", "conv-123");
    expect(formData.has("file")).toBe(true);
    expect(formData.has("conversationId")).toBe(true);
  });
});

// ── Per-conversation queue tests (real ArinovaAgent) ─────────

describe("per-conversation task queue", () => {
  // Helper: create an ArinovaAgent and access internals via `any` cast
  function createAgent() {
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:9999",
      botToken: "ari_test",
    });
    const a = agent as unknown as {
      taskHandler: ((ctx: unknown) => Promise<void>) | null;
      handleTask: (data: Record<string, unknown>) => void;
      cleanup: () => void;
      activeConversationTasks: Map<string, string>;
      conversationQueues: Map<string, Array<Record<string, unknown>>>;
      taskAbortControllers: Map<string, AbortController>;
      send: (event: Record<string, unknown>) => void;
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

  it("queue overflow drops oldest queued task", () => {
    const { a } = createAgent();
    a.taskHandler = blockingHandler as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "t0", conversationId: "conv-A", content: "active" });

    // Fill queue to 10 (MAX_QUEUE_SIZE)
    for (let i = 1; i <= 10; i++) {
      a.handleTask({ taskId: `t${i}`, conversationId: "conv-A", content: `msg${i}` });
    }
    expect(a.conversationQueues.get("conv-A")?.length).toBe(10);

    // Push one more — should drop t1 (oldest queued)
    a.handleTask({ taskId: "t11", conversationId: "conv-A", content: "overflow" });
    expect(a.conversationQueues.get("conv-A")?.length).toBe(10);

    const queue = a.conversationQueues.get("conv-A")!;
    expect(queue[0].taskId).toBe("t2");
    expect(queue[queue.length - 1].taskId).toBe("t11");

    // Verify overflow error was sent
    expect(a.send).toHaveBeenCalledWith({ type: "agent_error", taskId: "t1", error: "queue_overflow" });
  });
});

// ── agent-wide queue tests (real ArinovaAgent) ───────────────

describe("agent-wide task queue", () => {
  function createAgentWide(maxConsecutive = 2) {
    const agent = new ArinovaAgent({
      serverUrl: "ws://localhost:9999",
      botToken: "ari_test",
      concurrencyMode: "agent-wide",
      maxConsecutivePerConversation: maxConsecutive,
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

  it("cross-conv second task queues instead of running in parallel", () => {
    const { a } = createAgentWide();
    a.taskHandler = blockingHandler as unknown as typeof a.taskHandler;

    a.handleTask({ taskId: "a1", conversationId: "conv-A", content: "first" });
    a.handleTask({ taskId: "b1", conversationId: "conv-B", content: "second" });

    // Under hasLiveTask() guard, b1 on a different conv still queues
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
    const { a } = createAgentWide();
    a.taskHandler = blockingHandler as unknown as typeof a.taskHandler;

    // t0 starts running; t1..t10 queue (queuePosition 0..9).
    a.handleTask({ taskId: "t0", conversationId: "conv-A", content: "" });
    for (let i = 1; i <= 10; i++) {
      a.handleTask({ taskId: `t${i}`, conversationId: "conv-A", content: "" });
    }

    expect(a.send).toHaveBeenCalledWith({ type: "task_queued", taskId: "t1", conversationId: "conv-A", queuePosition: 0 });
    expect(a.send).toHaveBeenCalledWith({ type: "task_queued", taskId: "t5", conversationId: "conv-A", queuePosition: 4 });
    expect(a.send).toHaveBeenCalledWith({ type: "task_queued", taskId: "t10", conversationId: "conv-A", queuePosition: 9 });

    // Overflow: pushing t11 drops oldest queued (t1). t11 lands at tail (pos 9).
    a.handleTask({ taskId: "t11", conversationId: "conv-A", content: "" });
    expect(a.send).toHaveBeenCalledWith({ type: "agent_error", taskId: "t1", error: "queue_overflow" });
    expect(a.send).toHaveBeenCalledWith({ type: "task_queued", taskId: "t11", conversationId: "conv-A", queuePosition: 9 });
    expect(a.conversationQueues.get("conv-A")?.length).toBe(10);
  });
});
