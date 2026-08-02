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

const pairingMocks = vi.hoisted(() => ({
  readAllowFromStore: vi.fn(async () => [] as string[]),
}));

vi.mock("openclaw/plugin-sdk/channel-inbound", () => ({
  buildChannelInboundEventContext: channelInboundMocks.buildContext,
  resolveChannelInboundRouteEnvelope: channelInboundMocks.resolveRouteEnvelope,
}));

vi.mock("openclaw/plugin-sdk/channel-pairing", () => ({
  readChannelAllowFromStore: pairingMocks.readAllowFromStore,
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
    config: { dmPolicy: "open", allowFrom: ["*"] },
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
  deliverPayloads?: Array<{ text?: string; mediaUrls?: string[] }>;
  partialText?: string;
  partialPayloads?: Array<{ text?: string; delta?: string; replace?: true }>;
  skipDelivery?: boolean;
  skipReason?: "empty" | "silent" | "heartbeat";
  cancelDelivery?: boolean;
  deliverError?: unknown;
  afterPartials?: () => void;
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
    options.afterPartials?.();
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
    for (const payload of options.deliverPayloads ?? []) {
      await request.delivery.deliver(payload);
    }
    if (!options.skipDelivery && !options.deliverPayloads) {
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
    pairingMocks.readAllowFromStore.mockResolvedValue([]);
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

  it("preserves tool-like lines inside fenced code blocks", () => {
    const input = "```sh\r\n[Bash] echo literal\r\n```\r\n[Read] real\r\n📎 result";
    expect(collapseToolBlocks(input)).toBe(
      "```sh\n[Bash] echo literal\n```\n[Read] real\n📎 result",
    );
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
      senderUsername: "User One",
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
    expect(body).toContain("[Sender: User One]");
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

  it("resolves punctuation, spaces, and CJK names without matching emails", () => {
    expect(resolveMentions("mail a@Alice.com, ping @Alice Chen, @研究員-一 and @bot.v2!", [
      { agentId: "short", agentName: "Alice" },
      { agentId: "alice", agentName: "Alice Chen" },
      { agentId: "cjk", agentName: "研究員-一" },
      { agentId: "bot", agentName: "bot.v2" },
    ])).toEqual(["alice", "cjk", "bot"]);
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

  it.each(["open", "allowlist", "pairing"] as const)(
    "fails closed without a sender identity in %s mode",
    async (dmPolicy) => {
      const { core, runtime } = createRuntime();
      const sendComplete = vi.fn();

      await handleArinovaChatInbound({
        message: createMessage({ senderUserId: undefined }),
        sendChunk: vi.fn(),
        sendComplete,
        sendError: vi.fn(),
        account: createAccount({
          config: {
            dmPolicy,
            allowFrom: dmPolicy === "open" ? ["*"] : ["user-1"],
          },
        }),
        config,
        runtime,
      });

      expect(sendComplete).toHaveBeenCalledWith("");
      expect(core.channel.inbound.dispatch).not.toHaveBeenCalled();
    },
  );

  it("fails closed when open policy lacks its required wildcard", async () => {
    const { core, runtime } = createRuntime();

    await handleArinovaChatInbound({
      message: createMessage(),
      sendChunk: vi.fn(),
      sendComplete: vi.fn(),
      sendError: vi.fn(),
      account: createAccount({ config: { dmPolicy: "open", allowFrom: [] } }),
      config,
      runtime,
    });

    expect(core.channel.inbound.dispatch).not.toHaveBeenCalled();
  });

  it("rejects an unlisted sender and dispatches a listed sender", async () => {
    const denied = createRuntime();
    await handleArinovaChatInbound({
      message: createMessage({ senderUserId: "intruder" }),
      sendChunk: vi.fn(),
      sendComplete: vi.fn(),
      sendError: vi.fn(),
      account: createAccount({ config: { dmPolicy: "allowlist", allowFrom: ["arinova:user-1"] } }),
      config,
      runtime: denied.runtime,
    });
    expect(denied.core.channel.inbound.dispatch).not.toHaveBeenCalled();

    const allowed = createRuntime();
    await handleArinovaChatInbound({
      message: createMessage(),
      sendChunk: vi.fn(),
      sendComplete: vi.fn(),
      sendError: vi.fn(),
      account: createAccount({ config: { dmPolicy: "allowlist", allowFrom: ["arinova:user-1"] } }),
      config,
      runtime: allowed.runtime,
    });
    expect(allowed.core.channel.inbound.dispatch).toHaveBeenCalledOnce();
  });

  it("rejects an unpaired sender and dispatches a sender approved in the pairing store", async () => {
    const denied = createRuntime();
    await handleArinovaChatInbound({
      message: createMessage(),
      sendChunk: vi.fn(),
      sendComplete: vi.fn(),
      sendError: vi.fn(),
      account: createAccount({ config: { dmPolicy: "pairing", allowFrom: [] } }),
      config,
      runtime: denied.runtime,
    });
    expect(denied.core.channel.inbound.dispatch).not.toHaveBeenCalled();

    pairingMocks.readAllowFromStore.mockResolvedValue(["openclaw-arinova-ai:user-1"]);
    const allowed = createRuntime();
    await handleArinovaChatInbound({
      message: createMessage(),
      sendChunk: vi.fn(),
      sendComplete: vi.fn(),
      sendError: vi.fn(),
      account: createAccount({ config: { dmPolicy: "pairing", allowFrom: [] } }),
      config,
      runtime: allowed.runtime,
    });
    expect(allowed.core.channel.inbound.dispatch).toHaveBeenCalledOnce();
  });

  it("fails closed when the pairing store cannot be read", async () => {
    pairingMocks.readAllowFromStore.mockRejectedValue(new Error("store unavailable"));
    const { core, runtime } = createRuntime();

    await handleArinovaChatInbound({
      message: createMessage(),
      sendChunk: vi.fn(),
      sendComplete: vi.fn(),
      sendError: vi.fn(),
      account: createAccount({ config: { dmPolicy: "pairing", allowFrom: [] } }),
      config,
      runtime,
    });

    expect(core.channel.inbound.dispatch).not.toHaveBeenCalled();
    expect(runtime.error).toHaveBeenCalledWith(expect.stringContaining("store unavailable"));
  });

  it("uses the actual sender identity and authorization in the inbound context", async () => {
    const { core, runtime } = createRuntime();

    await handleArinovaChatInbound({
      message: createMessage({ senderUserId: "user-1", conversationId: "conv-1" }),
      sendChunk: vi.fn(),
      sendComplete: vi.fn(),
      sendError: vi.fn(),
      account: createAccount({ config: { dmPolicy: "allowlist", allowFrom: ["user-1"] } }),
      config,
      runtime,
    });

    const request = core.channel.inbound.dispatch.mock.calls[0]?.[0] as unknown as {
      ctxPayload: { From: string; SenderId: string; CommandAuthorized: boolean };
    };
    expect(request.ctxPayload).toMatchObject({
      From: "openclaw-arinova-ai:user-1",
      SenderId: "user-1",
      CommandAuthorized: true,
    });
  });

  it("drops agent-authored messages by default to prevent A2A reply loops", async () => {
    const { core, runtime } = createRuntime();
    const sendComplete = vi.fn();

    await handleArinovaChatInbound({
      message: createMessage({
        conversationType: "group",
        senderAgentId: "agent-peer",
        senderAgentName: "Peer Agent",
      }),
      sendChunk: vi.fn(),
      sendComplete,
      sendError: vi.fn(),
      account: createAccount(),
      config,
      runtime,
    });

    expect(sendComplete).toHaveBeenCalledWith("");
    expect(core.channel.inbound.dispatch).not.toHaveBeenCalled();
  });

  it("preserves an explicitly allowlisted A2A sender without command authority", async () => {
    const { core, runtime } = createRuntime();

    await handleArinovaChatInbound({
      message: createMessage({
        conversationType: "group",
        senderAgentId: "agent-peer",
        senderAgentName: "Peer Agent",
      }),
      sendChunk: vi.fn(),
      sendComplete: vi.fn(),
      sendError: vi.fn(),
      account: createAccount({
        config: {
          dmPolicy: "open",
          allowFrom: ["*"],
          allowAgentMessagesFrom: ["arinova:agent-peer"],
        },
      }),
      config,
      runtime,
    });

    const request = core.channel.inbound.dispatch.mock.calls[0]?.[0] as unknown as {
      ctxPayload: {
        From: string;
        SenderId: string;
        CommandAuthorized: boolean;
        ArinovaSenderAgentId: string;
      };
    };
    expect(request.ctxPayload).toMatchObject({
      From: "openclaw-arinova-ai:agent-peer",
      SenderId: "agent-peer",
      CommandAuthorized: false,
      ArinovaSenderAgentId: "agent-peer",
    });
  });

  it("keeps group routing conversation-scoped without authorizing an unlisted sender", async () => {
    const { core, runtime } = createRuntime();

    await handleArinovaChatInbound({
      message: createMessage({
        senderUserId: "group-user",
        conversationId: "group-conv",
        conversationType: "group",
      }),
      sendChunk: vi.fn(),
      sendComplete: vi.fn(),
      sendError: vi.fn(),
      account: createAccount({ config: { dmPolicy: "allowlist", allowFrom: ["admin-user"] } }),
      config,
      runtime,
    });

    const request = core.channel.inbound.dispatch.mock.calls[0]?.[0] as unknown as {
      ctxPayload: { SenderId: string; CommandAuthorized: boolean };
    };
    expect(request.ctxPayload).toMatchObject({
      SenderId: "group-user",
      CommandAuthorized: false,
    });
    expect(channelInboundMocks.resolveRouteEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({ peer: { kind: "group", id: "group-conv" } }),
    );
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

  it("derives deltas from accumulated text instead of trusting upstream delta", async () => {
    const { runtime } = createRuntime({
      partialPayloads: [
        { text: "hello" },
        { text: "hello world", delta: " CORRUPT" },
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

  it("resends collapsed content when a new tool block rewrites the prefix", async () => {
    const { runtime } = createRuntime({
      partialPayloads: [
        { text: "[Bash] first\n📎 one" },
        { text: "[Bash] first\n📎 one\n[Read] second\n📎 two" },
      ],
      deliverText: "done",
    });
    const sendChunk = vi.fn();

    await handleArinovaChatInbound({
      message: createMessage(), sendChunk, sendComplete: vi.fn(), sendError: vi.fn(),
      account: createAccount(), config, runtime,
    });

    expect(sendChunk.mock.calls).toEqual([
      ["[Bash] first\n📎 one"],
      ["[Read] second\n📎 two"],
    ]);
  });

  it("completes an abort with the already-visible first block", async () => {
    const controller = new AbortController();
    const { runtime } = createRuntime({
      partialText: "visible\r\ntext",
      afterPartials: () => controller.abort(),
      skipDelivery: true,
    });
    const sendComplete = vi.fn();

    await handleArinovaChatInbound({
      message: createMessage(), sendChunk: vi.fn(), sendComplete, sendError: vi.fn(),
      signal: controller.signal, account: createAccount(), config, runtime,
    });

    expect(sendComplete).toHaveBeenCalledOnce();
    expect(sendComplete).toHaveBeenCalledWith("visible\ntext");
  });

  it("keeps streamed content when final delivery is suppressed", async () => {
    const { runtime } = createRuntime({ partialText: "kept", cancelDelivery: true });
    const sendComplete = vi.fn();

    await handleArinovaChatInbound({
      message: createMessage(), sendChunk: vi.fn(), sendComplete, sendError: vi.fn(),
      account: createAccount(), config, runtime,
    });

    expect(sendComplete).toHaveBeenCalledWith("kept");
  });

  it("does not leak a MEDIA token split across accumulated partials", async () => {
    const { runtime } = createRuntime({
      partialPayloads: [{ text: "answer\nMED" }, { text: "answer\nMEDIA: local.png" }],
      deliverText: "answer",
    });
    const sendChunk = vi.fn();

    await handleArinovaChatInbound({
      message: createMessage(), sendChunk, sendComplete: vi.fn(), sendError: vi.fn(),
      account: createAccount(), config, runtime,
    });

    expect(sendChunk.mock.calls).toEqual([["answer"]]);
  });

  it("joins separately delivered GFM table rows without a blank line", async () => {
    const { runtime } = createRuntime({
      deliverPayloads: [
        { text: "| Name | Value |" },
        { text: "| --- | --- |" },
        { text: "| A | B |" },
      ],
    });
    const sendComplete = vi.fn();
    await handleArinovaChatInbound({
      message: createMessage(), sendChunk: vi.fn(), sendComplete, sendError: vi.fn(),
      account: createAccount(), config, runtime,
    });
    expect(sendComplete).toHaveBeenCalledWith(
      "| Name | Value |\n| --- | --- |\n| A | B |",
      undefined,
    );
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
