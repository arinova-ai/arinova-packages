import type { ActionCallResult } from "./action-types.js";

export interface McpActionResponse {
  ok: boolean;
  status: string;
  action: string;
  callId: string;
  traceId?: string;
  result?: Record<string, unknown> | null;
  error?: { code: string; message: string; details?: Record<string, unknown> } | null;
  confirmation?: {
    confirmationId: string;
    title: string;
    summary: string;
    expiresAt: string;
  } | null;
}

export function normalizeResult(result: ActionCallResult): McpActionResponse {
  const ok = result.status === "success";

  return {
    ok,
    status: result.status,
    action: result.action,
    callId: result.callId,
    ...(result.traceId && { traceId: result.traceId }),
    ...(ok && result.result !== undefined && { result: result.result }),
    ...(result.error && { error: result.error }),
    ...(result.confirmation && { confirmation: result.confirmation }),
  };
}

export function isTerminalStatus(status: string): boolean {
  return (
    status === "success" ||
    status === "error" ||
    status === "cancelled" ||
    status === "requires_confirmation"
  );
}

export function shouldReportAsError(response: McpActionResponse): boolean {
  return !response.ok;
}
