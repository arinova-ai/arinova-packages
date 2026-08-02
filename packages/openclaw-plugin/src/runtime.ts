import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import type { ArinovaAgent } from "@arinova-ai/agent-sdk";

let runtime: PluginRuntime | null = null;

const agentInstances = new Map<string, ArinovaAgent>();

export function setArinovaChatRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getArinovaChatRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Arinova Chat runtime not initialized");
  }
  return runtime;
}

export function setAgentInstance(accountId: string, agent: ArinovaAgent) {
  agentInstances.set(accountId, agent);
}

export function removeAgentInstance(accountId: string, agent?: ArinovaAgent): ArinovaAgent | undefined {
  const current = agentInstances.get(accountId);
  if (!agent || current === agent) agentInstances.delete(accountId);
  return current;
}

export function getAgentInstance(accountId: string): ArinovaAgent | undefined {
  return agentInstances.get(accountId);
}
