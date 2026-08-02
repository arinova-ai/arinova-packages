import type { ArinovaChatSendResult, CoreConfig } from "./types.js";
import { resolveArinovaChatAccount } from "./accounts.js";
import { getArinovaChatRuntime, getAgentInstance } from "./runtime.js";
import { ArinovaAgent } from "@arinova-ai/agent-sdk";
import { stripArinovaChatTargetPrefix } from "./normalize.js";

const fallbackAgents = new Map<string, { agent: ArinovaAgent; apiUrl: string; botToken: string }>();

type ArinovaChatSendOpts = {
  accountId?: string;
};

/**
 * Send a proactive text message via Arinova Chat.
 *
 * Uses the Agent SDK's sendMessage method to deliver messages
 * outside of an A2A request context (e.g. @mention responses,
 * scheduled messages, notifications).
 */
export async function sendMessageArinovaChat(
  to: string,
  text: string,
  opts: ArinovaChatSendOpts = {},
): Promise<ArinovaChatSendResult> {
  const cfg = getArinovaChatRuntime().config.current() as CoreConfig;
  const account = resolveArinovaChatAccount({
    cfg,
    accountId: opts.accountId,
  });

  if (!account.apiUrl) {
    throw new Error(
      `Arinova Chat apiUrl missing for account "${account.accountId}" (set channels.openclaw-arinova-ai.apiUrl).`,
    );
  }

  if (!text?.trim()) {
    throw new Error("Message must be non-empty for Arinova Chat sends");
  }

  // Strip channel prefix to get conversation ID
  const conversationId = stripArinovaChatTargetPrefix(to);

  if (!conversationId) {
    // Delivery-recovery retries may have a `to` without conversationId (e.g. --deliver mode).
    // Return empty result instead of throwing to avoid noisy startup errors.
    console.warn("[openclaw-arinova-ai] Skipping send: no conversationId in target (delivery-mode message?)");
    return {};
  }

  const agent = getAgentInstance(account.accountId);
  if (agent) {
    console.log(
      `[openclaw-arinova-ai] sendMessage accountId=${account.accountId} conversationId=${conversationId} textLen=${text.length}`,
    );
    await agent.sendMessage(conversationId, text);
  } else {
    // No agent instance — use HTTP directly as fallback
    console.log(
      `[openclaw-arinova-ai] sendMessage via HTTP (no agent instance) accountId=${account.accountId} conversationId=${conversationId}`,
    );
    if (!account.botToken?.trim()) throw new Error(`Arinova Chat botToken missing for account "${account.accountId}"`);
    let fallback = fallbackAgents.get(account.accountId);
    if (!fallback || fallback.apiUrl !== account.apiUrl || fallback.botToken !== account.botToken) {
      fallback?.agent.disconnect();
      fallback = {
        agent: new ArinovaAgent({ serverUrl: account.apiUrl, botToken: account.botToken }),
        apiUrl: account.apiUrl,
        botToken: account.botToken,
      };
      fallbackAgents.set(account.accountId, fallback);
    }
    await fallback.agent.sendMessage(conversationId, text);
  }

  getArinovaChatRuntime().channel.activity.record({
    channel: "openclaw-arinova-ai",
    accountId: account.accountId,
    direction: "outbound",
  });

  return {};
}
