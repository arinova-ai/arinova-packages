/** Agent status in the virtual office */
export type AgentStatus = "working" | "idle" | "blocked" | "collaborating";

/** Token usage from the last LLM call */
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
}

/** Tracked state for a single agent session */
export interface AgentState {
  /** Agent/session identifier */
  agentId: string;
  /** Display name (resolved from context or session metadata) */
  name: string;
  /** Current derived status */
  status: AgentStatus;
  /** Timestamp of last activity */
  lastActivity: number;
  /** IDs of agents this one is collaborating with (via subagents) */
  collaboratingWith: string[];
  /** Current task description (from session context) */
  currentTask: string | null;
  /** Whether the session is currently active */
  online: boolean;
  /** LLM model being used (e.g. "claude-sonnet-4-20250514") */
  model: string | null;
  /** Cumulative token usage for the current session */
  tokenUsage: TokenUsage | null;
  /** Session duration in milliseconds (set on session_end / agent_end) */
  sessionDurationMs: number | null;
  /** Current tool call detail (name + optional duration) */
  currentToolDetail: string | null;
}

/** Payload for SSE status events */
export interface OfficeStatusEvent {
  type: "status_update";
  agents: AgentState[];
  timestamp: number;
}

/** Internal event types used by the state store */
export type InternalEventType =
  | "session_start"
  | "session_end"
  | "llm_input"
  | "llm_output"
  | "tool_call"
  | "tool_result"
  | "message_in"
  | "message_out"
  | "subagent_start"
  | "subagent_end"
  | "agent_end"
  | "agent_error";

/** Normalized internal event fed into the state store */
export interface InternalEvent {
  type: InternalEventType;
  agentId: string;
  sessionId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// Legacy aliases for backwards compatibility with direct integration
export type HookEventType = InternalEventType;
export type HookEvent = InternalEvent;
