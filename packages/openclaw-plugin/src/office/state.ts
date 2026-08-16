import type { AgentState, InternalEvent, OfficeStatusEvent } from "./types.js";
import {
  applyActivity,
  applyAgentEnd,
  applyError,
  applyLlmActivity,
  applySessionEnd,
  applyToolCall,
  createAgentState,
  updateCollaborationStatus,
  type SubagentLink,
} from "./state-transitions.js";

/** How long (ms) before an agent with no activity is considered idle */
const IDLE_TIMEOUT = 60_000;

/** How long (ms) a blocked status sticks before reverting to idle */
const BLOCKED_LINGER = 120_000;

/** How long (ms) after session_end before removing the agent from the map */
const OFFLINE_REMOVE_DELAY = 300_000;

/** Hard retention bounds for long-running gateway processes. */
const DEFAULT_MAX_AGENTS = 512;
const DEFAULT_MAX_AGENT_AGE_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_SESSIONS = 2_048;
const DEFAULT_MAX_SUBAGENT_LINKS = 1_024;

type StatusListener = (event: OfficeStatusEvent) => void;

export interface OfficeStateStoreOptions {
  maxAgents?: number;
  maxAgentAgeMs?: number;
  maxSessions?: number;
  maxSubagentLinks?: number;
}

/**
 * In-memory state store for all tracked agents.
 * Aggregates hook events into derived AgentStatus values.
 */
export class OfficeStateStore {
  private agents = new Map<string, AgentState>();
  private listeners = new Set<StatusListener>();
  private subagentLinks: SubagentLink[] = [];
  /** Maps sessionKey/sessionId → agentId for reliable resolution */
  private sessionToAgent = new Map<string, string>();
  /** Insertion order is refreshed on every event, making this an LRU index. */
  private agentLastSeen = new Map<string, number>();
  private readonly maxAgents: number;
  private readonly maxAgentAgeMs: number;
  private readonly maxSessions: number;
  private readonly maxSubagentLinks: number;

  constructor(options: OfficeStateStoreOptions = {}) {
    this.maxAgents = positiveLimit(options.maxAgents, DEFAULT_MAX_AGENTS);
    this.maxAgentAgeMs = positiveLimit(
      options.maxAgentAgeMs,
      DEFAULT_MAX_AGENT_AGE_MS,
    );
    this.maxSessions = positiveLimit(options.maxSessions, DEFAULT_MAX_SESSIONS);
    this.maxSubagentLinks = positiveLimit(
      options.maxSubagentLinks,
      DEFAULT_MAX_SUBAGENT_LINKS,
    );
  }

  /** Process an incoming hook event and update agent state */
  ingest(event: InternalEvent): void {
    const now = Date.now();
    const evicted = this.evictExpired(now);
    this.reserveAgentSlot(event.agentId);

    // Track session→agent mapping from every event that has both
    if (event.agentId && event.agentId !== "unknown" && event.sessionId) {
      this.setSessionAgent(event.sessionId, event.agentId);
    }

    switch (event.type) {
      case "session_start":
        this.handleSessionStart(event);
        break;
      case "session_end":
        this.handleSessionEnd(event);
        break;
      case "llm_input":
        this.handleLlmInput(event);
        break;
      case "llm_output":
        this.handleLlmOutput(event);
        break;
      case "tool_result":
      case "message_in":
      case "message_out":
        this.handleActivity(event);
        break;
      case "tool_call":
        this.handleToolCall(event);
        break;
      case "agent_error":
        this.handleError(event);
        break;
      case "agent_end":
        this.handleAgentEnd(event);
        break;
      case "subagent_start":
        this.handleSubagentStart(event);
        break;
      case "subagent_end":
        this.handleSubagentEnd(event);
        break;
    }
    if (this.agents.has(event.agentId)) {
      this.touchAgent(event.agentId, now);
    } else if (evicted) {
      this.broadcast();
    }
  }

  private handleSessionStart(event: InternalEvent): void {
    const existing = this.agents.get(event.agentId);
    this.agents.set(
      event.agentId,
      createAgentState(event.agentId, event.timestamp, existing),
    );
    this.broadcast();
  }

  private handleSessionEnd(event: InternalEvent): void {
    const agent = this.agents.get(event.agentId);
    if (!agent) return;

    applySessionEnd(agent, event);
    // Clean up subagent links involving this agent
    this.removeSubagentLinks(event.agentId);
    this.updateCollaborationStatus();
    // Clean up session mapping
    this.sessionToAgent.delete(event.sessionId);
    this.broadcast();
  }

  private handleLlmInput(event: InternalEvent): void {
    const agent = this.ensureAgent(event.agentId, event.timestamp);
    applyLlmActivity(agent, event, false);
    this.broadcast();
  }

  private handleLlmOutput(event: InternalEvent): void {
    const agent = this.ensureAgent(event.agentId, event.timestamp);
    applyLlmActivity(agent, event, true);
    this.broadcast();
  }

  private handleActivity(event: InternalEvent): void {
    const agent = this.ensureAgent(event.agentId, event.timestamp);

    applyActivity(agent, event.timestamp);
    this.broadcast();
  }

  private handleToolCall(event: InternalEvent): void {
    const agent = this.ensureAgent(event.agentId, event.timestamp);

    applyToolCall(agent, event);
    this.broadcast();
  }

  private handleError(event: InternalEvent): void {
    const agent = this.ensureAgent(event.agentId, event.timestamp);
    applyError(agent, event.timestamp);
    this.broadcast();
  }

  private handleAgentEnd(event: InternalEvent): void {
    const agent = this.agents.get(event.agentId);
    if (!agent) return;
    applyAgentEnd(agent, event);
    this.broadcast();
  }

  private handleSubagentStart(event: InternalEvent): void {
    const parentSessionKey = event.data.parentSessionKey as string | undefined;
    if (!parentSessionKey) return;

    // Resolve parent agent via session→agent mapping
    const parentAgentId = this.sessionToAgent.get(parentSessionKey) ?? parentSessionKey;

    this.subagentLinks = this.subagentLinks.filter(
      (link) => link.childSessionKey !== event.sessionId,
    );
    this.subagentLinks.push({
      parentAgentId,
      childAgentId: event.agentId,
      childSessionKey: event.sessionId,
    });
    if (this.subagentLinks.length > this.maxSubagentLinks) {
      this.subagentLinks.splice(
        0,
        this.subagentLinks.length - this.maxSubagentLinks,
      );
    }

    // Ensure child agent exists
    this.ensureAgent(event.agentId, event.timestamp);

    this.updateCollaborationStatus();
    this.broadcast();
  }

  private handleSubagentEnd(event: InternalEvent): void {
    const childKey = event.sessionId;
    this.subagentLinks = this.subagentLinks.filter(
      (l) => l.childSessionKey !== childKey,
    );
    this.updateCollaborationStatus();
    this.broadcast();
  }

  /** Update collaboratingWith arrays and status for linked agents */
  private updateCollaborationStatus(): void {
    updateCollaborationStatus(this.agents, this.subagentLinks);
  }

  private removeSubagentLinks(agentId: string): void {
    this.subagentLinks = this.subagentLinks.filter(
      (l) => l.parentAgentId !== agentId && l.childAgentId !== agentId,
    );
  }

  private ensureAgent(agentId: string, timestamp: number): AgentState {
    let agent = this.agents.get(agentId);
    if (!agent) {
      agent = createAgentState(agentId, timestamp);
      this.agents.set(agentId, agent);
    }
    return agent;
  }

  private setSessionAgent(sessionId: string, agentId: string): void {
    this.sessionToAgent.delete(sessionId);
    this.sessionToAgent.set(sessionId, agentId);
    while (this.sessionToAgent.size > this.maxSessions) {
      const oldest = this.sessionToAgent.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.sessionToAgent.delete(oldest);
    }
  }

  private touchAgent(agentId: string, now: number): void {
    this.agentLastSeen.delete(agentId);
    this.agentLastSeen.set(agentId, now);
  }

  private reserveAgentSlot(agentId: string): void {
    if (this.agents.has(agentId)) return;
    while (this.agents.size >= this.maxAgents) {
      const oldest = this.agentLastSeen.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.removeAgent(oldest);
    }
  }

  private removeAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.agentLastSeen.delete(agentId);
    this.removeSubagentLinks(agentId);
    for (const [sessionId, mappedAgentId] of this.sessionToAgent) {
      if (mappedAgentId === agentId) {
        this.sessionToAgent.delete(sessionId);
      }
    }
  }

  private evictExpired(now: number): boolean {
    let changed = false;
    for (const [agentId, lastSeen] of this.agentLastSeen) {
      if (now - lastSeen <= this.maxAgentAgeMs) continue;
      this.removeAgent(agentId);
      changed = true;
    }
    return changed;
  }

  /** Run periodic checks — idle timeout, blocked linger, offline cleanup */
  tick(): void {
    const now = Date.now();
    let changed = this.evictExpired(now);

    for (const [id, agent] of this.agents) {
      const elapsed = now - agent.lastActivity;

      // Remove long-offline agents
      if (!agent.online && elapsed > OFFLINE_REMOVE_DELAY) {
        this.removeAgent(id);
        changed = true;
        continue;
      }

      // Blocked → idle after linger period
      if (agent.status === "blocked" && elapsed > BLOCKED_LINGER) {
        agent.status = "idle";
        changed = true;
      }

      // Working → idle after timeout
      if (agent.status === "working" && elapsed > IDLE_TIMEOUT) {
        agent.status = "idle";
        changed = true;
      }
    }

    if (changed) {
      this.updateCollaborationStatus();
      this.broadcast();
    }
  }

  /** Get current snapshot of all online agents */
  snapshot(): OfficeStatusEvent {
    const onlineAgents = Array.from(this.agents.values()).filter((a) => a.online);
    return {
      type: "status_update",
      agents: onlineAgents,
      timestamp: Date.now(),
    };
  }

  /** Subscribe to status changes */
  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private broadcast(): void {
    const event = this.snapshot();
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        this.listeners.delete(listener);
      }
    }
  }
}

/** Singleton store instance */
export const officeState = new OfficeStateStore();

function positiveLimit(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && value! > 0 ? value! : fallback;
}
