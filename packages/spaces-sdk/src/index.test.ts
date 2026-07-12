import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Arinova, ArinovaError } from "./index.js";
import * as browserEntry from "./index.js";
import { ArinovaServer } from "./server.js";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function connectedClient() {
  const client = new Arinova({
    clientId: "app-1",
    apiUrl: "https://api.test///",
    authUrl: "https://ui.test",
    redirectUri: "https://app.test/callback",
    scopes: ["profile", "economy", "agents"],
  });
  // Seed a session so resource methods work without a real login.
  (client as unknown as { _session: unknown })._session = {
    user: { id: "u1", name: "Ada", email: null, image: null },
    accessToken: "access-1",
    tokenType: "Bearer",
    expiresAt: Date.now() + 1000,
    scopes: ["profile", "economy", "agents"],
    agents: [],
  };
  return client;
}

describe("Arinova config", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to the correct API + auth hosts and profile scope", () => {
    vi.stubGlobal("window", { location: { origin: "https://game.test" } });
    const c = new Arinova({ clientId: "app-1" });
    expect(c.apiUrl).toBe("https://api.chat.arinova.ai");
    expect(c.authUrl).toBe("https://chat.arinova.ai");
    expect(c.redirectUri).toBe("https://game.test/callback");
    expect(c.scopes).toEqual(["profile"]);
  });

  it("trims trailing slashes and requires clientId", () => {
    const c = new Arinova({ clientId: "x", apiUrl: "https://api.test//" });
    expect(c.apiUrl).toBe("https://api.test");
    expect(() => new Arinova({} as never)).toThrow(/clientId/);
  });
});

describe("resource methods (user OAuth token)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("throws before a session exists (no fetch)", async () => {
    const client = new Arinova({ clientId: "app-1", apiUrl: "https://api.test", redirectUri: "https://app.test/cb" });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(client.economy.balance()).rejects.toThrow(/Not connected/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("balance hits the right path with bearer auth", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ balance: 42 }));
    await expect(connectedClient().economy.balance()).resolves.toEqual({ balance: 42 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/api/v1/economy/balance",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer access-1" }),
      }),
    );
  });

  it("purchase posts productId/amount/description", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ transactionId: "t1", newBalance: 10 }));
    await connectedClient().economy.purchase({ productId: "potion", amount: 5, description: "Potion" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/api/v1/economy/purchase",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ productId: "potion", amount: 5, description: "Potion" }),
      }),
    );
  });

  it("transactions builds pagination query", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ transactions: [], total: 0, limit: 25, offset: 50 }));
    await connectedClient().economy.transactions({ limit: 25, offset: 50 });
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/api/v1/economy/transactions?limit=25&offset=50", expect.anything());
  });

  it("user.agents unwraps { agents } and agent.chat posts the body", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ agents: [{ id: "a1", name: "Bo", description: null, avatarUrl: null }] }))
      .mockResolvedValueOnce(jsonResponse({ response: "hi", agentId: "a1" }));
    const client = connectedClient();
    await expect(client.user.agents()).resolves.toEqual([{ id: "a1", name: "Bo", description: null, avatarUrl: null }]);
    await expect(client.agent.chat({ agentId: "a1", prompt: "hello" })).resolves.toEqual({ response: "hi", agentId: "a1" });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.test/api/v1/user/agents", expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.test/api/v1/agent/chat", expect.objectContaining({ method: "POST" }));
  });

  it("surfaces error_description / error / status", async () => {
    const c = connectedClient();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ error_description: "Scope 'economy' required" }, { status: 403 }));
    await expect(c.economy.purchase({ amount: 1 })).rejects.toThrow("Scope 'economy' required");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ error: "insufficient_scope" }, { status: 403 }));
    await expect(c.economy.balance()).rejects.toThrow("insufficient_scope");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("boom", { status: 500 }));
    await expect(c.economy.balance()).rejects.toThrow("Request failed (500)");
  });
});

describe("PKCE callback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("exchanges the code with the stored verifier and builds a session", async () => {
    const store = new Map<string, string>([
      ["arinova_pkce_verifier", "verifier-1"],
      ["arinova_pkce_state", "state-1"],
    ]);
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal("window", { location: { href: "https://app.test/callback?code=code-1&state=state-1" } });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        access_token: "access-2",
        token_type: "Bearer",
        expires_in: 604800,
        scope: "profile",
        user: { id: "u1", name: "Ada", email: "ada@test", image: null },
      }),
    );
    const client = new Arinova({ clientId: "app-1", apiUrl: "https://api.test", redirectUri: "https://app.test/callback" });
    const session = await client.handleCallback();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/oauth/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: "app-1",
          code: "code-1",
          redirect_uri: "https://app.test/callback",
          code_verifier: "verifier-1",
        }),
      }),
    );
    expect(session.accessToken).toBe("access-2");
    expect(session.scopes).toEqual(["profile"]);
    expect(client.accessToken).toBe("access-2");
    expect(store.has("arinova_pkce_verifier")).toBe(false);
  });
});

describe("connect() iframe mode — origin validation", () => {
  let listeners: Array<(e: MessageEvent) => void>;
  let parentWindow: object;
  afterEach(() => vi.unstubAllGlobals());

  function stubIframeWindow() {
    listeners = [];
    parentWindow = { id: "parent", postMessage: vi.fn() };
    const win: Record<string, unknown> = {
      parent: parentWindow,
      top: { id: "top" },
      location: { origin: "https://app.test" },
      addEventListener: (t: string, cb: (e: MessageEvent) => void) => {
        if (t === "message") listeners.push(cb);
      },
      removeEventListener: (t: string, cb: (e: MessageEvent) => void) => {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      },
    };
    win.self = win;
    vi.stubGlobal("window", win);
  }
  const dispatch = (e: Partial<MessageEvent>) => listeners.slice().forEach((cb) => cb(e as MessageEvent));
  const client = () => new Arinova({ clientId: "app-1", apiUrl: "https://api.test", authUrl: "https://ui.test", redirectUri: "https://app.test/cb" });

  it("accepts a same-origin arinova:auth from the parent", async () => {
    stubIframeWindow();
    const p = client().connect({ mode: "iframe", timeout: 1000 });
    dispatch({
      origin: "https://ui.test",
      source: parentWindow as Window,
      data: { type: "arinova:auth", payload: { user: { id: "u1", name: "A", email: null, image: null }, accessToken: "tok", agents: [], scope: "profile agents" } },
    });
    const session = await p;
    expect(session.accessToken).toBe("tok");
    expect(session.scopes).toEqual(["profile", "agents"]);
  });

  it("rejects a foreign-origin message (times out)", async () => {
    stubIframeWindow();
    const p = client().connect({ mode: "iframe", timeout: 60 });
    dispatch({
      origin: "https://evil.test",
      source: parentWindow as Window,
      data: { type: "arinova:auth", payload: { accessToken: "attacker-token" } },
    });
    await expect(p).rejects.toThrow(/connect timeout/);
  });

  it("rejects an empty access token", async () => {
    stubIframeWindow();
    const p = client().connect({ mode: "iframe", timeout: 1000 });
    dispatch({ origin: "https://ui.test", source: parentWindow as Window, data: { type: "arinova:auth", payload: { user: {}, accessToken: "" } } });
    await expect(p).rejects.toThrow(/did not issue an access token/);
  });

  it("requestScope posts a request and resolves on the widened-scope re-auth", async () => {
    stubIframeWindow();
    const p = client().requestScope("economy", { timeout: 1000 });
    expect((parentWindow as { postMessage: (m: unknown, o: string) => void }).postMessage).toHaveBeenCalledWith(
      { type: "arinova:request-scope", payload: { scope: "economy" } },
      "https://ui.test",
    );
    // A re-auth still lacking economy is ignored; the one that carries it resolves.
    dispatch({ origin: "https://ui.test", source: parentWindow as Window, data: { type: "arinova:auth", payload: { user: {}, accessToken: "t1", scope: "profile agents" } } });
    dispatch({ origin: "https://ui.test", source: parentWindow as Window, data: { type: "arinova:auth", payload: { user: {}, accessToken: "t2", scope: "profile agents economy" } } });
    const session = await p;
    expect(session.accessToken).toBe("t2");
    expect(session.scopes).toContain("economy");
  });
});

describe("browser/server split", () => {
  afterEach(() => vi.restoreAllMocks());

  it("the browser entry exposes no server/secret surface", () => {
    expect(browserEntry).not.toHaveProperty("ArinovaServer");
    const c = new Arinova({ clientId: "x", apiUrl: "https://api.test", redirectUri: "https://a/cb" });
    expect((c.economy as Record<string, unknown>).charge).toBeUndefined();
    expect((c.economy as Record<string, unknown>).award).toBeUndefined();
  });

  it("ArinovaServer.charge/award send x-client-id + x-app-secret headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ transactionId: "t1", newBalance: 5 }));
    const server = new ArinovaServer({ clientId: "app-1", clientSecret: "secret-1", apiUrl: "https://api.test" });
    await server.economy.charge({ userId: "u1", amount: 10, description: "x" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/api/v1/economy/charge",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-client-id": "app-1", "x-app-secret": "secret-1" }),
        body: JSON.stringify({ userId: "u1", amount: 10, description: "x" }),
      }),
    );
  });

  it("requires clientId + clientSecret", () => {
    expect(() => new ArinovaServer({ clientId: "x" } as never)).toThrow(/clientSecret/);
  });
});

it("ArinovaError carries status + code", () => {
  const e = new ArinovaError("nope", 403, "insufficient_scope");
  expect(e.status).toBe(403);
  expect(e.code).toBe("insufficient_scope");
  expect(e).toBeInstanceOf(Error);
});
