import { describe, expect, it } from "vitest";
import {
  looksLikeArinovaChatTargetId,
  normalizeArinovaChatMessagingTarget,
} from "./normalize.js";

describe("normalizeArinovaChatMessagingTarget", () => {
  it("normalizes bare ids into the plugin-prefixed target form", () => {
    expect(normalizeArinovaChatMessagingTarget(" Conv-ABC ")).toBe(
      "openclaw-arinova-ai:conv-abc",
    );
  });

  it("accepts arinova and plugin prefixes without double-prefixing", () => {
    expect(normalizeArinovaChatMessagingTarget("arinova:Conv-1")).toBe(
      "openclaw-arinova-ai:conv-1",
    );
    expect(normalizeArinovaChatMessagingTarget("openclaw-arinova-ai:Conv-2")).toBe(
      "openclaw-arinova-ai:conv-2",
    );
  });

  it("returns undefined for empty targets", () => {
    expect(normalizeArinovaChatMessagingTarget("   ")).toBeUndefined();
    expect(normalizeArinovaChatMessagingTarget("arinova: ")).toBeUndefined();
  });
});

describe("looksLikeArinovaChatTargetId", () => {
  it("recognizes prefixed targets and UUID conversation ids", () => {
    expect(looksLikeArinovaChatTargetId("arinova:conv-1")).toBe(true);
    expect(looksLikeArinovaChatTargetId("openclaw-arinova-ai:conv-1")).toBe(true);
    expect(looksLikeArinovaChatTargetId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rejects empty and unrelated targets", () => {
    expect(looksLikeArinovaChatTargetId("")).toBe(false);
    expect(looksLikeArinovaChatTargetId("slack:general")).toBe(false);
    expect(looksLikeArinovaChatTargetId("not-a-uuid")).toBe(false);
  });
});
