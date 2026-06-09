import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedArinovaChatAccount } from "./accounts.js";
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
  skipDelivery?: boolean;
  deliverError?: unknown;
} = {}) {
  const runtimeLog = vi.fn();
  const runtimeError = vi.fn();
  const recordInboundSession = vi.fn().mockResolvedValue(undefined);
  const dispatchReplyWithBufferedBlockDispatcher = vi.fn(async (request: {
    dispatcherOptions: {
      deliver: (payload: { text?: string; mediaUrls?: string[] }) => Promise<void>;
      onError: (err: unknown, info: { kind: string }) => void;
    };
    replyOptions: {
      onPartialReply?: (payload: { text?: string }) => void;
    };
  }) => {
    if (options.deliverError) {
      request.dispatcherOptions.onError(options.deliverError, { kind: "test" });
      return;
    }
    if (options.partialText) {
      request.replyOptions.onPartialReply?.({ text: options.partialText });
    }
    if (!options.skipDelivery) {
      await request.dispatcherOptions.deliver({ text: options.deliverText ?? "reply" });
    }
  });

  const core = {
    log: runtimeLog,
    error: runtimeError,
    channel: {
      routing: {
        resolveAgentRoute: vi.fn(() => ({
          agentId: "agent-1",
          accountId: "acct-1",
          sessionKey: "session-1",
        })),
      },
      session: {
        resolveStorePath: vi.fn(() => "/tmp/openclaw-sessions"),
        readSessionUpdatedAt: vi.fn(() => 123),
        recordInboundSession,
      },
      reply: {
        resolveEnvelopeFormatOptions: vi.fn(() => ({})),
        formatAgentEnvelope: vi.fn(({ body }: { body: string }) => body),
        finalizeInboundContext: vi.fn((ctx: Record<string, unknown>) => ctx),
        dispatchReplyWithBufferedBlockDispatcher,
      },
    },
  };

  setArinovaChatRuntime(core as never);
  return { core, runtime: { log: runtimeLog, error: runtimeError } };
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
    expect(core.channel.reply.dispatchReplyWithBufferedBlockDispatcher).not.toHaveBeenCalled();
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
    expect(core.channel.routing.resolveAgentRoute).not.toHaveBeenCalled();
    expect(core.channel.reply.dispatchReplyWithBufferedBlockDispatcher).not.toHaveBeenCalled();
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
    expect(core.channel.session.recordInboundSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "session-1",
        updateLastRoute: expect.objectContaining({
          accountId: "acct-1",
          sessionKey: "session-1",
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
