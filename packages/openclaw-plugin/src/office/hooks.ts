import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { InternalEvent } from "./types.js";
import { officeState } from "./state.js";
import { getAgentInstance } from "../runtime.js";
import {
  forwardOfficeEvent,
  setForwardTargets,
  type OfficeForwardTarget,
} from "./forwarder.js";

/**
 * Model context window sizes (max input tokens).
 * Used to calculate context usage percentage.
 */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Claude
  "claude-opus-4-6": 1_000_000,
  "claude-sonnet-4-6": 1_000_000,
  "claude-sonnet-4-5-20250514": 200_000,
  "claude-haiku-4-5-20251001": 200_000,
  "claude-3-5-sonnet": 200_000,
  "claude-3-5-haiku": 200_000,
  "claude-3-opus": 200_000,
  // GPT
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "gpt-4-turbo": 128_000,
  "gpt-4": 8_192,
  "o1": 200_000,
  "o1-mini": 128_000,
  "o3": 200_000,
  "o3-mini": 200_000,
  "o4-mini": 200_000,
  // Gemini
  "gemini-2.5-pro": 1_000_000,
  "gemini-2.5-flash": 1_000_000,
  "gemini-2.0-flash": 1_000_000,
  "gemini-1.5-pro": 2_000_000,
  "gemini-1.5-flash": 1_000_000,
  // DeepSeek
  "deepseek-chat": 128_000,
  "deepseek-reasoner": 128_000,
};

/** Find the context limit for a model, trying exact match then prefix match. */
function getModelLimit(model: string): number | null {
  if (MODEL_CONTEXT_LIMITS[model]) return MODEL_CONTEXT_LIMITS[model];
  // Try prefix match (e.g. "claude-opus-4-6-20260301" → "claude-opus-4-6")
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)
    .sort(([left], [right]) => right.length - left.length)) {
    if (model.startsWith(key)) return limit;
  }
  return null;
}

/**
 * Send telemetry data to the backend via the agent's existing WS connection.
 * Silently no-ops if agent instance is not available.
 */
function sendTelemetry(accountId: string | undefined, event: string, data: Record<string, unknown>): void {
  if (!accountId) return;
  const agent = getAgentInstance(accountId);
  if (agent) {
    agent.sendTelemetry(event, data);
  }
}

/**
 * Send HUD context data to the backend for display in the office HUD bar.
 */
function sendHudContext(accountId: string | undefined, model: string, inputTokens: number): void {
  if (!accountId) return;
  const agent = getAgentInstance(accountId);
  if (!agent) return;
  const limit = getModelLimit(model);
  if (!limit) return;
  const percent = Math.max(0, Math.min(100, Math.round((inputTokens / limit) * 100)));
  agent.sendHud({
    context: { percent, inputTokens, maxTokens: limit },
    model,
  });
}

/**
 * Register hook listeners with the OpenClaw plugin API.
 * Each hook normalizes the raw event and feeds it into the state store.
 */
export function registerHooks(api: OpenClawPluginApi): void {
  // accountId may not be on all SDK context types yet — extract safely
  const acct = (ctx: Record<string, unknown>) =>
    ctx.accountId as string | undefined;
  const identity = (ctx: Record<string, unknown>, sessionId?: string) =>
    (ctx.agentId as string | undefined) ?? sessionId ?? "unknown";

  // ── Session lifecycle ──────────────────────────────────

  api.on("session_start", (event, ctx) => {
    const accountId = acct(ctx);
    emit({
      type: "session_start",
      agentId: identity(ctx, event.sessionId),
      sessionId: event.sessionId,
      timestamp: Date.now(),
      data: { resumedFrom: event.resumedFrom },
    }, accountId);
    const ev = event as Record<string, unknown>;
    sendTelemetry(accountId, "session_start", {
      sessionId: event.sessionId,
      model: ev.model as string | undefined,
      provider: ev.provider as string | undefined,
    });
  });

  api.on("session_end", (event, ctx) => {
    const accountId = acct(ctx);
    emit({
      type: "session_end",
      agentId: identity(ctx, event.sessionId),
      sessionId: event.sessionId,
      timestamp: Date.now(),
      data: {
        messageCount: event.messageCount,
        durationMs: event.durationMs,
      },
    }, accountId);
    sendTelemetry(accountId, "session_end", {
      sessionId: event.sessionId,
      messageCount: event.messageCount,
      durationMs: event.durationMs,
    });
  });

  // ── LLM activity ──────────────────────────────────────

  api.on("llm_input", (event, ctx) => {
    emit({
      type: "llm_input",
      agentId: identity(ctx, event.runId ?? ctx.sessionKey),
      sessionId: event.runId ?? ctx.sessionKey ?? "",
      timestamp: Date.now(),
      data: {
        model: event.model,
        provider: event.provider,
      },
    }, acct(ctx));
  });

  api.on("llm_output", (event, ctx) => {
    const accountId = acct(ctx);
    emit({
      type: "llm_output",
      agentId: identity(ctx, event.sessionId),
      sessionId: event.sessionId,
      timestamp: Date.now(),
      data: {
        model: event.model,
        provider: event.provider,
        usage: event.usage,
      },
    }, accountId);
    const usage = event.usage as Record<string, unknown> | undefined;
    const inputTokens = (usage?.inputTokens ?? usage?.input ?? 0) as number;
    sendTelemetry(accountId, "llm_output", {
      sessionId: event.sessionId,
      model: event.model,
      provider: event.provider,
      usage: {
        input: inputTokens,
        output: usage?.outputTokens ?? usage?.output ?? 0,
        cacheRead: usage?.cacheReadTokens ?? usage?.cacheRead ?? 0,
        cacheWrite: usage?.cacheWriteTokens ?? usage?.cacheWrite ?? 0,
        total: usage?.totalTokens ?? usage?.total ?? 0,
      },
    });
    // Push context % to HUD
    if (event.model && inputTokens > 0) {
      sendHudContext(accountId, event.model as string, inputTokens);
    }
  });

  // ── Tool calls ────────────────────────────────────────

  api.on("after_tool_call", (event, ctx) => {
    const accountId = acct(ctx);
    const hasError = Boolean(event.error);
    emit({
      type: hasError ? "tool_result" : "tool_call",
      agentId: identity(ctx, ctx.sessionKey),
      sessionId: ctx.sessionKey ?? "",
      timestamp: Date.now(),
      data: {
        toolName: event.toolName,
        durationMs: event.durationMs,
        error: event.error,
      },
    }, accountId);
    sendTelemetry(accountId, "tool_call", {
      sessionId: ctx.sessionKey ?? "",
      toolName: event.toolName,
      durationMs: event.durationMs,
      success: !hasError,
      error: event.error,
    });

    // Persistent tool errors → blocked
    if (hasError) {
      emit({
        type: "agent_error",
        agentId: identity(ctx, ctx.sessionKey),
        sessionId: ctx.sessionKey ?? "",
        timestamp: Date.now(),
        data: { error: event.error, toolName: event.toolName },
      }, acct(ctx));
    }
  });

  // ── Messages ──────────────────────────────────────────

  api.on("message_received", (event, ctx) => {
    // Use event.from as agentId — this is the sender's identity.
    // ctx.accountId/channelId are channel-level, not agent-level.
    emit({
      type: "message_in",
      agentId: event.from ?? ctx.accountId ?? "unknown",
      sessionId: ctx.conversationId ?? "",
      timestamp: event.timestamp ?? Date.now(),
      data: { from: event.from, channelId: ctx.channelId },
    }, ctx.accountId);
  });

  api.on("message_sent", (event, ctx) => {
    // Use event.to as agentId — this is the target agent identity.
    emit({
      type: "message_out",
      agentId: event.to ?? ctx.accountId ?? "unknown",
      sessionId: ctx.conversationId ?? "",
      timestamp: Date.now(),
      data: { to: event.to, success: event.success, error: event.error, channelId: ctx.channelId },
    }, ctx.accountId);
  });

  // ── Agent run completion ──────────────────────────────

  api.on("agent_end", (event, ctx) => {
    const accountId = acct(ctx);
    if (!event.success && event.error) {
      emit({
        type: "agent_error",
        agentId: identity(ctx, ctx.sessionKey),
        sessionId: ctx.sessionKey ?? "",
        timestamp: Date.now(),
        data: { error: event.error, durationMs: event.durationMs },
      }, accountId);
    } else {
      emit({
        type: "agent_end",
        agentId: identity(ctx, ctx.sessionKey),
        sessionId: ctx.sessionKey ?? "",
        timestamp: Date.now(),
        data: { durationMs: event.durationMs },
      }, accountId);
    }
    sendTelemetry(accountId, "agent_end", {
      sessionId: ctx.sessionKey ?? "",
      success: event.success,
      error: event.error,
      durationMs: event.durationMs,
    });
  });

  // ── Subagent collaboration ────────────────────────────

  api.on("subagent_spawned", (event, ctx) => {
    emit({
      type: "subagent_start",
      agentId: event.agentId,
      sessionId: event.childSessionKey,
      timestamp: Date.now(),
      data: {
        parentSessionKey: ctx.requesterSessionKey,
        label: event.label,
        mode: event.mode,
      },
    }, event.requester?.accountId);
  });

  api.on("subagent_ended", (event, ctx) => {
    emit({
      type: "subagent_end",
      agentId: ctx.childSessionKey ?? event.targetSessionKey,
      sessionId: event.targetSessionKey,
      timestamp: Date.now(),
      data: {
        parentSessionKey: ctx.requesterSessionKey,
        outcome: event.outcome,
        reason: event.reason,
      },
    }, event.accountId);
  });
}

export function setForwardTarget(url: string, tokens: Map<string, string>): void {
  setForwardTargets(new Map(
    [...tokens].map(([accountId, token]) => [
      accountId,
      { url, token } satisfies OfficeForwardTarget,
    ]),
  ));
}

function emit(event: InternalEvent, accountId?: string): void {
  officeState.ingest(event);

  forwardOfficeEvent(event, accountId);
}

/**
 * Manually ingest a hook event (for testing or direct integration).
 */
export function ingestHookEvent(
  type: InternalEvent["type"],
  sessionId: string,
  agentId: string,
  data: Record<string, unknown> = {},
  accountId?: string,
): void {
  emit({
    type,
    sessionId,
    agentId,
    timestamp: Date.now(),
    data,
  }, accountId);
}
