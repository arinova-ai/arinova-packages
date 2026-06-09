import { beforeEach, describe, expect, it, vi } from "vitest";
import { OfficeStateStore } from "./state.js";

const baseEvent = {
  sessionId: "session-1",
  agentId: "agent-1",
  timestamp: 1_000,
  data: {},
};

describe("OfficeStateStore", () => {
  let store: OfficeStateStore;

  beforeEach(() => {
    store = new OfficeStateStore();
    vi.useFakeTimers();
  });

  it("tracks session lifecycle and filters offline agents from snapshots", () => {
    store.ingest({ ...baseEvent, type: "session_start" });
    expect(store.snapshot().agents).toMatchObject([
      { agentId: "agent-1", status: "working", online: true },
    ]);

    store.ingest({
      ...baseEvent,
      type: "session_end",
      timestamp: 2_000,
      data: { durationMs: 1000 },
    });

    expect(store.snapshot().agents).toEqual([]);
  });

  it("accumulates token usage and model from llm output events", () => {
    store.ingest({
      ...baseEvent,
      type: "llm_output",
      data: { model: "claude-sonnet-4-6", usage: { input: 10, output: 3, cacheRead: 2, total: 15 } },
    });
    store.ingest({
      ...baseEvent,
      type: "llm_output",
      timestamp: 2_000,
      data: { model: "claude-sonnet-4-6", usage: { input: 5, output: 7, cacheWrite: 1, total: 13 } },
    });

    expect(store.snapshot().agents[0]).toMatchObject({
      model: "claude-sonnet-4-6",
      tokenUsage: { input: 15, output: 10, cacheRead: 2, cacheWrite: 1, total: 28 },
    });
  });

  it("marks tool calls as current task and clears them on agent end", () => {
    store.ingest({
      ...baseEvent,
      type: "tool_call",
      data: { toolName: "Read", durationMs: 25 },
    });
    expect(store.snapshot().agents[0]).toMatchObject({
      status: "working",
      currentTask: "Read",
      currentToolDetail: "Read (25ms)",
    });

    store.ingest({ ...baseEvent, type: "agent_end", timestamp: 2_000, data: { durationMs: 100 } });
    expect(store.snapshot().agents[0]).toMatchObject({
      status: "idle",
      currentTask: null,
      currentToolDetail: null,
      sessionDurationMs: 100,
    });
  });

  it("derives collaboration from parent session to child agent links", () => {
    store.ingest({ ...baseEvent, type: "session_start" });
    store.ingest({
      type: "subagent_start",
      sessionId: "child-session",
      agentId: "agent-2",
      timestamp: 1_500,
      data: { parentSessionKey: "session-1" },
    });

    expect(store.snapshot().agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agentId: "agent-1",
        status: "collaborating",
        collaboratingWith: ["agent-2"],
      }),
      expect.objectContaining({
        agentId: "agent-2",
        status: "collaborating",
        collaboratingWith: ["agent-1"],
      }),
    ]));

    store.ingest({
      type: "subagent_end",
      sessionId: "child-session",
      agentId: "agent-2",
      timestamp: 2_000,
      data: {},
    });
    expect(store.snapshot().agents).toEqual(expect.arrayContaining([
      expect.objectContaining({ agentId: "agent-1", status: "working", collaboratingWith: [] }),
      expect.objectContaining({ agentId: "agent-2", status: "working", collaboratingWith: [] }),
    ]));
  });

  it("moves stale working and blocked agents to idle on tick", () => {
    store.ingest({ ...baseEvent, type: "session_start", timestamp: 1_000 });
    vi.setSystemTime(62_000);
    store.tick();
    expect(store.snapshot().agents[0].status).toBe("idle");

    store.ingest({ ...baseEvent, type: "agent_error", timestamp: 63_000, data: { error: "tool failed" } });
    vi.setSystemTime(184_000);
    store.tick();
    expect(store.snapshot().agents[0].status).toBe("idle");
  });
});
