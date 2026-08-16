import { describe, expect, it, vi } from "vitest";
import { collectAllPages, paginationQuery } from "./pagination.js";

describe("pagination", () => {
  it("uses one shared query encoder", () => {
    expect(paginationQuery({ limit: 20, offset: 4, cursor: "a/b" })).toBe(
      "?limit=20&offset=4&cursor=a%2Fb",
    );
  });

  it("collects multiple pages and stops on an empty page", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [1, 2], next: "two" })
      .mockResolvedValueOnce({ items: [3], next: "empty" })
      .mockResolvedValueOnce({ items: [] });

    await expect(collectAllPages("one", fetchPage)).resolves.toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("fails instead of looping on a repeated server cursor", async () => {
    await expect(collectAllPages("same", async () => ({
      items: [1],
      next: "same",
    }))).rejects.toThrow("Server repeated pagination cursor");
  });

  it("fails when a numeric cursor does not strictly advance", async () => {
    await expect(collectAllPages(10, async () => ({
      items: [1],
      next: 9,
    }))).rejects.toThrow("cursor did not advance");
  });

  it("enforces page and item safety limits", async () => {
    await expect(collectAllPages(0 as number, async (offset) => ({
      items: [offset],
      next: offset + 1,
    }), { maxPages: 2 })).rejects.toThrow("2-page safety limit");

    await expect(collectAllPages(0 as number, async () => ({
      items: [1, 2, 3],
    }), { maxItems: 2 })).rejects.toThrow("2-item safety limit");
  });

  it("backs off and retries only errors accepted by the caller", async () => {
    vi.useFakeTimers();
    try {
      const transient = new Error("rate limited");
      const fetchPage = vi.fn()
        .mockRejectedValueOnce(transient)
        .mockResolvedValueOnce({ items: [1] });
      const result = collectAllPages("start", fetchPage, {
        retries: 1,
        retryBaseDelayMs: 25,
        shouldRetry: (error) => error === transient,
      });
      await vi.advanceTimersByTimeAsync(25);
      await expect(result).resolves.toEqual([1]);
      expect(fetchPage).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
