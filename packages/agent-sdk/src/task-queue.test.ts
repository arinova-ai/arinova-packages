import { describe, expect, it } from "vitest";
import { TaskQueue } from "./task-queue.js";

const task = (taskId: string) => ({ taskId });

describe("TaskQueue", () => {
  it("bounds queues and supports duplicate lookup and cancellation", () => {
    const queue = new TaskQueue("per-conversation", 2, 2);
    expect(queue.enqueue("a", task("1"))).toEqual({
      accepted: true,
      queuePosition: 0,
      globalQueueSize: 1,
    });
    expect(queue.enqueue("b", task("2")).accepted).toBe(true);
    expect(queue.enqueue("b", task("3")).accepted).toBe(false);
    expect(queue.has("2")).toBe(true);
    expect(queue.cancel("2")).toEqual(task("2"));
    expect(queue.cancel("missing")).toBeUndefined();
    expect(queue.size()).toBe(1);
  });

  it("serializes only an active conversation in per-conversation mode", () => {
    const queue = new TaskQueue("per-conversation", 2, 10);
    expect(queue.shouldQueue(false)).toBe(false);
    expect(queue.shouldQueue(true)).toBe(true);
    queue.enqueue("a", task("1"));
    expect(queue.takeNext("a")).toEqual(task("1"));
    expect(queue.takeNext("a")).toBeUndefined();
  });

  it("does not queue or drain in unbounded mode", () => {
    const queue = new TaskQueue("unbounded", 2, 10);
    expect(queue.shouldQueue(true)).toBe(false);
    queue.enqueue("a", task("1"));
    expect(queue.takeNext("a")).toBeUndefined();
    queue.clear();
    expect(queue.size()).toBe(0);
  });

  it("rotates agent-wide work after the consecutive cap", () => {
    const queue = new TaskQueue("agent-wide", 2, 10);
    expect(queue.shouldQueue(false)).toBe(false);
    queue.markStarted("a");
    expect(queue.shouldQueue(false)).toBe(true);
    queue.enqueue("a", task("a2"));
    queue.enqueue("b", task("b1"));
    queue.markFinished();
    expect(queue.takeNext("a")).toEqual(task("a2"));
    queue.markStarted("a");
    queue.markFinished();
    expect(queue.takeNext("a")).toEqual(task("b1"));
  });

  it("continues the only queued conversation even after its cap", () => {
    const queue = new TaskQueue("agent-wide", 1, 10);
    expect(queue.shouldQueue(false)).toBe(false);
    queue.markStarted("a");
    queue.enqueue("a", task("a2"));
    queue.markFinished();
    expect(queue.takeNext("a")).toEqual(task("a2"));
  });
});
