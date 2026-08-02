import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
} from "openclaw/plugin-sdk/core";
import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk/core";
import { formatPairingApproveHint } from "openclaw/plugin-sdk/channel-plugin-common";
import type { ChannelSetupInput } from "openclaw/plugin-sdk/setup";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";

import type { CoreConfig } from "./types.js";
import {
  listArinovaChatAccountIds,
  resolveDefaultArinovaChatAccountId,
  resolveArinovaChatAccount,
  type ResolvedArinovaChatAccount,
} from "./accounts.js";
import { ArinovaChatConfigSchema } from "./config-schema.js";
import {
  looksLikeArinovaChatTargetId,
  normalizeArinovaChatMessagingTarget,
  stripArinovaChatTargetPrefix,
} from "./normalize.js";
import { getArinovaChatRuntime, removeAgentInstance, setAgentInstance } from "./runtime.js";
import { sendMessageArinovaChat } from "./send.js";
import { ArinovaAgent } from "@arinova-ai/agent-sdk";
import { handleArinovaChatInbound } from "./inbound.js";

const meta = {
  id: "openclaw-arinova-ai",
  label: "Arinova Chat",
  selectionLabel: "Arinova Chat (A2A streaming)",
  docsPath: "/channels/openclaw-arinova-ai",
  docsLabel: "openclaw-arinova-ai",
  blurb: "Human-to-AI messaging via Arinova Chat with native streaming.",
  aliases: ["arinova"],
  order: 70,
  quickstartAllowFrom: true,
};

const isConfigured = (account: ResolvedArinovaChatAccount) =>
  Boolean(account.apiUrl?.trim() && account.botToken?.trim());

export const arinovaChatPlugin: ChannelPlugin<ResolvedArinovaChatAccount> = {
  id: "openclaw-arinova-ai",
  meta,
  pairing: {
    idLabel: "arinovaUserId",
    normalizeAllowEntry: (entry) =>
      stripArinovaChatTargetPrefix(entry).toLowerCase(),
    notifyApproval: async ({ id }) => {
      console.log(`[openclaw-arinova-ai] User ${id} approved for pairing`);
    },
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false,
    threads: false,
    media: true,
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.openclaw-arinova-ai"] },
  configSchema: buildChannelConfigSchema(ArinovaChatConfigSchema),
  config: {
    listAccountIds: (cfg) => listArinovaChatAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg, accountId) =>
      resolveArinovaChatAccount({ cfg: cfg as CoreConfig, accountId }),
    defaultAccountId: (cfg) => resolveDefaultArinovaChatAccountId(cfg as CoreConfig),
    isConfigured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: isConfigured(account),
      apiUrl: account.apiUrl ? "[set]" : "[missing]",
      botToken: account.botToken ? "[set]" : "[missing]",
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (
        resolveArinovaChatAccount({ cfg: cfg as CoreConfig, accountId }).config.allowFrom ?? []
      ).map((entry) => String(entry).toLowerCase()),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map(stripArinovaChatTargetPrefix)
        .map((entry) => entry.toLowerCase()),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(
        cfg.channels?.["openclaw-arinova-ai"]?.accounts?.[resolvedAccountId],
      );
      const basePath = useAccountPath
        ? `channels.openclaw-arinova-ai.accounts.${resolvedAccountId}.`
        : "channels.openclaw-arinova-ai.";
      return {
        policy: account.config.dmPolicy ?? "open",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("openclaw-arinova-ai"),
        normalizeEntry: (raw) => stripArinovaChatTargetPrefix(raw).toLowerCase(),
      };
    },
    collectWarnings: () => [],
  },
  messaging: {
    normalizeTarget: normalizeArinovaChatMessagingTarget,
    targetResolver: {
      looksLikeId: looksLikeArinovaChatTargetId,
      hint: "<conversationId>",
    },
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "openclaw-arinova-ai",
        accountId,
        name,
      }),
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const setupInput = input as ChannelSetupInput & {
        apiUrl?: string;
        agentId?: string;
      };
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "openclaw-arinova-ai",
        accountId,
        name: setupInput.name,
      });
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...namedConfig,
          channels: {
            ...namedConfig.channels,
            "openclaw-arinova-ai": {
              ...namedConfig.channels?.["openclaw-arinova-ai"],
              enabled: true,
              apiUrl: setupInput.apiUrl,
              agentId: setupInput.agentId,
            },
          },
        } as OpenClawConfig;
      }
      return {
        ...namedConfig,
        channels: {
          ...namedConfig.channels,
          "openclaw-arinova-ai": {
            ...namedConfig.channels?.["openclaw-arinova-ai"],
            enabled: true,
            accounts: {
              ...namedConfig.channels?.["openclaw-arinova-ai"]?.accounts,
              [accountId]: {
                ...namedConfig.channels?.["openclaw-arinova-ai"]?.accounts?.[accountId],
                enabled: true,
                apiUrl: setupInput.apiUrl,
                agentId: setupInput.agentId,
              },
            },
          },
        },
      } as OpenClawConfig;
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => getArinovaChatRuntime().channel.text.chunkMarkdownText(text, limit),
    chunkerMode: "markdown",
    textChunkLimit: 32000,
    resolveEffectiveTextChunkLimit: ({ cfg, accountId, fallbackLimit }) =>
      resolveArinovaChatAccount({ cfg: cfg as CoreConfig, accountId: accountId ?? undefined })
        .config.textChunkLimit ?? fallbackLimit ?? 32000,
    sendText: async ({ to, text, accountId }) => {
      const result = await sendMessageArinovaChat(to, text, {
        accountId: accountId ?? undefined,
      });
      return { channel: "openclaw-arinova-ai", ...result, messageId: result.messageId ?? "inline" };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId }) => {
      // Convert media URL to markdown image so frontend renders it as <img>
      const mediaMarkdown = mediaUrl ? `![](${mediaUrl})` : "";
      const messageWithMedia = [text, mediaMarkdown].filter(Boolean).join("\n\n");
      const result = await sendMessageArinovaChat(to, messageWithMedia, {
        accountId: accountId ?? undefined,
      });
      return { channel: "openclaw-arinova-ai", ...result, messageId: result.messageId ?? "inline" };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      mode: "websocket",
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }) => {
      const configured = isConfigured(account);
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured,
        apiUrl: account.apiUrl ? "[set]" : "[missing]",
        botToken: account.botToken ? "[set]" : "[missing]",
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        mode: "websocket",
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      if (!account.apiUrl) {
        throw new Error(
          `Arinova Chat not configured for account "${account.accountId}" (missing apiUrl)`,
        );
      }
      if (!account.botToken) {
        throw new Error(
          `Arinova Chat not configured for account "${account.accountId}" (missing botToken)`,
        );
      }

      const core = getArinovaChatRuntime();
      const cfg = ctx.cfg as CoreConfig;
      const logger = core.logging.getChildLogger({
        channel: "openclaw-arinova-ai",
        accountId: account.accountId,
      });
      const runtime: RuntimeEnv = ctx.runtime ?? {
        log: (message: string) => logger.info(message),
        error: (message: string) => logger.error(message),
        exit: () => {
          throw new Error("Runtime exit not available");
        },
      };

      // Connect to backend via SDK (botToken auth, no pair step needed)
      logger.info(`[${account.accountId}] connecting to backend: ${account.apiUrl}`);

      const agent = new ArinovaAgent({
        serverUrl: account.apiUrl,
        botToken: account.botToken,
      });

      setAgentInstance(account.accountId, agent);

      agent.onTask(async (task) => {
        core.channel.activity.record({
          channel: "openclaw-arinova-ai",
          accountId: account.accountId,
          direction: "inbound",
          at: Date.now(),
        });

        await handleArinovaChatInbound({
          message: {
            taskId: task.taskId,
            text: task.content ?? "",
            timestamp: Date.now(),
            conversationId: task.conversationId,
            conversationType: task.conversationType,
            senderUserId: task.senderUserId,
            senderUsername: task.senderUsername,
            senderAgentId: task.senderAgentId,
            senderAgentName: task.senderAgentName,
            members: task.members,
            replyTo: task.replyTo,
            history: task.history,
            attachments: task.attachments,
          },
          sendChunk: task.sendChunk,
          sendComplete: task.sendComplete,
          sendError: task.sendError,
          signal: task.signal,
          account,
          config: cfg,
          runtime,
          uploadFile: task.uploadFile,
          statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
        });
      });

      agent.on("connected", () => {
        logger.info(`[openclaw-arinova-ai:${account.accountId}] WebSocket connected`);
      });
      agent.on("disconnected", () => {
        logger.info(`[openclaw-arinova-ai:${account.accountId}] WebSocket disconnected, will reconnect...`);
      });
      agent.on("error", (error) => {
        logger.error(`[openclaw-arinova-ai:${account.accountId}] WebSocket error: ${error.message}`);
      });

      let rejectLifetime: ((error: Error) => void) | undefined;
      let onAbort: (() => void) | undefined;
      const lifetime = new Promise<void>((resolve, reject) => {
        rejectLifetime = reject;
        onAbort = () => {
          removeAgentInstance(account.accountId, agent);
          agent.disconnect();
          resolve();
        };
        ctx.abortSignal.addEventListener("abort", onAbort, { once: true });
      });
      // auth_failed fires synchronously inside agent.connect() below when the
      // bot token is rejected — at that point nobody awaits `lifetime` yet, so
      // observe the rejection here or it becomes an unhandledRejection.
      void lifetime.catch(() => undefined);
      agent.on("auth_failed", () => {
        removeAgentInstance(account.accountId, agent);
        agent.disconnect();
        rejectLifetime?.(new Error(`Arinova authentication failed for account "${account.accountId}"`));
      });

      // Connect and keep the Promise pending for the lifetime of the connection.
      // The gateway expects startAccount to return a Promise that stays open
      // while the channel is running, and resolves/rejects when it stops.
      try {
        await agent.connect();
      } catch (error) {
        if (onAbort) ctx.abortSignal.removeEventListener("abort", onAbort);
        removeAgentInstance(account.accountId, agent);
        agent.disconnect();
        throw error;
      }
      logger.info(`[openclaw-arinova-ai:${account.accountId}] WebSocket connected and authenticated`);

      // Return a Promise that stays pending until the abort signal fires
      // (gateway calls abort when stopping the channel)
      return lifetime;
    },
    stopAccount: async ({ account }) => {
      const agent = removeAgentInstance(account.accountId);
      agent?.disconnect();
    },
  },
};
