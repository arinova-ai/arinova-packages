import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchManifest } from "../src/manifest.js";

function response(body: unknown, init: ResponseInit = {}): Response {
  return new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    { status: 200, ...init },
  );
}

describe("fetchManifest", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("fetches a valid manifest and reads Headers case-insensitively", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({
      manifestVersion: "1.0.0",
      actions: [{
        name: "arinova.test.action",
        version: "1.0.0",
        inputSchema: { type: "object" },
        maxExecutionMs: 30_000,
      }],
    }, { headers: new Headers({ ETag: '"v1"' }) })));

    const result = await fetchManifest("https://api.example.com", "ari_test");
    expect(result).not.toBe("not_modified");
    if (result === "not_modified") return;
    expect(result.etag).toBe('"v1"');
    expect(result.manifest.actions[0]).toMatchObject({
      name: "arinova.test.action",
      maxExecutionMs: 30_000,
    });
  });

  it("sends Authorization and If-None-Match headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", mockFetch);

    await expect(fetchManifest(
      "https://api.example.com",
      "ari_secret",
      '"v1"',
    )).resolves.toBe("not_modified");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/actions/agent-manifest",
      expect.objectContaining({ headers: expect.objectContaining({
        Authorization: "Bearer ari_secret",
        "If-None-Match": '"v1"',
      }) }),
    );
  });

  it("maps non-OK and network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("Invalid token", {
      status: 401,
      statusText: "Unauthorized",
    })));
    await expect(fetchManifest("https://api.example.com", "bad"))
      .rejects.toThrow("Manifest fetch failed: HTTP 401");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(fetchManifest("https://api.example.com", "ari_test"))
      .rejects.toThrow("Failed to reach manifest endpoint");
  });

  it("times out a stalled request", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(
          Object.assign(new Error("aborted"), { name: "AbortError" }),
        ));
      }),
    ));
    await expect(fetchManifest("https://api.example.com", "ari_test", undefined, {
      timeoutMs: 5,
    })).rejects.toThrow("timed out after 5ms");
  });

  it("rejects invalid JSON and malformed top-level fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("not-json")));
    await expect(fetchManifest("https://api.example.com", "ari_test"))
      .rejects.toThrow("not valid JSON");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ actions: [] })));
    await expect(fetchManifest("https://api.example.com", "ari_test"))
      .rejects.toThrow("missing manifestVersion");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({
      manifestVersion: "1",
      actions: null,
    })));
    await expect(fetchManifest("https://api.example.com", "ari_test"))
      .rejects.toThrow("missing actions array");
  });

  it("caps both declared and chunked response bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("x", {
      headers: { "content-length": String(11 * 1024 * 1024) },
    })));
    await expect(fetchManifest("https://api.example.com", "ari_test"))
      .rejects.toThrow("exceeds 10485760 byte limit");

    const chunk = new Uint8Array(6 * 1024 * 1024);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(chunk);
          controller.enqueue(chunk);
          controller.close();
        },
      }),
    )));
    await expect(fetchManifest("https://api.example.com", "ari_test"))
      .rejects.toThrow("exceeds 10485760 byte limit");
  });

  it("skips unnamed actions and normalizes optional fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({
      manifestVersion: "1",
      actions: [
        { version: "1.0.0" },
        {
          name: "arinova.optional",
          description: 123,
          promptSummary: "Summary",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
          confirmation: "user-confirm",
          maxExecutionMs: "fast",
          maxArgumentsBytes: 2048,
          deprecated: true,
          replacementAction: "arinova.replacement",
          removed: true,
        },
      ],
    })));
    const result = await fetchManifest("https://api.example.com", "ari_test");
    if (result === "not_modified") throw new Error("unexpected 304");
    expect(result.manifest.actions).toHaveLength(1);
    expect(result.manifest.actions[0]).toEqual({
      name: "arinova.optional",
      version: "0.0.0",
      description: undefined,
      promptSummary: "Summary",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      confirmation: "user-confirm",
      maxExecutionMs: undefined,
      maxArgumentsBytes: 2048,
      deprecated: true,
      replacementAction: "arinova.replacement",
      removed: true,
    });
  });
});
