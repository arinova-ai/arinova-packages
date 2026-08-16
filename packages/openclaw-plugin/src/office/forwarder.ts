import { assertTrustedApiRequestUrl } from "../api-endpoint.js";
import type { InternalEvent } from "./types.js";

const FORWARD_TIMEOUT_MS = 10_000;
const MAX_FORWARD_CONCURRENCY = 8;

export interface OfficeForwardTarget {
  url: string;
  token: string;
}

export interface OfficeForwardMetrics {
  attempted: number;
  succeeded: number;
  failed: number;
  dropped: number;
  skipped: number;
  inFlight: number;
}

let targets = new Map<string, OfficeForwardTarget>();
let reportError: (message: string) => void = () => undefined;
const pending = new Set<Promise<void>>();
const metrics: OfficeForwardMetrics = {
  attempted: 0,
  succeeded: 0,
  failed: 0,
  dropped: 0,
  skipped: 0,
  inFlight: 0,
};

export function setForwardTargets(
  nextTargets: Map<string, OfficeForwardTarget>,
  logger?: (message: string) => void,
): void {
  const validated = new Map<string, OfficeForwardTarget>();
  for (const [accountId, target] of nextTargets) {
    assertTrustedApiRequestUrl(target.url);
    if (!target.token) continue;
    validated.set(accountId, target);
  }
  targets = validated;
  reportError = logger ?? (() => undefined);
}

export function clearForwardTargets(): void {
  targets = new Map();
  reportError = () => undefined;
}

export function getForwardMetrics(): Readonly<OfficeForwardMetrics> {
  return { ...metrics };
}

export function resetForwardMetrics(): void {
  metrics.attempted = 0;
  metrics.succeeded = 0;
  metrics.failed = 0;
  metrics.dropped = 0;
  metrics.skipped = 0;
  metrics.inFlight = 0;
}

export async function waitForPendingForwards(): Promise<void> {
  await Promise.allSettled([...pending]);
}

export function forwardOfficeEvent(event: InternalEvent, accountId?: string): void {
  const target = (accountId ? targets.get(accountId) : undefined)
    ?? targets.get("default");
  if (!target) {
    metrics.skipped += 1;
    return;
  }
  if (metrics.inFlight >= MAX_FORWARD_CONCURRENCY) {
    metrics.dropped += 1;
    reportError("openclaw-arinova-ai: office forward dropped at concurrency limit");
    return;
  }

  metrics.attempted += 1;
  metrics.inFlight += 1;
  const operation = (async () => {
    const response = await fetch(target.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${target.token}`,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    });
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  })()
    .then(() => {
      metrics.succeeded += 1;
    })
    .catch((error) => {
      metrics.failed += 1;
      reportError(`openclaw-arinova-ai: office forward failed: ${String(error)}`);
    })
    .finally(() => {
      metrics.inFlight -= 1;
      pending.delete(operation);
    });
  pending.add(operation);
}
