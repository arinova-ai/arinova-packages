import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeBotToken } from "./auth.js";

afterEach(() => vi.unstubAllGlobals());

describe("exchangeBotToken", () => {
  it("pairs with the bot token and optional endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      agentId: "agent-1", name: "Bot",
    }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(exchangeBotToken({
      apiUrl: "https://api.chat.arinova.ai",
      botToken: "ari_token",
      a2aEndpoint: "https://agent.test/a2a",
    })).resolves.toEqual({ agentId: "agent-1", name: "Bot" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.chat.arinova.ai/api/agents/pair", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ botToken: "ari_token", a2aEndpoint: "https://agent.test/a2a" }),
      signal: expect.any(AbortSignal),
    }));
  });

  it("reports bounded pairing errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid", { status: 401 })));
    await expect(exchangeBotToken({ apiUrl: "https://api.chat.arinova.ai", botToken: "bad" }))
      .rejects.toThrow("Pairing code exchange failed (401): invalid");
  });

  it("rejects an untrusted URL before exposing the bot token to fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(exchangeBotToken({
      apiUrl: "https://attacker.example",
      botToken: "ari_secret",
    })).rejects.toThrow("official Arinova API host");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
