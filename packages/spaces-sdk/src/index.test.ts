import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Arinova, ArinovaError } from "./index.js";
import * as browserEntry from "./index.js";
import { ArinovaServer } from "./server.js";
import { pkceChallenge } from "./pkce.js";

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
    const c = new Arinova({ clientId: "x", apiUrl: "https://api.test//", redirectUri: "https://app.test/callback" });
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

  it("purchase posts the space-bound contract and idempotency key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      transactionId: "t1", newBalance: 10, spaceId: "space-1", creatorShare: 4, idempotentReplay: false,
    }));
    await connectedClient().economy.purchase({
      spaceId: "space-1",
      productId: "potion",
      amount: 5,
      description: "Potion",
      idempotencyKey: "purchase-1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/api/v1/economy/purchase",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          spaceId: "space-1",
          productId: "potion",
          amount: 5,
          description: "Potion",
          idempotencyKey: "purchase-1",
        }),
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

  it("maps user.profile(), handles 204, and logout clears the session", async () => {
    const profile = { id: "u1", name: "Ada", email: null, image: null, isVerified: true };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(profile))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = connectedClient();
    await expect(client.user.profile()).resolves.toEqual(profile);
    await expect((client as unknown as {
      apiPost: <T>(path: string, body: unknown) => Promise<T>;
    }).apiPost("/api/v1/no-content", {})).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    client.logout();
    expect(client.session).toBeNull();
    expect(client.accessToken).toBeNull();
  });

  it("surfaces nested API-v1 and flat OAuth errors", async () => {
    const c = connectedClient();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      error: { code: "SPACE_ID_REQUIRED", message: "Space-bound OAuth token and spaceId are required" },
    }, { status: 400 }));
    await expect(c.economy.purchase({ spaceId: "space-1", amount: 1 })).rejects.toMatchObject({
      message: "Space-bound OAuth token and spaceId are required",
      code: "SPACE_ID_REQUIRED",
      status: 400,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      error: "invalid_grant", error_description: "Authorization code expired",
    }, { status: 400 }));
    await expect(c.economy.balance()).rejects.toMatchObject({
      message: "Authorization code expired",
      code: "invalid_grant",
    });
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

  it.each([
    ["https://app.test/callback?state=state-1", /No authorization code/],
    ["https://app.test/callback?code=code-1&state=wrong", /State mismatch/],
  ])("rejects invalid callback %s", async (href, error) => {
    const store = new Map<string, string>([
      ["arinova_pkce_verifier", "verifier-1"],
      ["arinova_pkce_state", "state-1"],
    ]);
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal("window", { location: { href } });
    const client = new Arinova({ clientId: "app-1", redirectUri: "https://app.test/callback" });
    await expect(client.handleCallback()).rejects.toThrow(error);
  });

  it("rejects a callback when the verifier is missing", async () => {
    const store = new Map<string, string>([["arinova_pkce_state", "state-1"]]);
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal("window", { location: { href: "https://app.test/callback?code=code-1&state=state-1" } });
    const client = new Arinova({ clientId: "app-1", redirectUri: "https://app.test/callback" });
    await expect(client.handleCallback()).rejects.toThrow(/No PKCE verifier/);
  });

  it("auto-fetches agents after exchange and treats that fetch as best-effort", async () => {
    const makeStorage = () => {
      const store = new Map<string, string>([
        ["arinova_pkce_verifier", "verifier-1"],
        ["arinova_pkce_state", "state-1"],
      ]);
      return {
        getItem: (k: string) => store.get(k) ?? null,
        removeItem: (k: string) => void store.delete(k),
      };
    };
    vi.stubGlobal("window", { location: { href: "https://app.test/callback?code=code-1&state=state-1" } });
    const token = {
      access_token: "access-2",
      token_type: "Bearer",
      expires_in: 60,
      scope: "profile agents",
      user: { id: "u1", name: "Ada", email: null, image: null },
    };
    vi.stubGlobal("sessionStorage", makeStorage());
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(token))
      .mockResolvedValueOnce(jsonResponse({ agents: [{ id: "a1", name: "Bo", description: null, avatarUrl: null }] }));
    const first = new Arinova({ clientId: "app-1", apiUrl: "https://api.test", redirectUri: "https://app.test/callback" });
    await expect(first.handleCallback()).resolves.toMatchObject({ agents: [{ id: "a1" }] });

    vi.stubGlobal("sessionStorage", makeStorage());
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(token))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    const second = new Arinova({ clientId: "app-1", apiUrl: "https://api.test", redirectUri: "https://app.test/callback" });
    await expect(second.handleCallback()).resolves.toMatchObject({ agents: [] });
  });
});

describe("login modes", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stubLoginEnvironment(open: () => unknown) {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      setItem: (k: string, v: string) => void store.set(k, v),
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => void store.delete(k),
    });
    const location = { origin: "https://app.test", href: "https://app.test/start" };
    const win: Record<string, unknown> = { location, open };
    win.self = win;
    win.top = win;
    win.parent = win;
    vi.stubGlobal("window", win);
    return location;
  }

  it("redirect login navigates to the PKCE authorize endpoint", async () => {
    const location = stubLoginEnvironment(() => null);
    const client = new Arinova({
      clientId: "app-1",
      apiUrl: "https://api.test",
      redirectUri: "https://app.test/callback",
      scopes: ["profile", "agents"],
    });
    await client.login({ mode: "redirect" });
    const url = new URL(location.href);
    expect(`${url.origin}${url.pathname}`).toBe("https://api.test/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe("profile agents");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("popup-blocked login falls back to redirect and rejects clearly", async () => {
    const location = stubLoginEnvironment(() => null);
    const client = new Arinova({
      clientId: "app-1",
      apiUrl: "https://api.test",
      redirectUri: "https://app.test/callback",
    });
    await expect(client.login({ mode: "popup" })).rejects.toThrow(/Popup blocked/);
    expect(location.href).toMatch(/^https:\/\/api\.test\/oauth\/authorize\?/);
  });

  it("connect auto uses popup outside an iframe", async () => {
    const location = stubLoginEnvironment(() => null);
    const client = new Arinova({
      clientId: "app-1",
      apiUrl: "https://api.test",
      redirectUri: "https://app.test/callback",
    });
    await expect(client.connect()).rejects.toThrow(/Popup blocked/);
    expect(location.href).toContain("/oauth/authorize?");
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
      data: { type: "arinova:auth", payload: { user: { id: "u1", name: "A", email: null, image: null }, accessToken: "tok", expiresAt: Date.now() + 60_000, agents: [], scope: "profile agents" } },
    });
    const session = await p;
    expect(session.accessToken).toBe("tok");
    expect(session.scopes).toEqual(["profile", "agents"]);
    expect(session.spaceId).toBeUndefined();
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
    dispatch({ origin: "https://ui.test", source: parentWindow as Window, data: { type: "arinova:auth", payload: { user: { id: "u1" }, accessToken: "t1", expiresAt: Date.now() + 60_000, scope: "profile agents" } } });
    dispatch({ origin: "https://ui.test", source: parentWindow as Window, data: { type: "arinova:auth", payload: { user: { id: "u1" }, accessToken: "t2", expiresAt: Date.now() + 60_000, scope: "profile agents economy" } } });
    const session = await p;
    expect(session.accessToken).toBe("t2");
    expect(session.scopes).toContain("economy");
  });

  it("updates the session for valid intermediate auth and rejects host denial immediately", async () => {
    stubIframeWindow();
    const c = client();
    const p = c.requestScope("economy", { timeout: 1000 });
    dispatch({
      origin: "https://ui.test",
      source: parentWindow as Window,
      data: {
        type: "arinova:auth",
        payload: { user: { id: "u1" }, accessToken: "profile-token", expiresAt: Date.now() + 60_000, scope: "profile", spaceId: "space-1" },
      },
    });
    expect(c.session).toMatchObject({ accessToken: "profile-token", spaceId: "space-1" });
    dispatch({
      origin: "https://ui.test",
      source: parentWindow as Window,
      data: {
        type: "arinova:scope-denied",
        payload: { scope: "economy", reason: "User declined" },
      },
    });
    await expect(p).rejects.toMatchObject({ message: "User declined", code: "scope_denied" });
  });

  it("requestScope rejects outside an embedded window and times out without approval", async () => {
    const topWindow: Record<string, unknown> = {
      parent: null,
      top: null,
      location: { origin: "https://app.test" },
    };
    topWindow.parent = topWindow;
    topWindow.top = topWindow;
    topWindow.self = topWindow;
    vi.stubGlobal("window", topWindow);
    await expect(client().requestScope("economy")).rejects.toThrow(/only available inside/);

    stubIframeWindow();
    await expect(client().requestScope("economy", { timeout: 10 })).rejects.toThrow(/was not granted/);
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

  it("ArinovaServer only exposes confidential exchangeCode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      access_token: "token-1",
      token_type: "Bearer",
      expires_in: 60,
      scope: "profile",
      user: { id: "u1", name: "Ada", email: null, image: null },
    }));
    const server = new ArinovaServer({ clientId: "app-1", clientSecret: "secret-1", apiUrl: "https://api.test" });
    expect((server as unknown as Record<string, unknown>).economy).toBeUndefined();
    await server.exchangeCode({ code: "code-1", redirectUri: "https://app.test/callback" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/oauth/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: "app-1",
          client_secret: "secret-1",
          code: "code-1",
          redirect_uri: "https://app.test/callback",
        }),
      }),
    );
  });

  it("requires clientId + clientSecret", () => {
    expect(() => new ArinovaServer({ clientId: "x" } as never)).toThrow(/clientSecret/);
  });
});

describe("agent chat streaming", () => {
  afterEach(() => vi.restoreAllMocks());

  it("buffers split chunks, ignores malformed frames, and emits the final unterminated frame", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"chunk","con'));
        controller.enqueue(encoder.encode('tent":"hel"}\n\ndata: nope\n'));
        controller.enqueue(encoder.encode('data: {"type":"done","content":"hel","agentId":"a1"}'));
        controller.close();
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(body, { status: 200 }));
    const events = [];
    for await (const event of connectedClient().agent.chatStream({ agentId: "a1", prompt: "hi" })) {
      events.push(event);
    }
    expect(events).toEqual([
      { type: "chunk", content: "hel" },
      { type: "done", content: "hel", agentId: "a1" },
    ]);
  });

  it("parses nested HTTP errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      error: { code: "INSUFFICIENT_SCOPE", message: "Scope 'agents' required" },
    }, { status: 403 }));
    const stream = connectedClient().agent.chatStream({ agentId: "a1", prompt: "hi" });
    await expect(stream.next()).rejects.toMatchObject({
      message: "Scope 'agents' required",
      code: "INSUFFICIENT_SCOPE",
      status: 403,
    });
  });
});

it("pkceChallenge matches the RFC 7636 S256 vector", async () => {
  await expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
    .resolves.toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

it("ArinovaError carries status + code", () => {
  const e = new ArinovaError("nope", 403, "insufficient_scope");
  expect(e.status).toBe(403);
  expect(e.code).toBe("insufficient_scope");
  expect(e).toBeInstanceOf(Error);
});
