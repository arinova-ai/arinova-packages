export interface ActionCallOptions {
  callId?: string;
  taskId?: string;
  conversationId?: string;
  messageId?: string;
  parentCallId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  dryRun?: boolean;
  timeoutMs?: number;
}

export interface ActionErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ActionConfirmationPayload {
  confirmationId: string;
  title: string;
  summary: string;
  expiresAt: string;
}

export interface ActionCallResult {
  callId: string;
  action: string;
  status:
    | "success"
    | "error"
    | "requires_confirmation"
    | "cancelled"
    | "processing"
    | "received"
    | "validating";
  result?: Record<string, unknown> | null;
  error?: ActionErrorBody | null;
  confirmation?: ActionConfirmationPayload | null;
  traceId?: string;
  actionVersion?: string;
  dryRun?: boolean;
}
