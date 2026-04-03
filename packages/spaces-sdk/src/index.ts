/**
 * Arinova Spaces SDK
 *
 * Public client OAuth with PKCE — no client_secret needed.
 *
 * Usage:
 *   const arinova = new Arinova({ appId: "my-app-abc123" });
 *   const token = await arinova.login();
 *   // token.access_token is ready to use
 */

export interface ArinovaConfig {
  /** Your OAuth app's client_id (from Developer Console) */
  appId: string;
  /** Arinova server URL (default: https://chat.arinova.ai) */
  endpoint?: string;
  /** OAuth redirect URI (default: current page origin + /callback) */
  redirectUri?: string;
  /** OAuth scope (default: "profile") */
  scope?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
}

export interface BalanceResponse {
  balance: number;
}

export interface PurchaseResponse {
  transactionId: string;
  newBalance: number;
}

export interface TransactionRecord {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  createdAt: string;
}

export interface TransactionsResponse {
  transactions: TransactionRecord[];
  total: number;
  limit: number;
  offset: number;
}

export class Arinova {
  private appId: string;
  private endpoint: string;
  private redirectUri: string;
  private scope: string;
  /** The access token from the most recent login/handleCallback. */
  accessToken: string | null = null;

  constructor(config: ArinovaConfig) {
    this.appId = config.appId;
    this.endpoint = (config.endpoint ?? "https://chat.arinova.ai").replace(
      /\/+$/,
      ""
    );
    this.redirectUri =
      config.redirectUri ?? `${window.location.origin}/callback`;
    this.scope = config.scope ?? "profile";
  }

  /**
   * Start the OAuth PKCE login flow.
   * Opens a popup window for authorization.
   * Returns the token response on success.
   */
  async login(): Promise<TokenResponse> {
    const { verifier, challenge } = await generatePKCE();
    const state = generateRandom(32);

    // Store state + verifier for callback validation
    sessionStorage.setItem("arinova_pkce_verifier", verifier);
    sessionStorage.setItem("arinova_pkce_state", state);

    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      scope: this.scope,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      response_type: "code",
    });

    const authUrl = `${this.endpoint}/oauth/authorize?${params}`;

    return new Promise<TokenResponse>((resolve, reject) => {
      const popup = window.open(authUrl, "arinova_auth", "width=500,height=600");

      if (!popup) {
        // Fallback: redirect instead of popup
        window.location.href = authUrl;
        reject(new Error("Popup blocked — redirecting instead"));
        return;
      }

      const interval = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(interval);
            reject(new Error("Login cancelled"));
          }

          const popupUrl = popup.location.href;
          if (popupUrl.startsWith(this.redirectUri)) {
            clearInterval(interval);
            popup.close();

            const url = new URL(popupUrl);
            const code = url.searchParams.get("code");
            const returnedState = url.searchParams.get("state");

            if (returnedState !== state) {
              reject(new Error("State mismatch — possible CSRF attack"));
              return;
            }

            if (!code) {
              reject(
                new Error(
                  url.searchParams.get("error_description") ?? "No code received"
                )
              );
              return;
            }

            this.exchangeCode(code, verifier).then((token) => {
              this.accessToken = token.access_token;
              resolve(token);
            }).catch(reject);
          }
        } catch {
          // Cross-origin — popup is on a different domain, ignore
        }
      }, 200);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(interval);
        try { popup.close(); } catch { /* ignore */ }
        reject(new Error("Login timed out"));
      }, 300_000);
    });
  }

  /**
   * Connect to Arinova — auto-detects iframe vs standalone.
   * In iframe: listens for postMessage from parent (Arinova Chat).
   * Standalone: falls back to PKCE login popup.
   */
  async connect(options?: { timeout?: number }): Promise<{ user: TokenResponse["user"]; accessToken: string; agents: { id: string; name: string; description: string | null; avatarUrl: string | null }[] }> {
    const timeout = options?.timeout ?? 5000;
    const inIframe = typeof window !== "undefined" && window.self !== window.top;

    if (!inIframe) {
      const token = await this.login();
      return { user: token.user, accessToken: token.access_token, agents: [] };
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          window.removeEventListener("message", handler);
          reject(new Error("connect timeout"));
        }
      }, timeout);

      const handler = (event: MessageEvent) => {
        if (event.data?.type !== "arinova:auth") return;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener("message", handler);
        const payload = event.data.payload as { user: TokenResponse["user"]; accessToken: string; agents: { id: string; name: string; description: string | null; avatarUrl: string | null }[] };
        this.accessToken = payload.accessToken;
        resolve(payload);
      };
      window.addEventListener("message", handler);
    });
  }

  /**
   * Handle the OAuth callback (call this on your redirect_uri page).
   * Reads code and state from URL, exchanges for token.
   */
  async handleCallback(): Promise<TokenResponse> {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const verifier = sessionStorage.getItem("arinova_pkce_verifier");
    const expectedState = sessionStorage.getItem("arinova_pkce_state");

    sessionStorage.removeItem("arinova_pkce_verifier");
    sessionStorage.removeItem("arinova_pkce_state");

    if (!code) {
      throw new Error(
        url.searchParams.get("error_description") ?? "No authorization code"
      );
    }
    if (state !== expectedState) {
      throw new Error("State mismatch");
    }
    if (!verifier) {
      throw new Error("No PKCE verifier found — did you start login()?");
    }

    const token = await this.exchangeCode(code, verifier);
    this.accessToken = token.access_token;
    return token;
  }

  // ── Economy Methods ───────────────────────────────────────────

  private getToken(): string {
    if (!this.accessToken) {
      throw new Error("Not logged in — call login() or handleCallback() first");
    }
    return this.accessToken;
  }

  private async apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const token = this.getToken();
    const res = await fetch(`${this.endpoint}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as Record<string, string>).error_description ??
          (body as Record<string, string>).error ??
          `API error (${res.status})`
      );
    }
    return res.json() as Promise<T>;
  }

  /** Get the current user's coin balance. */
  async balance(): Promise<BalanceResponse> {
    return this.apiFetch<BalanceResponse>("/api/v1/economy/balance");
  }

  /**
   * Purchase / charge coins from the user's balance.
   * Requires the "economy" scope.
   */
  async purchase(
    productId: string,
    amount: number,
    description?: string,
  ): Promise<PurchaseResponse> {
    return this.apiFetch<PurchaseResponse>("/api/v1/economy/purchase", {
      method: "POST",
      body: JSON.stringify({ productId, amount, description }),
    });
  }

  /** Get the user's transaction history. */
  async transactions(
    limit?: number,
    offset?: number,
  ): Promise<TransactionsResponse> {
    const params = new URLSearchParams();
    if (limit != null) params.set("limit", String(limit));
    if (offset != null) params.set("offset", String(offset));
    const qs = params.toString();
    return this.apiFetch<TransactionsResponse>(
      `/api/v1/economy/transactions${qs ? `?${qs}` : ""}`,
    );
  }

  private async exchangeCode(
    code: string,
    codeVerifier: string
  ): Promise<TokenResponse> {
    const res = await fetch(`${this.endpoint}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: this.appId,
        code,
        redirect_uri: this.redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as Record<string, string>).error_description ??
          (body as Record<string, string>).error ??
          `Token exchange failed (${res.status})`
      );
    }

    return res.json() as Promise<TokenResponse>;
  }
}

// ── PKCE Helpers ──────────────────────────────────────────────

function generateRandom(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function generatePKCE(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const verifier = generateRandom(32); // 64 hex chars
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const challenge = base64UrlEncode(new Uint8Array(hash));
  return { verifier, challenge };
}

function base64UrlEncode(buffer: Uint8Array): string {
  let binary = "";
  for (const byte of buffer) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Default export for convenience
export default Arinova;
