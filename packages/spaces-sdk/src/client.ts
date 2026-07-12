import { request, ArinovaError, stripTrailingSlash, parseScopes } from "./http.js";
import { randomString, pkceChallenge } from "./pkce.js";
import type {
  ArinovaConfig,
  ArinovaSession,
  ArinovaUser,
  AgentInfo,
  ConnectOptions,
  LoginOptions,
  TokenResponse,
  BalanceResponse,
  PurchaseParams,
  PurchaseResponse,
  TransactionsParams,
  TransactionsResponse,
  AgentChatParams,
  AgentChatResponse,
  AgentChatEvent,
} from "./types.js";

const DEFAULT_API_URL = "https://api.chat.arinova.ai";
const DEFAULT_AUTH_URL = "https://chat.arinova.ai";
const VERIFIER_KEY = "arinova_pkce_verifier";
const STATE_KEY = "arinova_pkce_state";
const POPUP_TIMEOUT_MS = 300_000;

/**
 * Browser Arinova client — OAuth-PKCE login, iframe `connect()`, and
 * user-token resource calls. Server-to-server operations (charge/award,
 * confidential token exchange) live in `@arinova-ai/spaces-sdk/server`.
 */
export class Arinova {
  readonly clientId: string;
  readonly apiUrl: string;
  readonly authUrl: string;
  readonly redirectUri: string;
  readonly scopes: string[];
  private _session: ArinovaSession | null = null;

  constructor(config: ArinovaConfig) {
    if (!config || !config.clientId) throw new Error("Arinova: `clientId` is required");
    this.clientId = config.clientId;
    this.apiUrl = stripTrailingSlash(config.apiUrl ?? DEFAULT_API_URL);
    this.authUrl = stripTrailingSlash(config.authUrl ?? DEFAULT_AUTH_URL);
    this.redirectUri =
      config.redirectUri ??
      (typeof window !== "undefined" ? `${window.location.origin}/callback` : "");
    this.scopes = (config.scopes && config.scopes.length ? [...config.scopes] : ["profile"]) as string[];
  }

  /** The current session, or null. */
  get session(): ArinovaSession | null {
    return this._session;
  }
  /** Convenience: the current access token, or null. */
  get accessToken(): string | null {
    return this._session?.accessToken ?? null;
  }
  /** Clear the in-memory session. */
  logout(): void {
    this._session = null;
  }

  // ── connect: one environment-aware entry point ──────────────────
  async connect(options: ConnectOptions = {}): Promise<ArinovaSession> {
    const mode = options.mode ?? "auto";
    const embedded = typeof window !== "undefined" && window.self !== window.top;
    if (mode === "iframe" || (mode === "auto" && embedded)) {
      return this.connectIframe(options.timeout ?? 5000);
    }
    if (mode === "redirect") {
      await this.login({ mode: "redirect" });
      // Page navigates away; never resolves.
      return new Promise<ArinovaSession>(() => {});
    }
    return (await this.login({ mode: "popup" })) as ArinovaSession;
  }

  /** Embedded (iframe) mode: wait for an origin-validated `arinova:auth`. */
  private connectIframe(timeout: number): Promise<ArinovaSession> {
    return this.awaitAuth(timeout);
  }

  /**
   * Ask the Arinova parent to upgrade the embedded session to include an extra
   * scope (e.g. "economy"). The host shows a consent prompt and, on approval,
   * re-sends `arinova:auth` with the widened scope. Embedded mode only.
   */
  requestScope(scope: ArinovaScope | string, options: { timeout?: number } = {}): Promise<ArinovaSession> {
    if (typeof window === "undefined" || window.self === window.top) {
      return Promise.reject(new ArinovaError("requestScope() is only available inside an embedded Space", 0));
    }
    const target = new URL(this.authUrl).origin;
    window.parent.postMessage({ type: "arinova:request-scope", payload: { scope } }, target);
    return this.awaitAuth(
      options.timeout ?? 30000,
      (session) => session.scopes.includes(scope),
      `scope "${scope}" was not granted`,
    );
  }

  /**
   * Resolve with the next origin-validated `arinova:auth` message. If `accept`
   * is given, keep waiting until a message satisfies it (e.g. carries a scope).
   */
  private awaitAuth(
    timeout: number,
    accept?: (session: ArinovaSession) => boolean,
    timeoutMessage = "connect timeout — this origin may not be authorized to receive Arinova auth",
  ): Promise<ArinovaSession> {
    const expectedOrigin = new URL(this.authUrl).origin;
    return new Promise<ArinovaSession>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        fn();
      };
      const timer = setTimeout(() => finish(() => reject(new ArinovaError(timeoutMessage, 0))), timeout);
      const onMessage = (event: MessageEvent): void => {
        // Reject anything not from the expected Arinova parent window.
        if (event.origin !== expectedOrigin || event.source !== window.parent) return;
        const data = event.data as { type?: string; payload?: Record<string, unknown> };
        if (!data || data.type !== "arinova:auth") return;
        const p = (data.payload ?? {}) as {
          user?: ArinovaUser;
          accessToken?: string;
          agents?: AgentInfo[];
          scope?: string;
          expiresAt?: number;
        };
        if (!p.accessToken) {
          finish(() => reject(new ArinovaError("Arinova did not issue an access token", 0)));
          return;
        }
        const session: ArinovaSession = {
          user: p.user as ArinovaUser,
          accessToken: p.accessToken,
          tokenType: "Bearer",
          expiresAt: p.expiresAt ?? Date.now() + 7 * 24 * 3600 * 1000,
          scopes: parseScopes(p.scope),
          agents: p.agents ?? [],
        };
        // Keep waiting until a message satisfies `accept` (if provided).
        if (accept && !accept(session)) return;
        this._session = session;
        finish(() => resolve(session));
      };
      window.addEventListener("message", onMessage);
    });
  }

  // ── PKCE login (standalone) ─────────────────────────────────────
  async login(options: LoginOptions = {}): Promise<ArinovaSession | void> {
    const verifier = randomString(32);
    const challenge = await pkceChallenge(verifier);
    const state = randomString(16);
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scopes.join(" "),
      state,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    // Open authorize on the API host — it 302-redirects to the frontend consent page.
    const authorizeUrl = `${this.apiUrl}/oauth/authorize?${params.toString()}`;

    if (options.mode === "redirect") {
      window.location.href = authorizeUrl;
      return;
    }
    return this.loginPopup(authorizeUrl, state, verifier);
  }

  private loginPopup(authorizeUrl: string, state: string, verifier: string): Promise<ArinovaSession> {
    return new Promise<ArinovaSession>((resolve, reject) => {
      const popup = window.open(authorizeUrl, "arinova_auth", "width=500,height=680");
      if (!popup) {
        window.location.href = authorizeUrl;
        reject(new ArinovaError("Popup blocked — redirecting instead", 0));
        return;
      }
      const interval = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(interval);
            reject(new ArinovaError("Login cancelled", 0));
            return;
          }
          if (!popup.location.href.startsWith(this.redirectUri)) return;
          clearInterval(interval);
          const url = new URL(popup.location.href);
          popup.close();
          const code = url.searchParams.get("code");
          const returnedState = url.searchParams.get("state");
          if (returnedState !== state) {
            reject(new ArinovaError("State mismatch — possible CSRF", 0));
            return;
          }
          if (!code) {
            reject(new ArinovaError(url.searchParams.get("error_description") ?? "No authorization code", 0));
            return;
          }
          this.exchangeCode(code, verifier).then(resolve, reject);
        } catch {
          // Cross-origin while the popup is on the consent host — keep polling.
        }
      }, 200);
      setTimeout(() => {
        clearInterval(interval);
        try {
          popup.close();
        } catch {
          /* ignore */
        }
        reject(new ArinovaError("Login timed out", 0));
      }, POPUP_TIMEOUT_MS);
    });
  }

  /** Complete the redirect flow — call on your redirect_uri page. */
  async handleCallback(): Promise<ArinovaSession> {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    const expectedState = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);

    if (!code) throw new ArinovaError(url.searchParams.get("error_description") ?? "No authorization code", 0);
    if (state !== expectedState) throw new ArinovaError("State mismatch", 0);
    if (!verifier) throw new ArinovaError("No PKCE verifier found — did you call login()?", 0);
    return this.exchangeCode(code, verifier);
  }

  private async exchangeCode(code: string, codeVerifier: string): Promise<ArinovaSession> {
    const token = await request<TokenResponse>(`${this.apiUrl}/oauth/token`, {
      method: "POST",
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: this.clientId,
        code,
        redirect_uri: this.redirectUri,
        code_verifier: codeVerifier,
      }),
    });
    const session: ArinovaSession = {
      user: token.user,
      accessToken: token.access_token,
      tokenType: token.token_type,
      expiresAt: Date.now() + token.expires_in * 1000,
      scopes: parseScopes(token.scope),
      agents: [],
    };
    this._session = session;
    if (session.scopes.includes("agents")) {
      try {
        session.agents = await this.user.agents();
      } catch {
        /* agents are best-effort */
      }
    }
    return session;
  }

  // ── internals ───────────────────────────────────────────────────
  private requireToken(): string {
    const token = this._session?.accessToken;
    if (!token) {
      throw new ArinovaError("Not connected — call connect(), login(), or handleCallback() first", 0);
    }
    return token;
  }

  private async apiGet<T>(path: string): Promise<T> {
    const token = this.requireToken();
    return request<T>(`${this.apiUrl}${path}`, { method: "GET", token });
  }
  private async apiPost<T>(path: string, body: unknown): Promise<T> {
    const token = this.requireToken();
    return request<T>(`${this.apiUrl}${path}`, { method: "POST", token, body: JSON.stringify(body) });
  }

  // ── user namespace ──────────────────────────────────────────────
  readonly user = {
    /** The authenticated user's profile. */
    profile: (): Promise<ArinovaUser> => this.apiGet<ArinovaUser>("/api/v1/user/profile"),
    /** The user's agents. Requires the `agents` scope. */
    agents: (): Promise<AgentInfo[]> =>
      this.apiGet<{ agents: AgentInfo[] }>("/api/v1/user/agents").then((r) => r.agents),
  };

  // ── economy namespace (user OAuth token) ────────────────────────
  readonly economy = {
    /** The user's coin balance. */
    balance: (): Promise<BalanceResponse> => this.apiGet<BalanceResponse>("/api/v1/economy/balance"),
    /** Charge coins from the user's balance. Requires the `economy` scope. */
    purchase: (params: PurchaseParams): Promise<PurchaseResponse> =>
      this.apiPost<PurchaseResponse>("/api/v1/economy/purchase", params),
    /** The user's transaction history. Requires the `economy` scope. */
    transactions: (params: TransactionsParams = {}): Promise<TransactionsResponse> => {
      const q = new URLSearchParams();
      if (params.limit != null) q.set("limit", String(params.limit));
      if (params.offset != null) q.set("offset", String(params.offset));
      const qs = q.toString();
      return this.apiGet<TransactionsResponse>(`/api/v1/economy/transactions${qs ? `?${qs}` : ""}`);
    },
  };

  // ── agent namespace (requires `agents` scope) ───────────────────
  readonly agent = {
    /** Send a prompt/messages to a user's agent; get a complete response. */
    chat: (params: AgentChatParams): Promise<AgentChatResponse> =>
      this.apiPost<AgentChatResponse>("/api/v1/agent/chat", params),
    /** Stream a response via SSE; yields `{type:"chunk"|"done"|"error"}` events. */
    chatStream: (params: AgentChatParams): AsyncGenerator<AgentChatEvent> => this.streamChat(params),
  };

  private async *streamChat(params: AgentChatParams): AsyncGenerator<AgentChatEvent> {
    const res = await fetch(`${this.apiUrl}/api/v1/agent/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.requireToken()}` },
      body: JSON.stringify(params),
    });
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => ({}))) as Record<string, string>;
      throw new ArinovaError(
        body.error_description ?? body.error ?? `Agent chat stream failed (${res.status})`,
        res.status,
        body.error,
      );
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          yield JSON.parse(payload) as AgentChatEvent;
        } catch {
          /* ignore malformed frame */
        }
      }
    }
  }
}
