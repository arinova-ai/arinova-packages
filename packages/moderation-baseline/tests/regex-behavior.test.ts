import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseToml } from "smol-toml";

const DICT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "dict");

type Entry = { key?: string; pattern?: string; pattern_stub?: string; aliases?: string[]; family?: string; except?: string[] };
const entries = (file: string): Entry[] => (parseToml(readFileSync(join(DICT_DIR, file), "utf8")).entries ?? []) as Entry[];

/**
 * Mirrors the consumer's `except` semantics: every listed safe word is removed
 * from the text before the entry's term or pattern is applied, so `bitchute`
 * stays usable while `bitchboy` is still blocked.
 */
const applyExcept = (value: string, entry: Entry): string =>
  (entry.except ?? []).reduce((text, safe) => text.split(safe).join(""), value);

const entryBlocks = (entry: Entry, value: string): boolean => {
  const text = applyExcept(value, entry);
  if (entry.key) {
    return text.includes(entry.key) || (entry.aliases ?? []).some((alias) => text.includes(alias));
  }
  return new RegExp((entry.pattern ?? entry.pattern_stub)!, "iu").test(text);
};

const FIXTURES = new Map<string, { match: string; reject: string }>([
  ["代收驗證碼", { match: "請幫忙代收驗證碼", reject: "請勿分享密碼" }],
  ["你的(包裹|快遞).*(滯留|海關|簽收)", { match: "你的包裹在海關滯留", reject: "你的包裹已送達" }],
  ["(銀聯|銀行卡).*(凍結|異常|盜刷)", { match: "銀行卡出現盜刷異常", reject: "銀行卡申請完成" }],
  ["ATM.*(操作|解除|設定)", { match: "請到ATM操作解除", reject: "ATM位置查詢" }],
  ["(刑事局|地檢署|警察局).*(傳喚|偵辦|涉嫌)", { match: "地檢署通知涉嫌案件", reject: "警察局地址" }],
  ["(健保署|衛福部).*(個資|外洩|健保卡)", { match: "健保署通知個資外洩", reject: "衛福部新聞" }],
  ["(投資|股票|虛擬貨幣).*(老師|穩賺|內線)", { match: "虛擬貨幣老師保證穩賺", reject: "股票風險很高" }],
  ["(交友|戀愛).*(匯款|借錢|急用)", { match: "交友對象急用要借錢", reject: "交友活動報名" }],
  ["(中獎|抽中|得獎).*(手續費|稅金|匯款)", { match: "中獎先付手續費", reject: "中獎公告" }],
  ["(蝦皮|momo|PChome).*(訂單錯誤|分期付款|改設定)", { match: "蝦皮訂單錯誤請改設定", reject: "momo訂單已出貨" }],
  ["(幾歲|小學|國中|未成年).*(裸|脫|私處|親密)", { match: "國中學生要求裸照", reject: "國中學生參加校隊" }],
  ["(別告訴|秘密|不要跟|爸爸媽媽不知道).*(line|微信|私訊|聯絡)", { match: "別告訴爸爸媽媽，私訊聯絡", reject: "爸爸媽媽知道學校聯絡方式" }],
  ["(傳|拍|給我看).*(學校|制服|放學後)", { match: "拍給我看你的制服", reject: "學校制服尺寸表" }],
  ["(^|[^a-z])admin", { match: "admin_team", reject: "badminton" }],
  ["(^|[^a-z])moderator", { match: "moderator_1", reject: "model_user" }],
  ["(^|[^a-z])official", { match: "official_news", reject: "office_user" }],
  ["(^|[^a-z])support", { match: "support_1", reject: "sport_user" }],
  ["(^|[^a-z])system", { match: "system_1", reject: "systematic" }],
  ["(^|[^a-z])staff([^a-z]|$)", { match: "staff_1", reject: "staffan" }],
  ["(^|[^a-z])security", { match: "security_team", reject: "secure_user" }],
  ["(^|[^a-z])helpdesk", { match: "helpdesk_1", reject: "helper" }],
  ["(^|[^a-z])webmaster", { match: "webmaster_1", reject: "website" }],
  ["(^|[^a-z])postmaster", { match: "postmaster_1", reject: "poster" }],
  ["(^|[^a-z])root([^a-z]|$)", { match: "root_1", reject: "rootbeer" }],
  ["(^|[^a-z])superuser", { match: "superuser_1", reject: "superman" }],
  ["(^|[^a-z])verif", { match: "verified_user", reject: "very_good" }],
  ["(^|[^a-z])shit", { match: "shit_user", reject: "shiitake" }],
  ["(^|[^a-z])whore", { match: "whore_1", reject: "shoreline" }],
  ["(^|[^a-z])slut", { match: "slut_1", reject: "salute" }],
  ["(^|[^a-z])rape([^a-z]|$)", { match: "rape_1", reject: "grapefruit" }],
  ["(^|[^a-z])rapist([^a-z]|$)", { match: "rapist_1", reject: "therapist" }],
  ["(^|[^a-z])anal([^a-z]|$)", { match: "anal_1", reject: "analyst" }],
  ["(^|[^a-z])sex([^a-z]|$)", { match: "sex_1", reject: "sussex" }],
  ["(^|[^a-z])cock([^a-z]|$)", { match: "cock_1", reject: "peacock" }],
  ["(^|[^a-z])dick([^a-z]|$)", { match: "dick_1", reject: "dickens" }],
  ["(^|[^a-z])cum([^a-z]|$)", { match: "cum_1", reject: "cucumber" }],
  ["(^|[^a-z])vagina", { match: "vagina_1", reject: "vanilla" }],
  ["(^|[^a-z])nazi([^a-z]|$)", { match: "nazi_1", reject: "nazir" }],
  ["(^|[^a-z])jiba([^a-z]|$)", { match: "jiba_1", reject: "jibade" }],
]);

describe("moderation regex behavior", () => {
  it("compiles every pattern without hidden control characters and exercises both outcomes", () => {
    const patterned = [
      ...entries("fraud_pattern.toml"),
      ...entries("minor_safety_zh.toml"),
      ...entries("username_guard.toml"),
    ].filter((entry) => entry.pattern || entry.pattern_stub);
    expect(patterned).toHaveLength(FIXTURES.size);
    for (const entry of patterned) {
      const pattern = entry.pattern ?? entry.pattern_stub!;
      expect(pattern).not.toMatch(/[\u0000-\u001f\u007f]/);
      const fixture = FIXTURES.get(pattern);
      expect(fixture, `missing behavior fixture for ${pattern}`).toBeDefined();
      expect(entryBlocks(entry, fixture!.match), `${pattern} should match ${fixture!.match}`).toBe(true);
      expect(entryBlocks(entry, fixture!.reject), `${pattern} should reject ${fixture!.reject}`).toBe(false);
    }
  });

  it("keeps documented innocent usernames usable across key and pattern entries", () => {
    const guards = entries("username_guard.toml");
    const blocked = (value: string) => guards.some((entry) => entryBlocks(entry, value));
    for (const safe of [
      "scunthorpe", "bitchute", "penistone", "systematic", "systemic", "ecosystem", "therapist",
      "grapefruit", "analyst", "sussex", "peacock", "dickens", "cucumber", "shiitake", "staffan",
      "rootbeer", "nazir",
    ]) {
      expect(blocked(safe), `${safe} must remain usable`).toBe(false);
    }
  });

  it("blocks compound handles that a trailing token bound used to let through", () => {
    const guards = entries("username_guard.toml");
    const blocked = (value: string) => guards.some((entry) => entryBlocks(entry, value));
    for (const handle of ["cuntface", "bitchboy", "penishead", "systemadmin", "systemsupport"]) {
      expect(blocked(handle), `${handle} must be blocked`).toBe(true);
    }
  });

  it("blocks except-guarded terms that a bare prefix used to hide", () => {
    const guards = entries("username_guard.toml");
    const blocked = (value: string) => guards.some((entry) => entryBlocks(entry, value));
    // An except word frees only its own occurrence, and substring matching
    // leaves no room for a prefix to smuggle the term past a leading bound.
    for (const handle of ["scunthorpecunt", "xxcunt", "mybitch", "hispenis"]) {
      expect(blocked(handle), `${handle} must be blocked`).toBe(true);
    }
  });

  it("matches CJK minor-safety families without relying on ASCII word boundaries", () => {
    const [family] = entries("minor_safety_zh.toml");
    expect(new RegExp(family!.pattern_stub!, "u").test("這位國中生傳裸照")).toBe(true);
    expect(new RegExp(family!.pattern_stub!, "u").test("這位國中生參加社團")).toBe(false);
  });
});
