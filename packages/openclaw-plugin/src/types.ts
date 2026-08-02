// DmPolicy inlined (removed from root plugin-sdk export in new SDK)
export type DmPolicy = "open" | "disabled" | "allowlist" | "pairing";

export type ArinovaChatAccountConfig = {
  name?: string;
  enabled?: boolean;
  /** Arinova backend URL (e.g., "http://localhost:21001"). */
  apiUrl?: string;
  /** Permanent bot token from Arinova UI (never expires, survives reinstalls). */
  botToken?: string;
  /** Arinova agent UUID that this plugin acts as. */
  agentId?: string;
  /** Direct message policy. Default: "open". */
  dmPolicy?: DmPolicy;
  /** Optional allowlist of user IDs. */
  allowFrom?: string[];
  /** Explicit allowlist of agent IDs whose A2A messages may trigger this agent. Default: none. */
  allowAgentMessagesFrom?: string[];
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
  /** Agent identity for an agent-authored A2A message. */
  senderAgentId?: string;
  senderAgentName?: string;
  /** Other agents in the conversation (for group chats). */
  members?: { agentId: string; agentName: string }[];
  /** The message being replied to, if this is a reply. */
  replyTo?: { role: string; content: string; senderAgentName?: string };
  /** Recent conversation history (up to 5 messages before the current one). */
  history?: { role: string; content: string; senderAgentName?: string; senderUsername?: string; createdAt: string }[];
  /** Attachments from the user's message. */
  attachments?: { id: string; fileName: string; fileType: string; fileSize: number; url: string }[];
};

/** Result from sending a message via Arinova REST API. */
export type ArinovaChatSendResult = {
  messageId?: string;
};
