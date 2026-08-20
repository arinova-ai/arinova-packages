/**
 * @arinova-ai/spaces-sdk — shared type definitions (single source of truth).
 *
 * Shapes mirror the arinova-chat server exactly:
 *   - OAuth:   apps/rust-server/src/routes/oauth.rs
 *   - API v1:  apps/rust-server/src/routes/api_v1.rs
 * All /oauth/* and /api/v1/* endpoints are served by the API host
 * (https://api.chat.arinova.ai); the consent/login UI is on the frontend
 * (https://chat.arinova.ai).
 */

// ── Config ───────────────────────────────────────────────────────
export interface ArinovaConfig {
  /** Your OAuth app client_id (public/PKCE client). */
  clientId: string;
  /** API host that serves /oauth/* and /api/v1/*. Default: https://api.chat.arinova.ai */
  apiUrl?: string;
  /** Consent/login UI host. Default: https://chat.arinova.ai */
  authUrl?: string;
  /** OAuth redirect URI. Default: `${location.origin}/callback`. */
  redirectUri?: string;
  /** Requested OAuth scopes (joined with spaces). Default: ["profile"]. */
  scopes?: ArinovaScope[];
}

/** Per-request cancellation and deadline controls. */
export interface RequestOptions {
  signal?: AbortSignal;
  /** Total request deadline in milliseconds. Default: 15 seconds. */
  timeoutMs?: number;
  /** Retry count for transient network, 429, and 5xx failures. Default: 0. */
  retries?: number;
}

/** Server-side (secret-bearing) config — never use in a browser bundle. */
export interface ArinovaServerConfig {
  clientId: string;
  clientSecret: string;
  /** Default: https://api.chat.arinova.ai */
  apiUrl?: string;
}

/** Scopes the server recognizes (space-separated on the wire). */
export type ArinovaScope = "profile" | "email" | "agents" | "economy" | (string & {});

// ── User / session ───────────────────────────────────────────────
export interface ArinovaUser {
  id: string;
  name: string;
  /** null unless the token carries the `profile`/`email` scope. */
  email: string | null;
  image: string | null;
  /** Only present from `user.profile()`. */
  isVerified?: boolean;
}

export interface AgentInfo {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
}

export interface ArinovaSession {
  user: ArinovaUser;
  accessToken: string;
  tokenType: string;
  /** Epoch milliseconds when the access token expires. */
  expiresAt: number;
  scopes: string[];
  agents: AgentInfo[];
  /** Present for sessions issued to an embedded Space. */
  spaceId?: string;
}

/** Convert the OAuth wire response into the SDK's public session shape. */
export function sessionFromToken(token: TokenResponse): ArinovaSession {
  return {
    user: token.user,
    accessToken: token.access_token,
    tokenType: token.token_type,
    expiresAt: Date.now() + token.expires_in * 1000,
    scopes: (token.scope ?? "").split(/[ ,]+/).filter(Boolean),
    agents: [],
  };
}

// ── Auth options ─────────────────────────────────────────────────
export type ConnectMode = "auto" | "iframe" | "popup" | "redirect";
export interface ConnectOptions {
  /** Default "auto": iframe when embedded, else popup. */
  mode?: ConnectMode;
  /** postMessage wait (ms) in iframe mode. Default 5000. */
  timeout?: number;
}
export interface LoginOptions {
  /** "popup" (default) resolves with a session; "redirect" navigates away. */
  mode?: "popup" | "redirect";
}

/** Raw OAuth token endpoint response. */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
  user: ArinovaUser;
}

// ── Economy ──────────────────────────────────────────────────────
export interface BalanceResponse {
  balance: number;
}
export interface TransactionsParams {
  limit?: number;
  offset?: number;
}
export interface TransactionRecord {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  createdAt: string | null;
}
export interface TransactionsResponse {
  transactions: TransactionRecord[];
  total: number;
  limit: number;
  offset: number;
}

// ── Managed Space commerce ───────────────────────────────────────
export type SpaceProductKind = "consumable" | "durable" | "subscription";

export interface SpaceProduct {
  productKey: string;
  name: string;
  description: string;
  pricePoints: number;
  kind: SpaceProductKind;
}

export interface SpaceProductsResponse {
  spaceId: string;
  subscriptionPeriodDays: number;
  products: SpaceProduct[];
}

export interface SpaceInventoryItem {
  productKey: string;
  name: string;
  kind: "consumable" | "durable";
  quantity: number;
}

export interface SpaceInventorySubscription {
  productKey: string;
  status: "active" | "past_due" | "ended";
  currentPeriodEnd: string;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface SpaceInventoryResponse {
  spaceId: string;
  items: SpaceInventoryItem[];
  subscriptions: SpaceInventorySubscription[];
}

export interface ConsumeInventoryParams {
  quantity: number;
  /** Visible ASCII, 1–128 characters, and stable across retries. */
  idempotencyKey: string;
}

export interface ConsumeInventoryResponse {
  spaceId: string;
  productKey: string;
  quantityConsumed: number;
  remainingQuantity: number;
  ledgerId: string;
  idempotentReplay: boolean;
}

export interface SpacePurchaseResult {
  productKey: string;
  status: "purchased" | "cancelled" | "error";
  protocolVersion: 1;
  errorCode?: string;
  grantId?: string | null;
  subscriptionId?: string | null;
  currentPeriodEnd?: string | null;
  quantity?: number | null;
  balance?: number;
  idempotentReplay?: boolean;
  [key: string]: unknown;
}

// ── Managed Space wager sessions ────────────────────────────────
export interface WagerBuyInOptions {
  /** Host confirmation deadline in milliseconds. Default: 60 seconds. */
  timeout?: number;
}

export interface WagerBuyInResult {
  sessionId: string;
  status: "accepted" | "cancelled" | "error";
  protocolVersion: 1;
  errorCode?: string;
  retryAfterMs?: number;
  stakeId?: string;
  [key: string]: unknown;
}

// ── Managed Space per-user storage ───────────────────────────────
export interface SpaceStorageEntry<T = unknown> {
  key: string;
  value: T;
  updatedAt: string;
}

export interface SpaceStorageListResponse<T = unknown> {
  entries: SpaceStorageEntry<T>[];
  usedBytes: number;
  quotaBytes: number;
}

export type SpaceStorageErrorCode =
  | "SPACE_STORAGE_KEY_INVALID"
  | "SPACE_STORAGE_KEY_NOT_FOUND"
  | "SPACE_STORAGE_VALUE_QUOTA_EXCEEDED"
  | "SPACE_STORAGE_VALUE_INVALID"
  | "SPACE_STORAGE_KEY_QUOTA_EXCEEDED"
  | "SPACE_STORAGE_USER_QUOTA_EXCEEDED"
  | "SPACE_STORAGE_GLOBAL_QUOTA_EXCEEDED";
// ── Agent chat ───────────────────────────────────────────────────
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}
export interface AgentChatParams {
  agentId: string;
  /** One of prompt / messages is required. */
  prompt?: string;
  messages?: ChatMessage[];
  /** Overrides the agent's default system prompt. */
  systemPrompt?: string;
  /** App/game state, injected into the system prompt as a context block. */
  context?: unknown;
}
export interface AgentChatResponse {
  response: string;
  agentId: string;
}
export type AgentChatEvent =
  | { type: "chunk"; content: string }
  | { type: "done"; content: string; agentId: string }
  | { type: "error"; error: string };
