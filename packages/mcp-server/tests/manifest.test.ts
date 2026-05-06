import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchManifest } from "../src/manifest.js";

describe("fetchManifest", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and parses a valid manifest", async () => {
    const mockManifest = {
      manifestVersion: "1.0.0",
      actions: [
        {
          name: "arinova.test.action",
          version: "1.0.0",
          description: "A test action",
          inputSchema: { type: "object", properties: {} },
          maxExecutionMs: 30000,
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([["etag", '"v1"']]),
        json: () => Promise.resolve(mockManifest),
      }),
    );

    const result = await fetchManifest("https://api.example.com", "ari_test");

    expect(result).not.toBe("not_modified");
    if (result === "not_modified") return;

    expect(result.manifest.manifestVersion).toBe("1.0.0");
    expect(result.manifest.actions).toHaveLength(1);
    expect(result.manifest.actions[0].name).toBe("arinova.test.action");
    expect(result.manifest.actions[0].maxExecutionMs).toBe(30000);
  });

  it("sends Authorization header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map(),
      json: () =>
        Promise.resolve({ manifestVersion: "1", actions: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchManifest("https://api.example.com", "ari_secret");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/actions/agent-manifest",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer ari_secret",
        }),
      }),
    );
  });

  it("sends If-None-Match header when etag provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 304,
      headers: new Map(),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchManifest(
      "https://api.example.com",
      "ari_test",
      '"v1"',
    );

    expect(result).toBe("not_modified");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "If-None-Match": '"v1"',
        }),
      }),
    );
  });

  it("throws on non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: () => Promise.resolve("Invalid token"),
        headers: new Map(),
      }),
    );

    await expect(
      fetchManifest("https://api.example.com", "bad_token"),
    ).rejects.toThrow("Manifest fetch failed: HTTP 401");
  });

  it("throws on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );

    await expect(
      fetchManifest("https://api.example.com", "ari_test"),
    ).rejects.toThrow("Failed to reach manifest endpoint");
  });

  it("throws on invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.reject(new Error("invalid json")),
      }),
    );

    await expect(
      fetchManifest("https://api.example.com", "ari_test"),
    ).rejects.toThrow("not valid JSON");
  });

  it("throws on missing manifestVersion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve({ actions: [] }),
      }),
    );

    await expect(
      fetchManifest("https://api.example.com", "ari_test"),
    ).rejects.toThrow("missing manifestVersion");
  });

  it("skips actions without name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () =>
          Promise.resolve({
            manifestVersion: "1",
            actions: [{ version: "1.0.0" }, { name: "valid", version: "1.0.0" }],
          }),
      }),
    );

    const result = await fetchManifest("https://api.example.com", "ari_test");
    if (result === "not_modified") throw new Error("unexpected");
    expect(result.manifest.actions).toHaveLength(1);
    expect(result.manifest.actions[0].name).toBe("valid");
  });
});
