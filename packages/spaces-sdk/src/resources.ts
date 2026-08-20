import { request, requestStream, ArinovaError } from "./http.js";
import type {
  AgentChatEvent,
  AgentChatParams,
  AgentChatResponse,
  AgentInfo,
  ArinovaSession,
  ArinovaUser,
  BalanceResponse,
  ConsumeInventoryParams,
  ConsumeInventoryResponse,
  RequestOptions,
  SpaceInventoryResponse,
  SpaceProductsResponse,
  SpacePurchaseResult,
  SpaceStorageEntry,
  SpaceStorageListResponse,
  TransactionsParams,
  TransactionsResponse,
  WagerBuyInOptions,
  WagerBuyInResult,
} from "./types.js";

export class ResourceTransport {
  constructor(
    private readonly apiUrl: string,
    private readonly getSession: () => ArinovaSession | null,
  ) {}

  async apiGet<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return request<T>(`${this.apiUrl}${path}`, {
      method: "GET",
      token: this.requireToken(),
      ...options,
    });
  }

  async apiPost<T>(
    path: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const idempotencyKey = body && typeof body === "object"
      && typeof (body as Record<string, unknown>).idempotencyKey === "string"
      ? (body as Record<string, unknown>).idempotencyKey as string
      : undefined;
    return request<T>(`${this.apiUrl}${path}`, {
      method: "POST",
      token: this.requireToken(),
      body: JSON.stringify(body),
      ...(idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {}),
      ...options,
    });
  }

  async apiPut<T>(
    path: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    return request<T>(`${this.apiUrl}${path}`, {
      method: "PUT",
      token: this.requireToken(),
      body: JSON.stringify(body),
      ...options,
    });
  }

  async apiDelete<T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    return request<T>(`${this.apiUrl}${path}`, {
      method: "DELETE",
      token: this.requireToken(),
      ...options,
    });
  }

  requireSpaceId(): string {
    this.requireToken();
    const spaceId = this.getSession()?.spaceId;
    if (!spaceId) {
      throw new ArinovaError(
        "This operation requires a Space-bound OAuth session",
        0,
        "space_session_required",
      );
    }
    return spaceId;
  }

  async *streamChat(
    params: AgentChatParams,
    options: RequestOptions = {},
  ): AsyncGenerator<AgentChatEvent> {
    const handle = await requestStream(`${this.apiUrl}/api/v1/agent/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.requireToken()}`,
      },
      body: JSON.stringify(params),
      ...options,
    });
    const reader = handle.response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          const event = parseSseLine(line);
          if (event) yield event;
        }
        if (done) {
          const event = parseSseLine(buffer.trim());
          if (event) yield event;
          break;
        }
      }
    } catch (error) {
      const abortCode = handle.abortCode();
      if (abortCode) {
        throw new ArinovaError(
          abortCode === "timeout" ? "Request timed out" : "Request aborted",
          0,
          abortCode,
        );
      }
      throw error;
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
      handle.close();
    }
  }

  private requireToken(): string {
    const session = this.getSession();
    if (!session?.accessToken) {
      throw new ArinovaError(
        "Not connected — call connect(), login(), or handleCallback() first",
        0,
        "not_connected",
      );
    }
    if (session.expiresAt <= Date.now()) {
      throw new ArinovaError(
        "Session token has expired — authenticate again",
        401,
        "token_expired",
      );
    }
    return session.accessToken;
  }
}

export class UserApi {
  constructor(private readonly client: ResourceTransport) {}

  profile(options?: RequestOptions): Promise<ArinovaUser> {
    return this.client.apiGet<ArinovaUser>("/api/v1/user/profile", options);
  }

  agents(options?: RequestOptions): Promise<AgentInfo[]> {
    return this.client.apiGet<{ agents: AgentInfo[] }>(
      "/api/v1/user/agents",
      options,
    ).then((response) => response.agents);
  }
}

export class EconomyApi {
  constructor(private readonly client: ResourceTransport) {}

  balance(options?: RequestOptions): Promise<BalanceResponse> {
    return this.client.apiGet<BalanceResponse>("/api/v1/economy/balance", options);
  }

  transactions(
    params: TransactionsParams = {},
    options?: RequestOptions,
  ): Promise<TransactionsResponse> {
    const query = new URLSearchParams();
    if (params.limit != null) query.set("limit", String(params.limit));
    if (params.offset != null) query.set("offset", String(params.offset));
    const suffix = query.toString();
    return this.client.apiGet<TransactionsResponse>(
      `/api/v1/economy/transactions${suffix ? `?${suffix}` : ""}`,
      options,
    );
  }
}

export class CommerceApi {
  constructor(
    private readonly client: ResourceTransport,
    private readonly purchaseBridge: (
      productKey: string,
      options?: { timeout?: number },
    ) => Promise<SpacePurchaseResult>,
  ) {}

  requestPurchase(
    productKey: string,
    options?: { timeout?: number },
  ): Promise<SpacePurchaseResult> {
    return this.purchaseBridge(productKey, options);
  }

  products(options?: RequestOptions): Promise<SpaceProductsResponse> {
    const spaceId = this.client.requireSpaceId();
    return this.client.apiGet<SpaceProductsResponse>(
      `/api/v1/spaces/${encodeURIComponent(spaceId)}/products`,
      options,
    );
  }

  inventory(options?: RequestOptions): Promise<SpaceInventoryResponse> {
    const spaceId = this.client.requireSpaceId();
    return this.client.apiGet<SpaceInventoryResponse>(
      `/api/v1/spaces/${encodeURIComponent(spaceId)}/inventory`,
      options,
    );
  }

  consume(
    productKey: string,
    params: ConsumeInventoryParams,
    options?: RequestOptions,
  ): Promise<ConsumeInventoryResponse> {
    if (!validProductKey(productKey)) {
      throw new ArinovaError("Invalid Space product key", 0, "invalid_product_key");
    }
    if (
      !params
      || !Number.isInteger(params.quantity)
      || params.quantity < 1
      || params.quantity > 100_000
    ) {
      throw new ArinovaError(
        "quantity must be an integer from 1 to 100000",
        0,
        "invalid_quantity",
      );
    }
    if (!visibleAscii(params.idempotencyKey, 128)) {
      throw new ArinovaError(
        "idempotencyKey must contain 1–128 visible ASCII characters",
        0,
        "invalid_idempotency_key",
      );
    }
    const spaceId = this.client.requireSpaceId();
    return this.client.apiPost<ConsumeInventoryResponse>(
      `/api/v1/spaces/${encodeURIComponent(spaceId)}/inventory/${encodeURIComponent(productKey)}/consume`,
      params,
      options,
    );
  }
}

export class WagerApi {
  constructor(
    private readonly buyInBridge: (
      sessionId: string,
      amountPoints: number,
      options?: WagerBuyInOptions,
    ) => Promise<WagerBuyInResult>,
  ) {}

  requestBuyIn(
    sessionId: string,
    amountPoints: number,
    options?: WagerBuyInOptions,
  ): Promise<WagerBuyInResult> {
    return this.buyInBridge(sessionId, amountPoints, options);
  }
}

export class StorageApi {
  constructor(private readonly client: ResourceTransport) {}

  list<T = unknown>(
    options?: RequestOptions,
  ): Promise<SpaceStorageListResponse<T>> {
    const spaceId = this.client.requireSpaceId();
    return this.client.apiGet<SpaceStorageListResponse<T>>(
      `/api/v1/spaces/${encodeURIComponent(spaceId)}/storage`,
      options,
    );
  }

  get<T = unknown>(
    key: string,
    options?: RequestOptions,
  ): Promise<SpaceStorageEntry<T>> {
    this.assertKey(key);
    const spaceId = this.client.requireSpaceId();
    return this.client.apiGet<SpaceStorageEntry<T>>(
      `/api/v1/spaces/${encodeURIComponent(spaceId)}/storage/${encodeURIComponent(key)}`,
      options,
    );
  }

  set<T = unknown>(
    key: string,
    value: T,
    options?: RequestOptions,
  ): Promise<SpaceStorageEntry<T>> {
    this.assertKey(key);
    const spaceId = this.client.requireSpaceId();
    return this.client.apiPut<SpaceStorageEntry<T>>(
      `/api/v1/spaces/${encodeURIComponent(spaceId)}/storage/${encodeURIComponent(key)}`,
      { value },
      options,
    );
  }

  delete(key: string, options?: RequestOptions): Promise<void> {
    this.assertKey(key);
    const spaceId = this.client.requireSpaceId();
    return this.client.apiDelete<void>(
      `/api/v1/spaces/${encodeURIComponent(spaceId)}/storage/${encodeURIComponent(key)}`,
      options,
    );
  }

  private assertKey(key: string): void {
    if (!validStorageKey(key)) {
      throw new ArinovaError(
        "Invalid Space storage key",
        0,
        "invalid_storage_key",
      );
    }
  }
}

export class AgentApi {
  constructor(private readonly client: ResourceTransport) {}

  chat(
    params: AgentChatParams,
    options?: RequestOptions,
  ): Promise<AgentChatResponse> {
    return this.client.apiPost<AgentChatResponse>(
      "/api/v1/agent/chat",
      params,
      { timeoutMs: 120_000, ...options },
    );
  }

  chatStream(
    params: AgentChatParams,
    options?: RequestOptions,
  ): AsyncGenerator<AgentChatEvent> {
    return this.client.streamChat(params, options);
  }
}

function visibleAscii(value: string, maxLength: number): boolean {
  return value.length > 0
    && value.length <= maxLength
    && [...value].every((character) => {
      const code = character.charCodeAt(0);
      return code >= 0x21 && code <= 0x7e;
    });
}

function validProductKey(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
}

function validStorageKey(value: string): boolean {
  return value !== "."
    && value !== ".."
    && new TextEncoder().encode(value).length <= 200
    && value.length > 0
    && ![...value].some((character) => /\p{Cc}/u.test(character));
}

function parseSseLine(line: string): AgentChatEvent | undefined {
  if (!line.startsWith("data:")) return undefined;
  const payload = line.slice(5).trim();
  if (!payload) return undefined;
  try {
    return JSON.parse(payload) as AgentChatEvent;
  } catch {
    return undefined;
  }
}
