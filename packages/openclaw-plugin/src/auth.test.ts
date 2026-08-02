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
      apiUrl: "https://api.test",
      botToken: "ari_token",
      a2aEndpoint: "https://agent.test/a2a",
    })).resolves.toEqual({ agentId: "agent-1", name: "Bot" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/api/agents/pair", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ botToken: "ari_token", a2aEndpoint: "https://agent.test/a2a" }),
    }));
  });

  it("reports bounded pairing errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid", { status: 401 })));
    await expect(exchangeBotToken({ apiUrl: "https://api.test", botToken: "bad" }))
      .rejects.toThrow("Pairing code exchange failed (401): invalid");
  });
});
