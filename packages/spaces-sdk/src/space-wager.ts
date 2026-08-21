import { ArinovaError, request } from "./http.js";
import { SpaceServiceTokenProvider } from "./space-service-token.js";
import type {
  RequestOptions,
  SpaceWagerCancelResponse,
  SpaceWagerHeartbeatParams,
  SpaceWagerOpenParams,
  SpaceWagerSession,
  SpaceWagerSessionParams,
  SpaceWagerSettleParams,
  SpaceWagerSettleResponse,
} from "./types.js";

/** Confidential Managed Space wager-session helper. Available from the server entry only. */
export class SpaceWagerApi {
  private readonly tokenProvider: SpaceServiceTokenProvider;

  constructor(
    private readonly apiUrl: string,
    clientId: string,
    clientSecret: string,
  ) {
    this.tokenProvider = new SpaceServiceTokenProvider(apiUrl, clientId, clientSecret, "wager");
  }

  async open(
    params: SpaceWagerOpenParams,
    options: RequestOptions = {},
  ): Promise<SpaceWagerSession> {
    const { spaceId, body } = validateOpenParams(params);
    return this.authorized(spaceId, "/api/v1/wager/sessions", "POST", body, options);
  }

  async get(
    params: SpaceWagerSessionParams,
    options: RequestOptions = {},
  ): Promise<SpaceWagerSession> {
    const { spaceId, sessionId } = validateSessionParams(params);
    return this.authorized(
      spaceId,
      `/api/v1/wager/sessions/${sessionId}`,
      "GET",
      undefined,
      options,
    );
  }

  async lock(
    params: SpaceWagerSessionParams,
    options: RequestOptions = {},
  ): Promise<SpaceWagerSession> {
    return this.sessionAction(params, "lock", options);
  }

  async cancel(
    params: SpaceWagerSessionParams,
    options: RequestOptions = {},
  ): Promise<SpaceWagerCancelResponse> {
    const { spaceId, sessionId } = validateSessionParams(params);
    return this.authorized(
      spaceId,
      `/api/v1/wager/sessions/${sessionId}/cancel`,
      "POST",
      undefined,
      options,
    );
  }

  async heartbeat(
    params: SpaceWagerHeartbeatParams,
    options: RequestOptions = {},
  ): Promise<SpaceWagerSession> {
    const { spaceId, sessionId } = validateSessionParams(params);
    const expiresAt = validTimestamp(params.expiresAt, "expiresAt");
    return this.authorized(
      spaceId,
      `/api/v1/wager/sessions/${sessionId}/heartbeat`,
      "POST",
      { expiresAt },
      options,
    );
  }

  async settle(
    params: SpaceWagerSettleParams,
    options: RequestOptions = {},
  ): Promise<SpaceWagerSettleResponse> {
    const { spaceId, sessionId } = validateSessionParams(params);
    const body = validateSettlement(params);
    return this.authorized(
      spaceId,
      `/api/v1/wager/sessions/${sessionId}/settle`,
      "POST",
      body,
      options,
    );
  }

  private sessionAction(
    params: SpaceWagerSessionParams,
    action: "lock",
    options: RequestOptions,
  ): Promise<SpaceWagerSession> {
    const { spaceId, sessionId } = validateSessionParams(params);
    return this.authorized(
      spaceId,
      `/api/v1/wager/sessions/${sessionId}/${action}`,
      "POST",
      undefined,
      options,
    );
  }

  private authorized<T>(
    spaceId: string,
    path: string,
    method: string,
    body: object | undefined,
    options: RequestOptions,
  ): Promise<T> {
    return this.tokenProvider.run(spaceId, (token) => request<T>(`${this.apiUrl}${path}`, {
      ...options,
      method,
      token,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
  }
}

function validateOpenParams(params: SpaceWagerOpenParams): {
  spaceId: string;
  body: Omit<SpaceWagerOpenParams, "spaceId">;
} {
  if (!params || !validUuid(params.spaceId)) invalid("spaceId must be a UUID", "invalid_space_id");
  if (!validUuid(params.spaceVersionId)) {
    invalid("spaceVersionId must be a UUID", "invalid_space_version_id");
  }
  positiveInteger(params.minBuyInPoints, "minBuyInPoints");
  positiveInteger(params.maxBuyInPoints, "maxBuyInPoints");
  if (params.maxBuyInPoints < params.minBuyInPoints || params.maxBuyInPoints > 1_000_000) {
    invalid(
      "maxBuyInPoints must be at least minBuyInPoints and at most 1000000",
      "invalid_max_buy_in_points",
    );
  }
  const rakeBps = params.rakeBps ?? 0;
  if (!Number.isInteger(rakeBps) || rakeBps < 0 || rakeBps > 500) {
    invalid("rakeBps must be an integer from 0 to 500", "invalid_rake_bps");
  }
  const expiresAt = params.expiresAt === undefined
    ? undefined
    : validTimestamp(params.expiresAt, "expiresAt");
  return {
    spaceId: params.spaceId.toLowerCase(),
    body: {
      spaceVersionId: params.spaceVersionId.toLowerCase(),
      minBuyInPoints: params.minBuyInPoints,
      maxBuyInPoints: params.maxBuyInPoints,
      rakeBps,
      ...(expiresAt === undefined ? {} : { expiresAt }),
    },
  };
}

function validateSessionParams(params: SpaceWagerSessionParams): {
  spaceId: string;
  sessionId: string;
} {
  if (!params || !validUuid(params.spaceId)) invalid("spaceId must be a UUID", "invalid_space_id");
  if (!validUuid(params.sessionId)) invalid("sessionId must be a UUID", "invalid_session_id");
  return { spaceId: params.spaceId.toLowerCase(), sessionId: params.sessionId.toLowerCase() };
}

function validateSettlement(params: SpaceWagerSettleParams): Omit<
  SpaceWagerSettleParams,
  "spaceId" | "sessionId"
> {
  positiveInteger(params.sequenceNo, "sequenceNo");
  if (typeof params.isFinal !== "boolean") invalid("isFinal must be a boolean", "invalid_is_final");
  nonNegativeInteger(params.expectedTotalStakePoints, "expectedTotalStakePoints");
  nonNegativeInteger(params.rakePoints, "rakePoints");
  if (!Array.isArray(params.payouts)) invalid("payouts must be an array", "invalid_payouts");
  const users = new Set<string>();
  const payouts = params.payouts.map((payout) => {
    if (!payout || typeof payout.userId !== "string" || payout.userId.length === 0) {
      invalid("each payout userId must be non-empty", "invalid_payouts");
    }
    if (users.has(payout.userId)) invalid("payout userId values must be unique", "invalid_payouts");
    users.add(payout.userId);
    nonNegativeInteger(payout.payoutPoints, "payoutPoints");
    return { userId: payout.userId, payoutPoints: payout.payoutPoints };
  });
  return {
    sequenceNo: params.sequenceNo,
    isFinal: params.isFinal,
    expectedTotalStakePoints: params.expectedTotalStakePoints,
    payouts,
    rakePoints: params.rakePoints,
  };
}

function validTimestamp(value: string | Date, field: string): string {
  if (typeof value !== "string" && !(value instanceof Date)) {
    invalid(`${field} must be a valid timestamp`, invalidFieldCode(field));
  }
  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    invalid(`${field} must be a valid timestamp`, invalidFieldCode(field));
  }
  return timestamp.toISOString();
}

function positiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    invalid(`${field} must be a positive integer`, invalidFieldCode(field));
  }
}

function nonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    invalid(`${field} must be a non-negative integer`, invalidFieldCode(field));
  }
}

function invalidFieldCode(field: string): string {
  return `invalid_${field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`;
}

function invalid(message: string, code: string): never {
  throw new ArinovaError(message, 0, code);
}

function validUuid(value: string): boolean {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
