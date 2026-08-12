import { afterEach, describe, expect, it, vi } from "vitest";
import { Arinova, ArinovaError } from "./index.js";
import { request, parseError, parseScopes, stripTrailingSlash } from "./http.js";
import { pkceChallenge, randomString } from "./pkce.js";
import { ArinovaServer } from "./server.js";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function storageStub(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
  };
}

function clientWithSession(expiresAt = Date.now() + 60_000): Arinova {
  const client = new Arinova({
    clientId: "app-1",
    apiUrl: "https://api.test",
    redirectUri: "https://app.test/callback",
  });
  (client as unknown as { _session: unknown })._session = {
    user: { id: "u1", name: "Ada", email: null, image: null },
    accessToken: "token-1",
    tokenType: "Bearer",
    expiresAt,
    scopes: ["profile"],
    agents: [],
  };
  return client;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PKCE invariants and popup lifecycle", () => {
  it("rejects a callback when both returned and stored state are missing", async () => {
    const { storage } = storageStub({ arinova_pkce_verifier: "verifier-1" });
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("window", { location: { href: "https://app.test/callback?code=code-1" } });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const client = new Arinova({ clientId: "app-1", redirectUri: "https://app.test/callback" });
    await expect(client.handleCallback()).rejects.toMatchObject({ code: "state_mismatch" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates redirectUri as an exact absolute callback path", () => {
    expect(() => new Arinova({ clientId: "app-1", redirectUri: "" })).toThrow(/absolute/);
    expect(() => new Arinova({ clientId: "app-1", redirectUri: "/callback" })).toThrow(/absolute/);
    expect(() => new Arinova({ clientId: "app-1", redirectUri: "javascript:alert(1)" })).toThrow(/absolute/);
  });

  it("recomputes the authorize challenge and clears popup PKCE state after success", async () => {
    const { storage, values } = storageStub();
    vi.stubGlobal("sessionStorage", storage);
    const popup = { closed: false, location: { href: "" }, close: vi.fn() };
    const open = vi.fn((authorizeUrl: string) => {
      const authorize = new URL(authorizeUrl);
      popup.location.href = `https://app.test/callback?code=code-1&state=${authorize.searchParams.get("state")}`;
      return popup;
    });
    const win: Record<string, unknown> = {
      location: { origin: "https://app.test", href: "https://app.test/start" },
      open,
    };
    win.self = win;
    win.top = win;
    win.parent = win;
    vi.stubGlobal("window", win);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      access_token: "access-1",
      token_type: "Bearer",
      expires_in: 60,
      scope: "profile",
      user: { id: "u1", name: "Ada", email: null, image: null },
    }));
    const client = new Arinova({ clientId: "app-1", apiUrl: "https://api.test", redirectUri: "https://app.test/callback" });
    const login = client.login({ mode: "popup" });
    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
    const authorize = new URL(open.mock.calls[0]![0]);
    const verifier = values.get("arinova_pkce_verifier")!;
    await expect(pkceChallenge(verifier)).resolves.toBe(authorize.searchParams.get("code_challenge"));
    await vi.waitFor(() => expect(popup.close).toHaveBeenCalledOnce());
    await expect(login).resolves.toMatchObject({ accessToken: "access-1" });
    expect(values.has("arinova_pkce_verifier")).toBe(false);
    expect(values.has("arinova_pkce_state")).toBe(false);
    expect(popup.close).toHaveBeenCalledTimes(1);
  });

  it("reuses an in-flight login instead of opening a second popup", async () => {
    const { storage } = storageStub();
    vi.stubGlobal("sessionStorage", storage);
    const popup = { closed: false, location: { href: "https://consent.test" }, close: vi.fn() };
    const open = vi.fn(() => popup);
    const win: Record<string, unknown> = { location: { origin: "https://app.test", href: "https://app.test" }, open };
    win.self = win;
    win.top = win;
    vi.stubGlobal("window", win);
    const client = new Arinova({ clientId: "app-1", redirectUri: "https://app.test/callback" });
    const first = client.login();
    const second = client.login();
    expect(second).toBe(first);
    // The popup opens only after the async PKCE challenge resolves — wait for
    // it instead of assuming a single macrotask tick is enough.
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(open).toHaveBeenCalledTimes(1);
    popup.closed = true;
    await expect(first).rejects.toMatchObject({ code: "login_cancelled" });
  });

  it("constructs server-side without a redirectUri and fails only at login", async () => {
    vi.stubGlobal("window", undefined);
    const client = new Arinova({ clientId: "app-1", apiUrl: "https://api.test" });
    await expect(client.login()).rejects.toMatchObject({ code: "browser_required" });
  });

  it("removes OAuth parameters from browser history after a redirect exchange", async () => {
    const { storage } = storageStub({
      arinova_pkce_verifier: "verifier-1",
      arinova_pkce_state: "state-1",
    });
    vi.stubGlobal("sessionStorage", storage);
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { href: "https://app.test/callback?code=code-1&state=state-1&keep=yes" },
      history: { replaceState },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      access_token: "access-1", token_type: "Bearer", expires_in: 60, scope: "profile",
      user: { id: "u1", name: "Ada", email: null, image: null },
    }));
    await new Arinova({ clientId: "app-1", apiUrl: "https://api.test", redirectUri: "https://app.test/callback" }).handleCallback();
    expect(replaceState).toHaveBeenCalledWith(null, "", "https://app.test/callback?keep=yes");
  });

  it.each([
    ["https://app.test/callback?code=code-1&state=wrong", "state_mismatch"],
    ["https://app.test/callback?state=state-1", "missing_authorization_code"],
  ])("rejects popup callback edge %s", async (href, code) => {
    vi.useFakeTimers();
    const { storage, values } = storageStub({
      arinova_pkce_verifier: "verifier-1",
      arinova_pkce_state: "state-1",
    });
    vi.stubGlobal("sessionStorage", storage);
    const popup = { closed: false, location: { href }, close: vi.fn() };
    vi.stubGlobal("window", { open: () => popup, location: { href: "https://app.test" } });
    const client = new Arinova({ clientId: "app-1", redirectUri: "https://app.test/callback" });
    const pending = (client as unknown as {
      loginPopup(url: string, state: string, verifier: string): Promise<unknown>;
    }).loginPopup("https://api.test/oauth/authorize", "state-1", "verifier-1");
    const assertion = expect(pending).rejects.toMatchObject({ code });
    await vi.advanceTimersByTimeAsync(200);
    await assertion;
    expect(values.has("arinova_pkce_verifier")).toBe(false);
    expect(values.has("arinova_pkce_state")).toBe(false);
  });

  it("times out a popup, closes it, and clears PKCE state", async () => {
    vi.useFakeTimers();
    const { storage, values } = storageStub({ arinova_pkce_verifier: "v", arinova_pkce_state: "s" });
    vi.stubGlobal("sessionStorage", storage);
    const popup = { closed: false, location: { href: "https://consent.test" }, close: vi.fn() };
    vi.stubGlobal("window", { open: () => popup, location: { href: "https://app.test" } });
    const client = new Arinova({ clientId: "app-1", redirectUri: "https://app.test/callback" });
    const pending = (client as unknown as {
      loginPopup(url: string, state: string, verifier: string): Promise<unknown>;
    }).loginPopup("https://api.test/oauth/authorize", "s", "v");
    const assertion = expect(pending).rejects.toMatchObject({ code: "login_timeout" });
    await vi.advanceTimersByTimeAsync(300_000);
    await assertion;
    expect(popup.close).toHaveBeenCalledOnce();
    expect(values.size).toBe(0);
  });

  it("does not accept a redirectUri prefix-confusion callback", async () => {
    vi.useFakeTimers();
    const { storage } = storageStub({ arinova_pkce_verifier: "v", arinova_pkce_state: "s" });
    vi.stubGlobal("sessionStorage", storage);
    const popup = { closed: false, location: { href: "https://app.test/callback-evil?code=c&state=s" }, close: vi.fn() };
    vi.stubGlobal("window", { open: () => popup, location: { href: "https://app.test" } });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      access_token: "access-1", token_type: "Bearer", expires_in: 60, scope: "profile",
      user: { id: "u1", name: "Ada", email: null, image: null },
    }));
    const client = new Arinova({ clientId: "app-1", apiUrl: "https://api.test", redirectUri: "https://app.test/callback" });
    const pending = (client as unknown as {
      loginPopup(url: string, state: string, verifier: string): Promise<unknown>;
    }).loginPopup("https://api.test/oauth/authorize", "s", "v");
    await vi.advanceTimersByTimeAsync(200);
    expect(popup.close).not.toHaveBeenCalled();
    popup.location.href = "https://app.test/callback?code=c&state=s";
    await vi.advanceTimersByTimeAsync(200);
    await expect(pending).resolves.toMatchObject({ accessToken: "access-1" });
  });

  it("returns from redirect connect instead of leaving an immortal promise", async () => {
    const { storage } = storageStub();
    vi.stubGlobal("sessionStorage", storage);
    const location = { origin: "https://app.test", href: "https://app.test/start" };
    const win: Record<string, unknown> = { location };
    win.self = win;
    win.top = win;
    vi.stubGlobal("window", win);
    const client = new Arinova({ clientId: "app-1", redirectUri: "https://app.test/callback" });
    await expect(client.connect({ mode: "redirect" })).resolves.toBeUndefined();
    expect(location.href).toContain("/oauth/authorize?");
  });

  it("reports browser, storage, and token endpoint failures with stable codes", async () => {
    vi.stubGlobal("window", undefined);
    const serverRendered = new Arinova({ clientId: "app-1", redirectUri: "https://app.test/callback" });
    await expect(serverRendered.login()).rejects.toMatchObject({ code: "browser_required" });

    vi.stubGlobal("window", { location: { origin: "https://app.test" } });
    vi.stubGlobal("sessionStorage", { setItem: () => { throw new Error("denied"); } });
    await expect(serverRendered.login()).rejects.toMatchObject({ code: "storage_unavailable" });

    const available = storageStub();
    vi.stubGlobal("sessionStorage", available.storage);
    vi.stubGlobal("crypto", { getRandomValues: () => { throw new Error("insecure"); } });
    await expect(new Arinova({ clientId: "app-1", redirectUri: "https://app.test/callback" }).login())
      .rejects.toMatchObject({ code: "crypto_unavailable" });

    const { storage } = storageStub({ arinova_pkce_verifier: "v", arinova_pkce_state: "s" });
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("window", { location: { href: "https://app.test/callback?code=c&state=s" } });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      error: { code: "invalid_grant", message: "expired" },
    }, { status: 400 }));
    await expect(new Arinova({ clientId: "app-1", apiUrl: "https://api.test", redirectUri: "https://app.test/callback" }).handleCallback())
      .rejects.toMatchObject({ code: "invalid_grant", status: 400 });
  });
});

describe("typed HTTP failures and cancellation", () => {
  it("wraps fetch rejection and successful non-JSON responses", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("offline"));
    await expect(request("https://api.test/data")).rejects.toMatchObject({ code: "network_error", status: 0 });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("not-json", { status: 200 }));
    await expect(request("https://api.test/data")).rejects.toMatchObject({ code: "invalid_response", status: 200 });
  });

  it("enforces timeout and caller abort with stable error codes", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }));
    const timed = request("https://api.test/slow", { timeoutMs: 10 });
    const timedAssertion = expect(timed).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(10);
    await timedAssertion;

    const controller = new AbortController();
    const aborted = request("https://api.test/slow", { signal: controller.signal });
    const abortedAssertion = expect(aborted).rejects.toMatchObject({ code: "aborted" });
    controller.abort();
    await abortedAssertion;
  });

  it("normalizes all valid HeadersInit forms and preserves bearer auth", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ ok: true }));
    await request("https://api.test/data", { token: "token-1", headers: [["X-Test", "yes"]] });
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/data", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token-1", "x-test": "yes" }),
    }));
  });

  it("rejects expired sessions before network access", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(clientWithSession(Date.now() - 1).user.profile()).rejects.toMatchObject({ code: "token_expired" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries only when explicitly requested", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const pending = request<{ ok: boolean }>("https://api.test/data", { retries: 1 });
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("stream and shared utility contracts", () => {
  it("cancels the response reader when a consumer stops early", async () => {
    const encoder = new TextEncoder();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"chunk","content":"hi"}\r\n'));
      },
      cancel,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(body, { status: 200 }));
    const stream = clientWithSession().agent.chatStream({ agentId: "a1", prompt: "hi" });
    await expect(stream.next()).resolves.toMatchObject({ value: { type: "chunk", content: "hi" } });
    await stream.return(undefined);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("keeps a healthy stream alive past the request timeout", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (let i = 0; i < 3; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 30));
          controller.enqueue(encoder.encode(`data: {"type":"chunk","content":"c${i}"}\n`));
        }
        controller.close();
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(body, { status: 200 }));
    // timeoutMs far below total stream duration: it must only bound the
    // connection phase, never abort an actively-delivering body.
    const stream = clientWithSession().agent.chatStream(
      { agentId: "a1", prompt: "hi" },
      { timeoutMs: 20 },
    );
    const contents: string[] = [];
    for await (const event of stream) {
      if (event.type === "chunk" && typeof event.content === "string") contents.push(event.content);
    }
    expect(contents).toEqual(["c0", "c1", "c2"]);
  });

  it("reports a bodyless successful stream as invalid_response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 200 }));
    const stream = clientWithSession().agent.chatStream({ agentId: "a1", prompt: "hi" });
    await expect(stream.next()).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("yields server error events and maps confidential exchange errors", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"error","error":"model failed"}\n'));
        controller.close();
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(body, { status: 200 }));
    const stream = clientWithSession().agent.chatStream({ agentId: "a1", prompt: "hi" });
    await expect(stream.next()).resolves.toMatchObject({ value: { type: "error", error: "model failed" } });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      error: { code: "invalid_client", message: "bad secret" },
    }, { status: 401 }));
    const server = new ArinovaServer({ clientId: "app-1", clientSecret: "bad", apiUrl: "https://api.test" });
    await expect(server.exchangeCode({ code: "c", redirectUri: "https://app.test/callback" }))
      .rejects.toMatchObject({ code: "invalid_client", status: 401 });
  });

  it("passes a PKCE verifier through confidential server exchange", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      access_token: "access-1", token_type: "Bearer", expires_in: 60, scope: "profile",
      user: { id: "u1", name: "Ada", email: null, image: null },
    }));
    const server = new ArinovaServer({ clientId: "app-1", clientSecret: "secret", apiUrl: "https://api.test" });
    await server.exchangeCode({ code: "code-1", redirectUri: "https://app.test/callback", codeVerifier: "verifier-1" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/oauth/token", expect.objectContaining({
      body: expect.stringContaining('"code_verifier":"verifier-1"'),
    }));
  });

  it("covers utility normalization and random verifier shape", () => {
    expect(parseScopes("profile, agents economy")).toEqual(["profile", "agents", "economy"]);
    expect(stripTrailingSlash("https://api.test///")).toBe("https://api.test");
    expect(parseError({ error: { code: "bad", message: "Bad request" } }, "fallback")).toEqual({ code: "bad", message: "Bad request" });
    expect(randomString(16)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("ignores same-origin auth from a non-parent source and handles scope denial without a scope", async () => {
    const listeners: Array<(event: MessageEvent) => void> = [];
    const parent = { postMessage: vi.fn() };
    const win: Record<string, unknown> = {
      self: null,
      top: {},
      parent,
      location: { origin: "https://app.test", hash: "#bridgeToken=bridge-1" },
      addEventListener: (_type: string, listener: (event: MessageEvent) => void) => listeners.push(listener),
      removeEventListener: (_type: string, listener: (event: MessageEvent) => void) => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      },
    };
    win.self = win;
    vi.stubGlobal("window", win);
    const client = new Arinova({
      clientId: "app-1", authUrl: "https://ui.test", redirectUri: "https://app.test/callback",
    });
    const connect = client.connect({ mode: "iframe", timeout: 1_000 });
    const validPayload = {
      type: "arinova:auth",
      bridgeToken: "bridge-1",
      payload: { protocolVersion: 1, user: { id: "u1" }, accessToken: "token", expiresAt: Date.now() + 60_000 },
    };
    listeners[0]!({ origin: "https://ui.test", source: {} as Window, data: validPayload } as MessageEvent);
    expect(client.session).toBeNull();
    listeners[0]!({ origin: "https://ui.test", source: parent as Window, data: validPayload } as MessageEvent);
    await expect(connect).resolves.toMatchObject({ accessToken: "token" });

    const denied = client.requestScope("economy", { timeout: 1_000 });
    listeners[0]!({
      origin: "https://ui.test", source: parent as Window,
      data: { type: "arinova:scope-denied", bridgeToken: "bridge-1", payload: { protocolVersion: 1, reason: "No consent" } },
    } as MessageEvent);
    await expect(denied).rejects.toMatchObject({ code: "scope_denied", message: "No consent" });
  });
});
