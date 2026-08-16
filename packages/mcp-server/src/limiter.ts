import { ActionExecutionError } from "./errors.js";

interface Waiter {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Bounded FIFO semaphore shared by manifest refreshes and action calls. */
export class RequestLimiter {
  private readonly queue: Waiter[] = [];
  private inFlight = 0;

  constructor(
    private readonly capacity: number,
    private readonly queueLimit: number,
    private readonly queueWaitMs: number,
  ) {}

  async acquire(): Promise<void> {
    if (this.inFlight < this.capacity) {
      this.inFlight += 1;
      return;
    }
    if (this.queue.length >= this.queueLimit) {
      throw new ActionExecutionError(
        "RATE_LIMITED",
        `Action queue is full (${this.queueLimit}). Try again later.`,
      );
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve: () => {
          clearTimeout(waiter.timer);
          resolve();
        },
        reject,
        timer: undefined as unknown as ReturnType<typeof setTimeout>,
      };
      waiter.timer = setTimeout(() => {
        const index = this.queue.indexOf(waiter);
        if (index >= 0) this.queue.splice(index, 1);
        reject(new ActionExecutionError(
          "QUEUE_TIMEOUT",
          `Action waited more than ${this.queueWaitMs}ms for capacity`,
        ));
      }, this.queueWaitMs);
      waiter.timer.unref?.();
      this.queue.push(waiter);
    });
  }

  release(): void {
    this.inFlight -= 1;
    const next = this.queue.shift();
    if (!next) return;
    this.inFlight += 1;
    next.resolve();
  }

  rejectQueued(code: string, message: string): void {
    while (this.queue.length > 0) {
      const waiter = this.queue.shift()!;
      clearTimeout(waiter.timer);
      waiter.reject(new ActionExecutionError(code, message));
    }
  }

  get inFlightCount(): number {
    return this.inFlight;
  }

  get queueDepth(): number {
    return this.queue.length;
  }
}
