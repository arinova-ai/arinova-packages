import { request, requestStream, ArinovaError, stripTrailingSlash, parseScopes } from "./http.js";
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
  ArinovaScope,
  RequestOptions,
} from "./types.js";
import { sessionFromToken } from "./types.js";

const DEFAULT_API_URL = "https://api.chat.arinova.ai";
const DEFAULT_AUTH_URL = "https://chat.arinova.ai";
const VERIFIER_KEY = "arinova_pkce_verifier";
const STATE_KEY = "arinova_pkce_state";
const POPUP_TIMEOUT_MS = 300_000;

/**
 * Browser Arinova client — OAuth-PKCE login, iframe `connect()`, and
 * user-token resource calls. Confidential token exchange lives in
 * `@arinova-ai/spaces-sdk/server`.
 */
export class Arinova {
  readonly clientId: string;
  readonly apiUrl: string;
  readonly authUrl: string;
  readonly redirectUri: string;
  readonly scopes: string[];
  private _session: ArinovaSession | null = null;
  private loginInFlight: Promise<ArinovaSession | void> | null = null;

  constructor(config: ArinovaConfig) {
    if (!config || !config.clientId) {
      throw new ArinovaError("Arinova: `clientId` is required", 0, "invalid_config");
    }
    this.clientId = config.clientId;
    this.apiUrl = stripTrailingSlash(config.apiUrl ?? DEFAULT_API_URL);
    this.authUrl = stripTrailingSlash(config.authUrl ?? DEFAULT_AUTH_URL);
    this.redirectUri =
      config.redirectUri ??
      (typeof window !== "undefined" ? `${window.location.origin}/callback` : "");
    try {
      const redirect = new URL(this.redirectUri);
      if (!redirect.protocol.startsWith("http") || !redirect.host) throw new Error();
    } catch {
      throw new ArinovaError("Arinova: `redirectUri` must be an absolute HTTP(S) URL", 0, "invalid_redirect_uri");
    }
    this.scopes = config.scopes && config.scopes.length ? [...config.scopes] : ["profile"];
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
  connect(options: ConnectOptions & { mode: "redirect" }): Promise<void>;
  connect(options?: ConnectOptions): Promise<ArinovaSession>;
  async connect(options: ConnectOptions = {}): Promise<ArinovaSession | void> {
    const mode = options.mode ?? "auto";
    const embedded = typeof window !== "undefined" && window.self !== window.top;
    if (mode === "iframe" || (mode === "auto" && embedded)) {
      return this.connectIframe(options.timeout ?? 5000);
    }
    if (mode === "redirect") {
      await this.login({ mode: "redirect" });
      return;
    }
    return this.login({ mode: "popup" });
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
  requestScope(scope: ArinovaScope, options: { timeout?: number } = {}): Promise<ArinovaSession> {
    if (typeof window === "undefined" || window.self === window.top) {
      return Promise.reject(new ArinovaError("requestScope() is only available inside an embedded Space", 0, "embedded_only"));
    }
    const target = new URL(this.authUrl).origin;
    window.parent.postMessage({ type: "arinova:request-scope", payload: { scope } }, target);
    return this.awaitAuth(
      options.timeout ?? 30000,
      (session) => session.scopes.includes(scope),
      `scope "${scope}" was not granted`,
      scope,
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
    deniedScope?: string,
  ): Promise<ArinovaSession> {
    if (typeof window === "undefined") {
      return Promise.reject(new ArinovaError("Iframe authentication requires a browser window", 0, "browser_required"));
    }
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
      const timer = setTimeout(() => finish(() => reject(new ArinovaError(timeoutMessage, 0, "auth_timeout"))), timeout);
      const onMessage = (event: MessageEvent): void => {
        // Reject anything not from the expected Arinova parent window.
        if (event.origin !== expectedOrigin || event.source !== window.parent) return;
        const data = event.data as { type?: string; payload?: Record<string, unknown> };
        if (!data) return;
        if (data.type === "arinova:scope-denied") {
          const denied = (data.payload ?? {}) as { scope?: string; reason?: string };
          if (!accept || !denied.scope || denied.scope === deniedScope) {
            finish(() => reject(new ArinovaError(
              denied.reason ?? `scope "${denied.scope ?? "requested"}" was denied`,
              0,
              "scope_denied",
            )));
          }
          return;
        }
        if (data.type !== "arinova:auth") return;
        const p = (data.payload ?? {}) as {
          user?: ArinovaUser;
          accessToken?: string;
          agents?: AgentInfo[];
          scope?: string;
          expiresAt?: number;
          spaceId?: string;
        };
        if (!p.accessToken) {
          finish(() => reject(new ArinovaError("Arinova did not issue an access token", 0, "missing_access_token")));
          return;
        }
        if (!p.user || typeof p.user !== "object" || typeof p.user.id !== "string") {
          finish(() => reject(new ArinovaError("Arinova sent an invalid user payload", 0, "invalid_auth_payload")));
          return;
        }
        if (typeof p.expiresAt !== "number" || !Number.isFinite(p.expiresAt)) {
          finish(() => reject(new ArinovaError("Arinova sent no valid token expiry", 0, "invalid_auth_payload")));
          return;
        }
        const session: ArinovaSession = {
          user: p.user,
          accessToken: p.accessToken,
          tokenType: "Bearer",
          expiresAt: p.expiresAt,
          scopes: parseScopes(p.scope),
          agents: p.agents ?? [],
          spaceId: p.spaceId,
        };
        // Any valid auth refreshes the current session, even while a scope
        // request is waiting for a wider token.
        this._session = session;
        if (accept && !accept(session)) return;
        finish(() => resolve(session));
      };
      window.addEventListener("message", onMessage);
    });
  }

  // ── PKCE login (standalone) ─────────────────────────────────────
  login(options: LoginOptions & { mode: "redirect" }): Promise<void>;
  login(options?: LoginOptions & { mode?: "popup" }): Promise<ArinovaSession>;
  login(options: LoginOptions = {}): Promise<ArinovaSession | void> {
    if (this.loginInFlight) return this.loginInFlight;
    const operation = this.startLogin(options);
    this.loginInFlight = operation;
    void operation.finally(() => {
      if (this.loginInFlight === operation) this.loginInFlight = null;
    }).catch(() => undefined);
    return operation;
  }

  private async startLogin(options: LoginOptions): Promise<ArinovaSession | void> {
    if (typeof window === "undefined" || typeof sessionStorage === "undefined") {
      throw new ArinovaError("Login requires a browser window with session storage", 0, "browser_required");
    }
    try {
      const probe = "arinova_storage_probe";
      sessionStorage.setItem(probe, "1");
      sessionStorage.removeItem(probe);
    } catch {
      throw new ArinovaError("Session storage is unavailable", 0, "storage_unavailable");
    }
    let verifier: string;
    let challenge: string;
    let state: string;
    try {
      verifier = randomString(32);
      challenge = await pkceChallenge(verifier);
      state = randomString(16);
    } catch {
      throw new ArinovaError("Web Crypto is unavailable", 0, "crypto_unavailable");
    }
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
        reject(new ArinovaError("Popup blocked — redirecting instead", 0, "popup_blocked"));
        return;
      }
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;
      let interval: ReturnType<typeof setInterval>;
      const cleanup = (): void => {
        clearInterval(interval);
        clearTimeout(timeout);
        sessionStorage.removeItem(VERIFIER_KEY);
        sessionStorage.removeItem(STATE_KEY);
      };
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };
      interval = setInterval(() => {
        try {
          if (popup.closed) {
            finish(() => reject(new ArinovaError("Login cancelled", 0, "login_cancelled")));
            return;
          }
          const url = new URL(popup.location.href);
          const redirect = new URL(this.redirectUri);
          if (url.origin !== redirect.origin || url.pathname !== redirect.pathname) return;
          popup.close();
          const code = url.searchParams.get("code");
          const returnedState = url.searchParams.get("state");
          if (!returnedState || returnedState !== state) {
            finish(() => reject(new ArinovaError("State mismatch — possible CSRF", 0, "state_mismatch")));
            return;
          }
          if (!code) {
            finish(() => reject(new ArinovaError(url.searchParams.get("error_description") ?? "No authorization code", 0, "missing_authorization_code")));
            return;
          }
          this.exchangeCode(code, verifier).then(
            (session) => finish(() => resolve(session)),
            (error) => finish(() => reject(error)),
          );
        } catch {
          // Cross-origin while the popup is on the consent host — keep polling.
        }
      }, 200);
      timeout = setTimeout(() => {
        try {
          popup.close();
        } catch {
          /* ignore */
        }
        finish(() => reject(new ArinovaError("Login timed out", 0, "login_timeout")));
      }, POPUP_TIMEOUT_MS);
    });
  }

  /** Complete the redirect flow — call on your redirect_uri page. */
  async handleCallback(): Promise<ArinovaSession> {
    if (typeof window === "undefined" || typeof sessionStorage === "undefined") {
      throw new ArinovaError("OAuth callback handling requires a browser window", 0, "browser_required");
    }
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    const expectedState = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);

    if (!verifier) throw new ArinovaError("No PKCE verifier found — did you call login()?", 0, "missing_pkce_verifier");
    if (!state || !expectedState || state !== expectedState) throw new ArinovaError("State mismatch", 0, "state_mismatch");
    if (!code) throw new ArinovaError(url.searchParams.get("error_description") ?? "No authorization code", 0, "missing_authorization_code");
    const session = await this.exchangeCode(code, verifier);
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    window.history?.replaceState?.(null, "", url.toString());
    return session;
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
    const session = sessionFromToken(token);
    this._session = session;
    if (session.scopes.includes("agents")) {
      try {
        const response = await request<{ agents: AgentInfo[] }>(`${this.apiUrl}/api/v1/user/agents`, {
          method: "GET",
          token: session.accessToken,
        });
        session.agents = response.agents;
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
      throw new ArinovaError("Not connected — call connect(), login(), or handleCallback() first", 0, "not_connected");
    }
    if (this._session!.expiresAt <= Date.now()) {
      throw new ArinovaError("Session token has expired — authenticate again", 401, "token_expired");
    }
    return token;
  }

  private async apiGet<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = this.requireToken();
    return request<T>(`${this.apiUrl}${path}`, { method: "GET", token, ...options });
  }
  private async apiPost<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    const token = this.requireToken();
    return request<T>(`${this.apiUrl}${path}`, { method: "POST", token, body: JSON.stringify(body), ...options });
  }

  readonly user = new UserApi(this as unknown as ClientTransport);
  readonly economy = new EconomyApi(this as unknown as ClientTransport);
  readonly agent = new AgentApi(this as unknown as ClientTransport);

  private async *streamChat(params: AgentChatParams, options: RequestOptions = {}): AsyncGenerator<AgentChatEvent> {
    const handle = await requestStream(`${this.apiUrl}/api/v1/agent/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.requireToken()}` },
      body: JSON.stringify(params),
      ...options,
    });
    const res = handle.response;
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          buffer += decoder.decode();
        } else {
          buffer += decoder.decode(value, { stream: true });
        }
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
        if (done) {
          const line = buffer.trim();
          if (line.startsWith("data:")) {
            const payload = line.slice(5).trim();
            if (payload) {
              try {
                yield JSON.parse(payload) as AgentChatEvent;
              } catch {
                /* ignore malformed final frame */
              }
            }
          }
          break;
        }
      }
    } catch (error) {
      const abortCode = handle.abortCode();
      if (abortCode) {
        throw new ArinovaError(abortCode === "timeout" ? "Request timed out" : "Request aborted", 0, abortCode);
      }
      throw error;
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
      handle.close();
    }
  }
}

interface ClientTransport {
  apiGet<T>(path: string, options?: RequestOptions): Promise<T>;
  apiPost<T>(path: string, body: unknown, options?: RequestOptions): Promise<T>;
  streamChat(params: AgentChatParams, options?: RequestOptions): AsyncGenerator<AgentChatEvent>;
}

class UserApi {
  constructor(private readonly client: ClientTransport) {}
  profile(options?: RequestOptions): Promise<ArinovaUser> {
    return this.client.apiGet<ArinovaUser>("/api/v1/user/profile", options);
  }
  agents(options?: RequestOptions): Promise<AgentInfo[]> {
    return this.client.apiGet<{ agents: AgentInfo[] }>("/api/v1/user/agents", options).then((response) => response.agents);
  }
}

class EconomyApi {
  constructor(private readonly client: ClientTransport) {}
  balance(options?: RequestOptions): Promise<BalanceResponse> {
    return this.client.apiGet<BalanceResponse>("/api/v1/economy/balance", options);
  }
  purchase(params: PurchaseParams, options?: RequestOptions): Promise<PurchaseResponse> {
    return this.client.apiPost<PurchaseResponse>("/api/v1/economy/purchase", params, options);
  }
  transactions(params: TransactionsParams = {}, options?: RequestOptions): Promise<TransactionsResponse> {
    const query = new URLSearchParams();
    if (params.limit != null) query.set("limit", String(params.limit));
    if (params.offset != null) query.set("offset", String(params.offset));
    const suffix = query.toString();
    return this.client.apiGet<TransactionsResponse>(`/api/v1/economy/transactions${suffix ? `?${suffix}` : ""}`, options);
  }
}

class AgentApi {
  constructor(private readonly client: ClientTransport) {}
  chat(params: AgentChatParams, options?: RequestOptions): Promise<AgentChatResponse> {
    return this.client.apiPost<AgentChatResponse>("/api/v1/agent/chat", params, options);
  }
  chatStream(params: AgentChatParams, options?: RequestOptions): AsyncGenerator<AgentChatEvent> {
    return this.client.streamChat(params, options);
  }
}
