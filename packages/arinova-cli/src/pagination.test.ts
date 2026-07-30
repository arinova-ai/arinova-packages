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
});
