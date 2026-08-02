import { afterEach, describe, expect, it, vi } from "vitest";
import { httpRequest, HttpRequestError } from "../src/http.js";

describe("httpRequest", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("retries retryable statuses and honors Retry-After", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("busy", {
        status: 429,
        headers: { "Retry-After": "0" },
      }))
      .mockResolvedValueOnce(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await httpRequest("https://api.example.com", {
      timeoutMs: 100,
      retries: 1,
    });
    expect(result.body).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry ordinary client errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await httpRequest("https://api.example.com", {
      timeoutMs: 100,
      retries: 2,
    });
    expect(result.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps retry backoff inside the total request timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("busy", {
      status: 503,
      headers: { "Retry-After": "10" },
    })));
    await expect(httpRequest("https://api.example.com", {
      timeoutMs: 5,
      retries: 2,
    })).rejects.toMatchObject<HttpRequestError>({ code: "TIMEOUT" });
  });

  it("distinguishes caller abort from timeout", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener(
        "abort",
        () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      )),
    ));
    const controller = new AbortController();
    const request = httpRequest("https://api.example.com", {
      timeoutMs: 1_000,
      signal: controller.signal,
      retries: 0,
    });
    controller.abort();
    await expect(request).rejects.toMatchObject<HttpRequestError>({ code: "ABORTED" });
  });
});
