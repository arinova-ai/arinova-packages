import type { PluginRuntime } from "openclaw/plugin-sdk";
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

export function getAgentInstance(accountId: string): ArinovaAgent | undefined {
  return agentInstances.get(accountId);
}
