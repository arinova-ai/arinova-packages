import type { Command } from "commander";
import { InvalidArgumentError } from "commander";
import { buildQuery } from "./client.js";

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  cursor?: string;
  all?: boolean;
}

export function parseCount(value: string): number {
  if (!/^\d+$/.test(value)) throw new InvalidArgumentError("Expected a non-negative integer.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new InvalidArgumentError("Expected a safe non-negative integer.");
  return parsed;
}

export function addPaginationOptions(command: Command): Command {
  return command
    .option("--limit <n>", "Maximum items to return", parseCount)
    .option("--offset <n>", "Number of items to skip", parseCount)
    .option("--cursor <cursor>", "Server pagination cursor")
    .option("--all", "Fetch every page");
}

export function paginationQuery(
  options: PaginationOptions,
  cursorKey = "cursor",
): string {
  return buildQuery({
    limit: options.limit,
    offset: options.offset,
    [cursorKey]: options.cursor,
  });
}

export async function collectAllPages<T, C extends string | number>(
  initialCursor: C,
  fetchPage: (cursor: C) => Promise<{ items: T[]; next?: C }>,
): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<C>();
  let cursor: C | undefined = initialCursor;
  while (cursor !== undefined) {
    if (seen.has(cursor)) {
      throw new Error(`Server repeated pagination cursor: ${String(cursor)}`);
    }
    seen.add(cursor);
    const page = await fetchPage(cursor);
    items.push(...page.items);
    cursor = page.next;
  }
  return items;
}
