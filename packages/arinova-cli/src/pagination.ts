import type { Command } from "commander";
import { InvalidArgumentError } from "commander";
import { buildQuery } from "./client.js";

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  cursor?: string;
  all?: boolean;
}

export interface PaginationOptionConfig {
  mode?: "offset" | "cursor" | "both";
  allowAll?: boolean;
  defaultLimit?: number;
}

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;
export const MAX_COLLECTED_PAGES = 100;
export const MAX_COLLECTED_ITEMS = 10_000;

export interface CollectAllPagesOptions {
  maxPages?: number;
  maxItems?: number;
  retries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  interPageDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
}

export function parseCount(value: string): number {
  if (!/^\d+$/.test(value)) throw new InvalidArgumentError("Expected a non-negative integer.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new InvalidArgumentError("Expected a safe non-negative integer.");
  return parsed;
}

export function addPaginationOptions(
  command: Command,
  config: PaginationOptionConfig = {},
): Command {
  const mode = config.mode ?? "both";
  command.option(
    "--limit <n>",
    `Maximum items to return (default ${config.defaultLimit ?? DEFAULT_PAGE_LIMIT})`,
    parseCount,
    config.defaultLimit ?? DEFAULT_PAGE_LIMIT,
  );
  if (mode === "offset" || mode === "both") {
    command.option("--offset <n>", "Number of items to skip", parseCount);
  }
  if (mode === "cursor" || mode === "both") {
    command.option("--cursor <cursor>", "Server pagination cursor");
  }
  if (config.allowAll) command.option("--all", "Fetch every page");
  return command;
}

export function paginationValues(
  options: PaginationOptions,
  cursorKey = "cursor",
): Record<string, string | number | undefined> {
  return {
    limit: pageLimit(options.limit),
    offset: options.offset,
    [cursorKey]: options.cursor,
  };
}

export function paginationQuery(
  options: PaginationOptions,
  cursorKey = "cursor",
): string {
  return buildQuery(paginationValues(options, cursorKey));
}

export function pageLimit(
  requested: number | undefined,
  fallback = DEFAULT_PAGE_LIMIT,
): number {
  return Math.min(requested ?? fallback, MAX_PAGE_LIMIT);
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function collectAllPages<T, C extends string | number>(
  initialCursor: C,
  fetchPage: (cursor: C) => Promise<{ items: T[]; next?: C }>,
  options: CollectAllPagesOptions = {},
): Promise<T[]> {
  const maxPages = options.maxPages ?? MAX_COLLECTED_PAGES;
  const maxItems = options.maxItems ?? MAX_COLLECTED_ITEMS;
  const retries = options.retries ?? 0;
  const retryBaseDelayMs = options.retryBaseDelayMs ?? 100;
  const retryMaxDelayMs = options.retryMaxDelayMs ?? 5_000;
  const interPageDelayMs = options.interPageDelayMs ?? 0;
  assertPositiveInteger(maxPages, "maxPages");
  assertPositiveInteger(maxItems, "maxItems");
  if (!Number.isSafeInteger(retries) || retries < 0) {
    throw new TypeError("retries must be a non-negative safe integer");
  }

  const items: T[] = [];
  const seen = new Set<C>();
  let cursor: C | undefined = initialCursor;
  let pageCount = 0;
  while (cursor !== undefined) {
    if (pageCount >= maxPages) {
      throw new Error(`Pagination exceeded the ${maxPages}-page safety limit`);
    }
    if (seen.has(cursor)) {
      throw new Error(`Server repeated pagination cursor: ${String(cursor)}`);
    }
    seen.add(cursor);

    let page: { items: T[]; next?: C } | undefined;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        page = await fetchPage(cursor);
        break;
      } catch (error) {
        if (attempt >= retries || !options.shouldRetry?.(error)) throw error;
        const delayMs = Math.min(
          retryMaxDelayMs,
          retryBaseDelayMs * 2 ** attempt,
        );
        await wait(delayMs);
      }
    }
    if (!page) throw new Error("Pagination request did not return a page");
    pageCount += 1;
    if (items.length + page.items.length > maxItems) {
      throw new Error(`Pagination exceeded the ${maxItems}-item safety limit`);
    }
    items.push(...page.items);
    if (
      typeof cursor === "number"
      && typeof page.next === "number"
      && page.next <= cursor
    ) {
      throw new Error(
        `Server pagination cursor did not advance: ${page.next} <= ${cursor}`,
      );
    }
    cursor = page.next;
    if (cursor !== undefined && interPageDelayMs > 0) {
      await wait(interPageDelayMs);
    }
  }
  return items;
}
