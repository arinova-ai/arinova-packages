import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, del, get, post, uploadMultipart } from "./client.js";

const mocks = vi.hoisted(() => ({
  getApiKey: vi.fn(() => "ari_cli_default"),
  getEndpoint: vi.fn(() => "https://api.example.test"),
}));

vi.mock("./config.js", () => ({
  getApiKey: mocks.getApiKey,
  getEndpoint: mocks.getEndpoint,
}));

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.getApiKey.mockReturnValue("ari_cli_default");
  mocks.getEndpoint.mockReturnValue("https://api.example.test");
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

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/api/v1/profile", {
      method: "GET",
      headers: {
        Authorization: "Bearer ari_cli_default",
        "Content-Type": "application/json",
      },
    });
  });

  it("explicit API key overrides configured key for JSON requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ created: true }), { status: 200 }),
    );

    await post("/api/v1/messages/send", { content: "hi" }, "ari_cli_override");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer ari_cli_override",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: "hi" }),
      },
    );
  });

  it("throws a clear missing-token error before fetch", async () => {
    mocks.getApiKey.mockReturnValue(undefined as unknown as string);
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
      message: 'API error 403: {"error":"Forbidden","code":"NOPE"}',
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
});
