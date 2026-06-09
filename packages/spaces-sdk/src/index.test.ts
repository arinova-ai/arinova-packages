import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Arinova } from "./index.js";

function createClient() {
  const client = new Arinova({
    appId: "app-1",
    endpoint: "https://spaces.example.test///",
    redirectUri: "https://app.example.test/callback",
    scope: "profile economy",
  });
  client.accessToken = "access-1";
  return client;
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("Arinova Spaces SDK request builders", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("trims endpoint and sends bearer auth for balance requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ balance: 42 }),
    );
    const client = createClient();

    await expect(client.balance()).resolves.toEqual({ balance: 42 });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://spaces.example.test/api/v1/economy/balance",
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer access-1",
        },
      },
    );
  });

  it("builds purchase request JSON body", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ transactionId: "txn-1", newBalance: 10 }),
    );
    const client = createClient();

    await client.purchase("product-1", 5, "Test purchase");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://spaces.example.test/api/v1/economy/purchase",
      {
        method: "POST",
        body: JSON.stringify({
          productId: "product-1",
          amount: 5,
          description: "Test purchase",
        }),
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer access-1",
        },
      },
    );
  });

  it("builds transaction pagination query parameters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ transactions: [], total: 0, limit: 25, offset: 50 }),
    );
    const client = createClient();

    await client.transactions(25, 50);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://spaces.example.test/api/v1/economy/transactions?limit=25&offset=50",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer access-1" }),
      }),
    );
  });

  it("normalizes API errors from error_description, error, or status", async () => {
    const client = createClient();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ error_description: "Scope denied" }, { status: 403 }),
    );
    await expect(client.balance()).rejects.toThrow("Scope denied");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ error: "Insufficient balance" }, { status: 402 }),
    );
    await expect(client.purchase("product-1", 999)).rejects.toThrow("Insufficient balance");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("not json", { status: 500 }),
    );
    await expect(client.transactions()).rejects.toThrow("API error (500)");
  });

  it("rejects API calls before login", async () => {
    const client = new Arinova({
      appId: "app-1",
      endpoint: "https://spaces.example.test",
      redirectUri: "https://app.example.test/callback",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(client.balance()).rejects.toThrow("Not logged in");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchanges OAuth callback code with stored PKCE verifier", async () => {
    const storage = new Map<string, string>([
      ["arinova_pkce_verifier", "verifier-1"],
      ["arinova_pkce_state", "state-1"],
    ]);
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => { storage.delete(key); },
      setItem: (key: string, value: string) => { storage.set(key, value); },
    });
    vi.stubGlobal("window", {
      location: {
        href: "https://app.example.test/callback?code=code-1&state=state-1",
      },
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        access_token: "access-2",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "profile",
        user: {
          id: "user-1",
          name: "Ada",
          email: "ada@example.test",
          image: null,
        },
      }),
    );
    const client = new Arinova({
      appId: "app-1",
      endpoint: "https://spaces.example.test",
      redirectUri: "https://app.example.test/callback",
    });

    const token = await client.handleCallback();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://spaces.example.test/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: "app-1",
          code: "code-1",
          redirect_uri: "https://app.example.test/callback",
          code_verifier: "verifier-1",
        }),
      },
    );
    expect(token.access_token).toBe("access-2");
    expect(client.accessToken).toBe("access-2");
    expect(storage.has("arinova_pkce_verifier")).toBe(false);
    expect(storage.has("arinova_pkce_state")).toBe(false);
  });
});
