import type { OpenClawConfig, RuntimeEnv } from "openclaw/plugin-sdk";

// Inline: createReplyPrefixOptions removed from new SDK
function createReplyPrefixOptions(_opts?: unknown) { return {}; }
import type { ResolvedArinovaChatAccount } from "./accounts.js";
import type { ArinovaChatInboundMessage, CoreConfig } from "./types.js";
import { getArinovaChatRuntime } from "./runtime.js";
import { replaceImagePaths, type UploadFn } from "./image-upload.js";

const CHANNEL_ID = "openclaw-arinova-ai" as const;

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
function collapseToolBlocks(text: string): string {
  const lines = text.split("\n");
  const output: string[] = [];
  let pendingTool: string[] | null = null;
  let inResult = false;

  for (const line of lines) {
    if (TOOL_LINE_RE.test(line)) {
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
function stripMediaLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !MEDIA_LINE_RE.test(line))
    .join("\n");
}

/**
 * Convert media URLs to markdown image syntax.
 */
function mediaUrlsToMarkdown(urls: string[]): string {
  return urls.map((url) => `![](${url})`).join("\n");
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

  // Use actual sender identity from the task payload (multi-user support)
  const senderId = message.senderUserId ?? "arinova-user";
  const senderDisplayName = message.senderUsername ?? "Arinova User";
  // SenderName carries JSON with conversationId + agentName for bridge routing
  const senderNameJson = JSON.stringify({
    name: senderDisplayName,
    conversationId: message.conversationId || "",
    agentName: account.name || account.accountId || "",
  });
  const chatType = message.conversationType ?? "direct";

  // DM policy check
  const dmPolicy = account.config.dmPolicy ?? "open";
  if (dmPolicy === "disabled") {
    runtime.log?.(`openclaw-arinova-ai: drop DM (dmPolicy=disabled)`);
    sendComplete("");
    return;
  }

  // Resolve agent route — use conversationId as peer id so each conversation
  // gets its own session (critical for groups where multiple convos exist).
  const peerId = message.conversationId || senderId || message.taskId;
  const route = core.channel.routing.resolveAgentRoute({
    cfg: config as OpenClawConfig,
    channel: CHANNEL_ID,
    accountId: account.accountId,
    peer: {
      kind: chatType === "group" ? "group" : "direct",
      id: peerId,
    },
  });

  const fromLabel = senderDisplayName;
  const storePath = core.channel.session.resolveStorePath(
    (config.session as Record<string, unknown> | undefined)?.store as string | undefined,
    { agentId: route.agentId },
  );
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config as OpenClawConfig);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });

  // Build enriched body for the LLM with context sections
  const bodyForAgent = buildEnrichedBody(rawBody, message);

  const body = core.channel.reply.formatAgentEnvelope({
    channel: "Arinova Chat",
    from: fromLabel,
    timestamp: message.timestamp,
    previousTimestamp,
    envelope: envelopeOptions,
    body: rawBody,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: bodyForAgent,
    RawBody: rawBody,
    CommandBody: rawBody.replace(/^!\[/, "["),
    From: `openclaw-arinova-ai:${peerId}`,
    To: `openclaw-arinova-ai:${account.agentId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: chatType,
    ConversationLabel: fromLabel,
    SenderName: senderNameJson,
    SenderId: peerId,
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    MessageSid: message.taskId,
    Timestamp: message.timestamp,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: `openclaw-arinova-ai:${account.agentId}`,
    ReceiverId: account.accountId,
    ReceiverName: account.accountId,
    ArinovaConversationId: message.conversationId || peerId,
    CommandAuthorized: true,
  });

  const persistedSessionKey = ctxPayload.SessionKey ?? route.sessionKey;
  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: persistedSessionKey,
    ctx: ctxPayload,
    updateLastRoute: {
      sessionKey: persistedSessionKey,
      channel: CHANNEL_ID,
      to: `openclaw-arinova-ai:${peerId}`,
      accountId: route.accountId,
    },
    onRecordError: (err) => {
      runtime.error?.(`openclaw-arinova-ai: failed updating session meta: ${String(err)}`);
    },
  });

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config as OpenClawConfig,
    agentId: route.agentId,
    channel: CHANNEL_ID,
    accountId: account.accountId,
  });

  // Track final content from block delivery
  let finalText = "";
  // Track the full accumulated text from onPartialReply — this preserves
  // original line breaks (e.g. inside markdown tables) that get corrupted
  // when blocks are joined with "\n\n" in the deliver callback.
  let lastAccumulatedText = "";
  let lastSentLength = 0;
  let aborted = false;
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
        sendComplete(finalText || "");
      }
    }, { once: true });
  }

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config as OpenClawConfig,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload) => {
        if (aborted) return;
        const p = payload as { text?: string; mediaUrls?: string[] };
        let text = p.text ?? "";

        // Convert media URLs to markdown images
        if (p.mediaUrls?.length) {
          const md = mediaUrlsToMarkdown(p.mediaUrls);
          text = text.trim() ? `${text}\n\n${md}` : md;
        }

        if (!text.trim()) return;

        if (finalText) {
          // If we're inside a GFM table (previous block ends with a table row
          // and next block starts with one), join with \n to avoid breaking it.
          const prevEndsWithTableRow = /\|[^\n]*\|\s*$/.test(finalText);
          const nextStartsWithTableRow = /^\s*\|/.test(text);
          finalText += (prevEndsWithTableRow && nextStartsWithTableRow) ? "\n" : "\n\n";
        }
        finalText += text;
        statusSink?.({ lastOutboundAt: Date.now() });
      },
      onError: (err, info) => {
        runtime.error?.(`openclaw-arinova-ai ${info.kind} reply failed: ${String(err)}`);
      },
    },
    replyOptions: {
      onModelSelected,
      disableBlockStreaming: false,
      abortSignal: signal,
      onPartialReply: (payload) => {
        if (aborted) return;
        // onPartialReply gives accumulated text for the CURRENT block only —
        // deltaBuffer resets in handleMessageEnd between tool calls.
        const text = (payload as { text?: string }).text ?? "";
        if (text) {
          lastAccumulatedText = text;
          // Strip MEDIA: lines so raw tokens don't flash during streaming
          const cleaned = stripMediaLines(text);
          if (!cleaned.trim()) return;
          const collapsed = collapseToolBlocks(cleaned);
          // Detect new block: text shortened means core reset deltaBuffer
          if (collapsed.length < lastSentLength) {
            lastSentLength = 0;
          }
          if (collapsed.length > lastSentLength) {
            const delta = collapsed.slice(lastSentLength);
            lastSentLength = collapsed.length;
            sendChunk(delta.replace(/\r\n?/g, "\n"));
          }
        }
      },
    },
  });

  // If abort already sent completion, skip post-processing entirely
  if (completionSent) return;

  // Post-process completed text: upload local images → R2, resolve @mentions
  // Use finalText (all blocks via deliver callback) as primary — lastAccumulatedText
  // only has the LAST block's text because onPartialReply resets between tool calls.
  let completedText = finalText || lastAccumulatedText;

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
function buildEnrichedBody(
  rawBody: string,
  message: ArinovaChatInboundMessage,
): string {
  const sections: string[] = [];

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
function resolveMentions(
  text: string,
  members?: { agentId: string; agentName: string }[],
): string[] {
  if (!members?.length) return [];
  const mentionPattern = /@(\w+)/g;
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = mentionPattern.exec(text)) !== null) {
    const name = match[1].toLowerCase();
    for (const m of members) {
      if (m.agentName.toLowerCase() === name) {
        ids.add(m.agentId);
      }
    }
  }
  return [...ids];
}

/** Format bytes to human-readable size. */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
