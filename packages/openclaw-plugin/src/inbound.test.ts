import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedArinovaChatAccount } from "./accounts.js";

const channelInboundMocks = vi.hoisted(() => ({
  buildContext: vi.fn((params: Record<string, any>) => ({
    Body: params.message.body,
    BodyForAgent: params.message.bodyForAgent,
    RawBody: params.message.rawBody,
    CommandBody: params.message.commandBody,
    From: params.from,
    To: params.reply.to,
    SessionKey: params.route.routeSessionKey,
    AccountId: params.route.accountId,
    ChatType: params.conversation.kind,
    ConversationLabel: params.conversation.label,
    SenderName: params.sender.name,
    SenderId: params.sender.id,
    Provider: params.channel,
    Surface: params.channel,
    MessageSid: params.messageId,
    Timestamp: params.timestamp,
    CommandAuthorized: params.access.commands.authorized,
    ...params.extra,
  })),
  resolveRouteEnvelope: vi.fn(() => ({
    route: {
      agentId: "agent-1",
      accountId: "acct-1",
      sessionKey: "session-1",
    },
    buildEnvelope: ({ body }: { body: string }) => body,
  })),
}));

vi.mock("openclaw/plugin-sdk/channel-inbound", () => ({
  buildChannelInboundEventContext: channelInboundMocks.buildContext,
  resolveChannelInboundRouteEnvelope: channelInboundMocks.resolveRouteEnvelope,
}));

import {
  buildEnrichedBody,
  collapseToolBlocks,
  formatFileSize,
  handleArinovaChatInbound,
  mediaUrlsToMarkdown,
  resolveMentions,
  stripMediaLines,
} from "./inbound.js";
import { setArinovaChatRuntime } from "./runtime.js";
import type { ArinovaChatInboundMessage, CoreConfig } from "./types.js";

function createAccount(overrides: Partial<ResolvedArinovaChatAccount> = {}): ResolvedArinovaChatAccount {
  return {
    accountId: "acct-1",
    enabled: true,
    name: "Test Agent",
    apiUrl: "http://localhost:21001",
    botToken: "token",
    agentId: "agent-1",
    sessionToken: "session",
    config: {},
    ...overrides,
  };
}

function createMessage(overrides: Partial<ArinovaChatInboundMessage> = {}): ArinovaChatInboundMessage {
  return {
    taskId: "task-1",
    text: "hello",
    timestamp: 1_718_000_000_000,
    conversationId: "conv-1",
    conversationType: "direct",
    senderUserId: "user-1",
    senderUsername: "User One",
    ...overrides,
  };
}

function createRuntime(options: {
  deliverText?: string;
  partialText?: string;
  partialPayloads?: Array<{ text?: string; delta?: string; replace?: true }>;
  skipDelivery?: boolean;
  skipReason?: "empty" | "silent" | "heartbeat";
  cancelDelivery?: boolean;
  deliverError?: unknown;
} = {}) {
  const runtimeLog = vi.fn();
  const runtimeError = vi.fn();
  const dispatch = vi.fn(async (request: {
    delivery: {
      deliver: (payload: { text?: string; mediaUrls?: string[] }) => Promise<unknown>;
      onError: (err: unknown, info: { kind: string }) => void;
    };
    dispatcherOptions: {
      onSkip?: (
        payload: { text?: string },
        info: { kind: string; reason: "empty" | "silent" | "heartbeat" },
      ) => void;
      onBeforeDeliverCancelled?: () => void;
    };
    replyOptions: {
      onPartialReply?: (payload: { text?: string; delta?: string; replace?: true }) => void;
    };
  }) => {
    if (options.deliverError) {
      request.delivery.onError(options.deliverError, { kind: "test" });
      return;
    }
    for (const payload of options.partialPayloads ?? []) {
      request.replyOptions.onPartialReply?.(payload);
    }
    if (options.partialText) {
      request.replyOptions.onPartialReply?.({ text: options.partialText });
    }
    if (options.skipReason) {
      request.dispatcherOptions.onSkip?.(
        { text: "NO_REPLY" },
        { kind: "final", reason: options.skipReason },
      );
    }
    if (options.cancelDelivery) {
      request.dispatcherOptions.onBeforeDeliverCancelled?.();
      return;
    }
    if (!options.skipDelivery) {
      await request.delivery.deliver({ text: options.deliverText ?? "reply" });
    }
  });

  const core = {
    log: runtimeLog,
    error: runtimeError,
    channel: {
      inbound: {
        dispatch,
      },
    },
  };

  setArinovaChatRuntime(core as never);
  return { core, runtime: { log: runtimeLog, error: runtimeError, exit: vi.fn() } };
}

describe("inbound payload helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("collapses consecutive tool blocks while preserving surrounding text", () => {
    const input = [
      "Starting",
      "[Bash] ls",
      "📎 first",
      "[Read] package.json",
      "📎 second",
      "Done",
    ].join("\n");

    expect(collapseToolBlocks(input)).toBe([
      "Starting",
      "[Read] package.json",
      "📎 second",
      "Done",
    ].join("\n"));
  });

  it("strips streaming MEDIA token lines", () => {
    expect(stripMediaLines("hello\nMEDIA: https://cdn/image.png\n  media: file.jpg\nworld"))
      .toBe("hello\nworld");
  });

  it("converts delivered media urls to markdown images", () => {
    expect(mediaUrlsToMarkdown(["https://cdn/a.png", "https://cdn/b.jpg"]))
      .toBe("![](https://cdn/a.png)\n![](https://cdn/b.jpg)");
  });

  it("builds enriched body with group, attachments, reply, and history context", () => {
    const body = buildEnrichedBody("please summarize", {
      taskId: "task-1",
      conversationId: "conv-1",
      conversationType: "group",
      text: "please summarize",
      timestamp: 1000,
      members: [
        { agentId: "agent-a", agentName: "Alice" },
        { agentId: "agent-b", agentName: "Bob" },
      ],
      attachments: [{
        id: "file-1",
        fileName: "report.pdf",
        fileType: "application/pdf",
        fileSize: 1536,
        url: "https://cdn/report.pdf",
      }],
      replyTo: {
        role: "assistant",
        content: "line 1\nline 2",
        senderAgentName: "Researcher",
      },
      history: [{
        role: "user",
        content: "previous question",
        senderAgentName: "Alice",
        createdAt: "2026-06-10T00:00:00Z",
      }],
    });

    expect(body).toContain("[Group: Alice, Bob]");
    expect(body).toContain("- report.pdf (application/pdf, 1.5KB) https://cdn/report.pdf");
    expect(body).toContain("> Replying to Researcher:\n> line 1\n> line 2");
    expect(body).toContain("[History]\n[Alice]: previous question");
    expect(body.endsWith("\n\nplease summarize")).toBe(true);
  });

  it("resolves mentions case-insensitively and deduplicates ids", () => {
    expect(resolveMentions("@Alice ping @alice and @Bob", [
      { agentId: "agent-a", agentName: "Alice" },
      { agentId: "agent-b", agentName: "Bob" },
    ])).toEqual(["agent-a", "agent-b"]);
  });

  it("formats attachment sizes", () => {
    expect(formatFileSize(512)).toBe("512B");
    expect(formatFileSize(2048)).toBe("2.0KB");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0MB");
  });
});

describe("handleArinovaChatInbound", () => {
  const config: CoreConfig = {
    session: { store: "/tmp/openclaw-sessions" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes blank inbound messages without dispatching to the runtime", async () => {
    const { core, runtime } = createRuntime();
    const sendChunk = vi.fn();
    const sendComplete = vi.fn();
    const sendError = vi.fn();

    await handleArinovaChatInbound({
      message: createMessage({ text: "   " }),
      sendChunk,
      sendComplete,
      sendError,
      account: createAccount(),
      config,
      runtime,
    });

    expect(sendComplete).toHaveBeenCalledWith("");
    expect(sendChunk).not.toHaveBeenCalled();
    expect(sendError).not.toHaveBeenCalled();
    expect(core.channel.inbound.dispatch).not.toHaveBeenCalled();
  });

  it("drops inbound messages when direct messages are disabled", async () => {
    const { core, runtime } = createRuntime();
    const sendComplete = vi.fn();

    await handleArinovaChatInbound({
      message: createMessage(),
      sendChunk: vi.fn(),
      sendComplete,
      sendError: vi.fn(),
      account: createAccount({ config: { dmPolicy: "disabled" } }),
      config,
      runtime,
    });

    expect(sendComplete).toHaveBeenCalledWith("");
    expect(channelInboundMocks.resolveRouteEnvelope).not.toHaveBeenCalled();
    expect(core.channel.inbound.dispatch).not.toHaveBeenCalled();
  });

  it("reports an error when dispatch finishes without generated content", async () => {
    const { runtime } = createRuntime({ skipDelivery: true });
    const sendComplete = vi.fn();
    const sendError = vi.fn();

    await handleArinovaChatInbound({
      message: createMessage(),
      sendChunk: vi.fn(),
      sendComplete,
      sendError,
      account: createAccount(),
      config,
      runtime,
    });

    expect(sendError).toHaveBeenCalledWith("Unable to generate a response. Please try again.");
    expect(sendComplete).not.toHaveBeenCalled();
  });

  it("quietly completes an exact silent reply skipped by upstream policy", async () => {
    const { runtime } = createRuntime({ skipDelivery: true, skipReason: "silent" });
    const sendComplete = vi.fn();
    const sendError = vi.fn();

    await handleArinovaChatInbound({
      message: createMessage({ conversationType: "group" }),
      sendChunk: vi.fn(),
      sendComplete,
      sendError,
      account: createAccount(),
      config,
      runtime,
    });

    expect(sendComplete).toHaveBeenCalledWith("");
    expect(sendError).not.toHaveBeenCalled();
  });

  it("quietly completes a stale foreground delivery cancelled by upstream", async () => {
    const { runtime } = createRuntime({ cancelDelivery: true });
    const sendComplete = vi.fn();
    const sendError = vi.fn();

    await handleArinovaChatInbound({
      message: createMessage(),
      sendChunk: vi.fn(),
      sendComplete,
      sendError,
      account: createAccount(),
      config,
      runtime,
    });

    expect(sendComplete).toHaveBeenCalledWith("");
    expect(sendError).not.toHaveBeenCalled();
  });

  it("resets streaming accumulation for replacement partials", async () => {
    const { runtime } = createRuntime({
      partialPayloads: [
        { text: "first answer" },
        { text: "replacement answer", replace: true },
      ],
      deliverText: "replacement answer",
    });
    const sendChunk = vi.fn();

    await handleArinovaChatInbound({
      message: createMessage(),
      sendChunk,
      sendComplete: vi.fn(),
      sendError: vi.fn(),
      account: createAccount(),
      config,
      runtime,
    });

    expect(sendChunk.mock.calls).toEqual([
      ["first answer"],
      ["replacement answer"],
    ]);
  });

  it("uses the explicit partial delta when upstream provides one", async () => {
    const { runtime } = createRuntime({
      partialPayloads: [
        { text: "hello" },
        { text: "hello world", delta: " world" },
      ],
      deliverText: "hello world",
    });
    const sendChunk = vi.fn();

    await handleArinovaChatInbound({
      message: createMessage(),
      sendChunk,
      sendComplete: vi.fn(),
      sendError: vi.fn(),
      account: createAccount(),
      config,
      runtime,
    });

    expect(sendChunk.mock.calls).toEqual([["hello"], [" world"]]);
  });

  it("streams partial text, completes delivered text, and resolves mentions", async () => {
    const { core, runtime } = createRuntime({
      partialText: "working\nMEDIA: local.png",
      deliverText: "hello @Alice",
    });
    const sendChunk = vi.fn();
    const sendComplete = vi.fn();
    const statusSink = vi.fn();

    await handleArinovaChatInbound({
      message: createMessage({
        members: [
          { agentId: "agent-a", agentName: "Alice" },
          { agentId: "agent-b", agentName: "Bob" },
        ],
      }),
      sendChunk,
      sendComplete,
      sendError: vi.fn(),
      account: createAccount(),
      config,
      runtime,
      statusSink,
    });

    expect(sendChunk).toHaveBeenCalledWith("working");
    expect(sendComplete).toHaveBeenCalledWith("hello @Alice", { mentions: ["agent-a"] });
    expect(core.channel.inbound.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        route: expect.objectContaining({ sessionKey: "session-1" }),
        record: expect.objectContaining({
          sessionKey: "session-1",
          updateLastRoute: expect.objectContaining({
            accountId: "acct-1",
            sessionKey: "session-1",
          }),
        }),
      }),
    );
    expect(statusSink).toHaveBeenCalledWith({ lastInboundAt: 1_718_000_000_000 });
    expect(statusSink).toHaveBeenCalledWith({ lastOutboundAt: expect.any(Number) });
  });

  it("logs dispatcher errors without sending an empty completion", async () => {
    const { runtime } = createRuntime({ deliverError: new Error("dispatch failed") });
    const sendComplete = vi.fn();
    const sendError = vi.fn();

    await handleArinovaChatInbound({
      message: createMessage(),
      sendChunk: vi.fn(),
      sendComplete,
      sendError,
      account: createAccount(),
      config,
      runtime,
    });

    expect(runtime.error).toHaveBeenCalledWith(
      expect.stringContaining("openclaw-arinova-ai test reply failed: Error: dispatch failed"),
    );
    expect(sendError).toHaveBeenCalledWith("Unable to generate a response. Please try again.");
    expect(sendComplete).not.toHaveBeenCalled();
  });
});
