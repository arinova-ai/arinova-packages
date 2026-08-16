import { describe, expect, it } from "vitest";
import { assertTrustedApiRequestUrl, normalizeTrustedApiUrl } from "./api-endpoint.js";

describe("credential-bearing Arinova endpoints", () => {
  it.each([
    "https://api.chat.arinova.ai",
    "https://api.chat-staging.arinova.ai/",
  ])("accepts trusted API base %s", (value) => {
    expect(normalizeTrustedApiUrl(value)).toMatch(/^https:\/\/api\.chat/);
  });

  it.each([
    "http://api.chat.arinova.ai",
    "https://evil.example",
    "https://127.0.0.1",
    "https://api.chat.arinova.ai:8443",
    "https://user@api.chat.arinova.ai",
    "https://api.chat.arinova.ai/path",
  ])("rejects untrusted base %s", (value) => {
    expect(() => normalizeTrustedApiUrl(value)).toThrow();
  });

  it("allows paths only after validating the request origin", () => {
    expect(assertTrustedApiRequestUrl(
      "https://api.chat.arinova.ai/api/v1/notes?limit=50",
    ).pathname).toBe("/api/v1/notes");
    expect(() => assertTrustedApiRequestUrl(
      "https://attacker.example/api/v1/notes",
    )).toThrow("official Arinova API host");
  });
});
