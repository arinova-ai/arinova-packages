import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ApiClient,
  ApiError,
  buildQuery,
  configureClientDefaults,
  del,
  encodePathSegment,
  get,
  post,
  resetClientDefaults,
  uploadMultipart,
  upload,
} from "./client.js";

const mocks = vi.hoisted(() => ({
  resolveApiKey: vi.fn(() => ({ apiKey: "ari_cli_default", profileName: "default", source: "profile" })),
  getEndpoint: vi.fn(() => "https://api.example.test"),
  getProfile: vi.fn(),
}));

vi.mock("./config.js", () => ({
  resolveApiKey: mocks.resolveApiKey,
  getEndpoint: mocks.getEndpoint,
  getProfile: mocks.getProfile,
}));

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.resolveApiKey.mockReturnValue({ apiKey: "ari_cli_default", profileName: "default", source: "profile" });
  mocks.getEndpoint.mockReturnValue("https://api.example.test");
  mocks.getProfile.mockReturnValue(undefined);
  resetClientDefaults();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CLI client", () => {
  it("GET uses configured endpoint and bearer auth header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await expect(get("/api/v1/profile")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/profile",
      expect.objectContaining({
        method: "GET",
        headers: {
          Authorization: "Bearer ari_cli_default",
        },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("explicit API key overrides configured key for JSON requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ created: true }), { status: 200 }),
    );

    await post("/api/v1/messages/send", { content: "hi" }, "ari_cli_override");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/messages/send",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer ari_cli_override",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: "hi" }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("throws a clear missing-token error before fetch", async () => {
    mocks.resolveApiKey.mockImplementation(() => { throw new Error("No API key configured"); });
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(del("/api/v1/notes/note-1")).rejects.toThrow(
      "No API key configured",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("formats JSON API errors with status and body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Forbidden", code: "NOPE" }), { status: 403 }),
    );

    await expect(get("/api/v1/private")).rejects.toMatchObject({
      status: 403,
      body: { error: "Forbidden", code: "NOPE" },
      message: "API error 403: Forbidden",
    } satisfies Partial<ApiError>);
  });

  it("formats non-JSON API errors with raw text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("gateway down", { status: 502 }),
    );

    await expect(get("/api/v1/private")).rejects.toMatchObject({
      status: 502,
      body: "gateway down",
      message: "API error 502: gateway down",
    } satisfies Partial<ApiError>);
  });

  it.each([400, 401, 403, 404, 409, 429, 500])(
    "preserves typed API error details for status %i without retry",
    async (status) => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({
          error: {
            code: `E_${status}`,
            message: "request rejected",
            details: { field: "name" },
          },
        }), { status }),
      );

      await expect(get("/api/v1/resource")).rejects.toMatchObject({
        status,
        code: `E_${status}`,
        details: { field: "name" },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("uploadMultipart sends FormData without JSON content type", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const blob = new Blob(["theme"], { type: "application/zip" });

    await uploadMultipart("/api/v1/themes/upload", { file: blob, name: "dark" }, "PUT");

    const [, options] = fetchMock.mock.calls[0];
    expect(options?.method).toBe("PUT");
    expect(options?.headers).toEqual({ Authorization: "Bearer ari_cli_default" });
    const body = options?.body as FormData;
    const file = body.get("file") as File;
    expect(file).toBeInstanceOf(File);
    expect(file.size).toBe(blob.size);
    expect(file.type).toBe("application/zip");
    expect(body.get("name")).toBe("dark");
  });

  it("upload includes the basename, inferred MIME type, and exact bytes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "arinova-upload-"));
    const input = join(directory, "asset.png");
    writeFileSync(input, new Uint8Array([137, 80, 78, 71]));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("{}", { status: 200 }),
    );
    try {
      await upload("/api/v1/files/upload", input);
      const body = fetchMock.mock.calls[0][1]?.body as FormData;
      const file = body.get("file") as File;
      expect(file.name).toBe("asset.png");
      expect(file.type).toBe("image/png");
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(
        new Uint8Array([137, 80, 78, 71]),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("propagates multipart server size rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        error: { code: "FILE_TOO_LARGE", message: "upload exceeds limit" },
      }), { status: 413 }),
    );
    await expect(uploadMultipart("/api/v1/files/upload", {
      file: new Blob(["large"]),
    })).rejects.toMatchObject({ status: 413, code: "FILE_TOO_LARGE" });
  });

  it("runtime endpoint and token overrides apply to compatibility helpers", async () => {
    configureClientDefaults({
      endpoint: "https://override.example.test/",
      token: "ari_runtime",
      profileName: "runtime",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );

    await expect(get("/api/v1/user/profile")).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://override.example.test/api/v1/user/profile",
      expect.objectContaining({
        headers: { Authorization: "Bearer ari_runtime" },
      }),
    );
  });

  it("selected runtime profile wins over the legacy first-profile fallback", async () => {
    mocks.resolveApiKey.mockReturnValue({ apiKey: "ari_selected", profileName: "selected", source: "profile" });
    configureClientDefaults({ profileName: "selected" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("{}", { status: 200 }),
    );

    await get("/api/v1/user/profile");

    expect(mocks.resolveApiKey).toHaveBeenCalledWith({ profile: "selected" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/user/profile",
      expect.objectContaining({
        headers: { Authorization: "Bearer ari_selected" },
      }),
    );
  });

  it("encodes path segments and omits undefined query values", () => {
    expect(encodePathSegment("a/b c")).toBe("a%2Fb%20c");
    expect(encodePathSegment("version.1")).toBe("version%2E1");
    expect(() => encodePathSegment(".")).toThrow("cannot be '.' or '..'");
    expect(() => encodePathSegment("..")).toThrow("cannot be '.' or '..'");
    expect(buildQuery({ q: "a b", limit: 20, cursor: undefined })).toBe(
      "?q=a+b&limit=20",
    );
  });

  it("returns binary responses without JSON parsing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );
    const client = new ApiClient({
      endpoint: "https://api.example.test",
      token: "ari_binary",
    });

    await expect(
      client.request({
        method: "GET",
        path: "/api/v1/files/file-1/content",
        responseMode: "binary",
      }),
    ).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it("downloads exact bytes, protects existing files, and supports force", async () => {
    const directory = mkdtempSync(join(tmpdir(), "arinova-download-"));
    const output = join(directory, "asset.bin");
    const client = new ApiClient({
      endpoint: "https://api.example.test",
      token: "ari_binary",
    });
    try {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response(new Uint8Array([0, 1, 255])))
        .mockResolvedValueOnce(new Response(new Uint8Array([9, 8])));
      await client.download("/api/v1/files/file-1/content", output);
      expect(readFileSync(output)).toEqual(Buffer.from([0, 1, 255]));
      await expect(
        client.download("/api/v1/files/file-1/content", output),
      ).rejects.toThrow("Use --force");
      await client.download("/api/v1/files/file-1/content", output, true);
      expect(readFileSync(output)).toEqual(Buffer.from([9, 8]));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps SIGINT abort active until a stream ends", async () => {
    let interrupt: (() => void) | undefined;
    vi.spyOn(process, "once").mockImplementation(((event: string, listener: () => void) => {
      if (event === "SIGINT") interrupt = listener;
      return process;
    }) as typeof process.once);
    vi.spyOn(process, "removeListener").mockReturnValue(process);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        queueMicrotask(() => interrupt?.());
      });
    });
    const client = new ApiClient({
      endpoint: "https://api.example.test",
      token: "ari_stream",
    });

    await expect(client.stream("/api/v1/agent/chat/stream")).rejects.toThrow(
      "Request interrupted by SIGINT",
    );
  });
});
