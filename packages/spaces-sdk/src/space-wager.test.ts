import { afterEach, describe, expect, it, vi } from "vitest";
import { ArinovaServer } from "./server.js";

const SPACE_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function serviceToken(accessToken = "wager-service-1"): Response {
  return jsonResponse({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    scope: "wager",
    space_id: SPACE_ID,
  });
}

function session(status = "open"): Response {
  return jsonResponse({
    id: SESSION_ID,
    spaceId: SPACE_ID,
    spaceVersionId: VERSION_ID,
    status,
    minBuyInPoints: 100,
    maxBuyInPoints: 1_000,
    rakeBps: 250,
    potPoints: 500,
    expiresAt: "2026-08-23T00:00:00Z",
  });
}

function server(): ArinovaServer {
  return new ArinovaServer({
    clientId: "app-1",
    clientSecret: "secret-1",
    apiUrl: "https://api.test/",
  });
}

afterEach(() => vi.restoreAllMocks());

describe("SpaceWagerApi", () => {
  it("opens and reads sessions with one cached wager token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(serviceToken())
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(session());
    const wager = server().wager;

    await expect(wager.open({
      spaceId: SPACE_ID.toUpperCase(),
      spaceVersionId: VERSION_ID.toUpperCase(),
      minBuyInPoints: 100,
      maxBuyInPoints: 1_000,
      rakeBps: 250,
      expiresAt: new Date("2026-08-23T00:00:00Z"),
    })).resolves.toMatchObject({ id: SESSION_ID });
    await expect(wager.get({ spaceId: SPACE_ID, sessionId: SESSION_ID }))
      .resolves.toMatchObject({ status: "open" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.test/oauth/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: "app-1",
          client_secret: "secret-1",
          scope: "wager",
          space_id: SPACE_ID,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.test/api/v1/wager/sessions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer wager-service-1" }),
        body: JSON.stringify({
          spaceVersionId: VERSION_ID,
          minBuyInPoints: 100,
          maxBuyInPoints: 1_000,
          rakeBps: 250,
          expiresAt: "2026-08-23T00:00:00.000Z",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `https://api.test/api/v1/wager/sessions/${SESSION_ID}`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock.mock.calls[2]![1]).not.toHaveProperty("body");
  });

  it("wraps heartbeat, lock, settlement, and cancellation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(serviceToken())
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(session("locked"))
      .mockResolvedValueOnce(jsonResponse({ settlementId: VERSION_ID, replayed: false }))
      .mockResolvedValueOnce(jsonResponse({ status: "voided", refundedPoints: 500 }));
    const wager = server().wager;
    const target = { spaceId: SPACE_ID, sessionId: SESSION_ID };

    await wager.heartbeat({ ...target, expiresAt: "2026-08-23T01:00:00Z" });
    await wager.lock(target);
    await wager.settle({
      ...target,
      sequenceNo: 1,
      isFinal: true,
      expectedTotalStakePoints: 500,
      payouts: [{ userId: "user-1", payoutPoints: 490 }],
      rakePoints: 10,
    });
    await expect(wager.cancel(target)).resolves.toEqual({
      status: "voided",
      refundedPoints: 500,
    });

    expect(fetchMock.mock.calls.slice(1).map(([url]) => String(url))).toEqual([
      `https://api.test/api/v1/wager/sessions/${SESSION_ID}/heartbeat`,
      `https://api.test/api/v1/wager/sessions/${SESSION_ID}/lock`,
      `https://api.test/api/v1/wager/sessions/${SESSION_ID}/settle`,
      `https://api.test/api/v1/wager/sessions/${SESSION_ID}/cancel`,
    ]);
    expect(fetchMock.mock.calls[3]![1]).toMatchObject({
      body: JSON.stringify({
        sequenceNo: 1,
        isFinal: true,
        expectedTotalStakePoints: 500,
        payouts: [{ userId: "user-1", payoutPoints: 490 }],
        rakePoints: 10,
      }),
    });
  });

  it.each([
    [{ spaceId: "bad", spaceVersionId: VERSION_ID, minBuyInPoints: 1, maxBuyInPoints: 2 }, "invalid_space_id"],
    [{ spaceId: SPACE_ID, spaceVersionId: "bad", minBuyInPoints: 1, maxBuyInPoints: 2 }, "invalid_space_version_id"],
    [{ spaceId: SPACE_ID, spaceVersionId: VERSION_ID, minBuyInPoints: 0, maxBuyInPoints: 2 }, "invalid_min_buy_in_points"],
    [{ spaceId: SPACE_ID, spaceVersionId: VERSION_ID, minBuyInPoints: 2, maxBuyInPoints: 1 }, "invalid_max_buy_in_points"],
    [{ spaceId: SPACE_ID, spaceVersionId: VERSION_ID, minBuyInPoints: 1, maxBuyInPoints: 2, rakeBps: 501 }, "invalid_rake_bps"],
    [{ spaceId: SPACE_ID, spaceVersionId: VERSION_ID, minBuyInPoints: 1, maxBuyInPoints: 2, expiresAt: "not-a-date" }, "invalid_expires_at"],
  ])("rejects invalid open input before fetching: %j", async (params, code) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(server().wager.open(params)).rejects.toMatchObject({ code });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed or duplicate settlement payouts before fetching", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(server().wager.settle({
      spaceId: SPACE_ID,
      sessionId: SESSION_ID,
      sequenceNo: 1,
      isFinal: false,
      expectedTotalStakePoints: 100,
      payouts: [
        { userId: "user-1", payoutPoints: 50 },
        { userId: "user-1", payoutPoints: 50 },
      ],
      rakePoints: 0,
    })).rejects.toMatchObject({ code: "invalid_payouts" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
