import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { createReplyPrefixOptions } from "openclaw/plugin-sdk/channel-outbound";
import {
  buildChannelInboundEventContext,
  resolveChannelInboundRouteEnvelope,
} from "openclaw/plugin-sdk/channel-inbound";
import type { ResolvedArinovaChatAccount } from "./accounts.js";
import type { ArinovaChatInboundMessage, CoreConfig } from "./types.js";
import { getArinovaChatRuntime } from "./runtime.js";
import { replaceImagePaths, type UploadFn } from "./image-upload.js";
import { authorizeInbound, type AuthorizedInboundSender } from "./inbound-authorization.js";
import {
  buildEnrichedBody,
  collapseToolBlocks,
  mediaUrlsToMarkdown,
  resolveMentions,
  stripMediaLines,
} from "./inbound-content.js";

export {
  buildEnrichedBody,
  collapseToolBlocks,
  formatFileSize,
  mediaUrlsToMarkdown,
  resolveMentions,
  stripMediaLines,
} from "./inbound-content.js";

const CHANNEL_ID = "openclaw-arinova-ai" as const;

class StreamRelay {
  finalText = "";
  lastAccumulatedText = "";
  private lastCollapsedText = "";
  private lastSentLength = 0;

  constructor(private readonly sendChunk: (chunk: string) => void) {}

  onPartial(payload: { text?: string; delta?: string; replace?: true }): void {
    const text = payload.text ?? "";
    if (!text) return;
    this.lastAccumulatedText = text.replace(/\r\n?/g, "\n");
    const cleaned = stripMediaLines(this.lastAccumulatedText);
    if (!cleaned.trim()) {
      this.lastCollapsedText = "";
      this.lastSentLength = 0;
      return;
    }
    const collapsed = collapseToolBlocks(cleaned);
    const stablePrefix = !payload.replace && collapsed.startsWith(this.lastCollapsedText);
    const delta = stablePrefix ? collapsed.slice(this.lastCollapsedText.length) : collapsed;
    this.lastCollapsedText = collapsed;
    this.lastSentLength = collapsed.length;
    if (delta) this.sendChunk(delta);
  }

  appendDelivered(text: string): void {
    if (this.finalText) {
      const continuesTable = /\|[^\n]*\|\s*$/.test(this.finalText) && /^\s*\|/.test(text);
      this.finalText += continuesTable ? "\n" : "\n\n";
    }
    this.finalText += text;
  }

  get hasStreamed(): boolean {
    return this.lastSentLength > 0;
  }

  get visibleText(): string {
    return this.finalText || this.lastCollapsedText || this.lastAccumulatedText;
  }

  get completedText(): string {
    return this.finalText || this.lastAccumulatedText;
  }
}

function buildInboundContext(params: {
  message: ArinovaChatInboundMessage;
  account: ResolvedArinovaChatAccount;
  config: CoreConfig;
  rawBody: string;
  auth: AuthorizedInboundSender;
}) {
  const { message, account, config, rawBody, auth } = params;
  const peerId = message.conversationId || auth.senderId || message.taskId;
  const { route, buildEnvelope } = resolveChannelInboundRouteEnvelope({
    cfg: config as OpenClawConfig,
    channel: CHANNEL_ID,
    accountId: account.accountId,
    peer: { kind: auth.chatType, id: peerId },
  });
  const senderName = JSON.stringify({
    name: auth.senderDisplayName,
    conversationId: message.conversationId || "",
    agentName: account.name || account.accountId || "",
  });
  const body = buildEnvelope({
    channel: "Arinova Chat",
    from: auth.senderDisplayName,
    timestamp: message.timestamp,
    body: rawBody,
  });
  const replyTarget = `openclaw-arinova-ai:${account.agentId}`;
  const ctxPayload = buildChannelInboundEventContext({
    channel: CHANNEL_ID,
    accountId: route.accountId,
    messageId: message.taskId,
    timestamp: message.timestamp,
    from: `openclaw-arinova-ai:${auth.senderId}`,
    sender: { id: auth.senderId, name: senderName },
    conversation: { kind: auth.chatType, id: peerId, label: auth.senderDisplayName },
    route: {
      agentId: route.agentId,
      dmScope: route.dmScope,
      accountId: route.accountId,
      routeSessionKey: route.sessionKey,
    },
    reply: { to: replyTarget, originatingTo: replyTarget },
    message: {
      body,
      bodyForAgent: buildEnrichedBody(rawBody, message),
      rawBody,
      commandBody: rawBody.replace(/^!\[/, "["),
    },
    access: { commands: { authorized: auth.commandsAuthorized } },
    extra: {
      OriginatingChannel: CHANNEL_ID,
      ReceiverId: account.accountId,
      ReceiverName: account.accountId,
      ArinovaConversationId: message.conversationId || peerId,
      ...(auth.senderAgentId ? { ArinovaSenderAgentId: auth.senderAgentId } : {}),
    },
  });
  return { route, ctxPayload, peerId, persistedSessionKey: ctxPayload.SessionKey ?? route.sessionKey };
}

/**
 * Handle an inbound message from the backend via WebSocket.
 * Streams the reply back using sendChunk/sendComplete/sendError callbacks.
 */
export async function handleArinovaChatInbound(params: {
  message: ArinovaChatInboundMessage;
  sendChunk: (chunk: string) => void;
  sendComplete: (content: string, options?: { mentions?: string[] }) => void;
  sendError: (error: string) => void;
  signal?: AbortSignal;
  account: ResolvedArinovaChatAccount;
  config: CoreConfig;
  runtime: RuntimeEnv;
  uploadFile?: UploadFn;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { message, sendChunk, sendComplete, sendError, signal, account, config, runtime, uploadFile, statusSink } = params;
  const core = getArinovaChatRuntime();

  const rawBody = message.text.trim();
  if (!rawBody) {
    sendComplete("");
    return;
  }

  // If already cancelled before we start, bail out
  if (signal?.aborted) {
    sendComplete("");
    return;
  }

  statusSink?.({ lastInboundAt: message.timestamp });

  const auth = await authorizeInbound({ message, account, runtime });
  if (!auth) {
    sendComplete("");
    return;
  }
  const { route, ctxPayload, peerId, persistedSessionKey } = buildInboundContext({
    message,
    account,
    config,
    rawBody,
    auth,
  });

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config as OpenClawConfig,
    agentId: route.agentId,
    channel: CHANNEL_ID,
    accountId: account.accountId,
  });

  const relay = new StreamRelay(sendChunk);
  let aborted = false;
  let deliverySuppressed = false;
  let silentReplySkipped = false;
  // Guard: ensure we only send completion once.  The abort handler sends
  // completion immediately so the agent is freed; any later natural
  // completion from the LLM is silently discarded.
  let completionSent = false;

  // Wire abort signal to stop generation early and immediately complete
  if (signal) {
    signal.addEventListener("abort", () => {
      aborted = true;
      if (!completionSent) {
        completionSent = true;
        // Send whatever we accumulated so far — the agent SDK's guard
        // will also prevent duplicates, but we short-circuit here to
        // avoid waiting for the (potentially slow) LLM to finish.
        sendComplete(relay.visibleText);
      }
    }, { once: true });
  }

  await core.channel.inbound.dispatch({
    cfg: config as OpenClawConfig,
    channel: CHANNEL_ID,
    accountId: account.accountId,
    route: {
      agentId: route.agentId,
      dmScope: route.dmScope,
      sessionKey: route.sessionKey,
    },
    ctxPayload,
    delivery: {
      deliver: async (payload) => {
        if (aborted) return { visibleReplySent: false };
        const p = payload as { text?: string; mediaUrls?: string[] };
        let text = p.text ?? "";

        // Convert media URLs to markdown images
        if (p.mediaUrls?.length) {
          const md = mediaUrlsToMarkdown(p.mediaUrls);
          text = text.trim() ? `${text}\n\n${md}` : md;
        }

        if (!text.trim()) return { visibleReplySent: false };

        relay.appendDelivered(text);
        statusSink?.({ lastOutboundAt: Date.now() });
        return { visibleReplySent: true, content: text };
      },
      onError: (err, info) => {
        runtime.error?.(`openclaw-arinova-ai ${info.kind} reply failed: ${String(err)}`);
      },
    },
    dispatcherOptions: {
      ...prefixOptions,
      onSkip: (_payload, info) => {
        if (info.reason === "silent") {
          silentReplySkipped = true;
        }
      },
      onBeforeDeliverCancelled: () => {
        deliverySuppressed = true;
      },
    },
    replyOptions: {
      onModelSelected,
      disableBlockStreaming: false,
      abortSignal: signal,
      onPartialReply: (payload) => {
        if (aborted) return;
        relay.onPartial(payload as { text?: string; delta?: string; replace?: true });
      },
    },
    record: {
      sessionKey: persistedSessionKey,
      updateLastRoute: {
        sessionKey: persistedSessionKey,
        channel: CHANNEL_ID,
        to: `openclaw-arinova-ai:${peerId}`,
        accountId: route.accountId,
      },
      onRecordError: (err) => {
        runtime.error?.(`openclaw-arinova-ai: failed updating session meta: ${String(err)}`);
      },
    },
  });

  // If abort already sent completion, skip post-processing entirely
  if (completionSent) return;

  // Upstream can intentionally suppress a stale foreground delivery, or skip
  // an exact NO_REPLY final under the silent-reply policy. Both are successful
  // quiet outcomes, not generation failures.
  if ((deliverySuppressed || silentReplySkipped) && !relay.finalText.trim()) {
    completionSent = true;
    // A silent-reply skip must stay silent: committing already-streamed noise
    // (the NO_REPLY sentinel, tool-progress blocks) would defeat the policy.
    // Only a suppressed stale delivery keeps what the user already saw.
    sendComplete(!silentReplySkipped && relay.hasStreamed ? relay.visibleText : "");
    return;
  }

  // Post-process completed text: upload local images → R2, resolve @mentions
  // Use finalText (all blocks via deliver callback) as primary — lastAccumulatedText
  // only has the LAST block's text because onPartialReply resets between tool calls.
  let completedText = relay.completedText;

  // If no content was generated (duplicate detection / fast abort skipped the LLM call),
  // report an error instead of sending empty completion that creates a blank message.
  if (!completedText.trim()) {
    completionSent = true;
    sendError("Unable to generate a response. Please try again.");
    return;
  }

  if (uploadFile && completedText) {
    try {
      completedText = await replaceImagePaths(completedText, process.cwd(), uploadFile, runtime.log);
    } catch (err) {
      runtime.error?.(`openclaw-arinova-ai: image upload post-process failed: ${String(err)}`);
    }
  }

  const mentionedIds = resolveMentions(completedText, message.members);
  completionSent = true;
  sendComplete(completedText, mentionedIds.length ? { mentions: mentionedIds } : undefined);
}
