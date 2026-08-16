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
  /** Maximum buffered JSON response size. Default: 10 MiB. */
  maxResponseBytes?: number;
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
export interface PurchaseParams {
  /** Embedded Space ID. Must match the space-bound OAuth token. */
  spaceId: string;
  productId?: string;
  amount: number;
  description?: string;
  /** Replay-protection key. The SDK generates one when omitted. */
  idempotencyKey?: string;
}
export interface PurchaseResponse {
  transactionId: string;
  newBalance: number;
  spaceId: string;
  creatorShare: number;
  idempotentReplay: boolean;
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
