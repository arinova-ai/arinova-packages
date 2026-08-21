import { afterEach, describe, expect, it, vi } from "vitest";
import { ArinovaServer } from "./server.js";

const SPACE_ID = "11111111-1111-4111-8111-111111111111";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function serviceToken(accessToken = "service-1"): Response {
  return jsonResponse({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    scope: "llm",
    space_id: SPACE_ID,
  });
}

function generation(text = "hello"): Response {
  return jsonResponse({
    requestId: "22222222-2222-4222-8222-222222222222",
    text,
    replayed: false,
    model: "anthropic/claude-haiku-4.5",
    usage: { inputTokens: 10, outputTokens: 4, costMicroUsd: 12 },
    reservePoints: 3,
    actualPoints: 1,
    refundedPoints: 2,
    daily: { spentPoints: 7, capPoints: 50_000 },
  });
}

function server(): ArinovaServer {
  return new ArinovaServer({
    clientId: "app-1",
    clientSecret: "secret-1",
    apiUrl: "https://api.test/",
  });
}

afterEach(() => vi.restoreAllMocks());

describe("SpaceLlmApi", () => {
  it("exchanges a confidential token, generates, and caches the token by Space", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(serviceToken())
      .mockResolvedValueOnce(generation("first"))
      .mockResolvedValueOnce(generation("second"));
    const llm = server().spaceLlm;
    const params = {
      spaceId: SPACE_ID,
      system: "Return JSON",
      input: "Say hello",
      jsonSchema: { type: "object" },
      maxOutputTokens: 4096,
      idempotencyKey: "quiz-room-1",
    };

    await expect(llm.generate(params)).resolves.toMatchObject({ text: "first" });
    await expect(llm.generate({ ...params, idempotencyKey: "quiz-room-2" }, {
      timeoutMs: 45_000,
    })).resolves.toMatchObject({ text: "second" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.test/oauth/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: "app-1",
          client_secret: "secret-1",
          scope: "llm",
          space_id: SPACE_ID,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.test/api/v1/space-llm/generate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer service-1" }),
        body: JSON.stringify({
          input: "Say hello",
          idempotencyKey: "quiz-room-1",
          system: "Return JSON",
          jsonSchema: { type: "object" },
          maxOutputTokens: 4096,
        }),
      }),
    );
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ signal: expect.any(AbortSignal) });
  });

  it("deduplicates concurrent service-token exchanges", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(serviceToken())
      .mockResolvedValueOnce(generation("one"))
      .mockResolvedValueOnce(generation("two"));
    const llm = server().spaceLlm;
    const base = { spaceId: SPACE_ID, input: "prompt", idempotencyKey: "call-1" };

    await expect(Promise.all([
      llm.generate(base),
      llm.generate({ ...base, idempotencyKey: "call-2" }),
    ])).resolves.toHaveLength(2);

    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/oauth/token"))).toHaveLength(1);
  });

  it("normalizes an uppercase Space UUID for the OAuth target", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(serviceToken())
      .mockResolvedValueOnce(generation());
    await server().spaceLlm.generate({
      spaceId: SPACE_ID.toUpperCase(),
      input: "prompt",
      idempotencyKey: "uppercase-space",
    });
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      body: expect.stringContaining(`\"space_id\":\"${SPACE_ID}\"`),
    });
  });

  it("refreshes a rejected service token once", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(serviceToken("expired"))
      .mockResolvedValueOnce(jsonResponse({
        error: "invalid_token",
        errorCode: "OAUTH_INVALID_TOKEN",
      }, { status: 401 }))
      .mockResolvedValueOnce(serviceToken("fresh"))
      .mockResolvedValueOnce(generation());

    await expect(server().spaceLlm.generate({
      spaceId: SPACE_ID,
      input: "prompt",
      idempotencyKey: "retry-safe-call",
    })).resolves.toMatchObject({ text: "hello" });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3]![1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: "Bearer fresh" }),
    });
  });

  it.each([
    [{ spaceId: "bad", input: "prompt", idempotencyKey: "key" }, "invalid_space_id"],
    [{ spaceId: SPACE_ID, input: "", idempotencyKey: "key" }, "invalid_input"],
    [{ spaceId: SPACE_ID, input: "prompt", idempotencyKey: "contains space" }, "invalid_idempotency_key"],
    [{ spaceId: SPACE_ID, input: "prompt", idempotencyKey: "key", maxOutputTokens: 0 }, "invalid_max_output_tokens"],
    [{ spaceId: SPACE_ID, input: "prompt", idempotencyKey: "key", model: "" }, "invalid_model"],
  ])("rejects invalid generation input before fetching: %j", async (params, code) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(server().spaceLlm.generate(params)).rejects.toMatchObject({ code });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized or non-serializable JSON schema before fetching", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(server().spaceLlm.generate({
      spaceId: SPACE_ID,
      input: "prompt",
      idempotencyKey: "key-1",
      jsonSchema: { description: "x".repeat(8_192) },
    })).rejects.toMatchObject({ code: "invalid_json_schema" });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(server().spaceLlm.generate({
      spaceId: SPACE_ID,
      input: "prompt",
      idempotencyKey: "key-2",
      jsonSchema: circular,
    })).rejects.toMatchObject({ code: "invalid_json_schema" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
