import { EmbeddedConnector } from "./connect.js";
import { ArinovaError, stripTrailingSlash } from "./http.js";
import { OAuthFlow, validateRedirectUri } from "./oauth.js";
import {
  AgentApi,
  EconomyApi,
  ResourceTransport,
  UserApi,
} from "./resources.js";
import type {
  ArinovaConfig,
  ArinovaScope,
  ArinovaSession,
  ConnectOptions,
  LoginOptions,
  RequestOptions,
} from "./types.js";

const DEFAULT_API_URL = "https://api.chat.arinova.ai";
const DEFAULT_AUTH_URL = "https://chat.arinova.ai";

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
  readonly user: UserApi;
  readonly economy: EconomyApi;
  readonly agent: AgentApi;

  private _session: ArinovaSession | null = null;
  private readonly embedded: EmbeddedConnector;
  private readonly oauth: OAuthFlow;
  private readonly resources: ResourceTransport;

  constructor(config: ArinovaConfig) {
    if (!config || !config.clientId) {
      throw new ArinovaError(
        "Arinova: `clientId` is required",
        0,
        "invalid_config",
      );
    }
    this.clientId = config.clientId;
    this.apiUrl = stripTrailingSlash(config.apiUrl ?? DEFAULT_API_URL);
    this.authUrl = stripTrailingSlash(config.authUrl ?? DEFAULT_AUTH_URL);
    this.redirectUri = config.redirectUri
      ?? (typeof window !== "undefined" ? `${window.location.origin}/callback` : "");
    // Defer validation during SSR when no redirect was supplied; login will
    // report the missing browser before it tries to build an authorize URL.
    if (config.redirectUri !== undefined || typeof window !== "undefined") {
      validateRedirectUri(this.redirectUri);
    }
    this.scopes = config.scopes?.length ? [...config.scopes] : ["profile"];

    const setSession = (session: ArinovaSession): void => {
      this._session = session;
    };
    this.embedded = new EmbeddedConnector(this.authUrl, setSession);
    this.oauth = new OAuthFlow({
      clientId: this.clientId,
      apiUrl: this.apiUrl,
      redirectUri: this.redirectUri,
      scopes: this.scopes,
      setSession,
    });
    this.resources = new ResourceTransport(this.apiUrl, () => this._session);
    this.user = new UserApi(this.resources);
    this.economy = new EconomyApi(this.resources);
    this.agent = new AgentApi(this.resources);
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

  connect(options: ConnectOptions & { mode: "redirect" }): Promise<void>;
  connect(options?: ConnectOptions): Promise<ArinovaSession>;
  async connect(options: ConnectOptions = {}): Promise<ArinovaSession | void> {
    const mode = options.mode ?? "auto";
    const isEmbedded = typeof window !== "undefined" && window.self !== window.top;
    if (mode === "iframe" || (mode === "auto" && isEmbedded)) {
      return this.embedded.connect(options.timeout ?? 5_000);
    }
    if (mode === "redirect") {
      await this.login({ mode: "redirect" });
      return;
    }
    return this.login({ mode: "popup" });
  }

  requestScope(
    scope: ArinovaScope,
    options: { timeout?: number } = {},
  ): Promise<ArinovaSession> {
    return this.embedded.requestScope(scope, options);
  }

  login(options: LoginOptions & { mode: "redirect" }): Promise<void>;
  login(options?: LoginOptions & { mode?: "popup" }): Promise<ArinovaSession>;
  login(options: LoginOptions = {}): Promise<ArinovaSession | void> {
    return this.oauth.login(options);
  }

  /** Complete the redirect flow — call on your redirect_uri page. */
  handleCallback(): Promise<ArinovaSession> {
    return this.oauth.handleCallback();
  }

  // Kept as thin private seams for compatibility with existing white-box
  // tests and consumers that previously inspected the runtime object.
  private loginPopup(
    authorizeUrl: string,
    state: string,
    verifier: string,
  ): Promise<ArinovaSession> {
    return this.oauth.loginPopup(authorizeUrl, state, verifier);
  }

  private apiPost<T>(
    path: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    return this.resources.apiPost<T>(path, body, options);
  }
}
