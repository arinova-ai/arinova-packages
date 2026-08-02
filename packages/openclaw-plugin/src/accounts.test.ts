import { describe, expect, it } from "vitest";
import {
  listArinovaChatAccountIds,
  resolveArinovaChatAccount,
  resolveDefaultArinovaChatAccountId,
} from "./accounts.js";

describe("Arinova account resolution", () => {
  it("returns the default account when no named accounts exist", () => {
    expect(listArinovaChatAccountIds({})).toEqual(["default"]);
    expect(resolveDefaultArinovaChatAccountId({})).toBe("default");
  });

  it("normalizes named ids and merges top-level defaults without legacy secrets", () => {
    const cfg = {
      channels: {
        "openclaw-arinova-ai": {
          apiUrl: "https://api.test/",
          botToken: "base",
          accounts: {
            " Team Bot ": { botToken: " named ", enabled: true },
          },
        },
      },
    };
    expect(listArinovaChatAccountIds(cfg)).toEqual(["team-bot"]);
    expect(resolveArinovaChatAccount({ cfg, accountId: "TEAM BOT" })).toMatchObject({
      accountId: "team-bot",
      apiUrl: "https://api.test",
      botToken: "named",
      enabled: true,
    });
  });
});
