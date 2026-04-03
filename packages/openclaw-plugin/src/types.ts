// DmPolicy inlined (removed from root plugin-sdk export in new SDK)
export type DmPolicy = "open" | "allowlist" | "paired";

export type ArinovaChatAccountConfig = {
  name?: string;
  enabled?: boolean;
  /** Arinova backend URL (e.g., "http://localhost:21001"). */
  apiUrl?: string;
  /** Permanent bot token from Arinova UI (never expires, survives reinstalls). */
  botToken?: string;
  /** Bot account email for Better Auth sign-in. */
  email?: string;
  /** Bot account password for Better Auth sign-in. */
  password?: string;
  /** Pre-existing session token (skip sign-in). */
  sessionToken?: string;
  /** Arinova agent UUID that this plugin acts as. */
  agentId?: string;
  /** Direct message policy. Default: "open". */
  dmPolicy?: DmPolicy;
  /** Optional allowlist of user IDs. */
  allowFrom?: string[];
  /** Outbound text chunk limit. Default: 32000. */
  textChunkLimit?: number;
};

export type ArinovaChatConfig = {
  accounts?: Record<string, ArinovaChatAccountConfig>;
} & ArinovaChatAccountConfig;

export type CoreConfig = {
  channels?: {
    "openclaw-arinova-ai"?: ArinovaChatConfig;
  };
  [key: string]: unknown;
};

/** Parsed inbound message from A2A request. */
export type ArinovaChatInboundMessage = {
  /** JSON-RPC request id (also used as A2A task id). */
  taskId: string;
  /** User text content. */
  text: string;
  /** Timestamp of receipt. */
  timestamp: number;
  /** Conversation ID this message belongs to. */
  conversationId?: string;
  /** Conversation type: "direct" or "group". */
  conversationType?: string;
  /** User ID of the human who sent the message. */
  senderUserId?: string;
  /** Username of the human who sent the message. */
  senderUsername?: string;
  /** Other agents in the conversation (for group chats). */
  members?: { agentId: string; agentName: string }[];
  /** The message being replied to, if this is a reply. */
  replyTo?: { role: string; content: string; senderAgentName?: string };
  /** Recent conversation history (up to 5 messages before the current one). */
  history?: { role: string; content: string; senderAgentName?: string; senderUsername?: string; createdAt: string }[];
  /** Attachments from the user's message. */
  attachments?: { id: string; fileName: string; fileType: string; fileSize: number; url: string }[];
  /** Fetch full conversation history with pagination. */
  fetchHistory?: (options?: { before?: string; after?: string; around?: string; limit?: number }) => Promise<{ messages: unknown[]; hasMore: boolean; nextCursor?: string }>;
};

/** Result from sending a message via Arinova REST API. */
export type ArinovaChatSendResult = {
  messageId?: string;
};
