export type TaskConcurrencyMode = "per-conversation" | "agent-wide" | "unbounded";
export type QueuedTask = Record<string, unknown>;

export interface EnqueueResult {
  accepted: boolean;
  queuePosition: number;
  globalQueueSize: number;
}

/** Owns task admission, bounded queues, cancellation, and fair queue rotation. */
export class TaskQueue {
  private readonly queues = new Map<string, QueuedTask[]>();
  private readonly consecutiveTaskCount = new Map<string, number>();
  private agentWideLock = false;

  constructor(
    private readonly mode: TaskConcurrencyMode,
    private readonly maxConsecutive: number,
    private readonly maxQueuedTasks: number,
  ) {}

  has(taskId: string): boolean {
    for (const queue of this.queues.values()) {
      if (queue.some((task) => task.taskId === taskId)) return true;
    }
    return false;
  }

  shouldQueue(conversationActive: boolean): boolean {
    if (this.mode === "unbounded") return false;
    if (this.mode === "per-conversation") return conversationActive;
    if (this.agentWideLock) return true;
    this.agentWideLock = true;
    return false;
  }

  enqueue(conversationId: string, task: QueuedTask): EnqueueResult {
    const before = this.size();
    if (before >= this.maxQueuedTasks) {
      return { accepted: false, queuePosition: -1, globalQueueSize: before };
    }
    let queue = this.queues.get(conversationId);
    if (!queue) {
      queue = [];
      this.queues.set(conversationId, queue);
    }
    queue.push(task);
    return {
      accepted: true,
      queuePosition: queue.length - 1,
      globalQueueSize: before + 1,
    };
  }

  cancel(taskId: string): QueuedTask | undefined {
    for (const [conversationId, queue] of this.queues) {
      const index = queue.findIndex((task) => task.taskId === taskId);
      if (index < 0) continue;
      const [cancelled] = queue.splice(index, 1);
      if (queue.length === 0) this.queues.delete(conversationId);
      return cancelled;
    }
    return undefined;
  }

  markStarted(conversationId: string): void {
    if (this.mode !== "agent-wide") return;
    this.agentWideLock = true;
    this.consecutiveTaskCount.set(
      conversationId,
      (this.consecutiveTaskCount.get(conversationId) ?? 0) + 1,
    );
  }

  markFinished(): void {
    if (this.mode === "agent-wide") this.agentWideLock = false;
  }

  takeNext(finishedConversationId: string): QueuedTask | undefined {
    if (this.mode === "agent-wide") {
      return this.takeNextAgentWide(finishedConversationId);
    }
    if (this.mode === "unbounded") return undefined;
    return this.shift(finishedConversationId);
  }

  clear(): void {
    this.queues.clear();
    this.consecutiveTaskCount.clear();
    this.agentWideLock = false;
  }

  size(): number {
    let total = 0;
    for (const queue of this.queues.values()) total += queue.length;
    return total;
  }

  private shift(conversationId: string): QueuedTask | undefined {
    const queue = this.queues.get(conversationId);
    const task = queue?.shift();
    if (queue?.length === 0) this.queues.delete(conversationId);
    return task;
  }

  private takeNextAgentWide(finishedConversationId: string): QueuedTask | undefined {
    const currentCount = this.consecutiveTaskCount.get(finishedConversationId) ?? 0;
    const sameQueue = this.queues.get(finishedConversationId);
    if (sameQueue?.length && currentCount < this.maxConsecutive) {
      return this.shift(finishedConversationId);
    }

    this.consecutiveTaskCount.delete(finishedConversationId);
    let nextConversationId: string | undefined;
    for (const conversationId of this.queues.keys()) {
      if (conversationId !== finishedConversationId) {
        nextConversationId = conversationId;
        break;
      }
    }
    if (!nextConversationId) {
      if (!sameQueue?.length) return undefined;
      nextConversationId = finishedConversationId;
    }

    const queue = this.queues.get(nextConversationId)!;
    const task = queue.shift();
    if (queue.length === 0) {
      this.queues.delete(nextConversationId);
    } else {
      this.queues.delete(nextConversationId);
      this.queues.set(nextConversationId, queue);
    }
    return task;
  }
}
