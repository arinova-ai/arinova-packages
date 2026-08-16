import { request, requestStream, ArinovaError } from "./http.js";
import { randomString } from "./pkce.js";
import type {
  AgentChatEvent,
  AgentChatParams,
  AgentChatResponse,
  AgentInfo,
  ArinovaSession,
  ArinovaUser,
  BalanceResponse,
  PurchaseParams,
  PurchaseResponse,
  RequestOptions,
  TransactionsParams,
  TransactionsResponse,
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

  purchase(
    params: PurchaseParams,
    options?: RequestOptions,
  ): Promise<PurchaseResponse> {
    const idempotencyKey = params.idempotencyKey?.trim() || `purchase_${randomString(16)}`;
    return this.client.apiPost<PurchaseResponse>(
      "/api/v1/economy/purchase",
      { ...params, idempotencyKey },
      options,
    );
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
