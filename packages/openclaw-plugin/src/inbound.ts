import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { createReplyPrefixOptions } from "openclaw/plugin-sdk/channel-outbound";
import {
  buildChannelInboundEventContext,
  resolveChannelInboundRouteEnvelope,
} from "openclaw/plugin-sdk/channel-inbound";
import { readChannelAllowFromStore } from "openclaw/plugin-sdk/channel-pairing";
import type { ResolvedArinovaChatAccount } from "./accounts.js";
import type { ArinovaChatInboundMessage, CoreConfig } from "./types.js";
import { getArinovaChatRuntime } from "./runtime.js";
import { replaceImagePaths, type UploadFn } from "./image-upload.js";
import { stripArinovaChatTargetPrefix } from "./normalize.js";

const CHANNEL_ID = "openclaw-arinova-ai" as const;

function normalizeAllowEntry(value: string): string {
  return stripArinovaChatTargetPrefix(value).toLowerCase();
}

async function resolveSenderAuthorization(params: {
  account: ResolvedArinovaChatAccount;
  senderId: string;
  chatType: "direct" | "group";
  runtime: RuntimeEnv;
}): Promise<{ inboundAllowed: boolean; commandsAuthorized: boolean }> {
  const { account, senderId, chatType, runtime } = params;
  const policy = account.config.dmPolicy ?? "open";
  const normalizedSender = normalizeAllowEntry(senderId);
  const configuredAllowFrom = (account.config.allowFrom ?? [])
    .map((entry) => normalizeAllowEntry(String(entry)))
    .filter(Boolean);
  const configuredMatch =
    configuredAllowFrom.includes("*") || configuredAllowFrom.includes(normalizedSender);

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
  if (chatType === "group") {
    return { inboundAllowed: true, commandsAuthorized };
  }

  switch (policy) {
    case "disabled":
      return { inboundAllowed: false, commandsAuthorized: false };
    case "open":
      // Runtime configuration can bypass schema validation, so require the
      // explicit wildcard that the schema mandates for open DMs.
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

// Known tool names from Claude Code CLI bridge
const TOOL_LINE_RE = /^\[(Bash|Read|Write|Edit|Grep|Glob|WebFetch|WebSearch|Task|Skill|NotebookEdit)\]/;
const RESULT_PREFIX = "📎";

// MEDIA: token regex — matches lines like `MEDIA: https://example.com/img.png`
const MEDIA_LINE_RE = /^\s*MEDIA:\s/i;

/**
 * Collapse consecutive tool blocks, keeping only the latest one.
 * When Claude Code runs multiple tools in sequence, each [Tool] line + its
 * 📎 result stacks up. Since the frontend replaces content (not appends),
 * we can show only the most recent tool activity for a cleaner UX.
 */
export function collapseToolBlocks(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const output: string[] = [];
  let pendingTool: string[] | null = null;
  let inResult = false;
  let fence: string | null = null;

  for (const line of lines) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]![0];
      if (fence === marker) fence = null;
      else if (fence === null) fence = marker;
    }

    if (fence === null && TOOL_LINE_RE.test(line)) {
      // New tool call — discard any previous pending tool block
      pendingTool = [line];
      inResult = false;
    } else if (pendingTool !== null) {
      if (line === "") {
        pendingTool.push(line);
        if (inResult) inResult = false; // blank line ends result section
      } else if (line.startsWith(RESULT_PREFIX)) {
        pendingTool.push(line);
        inResult = true;
      } else if (inResult) {
        // Content line within result section
        pendingTool.push(line);
      } else {
        // Non-tool content after tool block — flush pending tool, continue as text
        output.push(...pendingTool);
        pendingTool = null;
        output.push(line);
      }
    } else {
      output.push(line);
    }
  }

  // Flush remaining pending tool block
  if (pendingTool) {
    output.push(...pendingTool);
  }

  return output.join("\n");
}

/**
 * Strip MEDIA: lines from streaming text so the raw token doesn't flash on screen.
 * OpenClaw parses these at block-completion time, but during streaming the raw lines
 * are still present.
 */
export function stripMediaLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      if (MEDIA_LINE_RE.test(line)) return false;
      const token = line.trim().toUpperCase();
      return !token || !"MEDIA:".startsWith(token);
    })
    .join("\n");
}

/**
 * Convert media URLs to markdown image syntax.
 */
export function mediaUrlsToMarkdown(urls: string[]): string {
  return urls.map((url) => `![](${url})`).join("\n");
}

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

async function authorizeInbound(params: {
  message: ArinovaChatInboundMessage;
  account: ResolvedArinovaChatAccount;
  runtime: RuntimeEnv;
}): Promise<{
  senderAgentId?: string;
  senderId: string;
  senderDisplayName: string;
  chatType: "group" | "direct";
  commandsAuthorized: boolean;
} | null> {
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
    : await resolveSenderAuthorization({ account, senderId, chatType, runtime });
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

function buildInboundContext(params: {
  message: ArinovaChatInboundMessage;
  account: ResolvedArinovaChatAccount;
  config: CoreConfig;
  rawBody: string;
  auth: NonNullable<Awaited<ReturnType<typeof authorizeInbound>>>;
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
    sendComplete(relay.hasStreamed ? relay.visibleText : "");
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

/**
 * Build an enriched body for the LLM by prepending context sections
 * (members, attachments, replyTo, history) before the raw user message.
 */
export function buildEnrichedBody(
  rawBody: string,
  message: ArinovaChatInboundMessage,
): string {
  const sections: string[] = [];

  const sender = message.senderAgentName ?? message.senderUsername;
  if (sender) sections.push(`[Sender: ${sender}]`);

  // Group members context
  if (message.conversationType === "group" && message.members?.length) {
    const names = message.members.map((m) => m.agentName).join(", ");
    sections.push(`[Group: ${names}]`);
  }

  // Attachments
  if (message.attachments?.length) {
    const lines = message.attachments.map((a) => {
      const size = formatFileSize(a.fileSize);
      return `- ${a.fileName} (${a.fileType}, ${size}) ${a.url}`;
    });
    sections.push(`[Attachments]\n${lines.join("\n")}`);
  }

  // Reply context
  if (message.replyTo) {
    const sender = message.replyTo.senderAgentName ?? message.replyTo.role;
    const quoted = message.replyTo.content
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    sections.push(`> Replying to ${sender}:\n${quoted}`);
  }

  // Conversation history
  if (message.history?.length) {
    const historyLines = message.history.map((h) => {
      const sender = h.senderAgentName ?? h.senderUsername ?? h.role;
      return `[${sender}]: ${h.content}`;
    });
    sections.push(`[History]\n${historyLines.join("\n")}`);
  }

  if (sections.length === 0) return rawBody;
  return sections.join("\n\n") + "\n\n" + rawBody;
}

/**
 * Extract @mentions from text and resolve them to agent IDs.
 * Matches @Name patterns against the members list (case-insensitive).
 */
export function resolveMentions(
  text: string,
  members?: { agentId: string; agentName: string }[],
): string[] {
  if (!members?.length) return [];
  const matches: Array<{ start: number; end: number; agentId: string }> = [];
  const sorted = [...members].sort((a, b) => b.agentName.length - a.agentName.length);
  for (const member of sorted) {
    const escaped = member.agentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^\\w@])@${escaped}(?=$|[^\\w])`, "giu");
    for (const match of text.matchAll(pattern)) {
      const start = (match.index ?? 0) + match[1]!.length;
      const end = start + member.agentName.length + 1;
      if (!matches.some((existing) => start < existing.end && end > existing.start)) {
        matches.push({ start, end, agentId: member.agentId });
      }
    }
  }
  const ids = new Set<string>();
  for (const match of matches.sort((a, b) => a.start - b.start)) ids.add(match.agentId);
  return [...ids];
}

/** Format bytes to human-readable size. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
