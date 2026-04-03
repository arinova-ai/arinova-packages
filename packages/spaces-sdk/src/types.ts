// ===== Config =====
export interface ArinovaConfig {
  appId: string;
  baseUrl?: string; // defaults to "https://api.arinova.ai"
}

// ===== Auth =====
export interface LoginOptions {
  scope?: string[]; // defaults to ["profile"]
}

export interface LoginResult {
  user: ArinovaUser;
  accessToken: string;
}

export interface ConnectOptions {
  timeout?: number; // milliseconds, defaults to 5000
}

export interface ConnectResult {
  user: ArinovaUser;
  accessToken: string;
  agents: AgentInfo[];
}

export interface ArinovaUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

// ===== Agent =====
export interface AgentInfo {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
}

export interface AgentChatOptions {
  agentId: string;
  prompt: string;
  systemPrompt?: string;
  accessToken: string;
}

export interface AgentChatResponse {
  response: string;
  agentId: string;
}

export interface AgentChatStreamOptions extends AgentChatOptions {
  onChunk: (chunk: string) => void;
}

export interface AgentChatStreamResponse {
  content: string;
  agentId: string;
}

// ===== Economy =====
export interface ChargeOptions {
  userId: string;
  amount: number;
  description?: string;
}

export interface ChargeResponse {
  transactionId: string;
  newBalance: number;
}

export interface AwardOptions {
  userId: string;
  amount: number;
  description?: string;
}

export interface AwardResponse {
  transactionId: string;
  newBalance: number;
  platformFee: number;
}

export interface BalanceResponse {
  balance: number;
}

export interface PurchaseOptions {
  productId: string;
  amount: number;
  description?: string;
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

// ===== SSE Event =====
export interface SSEChunkEvent {
  type: "chunk";
  content: string;
}

export interface SSEDoneEvent {
  type: "done";
  content: string;
}

export interface SSEErrorEvent {
  type: "error";
  error: string;
}

export type SSEEvent = SSEChunkEvent | SSEDoneEvent | SSEErrorEvent;
