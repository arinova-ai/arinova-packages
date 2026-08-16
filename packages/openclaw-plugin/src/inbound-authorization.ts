import { readChannelAllowFromStore } from "openclaw/plugin-sdk/channel-pairing";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import type { ResolvedArinovaChatAccount } from "./accounts.js";
import { stripArinovaChatTargetPrefix } from "./normalize.js";
import type { ArinovaChatInboundMessage } from "./types.js";

const CHANNEL_ID = "openclaw-arinova-ai" as const;

function normalizeAllowEntry(value: string): string {
  return stripArinovaChatTargetPrefix(value).toLowerCase();
}

async function resolveSenderAuthorization(params: {
  account: ResolvedArinovaChatAccount;
  senderId: string;
  runtime: RuntimeEnv;
}): Promise<{ inboundAllowed: boolean; commandsAuthorized: boolean }> {
  const { account, senderId, runtime } = params;
  const policy = account.config.dmPolicy ?? "open";
  const normalizedSender = normalizeAllowEntry(senderId);
  const configuredAllowFrom = (account.config.allowFrom ?? [])
    .map((entry) => normalizeAllowEntry(String(entry)))
    .filter(Boolean);
  const configuredMatch = configuredAllowFrom.includes("*")
    || configuredAllowFrom.includes(normalizedSender);

  let pairedMatch = false;
  if (policy === "pairing") {
    try {
      const storedAllowFrom = await readChannelAllowFromStore(
        CHANNEL_ID,
        process.env,
        account.accountId,
      );
      pairedMatch = storedAllowFrom
        .map((entry) => normalizeAllowEntry(String(entry)))
        .includes(normalizedSender);
    } catch (error) {
      runtime.error?.(
        `openclaw-arinova-ai: unable to read pairing allowlist; denying sender: ${String(error)}`,
      );
    }
  }

  const commandsAuthorized = configuredMatch || pairedMatch;
  switch (policy) {
    case "disabled":
      return { inboundAllowed: false, commandsAuthorized: false };
    case "open":
      return {
        inboundAllowed: configuredAllowFrom.includes("*"),
        commandsAuthorized: configuredAllowFrom.includes("*"),
      };
    case "allowlist":
    case "pairing":
      return { inboundAllowed: commandsAuthorized, commandsAuthorized };
    default:
      return { inboundAllowed: false, commandsAuthorized: false };
  }
}

export interface AuthorizedInboundSender {
  senderAgentId?: string;
  senderId: string;
  senderDisplayName: string;
  chatType: "group" | "direct";
  commandsAuthorized: boolean;
}

export async function authorizeInbound(params: {
  message: ArinovaChatInboundMessage;
  account: ResolvedArinovaChatAccount;
  runtime: RuntimeEnv;
}): Promise<AuthorizedInboundSender | null> {
  const { message, account, runtime } = params;
  const senderAgentId = message.senderAgentId?.trim() || undefined;
  const senderId = senderAgentId || message.senderUserId?.trim();
  if (!senderId) {
    runtime.log?.("openclaw-arinova-ai: drop inbound message without sender identity");
    return null;
  }
  const chatType = message.conversationType === "group" ? "group" : "direct";
  const allowedAgentSenders = (account.config.allowAgentMessagesFrom ?? [])
    .map((entry) => normalizeAllowEntry(String(entry)))
    .filter(Boolean);
  const access = senderAgentId
    ? {
        inboundAllowed: allowedAgentSenders.includes(normalizeAllowEntry(senderId)),
        commandsAuthorized: false,
      }
    : await resolveSenderAuthorization({ account, senderId, runtime });
  if (!access.inboundAllowed) {
    runtime.log?.(senderAgentId
      ? "openclaw-arinova-ai: drop unlisted agent-authored message"
      : `openclaw-arinova-ai: drop unauthorized ${chatType} sender (dmPolicy=${account.config.dmPolicy ?? "open"})`);
    return null;
  }
  return {
    senderAgentId,
    senderId,
    senderDisplayName: (senderAgentId ? message.senderAgentName : message.senderUsername)
      ?? (senderAgentId ? "Arinova Agent" : "Arinova User"),
    chatType,
    commandsAuthorized: access.commandsAuthorized,
  };
}
