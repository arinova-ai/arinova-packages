import { ArinovaError, request } from "./http.js";

const TOKEN_EXPIRY_SKEW_MS = 30_000;

interface ServiceTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  space_id: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/** Internal cache for one confidential-client service-token scope. */
export class SpaceServiceTokenProvider {
  private readonly tokens = new Map<string, CachedToken>();
  private readonly tokenRequests = new Map<string, Promise<string>>();

  constructor(
    private readonly apiUrl: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly scope: string,
  ) {}

  async run<T>(spaceId: string, operation: (token: string) => Promise<T>): Promise<T> {
    let token = await this.serviceToken(spaceId);
    try {
      return await operation(token);
    } catch (error) {
      if (!(error instanceof ArinovaError) || error.status !== 401) throw error;
      this.tokens.delete(spaceId);
      token = await this.serviceToken(spaceId);
      return operation(token);
    }
  }

  private serviceToken(spaceId: string): Promise<string> {
    const cached = this.tokens.get(spaceId);
    if (cached && cached.expiresAt - TOKEN_EXPIRY_SKEW_MS > Date.now()) {
      return Promise.resolve(cached.accessToken);
    }
    const inFlight = this.tokenRequests.get(spaceId);
    if (inFlight) return inFlight;
    const pending = this.exchangeServiceToken(spaceId).finally(() => {
      this.tokenRequests.delete(spaceId);
    });
    this.tokenRequests.set(spaceId, pending);
    return pending;
  }

  private async exchangeServiceToken(spaceId: string): Promise<string> {
    const token = await request<ServiceTokenResponse>(`${this.apiUrl}/oauth/token`, {
      method: "POST",
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: this.scope,
        space_id: spaceId,
      }),
    });
    if (
      !token
      || typeof token.access_token !== "string"
      || token.access_token.length === 0
      || token.token_type !== "Bearer"
      || token.scope !== this.scope
      || token.space_id !== spaceId
      || !Number.isFinite(token.expires_in)
      || token.expires_in <= 0
    ) {
      throw new ArinovaError(
        `Invalid Space ${this.scope} service token response`,
        200,
        "invalid_response",
      );
    }
    this.tokens.set(spaceId, {
      accessToken: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1_000,
    });
    return token.access_token;
  }
}
