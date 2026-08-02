import { request, stripTrailingSlash, ArinovaError } from "./http.js";
import type {
  ArinovaServerConfig,
  TokenResponse,
  ArinovaSession,
} from "./types.js";
import { sessionFromToken } from "./types.js";

export { ArinovaError } from "./http.js";

const DEFAULT_API_URL = "https://api.chat.arinova.ai";

/**
 * Server-side Arinova client — secret-bearing operations that must NEVER run in
 * a browser: confidential OAuth token exchange.
 *
 * Import from `@arinova-ai/spaces-sdk/server` only (Node / your backend).
 */
export class ArinovaServer {
  readonly clientId: string;
  private readonly clientSecret: string;
  readonly apiUrl: string;

  constructor(config: ArinovaServerConfig) {
    if (!config || !config.clientId || !config.clientSecret) {
      throw new ArinovaError("ArinovaServer: `clientId` and `clientSecret` are required", 0, "invalid_config");
    }
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.apiUrl = stripTrailingSlash(config.apiUrl ?? DEFAULT_API_URL);
  }

  /**
   * Confidential-client authorization-code exchange (server-side).
   * Sends `client_secret`; use only from your backend.
   */
  async exchangeCode(params: {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<ArinovaSession> {
    const token = await request<TokenResponse>(`${this.apiUrl}/oauth/token`, {
      method: "POST",
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: params.code,
        redirect_uri: params.redirectUri,
        code_verifier: params.codeVerifier,
      }),
    });
    return sessionFromToken(token);
  }
}
