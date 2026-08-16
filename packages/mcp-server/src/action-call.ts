import { randomUUID } from "node:crypto";
import type { ActionCallOptions, ActionCallResult } from "./action-types.js";
import type { McpServerConfig } from "./config.js";
import { ActionExecutionError } from "./errors.js";
import { httpRequest, HttpRequestError } from "./http.js";

/** Owns action-call envelopes, HTTP execution, normalization, and request aborts. */
export class ActionCaller {
  private readonly activeRequests = new Set<AbortController>();

  constructor(
    private readonly config: Pick<McpServerConfig, "apiUrl" | "botToken" | "actionTimeoutMs">,
  ) {}

  async call(
    actionName: string,
    args: Record<string, unknown>,
    options: Partial<ActionCallOptions> = {},
    maxRequestBytes?: number,
  ): Promise<ActionCallResult> {
    const timeoutMs = options.timeoutMs ?? this.config.actionTimeoutMs;
    const callId = options.callId ?? `mcp_${randomUUID()}`;
    const payload = {
      type: "action_call",
      id: callId,
      taskId: options.taskId ?? null,
      conversationId: options.conversationId ?? null,
      messageId: options.messageId ?? null,
      action: actionName,
      arguments: args,
      dryRun: options.dryRun ?? false,
      reason: options.reason ?? null,
      metadata: options.metadata ?? null,
      parentCallId: options.parentCallId ?? null,
    };
    const argumentBytes = Buffer.byteLength(JSON.stringify(args ?? {}), "utf8");
    if (maxRequestBytes && argumentBytes > maxRequestBytes) {
      throw new ActionExecutionError(
        "ARGUMENTS_TOO_LARGE",
        `Action arguments size ${argumentBytes} exceeds limit ${maxRequestBytes}`,
        { callId },
      );
    }

    const controller = new AbortController();
    this.activeRequests.add(controller);
    try {
      const response = await httpRequest(`${this.config.apiUrl}/api/v1/actions/call`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        timeoutMs,
        retries: 0,
      });
      const body = parseJsonBody(response.body);
      if (!response.ok) {
        const error = actionErrorFromBody(body);
        throw new ActionExecutionError(
          error.code ?? "HTTP_ACTION_CALL_FAILED",
          error.message ?? `HTTP action call failed (${response.status})`,
          { statusCode: response.status, details: error.details, callId },
        );
      }
      return normalizeHttpActionResult(body, callId, actionName);
    } catch (error) {
      if (error instanceof ActionExecutionError) throw error;
      if (error instanceof HttpRequestError && error.code === "TIMEOUT") {
        throw new ActionExecutionError(
          "TIMEOUT",
          `Action timed out after ${timeoutMs}ms`,
          { callId },
        );
      }
      if (error instanceof HttpRequestError && error.code === "ABORTED") {
        throw new ActionExecutionError("ABORTED", "Action request was aborted", { callId });
      }
      throw new ActionExecutionError(
        "HTTP_ACTION_CALL_FAILED",
        error instanceof Error ? error.message : String(error),
        { callId },
      );
    } finally {
      this.activeRequests.delete(controller);
    }
  }

  abort(): void {
    for (const controller of this.activeRequests) controller.abort();
    this.activeRequests.clear();
  }
}

function parseJsonBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function actionErrorFromBody(body: unknown): {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
} {
  if (!body || typeof body !== "object") return {};
  const value = body as Record<string, unknown>;
  const nested = value.error && typeof value.error === "object"
    ? value.error as Record<string, unknown>
    : value;
  return {
    code: stringField(nested.code),
    message: stringField(nested.message),
    details: recordOrNull(nested.details) ?? undefined,
  };
}

function normalizeHttpActionResult(
  body: unknown,
  fallbackCallId: string,
  fallbackAction: string,
): ActionCallResult {
  const value = body && typeof body === "object"
    ? body as Record<string, unknown>
    : {};
  return {
    callId: stringField(value.id) ?? stringField(value.callId) ?? fallbackCallId,
    action: stringField(value.action) ?? fallbackAction,
    status: actionStatus(value.status),
    result: recordOrNull(value.result),
    error: recordOrNull(value.error) as ActionCallResult["error"],
    confirmation: recordOrNull(value.confirmation) as ActionCallResult["confirmation"],
    traceId: stringField(value.traceId),
    actionVersion: stringField(value.actionVersion),
    dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined,
  };
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function actionStatus(value: unknown): ActionCallResult["status"] {
  if (
    value === "success"
    || value === "error"
    || value === "requires_confirmation"
    || value === "cancelled"
    || value === "processing"
    || value === "received"
    || value === "validating"
  ) {
    return value;
  }
  return "error";
}

function recordOrNull(value: unknown): Record<string, unknown> | null | undefined {
  if (value === null) return null;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}
