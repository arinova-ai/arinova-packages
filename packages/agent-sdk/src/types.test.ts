import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  ActionCallOptions,
  ActionCallResult,
  TaskAttachment,
  TaskContext,
  UploadResult,
} from "./index.js";

describe("agent SDK type contracts", () => {
  it("supports action call context and file-reference arguments", () => {
    const options = {
      callId: "call-1",
      taskId: "task-1",
      conversationId: "conv-1",
      messageId: "msg-1",
      parentCallId: "parent-1",
      reason: "Attach generated file to card",
      metadata: { source: "agent-sdk-test" },
      dryRun: true,
      timeoutMs: 15_000,
    } satisfies ActionCallOptions;
    const args = {
      cardId: "card-1",
      file: {
        fileId: "file-1",
        url: "https://cdn.example.test/file.png",
        fileName: "file.png",
      },
    } satisfies Record<string, unknown>;

    expect(options.messageId).toBe("msg-1");
    expect(args.file).toEqual({
      fileId: "file-1",
      url: "https://cdn.example.test/file.png",
      fileName: "file.png",
    });
  });

  it("models action success, error, and confirmation results", () => {
    const success = {
      callId: "call-1",
      action: "arinova.message.send",
      status: "success",
      result: { messageId: "msg-1" },
      traceId: "trace-1",
      actionVersion: "1.0.0",
      dryRun: false,
    } satisfies ActionCallResult;
    const failure = {
      callId: "call-2",
      action: "arinova.message.send",
      status: "error",
      error: {
        code: "VALIDATION_ERROR",
        message: "content is required",
        details: { field: "content" },
      },
    } satisfies ActionCallResult;
    const confirmation = {
      callId: "call-3",
      action: "arinova.wiki.update_page",
      status: "requires_confirmation",
      confirmation: {
        confirmationId: "confirm-1",
        title: "Update page",
        summary: "Replace page content",
        expiresAt: "2026-06-10T00:00:00Z",
      },
    } satisfies ActionCallResult;

    expect(success.result?.messageId).toBe("msg-1");
    expect(failure.error?.details).toEqual({ field: "content" });
    expect(confirmation.confirmation?.confirmationId).toBe("confirm-1");
  });

  it("exposes upload metadata and inbound attachment shapes", () => {
    const upload = {
      url: "https://cdn.example.test/report.pdf",
      fileName: "report.pdf",
      fileType: "application/pdf",
      fileSize: 2048,
    } satisfies UploadResult;
    const attachment = {
      id: "att-1",
      fileName: upload.fileName,
      fileType: upload.fileType,
      fileSize: upload.fileSize,
      url: upload.url,
    } satisfies TaskAttachment;

    expect(attachment).toEqual({
      id: "att-1",
      fileName: "report.pdf",
      fileType: "application/pdf",
      fileSize: 2048,
      url: "https://cdn.example.test/report.pdf",
    });
    expectTypeOf<UploadResult>().toMatchTypeOf<{
      url: string;
      fileName: string;
      fileType: string;
      fileSize: number;
    }>();
  });

  it("keeps TaskContext upload and action helpers aligned with exported result types", () => {
    expectTypeOf<TaskContext["uploadFile"]>().returns.resolves.toEqualTypeOf<UploadResult>();
    expectTypeOf<TaskContext["callAction"]>().parameters.toEqualTypeOf<[
      string,
      Record<string, unknown>,
      (
        Omit<ActionCallOptions, "taskId" | "conversationId" | "messageId">
        | undefined
      )?,
    ]>();
    expectTypeOf<TaskContext["callAction"]>().returns.resolves.toEqualTypeOf<ActionCallResult>();
  });
});
