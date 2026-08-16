import { afterEach, describe, expect, it, vi } from "vitest";
import { apiCall } from "./tools.js";

afterEach(() => vi.unstubAllGlobals());

describe("apiCall", () => {
  it("sends authorization and JSON bodies through the real fetch path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiCall({
      method: "POST",
      url: "https://api.test/items",
      token: "secret",
      body: { name: "item" },
    })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/items", expect.objectContaining({
      method: "POST",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: '{"name":"item"}',
      signal: expect.any(AbortSignal),
    }));
  });

  it("maps an empty 204 body to undefined", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiCall({ method: "DELETE", url: "https://api.test/item", token: "x" }))
      .resolves.toBeUndefined();
  });

  it("bounds HTTP errors and keeps non-JSON success text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("plain", { status: 200 })));
    await expect(apiCall({ method: "GET", url: "https://api.test/text", token: "x" }))
      .resolves.toBe("plain");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", { status: 403 })));
    await expect(apiCall({ method: "GET", url: "https://api.test/fail", token: "x" }))
      .rejects.toThrow("HTTP 403: denied");
  });

  it("rejects a buffered response whose declared size exceeds the cap", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("large", {
      headers: { "Content-Length": String(10 * 1024 * 1024 + 1) },
    })));
    await expect(apiCall({
      method: "GET",
      url: "https://api.test/large",
      token: "x",
    })).rejects.toThrow("safety limit");
  });
});
