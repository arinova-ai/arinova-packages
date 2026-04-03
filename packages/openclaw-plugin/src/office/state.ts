import type { AgentState, AgentStatus, InternalEvent, OfficeStatusEvent } from "./types.js";

/** How long (ms) before an agent with no activity is considered idle */
const IDLE_TIMEOUT = 60_000;

/** How long (ms) a blocked status sticks before reverting to idle */
const BLOCKED_LINGER = 120_000;

/** How long (ms) after session_end before removing the agent from the map */
const OFFLINE_REMOVE_DELAY = 300_000;

type StatusListener = (event: OfficeStatusEvent) => void;

/** Track parent↔child relationships for collaboration detection */
interface SubagentLink {
  parentAgentId: string;
  childAgentId: string;
  childSessionKey: string;
}

/**
 * In-memory state store for all tracked agents.
 * Aggregates hook events into derived AgentStatus values.
 */
class OfficeStateStore {
  private agents = new Map<string, AgentState>();
  private listeners = new Set<StatusListener>();
  private subagentLinks: SubagentLink[] = [];
  /** Maps sessionKey/sessionId → agentId for reliable resolution */
  private sessionToAgent = new Map<string, string>();

  /** Process an incoming hook event and update agent state */
  ingest(event: InternalEvent): void {
    // Track session→agent mapping from every event that has both
    if (event.agentId && event.agentId !== "unknown" && event.sessionId) {
      this.sessionToAgent.set(event.sessionId, event.agentId);
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
  }

  private handleSessionStart(event: InternalEvent): void {
    const existing = this.agents.get(event.agentId);
    this.agents.set(event.agentId, {
      agentId: event.agentId,
      name: existing?.name ?? "Agent",
      status: "working",
      lastActivity: event.timestamp,
      collaboratingWith: existing?.collaboratingWith ?? [],
      currentTask: existing?.currentTask ?? null,
      online: true,
      model: existing?.model ?? null,
      tokenUsage: null,
      sessionDurationMs: null,
      currentToolDetail: null,
    });
    this.broadcast();
  }

  private handleSessionEnd(event: InternalEvent): void {
    const agent = this.agents.get(event.agentId);
    if (!agent) return;

    agent.status = "idle";
    agent.online = false;
    agent.lastActivity = event.timestamp;
    agent.currentTask = null;
    agent.currentToolDetail = null;
    const durationMs = event.data.durationMs as number | undefined;
    if (durationMs != null) {
      agent.sessionDurationMs = durationMs;
    }
    // Clean up subagent links involving this agent
    this.removeSubagentLinks(event.agentId);
    this.updateCollaborationStatus();
    // Clean up session mapping
    this.sessionToAgent.delete(event.sessionId);
    this.broadcast();
  }

  private handleLlmInput(event: InternalEvent): void {
    const agent = this.ensureAgent(event.agentId, event.timestamp);
    const model = event.data.model as string | undefined;
    if (model) {
      agent.model = model;
    }
    if (agent.status === "blocked" || agent.status === "idle") {
      agent.status = "working";
    }
    agent.lastActivity = event.timestamp;
    agent.online = true;
    this.broadcast();
  }

  private handleLlmOutput(event: InternalEvent): void {
    const agent = this.ensureAgent(event.agentId, event.timestamp);
    const model = event.data.model as string | undefined;
    if (model) {
      agent.model = model;
    }
    const usage = event.data.usage as { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number } | undefined;
    if (usage) {
      const prev = agent.tokenUsage;
      agent.tokenUsage = {
        input: (prev?.input ?? 0) + (usage.input ?? 0),
        output: (prev?.output ?? 0) + (usage.output ?? 0),
        cacheRead: (prev?.cacheRead ?? 0) + (usage.cacheRead ?? 0),
        cacheWrite: (prev?.cacheWrite ?? 0) + (usage.cacheWrite ?? 0),
        total: (prev?.total ?? 0) + (usage.total ?? 0),
      };
    }
    if (agent.status === "blocked" || agent.status === "idle") {
      agent.status = "working";
    }
    agent.lastActivity = event.timestamp;
    agent.online = true;
    this.broadcast();
  }

  private handleActivity(event: InternalEvent): void {
    const agent = this.ensureAgent(event.agentId, event.timestamp);

    // Activity resets blocked status
    if (agent.status === "blocked") {
      agent.status = "working";
    }
    // Only upgrade idle to working (don't break collaborating)
    if (agent.status === "idle") {
      agent.status = "working";
    }
    agent.lastActivity = event.timestamp;
    agent.online = true;
    this.broadcast();
  }

  private handleToolCall(event: InternalEvent): void {
    const agent = this.ensureAgent(event.agentId, event.timestamp);

    if (agent.status === "blocked" || agent.status === "idle") {
      agent.status = "working";
    }
    agent.lastActivity = event.timestamp;
    agent.online = true;
    // Set currentTask from the tool name
    const toolName = event.data.toolName as string | undefined;
    if (toolName) {
      agent.currentTask = toolName;
      const durationMs = event.data.durationMs as number | undefined;
      agent.currentToolDetail = durationMs
        ? `${toolName} (${durationMs}ms)`
        : toolName;
    }
    this.broadcast();
  }

  private handleError(event: InternalEvent): void {
    const agent = this.ensureAgent(event.agentId, event.timestamp);
    agent.status = "blocked";
    agent.lastActivity = event.timestamp;
    this.broadcast();
  }

  private handleAgentEnd(event: InternalEvent): void {
    const agent = this.agents.get(event.agentId);
    if (!agent) return;
    // Agent run completed successfully — mark as idle
    if (agent.status !== "blocked") {
      agent.status = "idle";
    }
    agent.lastActivity = event.timestamp;
    agent.currentTask = null;
    agent.currentToolDetail = null;
    const durationMs = event.data.durationMs as number | undefined;
    if (durationMs != null) {
      agent.sessionDurationMs = durationMs;
    }
    this.broadcast();
  }

  private handleSubagentStart(event: InternalEvent): void {
    const parentSessionKey = event.data.parentSessionKey as string | undefined;
    if (!parentSessionKey) return;

    // Resolve parent agent via session→agent mapping
    const parentAgentId = this.sessionToAgent.get(parentSessionKey) ?? parentSessionKey;

    this.subagentLinks.push({
      parentAgentId,
      childAgentId: event.agentId,
      childSessionKey: event.sessionId,
    });

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
    // Reset all collaboration arrays
    for (const agent of this.agents.values()) {
      agent.collaboratingWith = [];
    }

    // Build collaboration links
    for (const link of this.subagentLinks) {
      const parent = this.agents.get(link.parentAgentId);
      const child = this.agents.get(link.childAgentId);

      if (parent && child) {
        if (!parent.collaboratingWith.includes(link.childAgentId)) {
          parent.collaboratingWith.push(link.childAgentId);
        }
        if (!child.collaboratingWith.includes(link.parentAgentId)) {
          child.collaboratingWith.push(link.parentAgentId);
        }
      }
    }

    // Set collaborating status for agents with active links
    for (const agent of this.agents.values()) {
      if (agent.collaboratingWith.length > 0 && agent.online) {
        agent.status = "collaborating";
      } else if (agent.status === "collaborating") {
        // No more links — revert to working if online
        agent.status = agent.online ? "working" : "idle";
      }
    }
  }

  private removeSubagentLinks(agentId: string): void {
    this.subagentLinks = this.subagentLinks.filter(
      (l) => l.parentAgentId !== agentId && l.childAgentId !== agentId,
    );
  }

  private ensureAgent(agentId: string, timestamp: number): AgentState {
    let agent = this.agents.get(agentId);
    if (!agent) {
      agent = {
        agentId,
        name: "Agent",
        status: "working",
        lastActivity: timestamp,
        collaboratingWith: [],
        currentTask: null,
        online: true,
        model: null,
        tokenUsage: null,
        sessionDurationMs: null,
        currentToolDetail: null,
      };
      this.agents.set(agentId, agent);
    }
    return agent;
  }

  /** Run periodic checks — idle timeout, blocked linger, offline cleanup */
  tick(): void {
    const now = Date.now();
    let changed = false;

    for (const [id, agent] of this.agents) {
      const elapsed = now - agent.lastActivity;

      // Remove long-offline agents
      if (!agent.online && elapsed > OFFLINE_REMOVE_DELAY) {
        this.agents.delete(id);
        this.removeSubagentLinks(id);
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
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

/** Singleton store instance */
export const officeState = new OfficeStateStore();
