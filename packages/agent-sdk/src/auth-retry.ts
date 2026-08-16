export const AUTH_ERROR_MAX_RETRIES = 5;
export const AUTH_ERROR_BASE_DELAY = 5_000;
export const AUTH_ERROR_MAX_DELAY = 60_000;

const RETRYABLE_AUTH_CODES = new Set([
  "AUTH_TIMEOUT",
  "AUTH_SERVICE_UNAVAILABLE",
  "CONNECTION_UNAVAILABLE",
  "GATEWAY_TIMEOUT",
  "NETWORK_ERROR",
  "SERVICE_UNAVAILABLE",
  "TEMPORARILY_UNAVAILABLE",
  "502",
  "503",
  "504",
]);

export interface ServerAuthError {
  message: string;
  code?: string;
  retryable: boolean;
}

/** Parse an auth_error frame without classifying arbitrary message substrings. */
export function parseServerAuthError(frame: Record<string, unknown>): ServerAuthError {
  const nested = frame.error && typeof frame.error === "object"
    ? frame.error as Record<string, unknown>
    : undefined;
  const message =
    (typeof nested?.message === "string" && nested.message) ||
    (typeof frame.error === "string" && frame.error) ||
    (typeof frame.message === "string" && frame.message) ||
    "Unknown auth error";
  const codeValue = typeof frame.code === "string" ? frame.code : nested?.code;
  const code = typeof codeValue === "string" && codeValue ? codeValue : undefined;
  const retryable = typeof frame.retryable === "boolean"
    ? frame.retryable
    : code !== undefined && RETRYABLE_AUTH_CODES.has(code.toUpperCase());
  return { message, code, retryable };
}

export function authRetryDelayMs(attempt: number): number {
  return Math.min(
    AUTH_ERROR_BASE_DELAY * 2 ** Math.max(attempt - 1, 0),
    AUTH_ERROR_MAX_DELAY,
  );
}
