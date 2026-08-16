import type { AgentState, InternalEvent } from "./types.js";

export interface SubagentLink {
  parentAgentId: string;
  childAgentId: string;
  childSessionKey: string;
}

export function createAgentState(
  agentId: string,
  timestamp: number,
  existing?: AgentState,
): AgentState {
  return {
    agentId,
    name: existing?.name ?? "Agent",
    status: "working",
    lastActivity: timestamp,
    collaboratingWith: existing?.collaboratingWith ?? [],
    currentTask: existing?.currentTask ?? null,
    online: true,
    model: existing?.model ?? null,
    tokenUsage: null,
    sessionDurationMs: null,
    currentToolDetail: null,
  };
}

export function applySessionEnd(agent: AgentState, event: InternalEvent): void {
  agent.status = "idle";
  agent.online = false;
  agent.lastActivity = event.timestamp;
  agent.currentTask = null;
  agent.currentToolDetail = null;
  const durationMs = event.data.durationMs as number | undefined;
  if (durationMs != null) agent.sessionDurationMs = durationMs;
}

export function applyLlmActivity(
  agent: AgentState,
  event: InternalEvent,
  includeUsage: boolean,
): void {
  const model = event.data.model as string | undefined;
  if (model) agent.model = model;
  if (includeUsage) {
    const usage = event.data.usage as {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      total?: number;
    } | undefined;
    if (usage) {
      const previous = agent.tokenUsage;
      agent.tokenUsage = {
        input: (previous?.input ?? 0) + (usage.input ?? 0),
        output: (previous?.output ?? 0) + (usage.output ?? 0),
        cacheRead: (previous?.cacheRead ?? 0) + (usage.cacheRead ?? 0),
        cacheWrite: (previous?.cacheWrite ?? 0) + (usage.cacheWrite ?? 0),
        total: (previous?.total ?? 0) + (usage.total ?? 0),
      };
    }
  }
  applyActivity(agent, event.timestamp);
}

export function applyActivity(agent: AgentState, timestamp: number): void {
  if (agent.status === "blocked" || agent.status === "idle") {
    agent.status = "working";
  }
  agent.lastActivity = timestamp;
  agent.online = true;
}

export function applyToolCall(agent: AgentState, event: InternalEvent): void {
  applyActivity(agent, event.timestamp);
  const toolName = event.data.toolName as string | undefined;
  if (!toolName) return;
  agent.currentTask = toolName;
  const durationMs = event.data.durationMs as number | undefined;
  agent.currentToolDetail = durationMs ? `${toolName} (${durationMs}ms)` : toolName;
}

export function applyError(agent: AgentState, timestamp: number): void {
  agent.status = "blocked";
  agent.lastActivity = timestamp;
}

export function applyAgentEnd(agent: AgentState, event: InternalEvent): void {
  if (agent.status !== "blocked") agent.status = "idle";
  agent.lastActivity = event.timestamp;
  agent.currentTask = null;
  agent.currentToolDetail = null;
  const durationMs = event.data.durationMs as number | undefined;
  if (durationMs != null) agent.sessionDurationMs = durationMs;
}

export function updateCollaborationStatus(
  agents: Map<string, AgentState>,
  links: readonly SubagentLink[],
): void {
  for (const agent of agents.values()) agent.collaboratingWith = [];
  for (const link of links) {
    const parent = agents.get(link.parentAgentId);
    const child = agents.get(link.childAgentId);
    if (!parent || !child) continue;
    if (!parent.collaboratingWith.includes(link.childAgentId)) {
      parent.collaboratingWith.push(link.childAgentId);
    }
    if (!child.collaboratingWith.includes(link.parentAgentId)) {
      child.collaboratingWith.push(link.parentAgentId);
    }
  }
  for (const agent of agents.values()) {
    if (agent.collaboratingWith.length > 0 && agent.online && agent.status !== "blocked") {
      agent.status = "collaborating";
    } else if (agent.status === "collaborating") {
      agent.status = agent.online ? "working" : "idle";
    }
  }
}
