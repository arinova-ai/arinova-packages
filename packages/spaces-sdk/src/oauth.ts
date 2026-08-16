import { request, ArinovaError } from "./http.js";
import { pkceChallenge, randomString } from "./pkce.js";
import type {
  AgentInfo,
  ArinovaSession,
  LoginOptions,
  TokenResponse,
} from "./types.js";
import { sessionFromToken } from "./types.js";

const VERIFIER_KEY = "arinova_pkce_verifier";
const STATE_KEY = "arinova_pkce_state";
const POPUP_TIMEOUT_MS = 300_000;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function validateRedirectUri(redirectUri: string): string {
  try {
    const redirect = new URL(redirectUri);
    const allowed = redirect.protocol === "https:"
      || (redirect.protocol === "http:" && LOOPBACK_HOSTS.has(redirect.hostname));
    if (!allowed || !redirect.host) throw new Error();
  } catch {
    throw new ArinovaError(
      "Arinova: `redirectUri` must be an absolute HTTP(S) URL",
      0,
      "invalid_redirect_uri",
    );
  }
  return redirectUri;
}

type OAuthConfig = {
  clientId: string;
  apiUrl: string;
  redirectUri: string;
  scopes: string[];
  setSession: (session: ArinovaSession) => void;
};

/** OAuth-PKCE lifecycle for standalone browser applications. */
export class OAuthFlow {
  private loginInFlight: Promise<ArinovaSession | void> | null = null;

  constructor(private readonly config: OAuthConfig) {}

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
      throw new ArinovaError(
        "Login requires a browser window with session storage",
        0,
        "browser_required",
      );
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
      client_id: this.config.clientId,
      redirect_uri: validateRedirectUri(this.config.redirectUri),
      scope: this.config.scopes.join(" "),
      state,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    const authorizeUrl = `${this.config.apiUrl}/oauth/authorize?${params.toString()}`;
    if (options.mode === "redirect") {
      window.location.href = authorizeUrl;
      return;
    }
    return this.loginPopup(authorizeUrl, state, verifier);
  }

  loginPopup(
    authorizeUrl: string,
    state: string,
    verifier: string,
  ): Promise<ArinovaSession> {
    return new Promise<ArinovaSession>((resolve, reject) => {
      const popup = window.open(authorizeUrl, "arinova_auth", "width=500,height=680");
      if (!popup) {
        window.location.href = authorizeUrl;
        reject(new ArinovaError(
          "Popup blocked — redirecting instead",
          0,
          "popup_blocked",
        ));
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
      const finish = (action: () => void): void => {
        if (settled) return;
        settled = true;
        cleanup();
        action();
      };

      interval = setInterval(() => {
        try {
          if (popup.closed) {
            finish(() => reject(new ArinovaError(
              "Login cancelled",
              0,
              "login_cancelled",
            )));
            return;
          }
          const url = new URL(popup.location.href);
          const redirect = new URL(this.config.redirectUri);
          if (url.origin !== redirect.origin || url.pathname !== redirect.pathname) return;
          popup.close();
          const code = url.searchParams.get("code");
          const returnedState = url.searchParams.get("state");
          if (!returnedState || returnedState !== state) {
            finish(() => reject(new ArinovaError(
              "State mismatch — possible CSRF",
              0,
              "state_mismatch",
            )));
            return;
          }
          if (!code) {
            finish(() => reject(new ArinovaError(
              url.searchParams.get("error_description") ?? "No authorization code",
              0,
              "missing_authorization_code",
            )));
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
          // Best-effort close for browsers that revoke the popup handle.
        }
        finish(() => reject(new ArinovaError(
          "Login timed out",
          0,
          "login_timeout",
        )));
      }, POPUP_TIMEOUT_MS);
    });
  }

  async handleCallback(): Promise<ArinovaSession> {
    if (typeof window === "undefined" || typeof sessionStorage === "undefined") {
      throw new ArinovaError(
        "OAuth callback handling requires a browser window",
        0,
        "browser_required",
      );
    }
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    const expectedState = sessionStorage.getItem(STATE_KEY);
    if (!verifier) {
      throw new ArinovaError(
        "No PKCE verifier found — did you call login()?",
        0,
        "missing_pkce_verifier",
      );
    }
    if (!state || !expectedState || state !== expectedState) {
      throw new ArinovaError("State mismatch", 0, "state_mismatch");
    }
    if (!code) {
      throw new ArinovaError(
        url.searchParams.get("error_description") ?? "No authorization code",
        0,
        "missing_authorization_code",
      );
    }

    const session = await this.exchangeCode(code, verifier);
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    window.history?.replaceState?.(null, "", url.toString());
    return session;
  }

  private async exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<ArinovaSession> {
    const token = await request<TokenResponse>(`${this.config.apiUrl}/oauth/token`, {
      method: "POST",
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: this.config.clientId,
        code,
        redirect_uri: validateRedirectUri(this.config.redirectUri),
        code_verifier: codeVerifier,
      }),
    });
    const session = sessionFromToken(token);
    this.config.setSession(session);
    if (session.scopes.includes("agents")) {
      try {
        const response = await request<{ agents: AgentInfo[] }>(
          `${this.config.apiUrl}/api/v1/user/agents`,
          { method: "GET", token: session.accessToken },
        );
        session.agents = response.agents;
      } catch {
        // Agent discovery is best-effort; the OAuth session remains usable.
      }
    }
    return session;
  }
}
