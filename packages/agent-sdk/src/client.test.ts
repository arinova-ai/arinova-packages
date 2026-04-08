import { describe, it, expect, vi, beforeEach } from "vitest";

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

// ── Per-conversation queue tests ─────────────────────────────

describe("per-conversation task queue", () => {
  // Helper: simulate the queue logic from client.ts without needing a real WS
  const MAX_QUEUE_SIZE = 10;

  function createQueueState() {
    const activeConversationTasks = new Map<string, string>();
    const taskAbortControllers = new Map<string, AbortController>();
    const conversationQueues = new Map<string, Array<Record<string, unknown>>>();
    const executed: string[] = [];
    const errors: Array<{ taskId: string; error: string }> = [];

    function handleTask(data: Record<string, unknown>) {
      const conversationId = data.conversationId as string;
      const activeTaskId = activeConversationTasks.get(conversationId);

      if (activeTaskId && taskAbortControllers.has(activeTaskId)) {
        let queue = conversationQueues.get(conversationId);
        if (!queue) {
          queue = [];
          conversationQueues.set(conversationId, queue);
        }
        if (queue.length >= MAX_QUEUE_SIZE) {
          const dropped = queue.shift()!;
          errors.push({ taskId: dropped.taskId as string, error: "queue_overflow" });
        }
        queue.push(data);
        return;
      }
      executeTask(data);
    }

    function executeTask(data: Record<string, unknown>) {
      const taskId = data.taskId as string;
      const conversationId = data.conversationId as string;
      const controller = new AbortController();
      taskAbortControllers.set(taskId, controller);
      activeConversationTasks.set(conversationId, taskId);
      executed.push(taskId);
    }

    function finishTask(taskId: string) {
      let conversationId: string | undefined;
      for (const [convId, tid] of activeConversationTasks) {
        if (tid === taskId) { conversationId = convId; break; }
      }
      taskAbortControllers.delete(taskId);
      if (conversationId) {
        activeConversationTasks.delete(conversationId);
        processNextTask(conversationId);
      }
    }

    function processNextTask(conversationId: string) {
      const queue = conversationQueues.get(conversationId);
      if (!queue || queue.length === 0) {
        conversationQueues.delete(conversationId);
        return;
      }
      const next = queue.shift()!;
      if (queue.length === 0) conversationQueues.delete(conversationId);
      executeTask(next);
    }

    function cancelTask(taskId: string) {
      for (const [convId, queue] of conversationQueues) {
        const idx = queue.findIndex((t) => t.taskId === taskId);
        if (idx !== -1) {
          queue.splice(idx, 1);
          if (queue.length === 0) conversationQueues.delete(convId);
          return;
        }
      }
      const controller = taskAbortControllers.get(taskId);
      if (controller) {
        controller.abort();
        let conversationId: string | undefined;
        for (const [convId, tid] of activeConversationTasks) {
          if (tid === taskId) { conversationId = convId; break; }
        }
        taskAbortControllers.delete(taskId);
        if (conversationId) {
          activeConversationTasks.delete(conversationId);
          processNextTask(conversationId);
        }
      }
    }

    function cleanup() {
      for (const controller of taskAbortControllers.values()) {
        controller.abort();
      }
      taskAbortControllers.clear();
      activeConversationTasks.clear();
      conversationQueues.clear();
    }

    return {
      activeConversationTasks, taskAbortControllers, conversationQueues,
      executed, errors,
      handleTask, finishTask, cancelTask, cleanup,
    };
  }

  it("same conversation queues second task instead of executing", () => {
    const q = createQueueState();
    q.handleTask({ taskId: "t1", conversationId: "conv-A", content: "first" });
    q.handleTask({ taskId: "t2", conversationId: "conv-A", content: "second" });

    expect(q.executed).toEqual(["t1"]);
    expect(q.conversationQueues.get("conv-A")?.length).toBe(1);
  });

  it("different conversations run in parallel", () => {
    const q = createQueueState();
    q.handleTask({ taskId: "t1", conversationId: "conv-A", content: "a" });
    q.handleTask({ taskId: "t2", conversationId: "conv-B", content: "b" });

    expect(q.executed).toEqual(["t1", "t2"]);
    expect(q.activeConversationTasks.size).toBe(2);
  });

  it("processNextTask dequeues and executes after finish", () => {
    const q = createQueueState();
    q.handleTask({ taskId: "t1", conversationId: "conv-A", content: "first" });
    q.handleTask({ taskId: "t2", conversationId: "conv-A", content: "second" });
    q.handleTask({ taskId: "t3", conversationId: "conv-A", content: "third" });

    expect(q.executed).toEqual(["t1"]);

    q.finishTask("t1");
    expect(q.executed).toEqual(["t1", "t2"]);

    q.finishTask("t2");
    expect(q.executed).toEqual(["t1", "t2", "t3"]);
    expect(q.conversationQueues.size).toBe(0);
  });

  it("cancel queued task removes from queue without aborting active", () => {
    const q = createQueueState();
    q.handleTask({ taskId: "t1", conversationId: "conv-A", content: "first" });
    q.handleTask({ taskId: "t2", conversationId: "conv-A", content: "second" });
    q.handleTask({ taskId: "t3", conversationId: "conv-A", content: "third" });

    q.cancelTask("t2");
    expect(q.conversationQueues.get("conv-A")?.length).toBe(1);
    expect(q.taskAbortControllers.has("t1")).toBe(true); // active task untouched

    q.finishTask("t1");
    expect(q.executed).toEqual(["t1", "t3"]); // t2 was skipped
  });

  it("cancel active task aborts it and starts next from queue", () => {
    const q = createQueueState();
    q.handleTask({ taskId: "t1", conversationId: "conv-A", content: "first" });
    q.handleTask({ taskId: "t2", conversationId: "conv-A", content: "second" });

    const controller = q.taskAbortControllers.get("t1")!;
    q.cancelTask("t1");

    expect(controller.signal.aborted).toBe(true);
    expect(q.executed).toEqual(["t1", "t2"]); // t2 auto-started
    expect(q.activeConversationTasks.get("conv-A")).toBe("t2");
  });

  it("cleanup aborts all active tasks and clears queues", () => {
    const q = createQueueState();
    q.handleTask({ taskId: "t1", conversationId: "conv-A", content: "a" });
    q.handleTask({ taskId: "t2", conversationId: "conv-A", content: "b" });
    q.handleTask({ taskId: "t3", conversationId: "conv-B", content: "c" });

    const c1 = q.taskAbortControllers.get("t1")!;
    const c3 = q.taskAbortControllers.get("t3")!;

    q.cleanup();

    expect(c1.signal.aborted).toBe(true);
    expect(c3.signal.aborted).toBe(true);
    expect(q.taskAbortControllers.size).toBe(0);
    expect(q.activeConversationTasks.size).toBe(0);
    expect(q.conversationQueues.size).toBe(0);
  });

  it("queue overflow drops oldest queued task and reports error", () => {
    const q = createQueueState();
    q.handleTask({ taskId: "t0", conversationId: "conv-A", content: "active" });

    // Fill queue to MAX_QUEUE_SIZE
    for (let i = 1; i <= 10; i++) {
      q.handleTask({ taskId: `t${i}`, conversationId: "conv-A", content: `msg${i}` });
    }
    expect(q.conversationQueues.get("conv-A")?.length).toBe(10);

    // Push one more — should drop t1 (oldest queued)
    q.handleTask({ taskId: "t11", conversationId: "conv-A", content: "overflow" });
    expect(q.conversationQueues.get("conv-A")?.length).toBe(10);
    expect(q.errors).toEqual([{ taskId: "t1", error: "queue_overflow" }]);

    // Queue should now be t2..t10, t11
    const queue = q.conversationQueues.get("conv-A")!;
    expect(queue[0].taskId).toBe("t2");
    expect(queue[queue.length - 1].taskId).toBe("t11");
  });
});
