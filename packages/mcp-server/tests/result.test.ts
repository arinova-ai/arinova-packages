import { describe, it, expect } from "vitest";
import { normalizeResult, shouldReportAsError } from "../src/result.js";
import type { ActionCallResult } from "../src/action-types.js";

describe("normalizeResult", () => {
  it("normalizes success", () => {
    const result: ActionCallResult = {
      callId: "call_123",
      action: "arinova.kanban.add_commit",
      status: "success",
      result: { id: "card_456" },
      traceId: "trace_789",
    };

    const response = normalizeResult(result);

    expect(response.ok).toBe(true);
    expect(response.status).toBe("success");
    expect(response.action).toBe("arinova.kanban.add_commit");
    expect(response.callId).toBe("call_123");
    expect(response.traceId).toBe("trace_789");
    expect(response.result).toEqual({ id: "card_456" });
    expect(response.error).toBeUndefined();
    expect(response.confirmation).toBeUndefined();
  });

  it("normalizes error", () => {
    const result: ActionCallResult = {
      callId: "call_123",
      action: "arinova.kanban.add_commit",
      status: "error",
      error: {
        code: "PERMISSION_DENIED",
        message: "Insufficient permissions",
      },
    };

    const response = normalizeResult(result);

    expect(response.ok).toBe(false);
    expect(response.status).toBe("error");
    expect(response.error).toEqual({
      code: "PERMISSION_DENIED",
      message: "Insufficient permissions",
    });
    expect(response.result).toBeUndefined();
  });

  it("normalizes requires_confirmation", () => {
    const result: ActionCallResult = {
      callId: "call_123",
      action: "arinova.wiki.update_page",
      status: "requires_confirmation",
      confirmation: {
        confirmationId: "conf_456",
        title: "Confirm update",
        summary: "Are you sure?",
        expiresAt: "2026-05-07T00:00:00Z",
      },
    };

    const response = normalizeResult(result);

    expect(response.ok).toBe(false);
    expect(response.status).toBe("requires_confirmation");
    expect(response.confirmation).toEqual({
      confirmationId: "conf_456",
      title: "Confirm update",
      summary: "Are you sure?",
      expiresAt: "2026-05-07T00:00:00Z",
    });
  });

  it("normalizes cancelled", () => {
    const result: ActionCallResult = {
      callId: "call_123",
      action: "arinova.kanban.add_commit",
      status: "cancelled",
    };

    const response = normalizeResult(result);

    expect(response.ok).toBe(false);
    expect(response.status).toBe("cancelled");
  });

  it("does not include result for non-success", () => {
    const result: ActionCallResult = {
      callId: "call_123",
      action: "arinova.kanban.add_commit",
      status: "error",
      result: { stale: true },
      error: { code: "TIMEOUT", message: "Timed out" },
    };

    const response = normalizeResult(result);

    expect(response.ok).toBe(false);
    expect(response.result).toBeUndefined();
  });
});

describe("shouldReportAsError", () => {
  it("returns false for success", () => {
    expect(
      shouldReportAsError({
        ok: true,
        status: "success",
        action: "test",
        callId: "c1",
      }),
    ).toBe(false);
  });

  it("returns true for error", () => {
    expect(
      shouldReportAsError({
        ok: false,
        status: "error",
        action: "test",
        callId: "c1",
      }),
    ).toBe(true);
  });

  it("returns true for requires_confirmation", () => {
    expect(
      shouldReportAsError({
        ok: false,
        status: "requires_confirmation",
        action: "test",
        callId: "c1",
      }),
    ).toBe(true);
  });
});
