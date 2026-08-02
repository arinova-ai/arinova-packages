import { readFileSync, readdirSync } from "node:fs";
import { join, basename, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parse as parseToml } from "smol-toml";
import { ENTRIES_PER_SOURCE, SOURCES } from "../scripts/url-deny-lib.mjs";

const DICT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "dict");

type Meta = {
  list_name: string;
  version: string;
  last_updated?: string;
  maintained_by?: string;
  review_cadence?: string;
  source_refs?: string[];
};

type Entry = {
  key?: string;
  pattern?: string;
  pattern_stub?: string;
  domain?: string;
  family?: string;
  aliases?: string[];
  locale?: string[];
  category?: string;
  severity?: string;
  applies?: string[];
  audit?: string;
  note?: string;
  source_ref?: number;
};

type Dict = {
  meta: Meta;
  entries?: Entry[];
};

const VERSION_RE = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/;
const VALID_SEVERITIES = new Set(["block", "warn", "review", "allow"]);
const VALID_APPLIES = new Set([
  "image_gen.input", "voice_tts.input", "web_search.input", "web_search.output", "username.input",
]);
const VALID_CATEGORIES = new Set([
  "academic", "atm-fraud", "bank-fraud", "brand-impersonation", "celebrity-impersonation", "code",
  "copyrighted-character", "csam-prompt-attempt", "dev-qa", "ecommerce-fraud", "encyclopedia",
  "grooming-script", "hate-symbol", "impersonation-authority", "impersonation-gov", "investment-fraud",
  "lottery-fraud", "material-request", "medical-official", "parcel-fraud", "phishing", "profanity-en",
  "profanity-zh", "public-figure", "ransomware-host", "reserved-handle", "romance-fraud", "scam-host",
]);
const VALID_REVIEW_CADENCES = new Set(["daily", "monthly", "quarterly"]);
const ENTRY_DISCRIMINATORS = ["key", "pattern", "pattern_stub", "domain"] as const;

function loadDict(file: string): Dict {
  const raw = readFileSync(join(DICT_DIR, file), "utf-8");
  return parseToml(raw) as unknown as Dict;
}

const dictFiles = readdirSync(DICT_DIR).filter((f) => extname(f) === ".toml").sort();

describe("moderation-baseline/dict — schema validation", () => {
  it("ships the expected 7 seed dict files", () => {
    expect(dictFiles).toEqual([
      "fraud_pattern.toml",
      "ip_keyword.toml",
      "minor_safety_zh.toml",
      "url_allow.toml",
      "url_deny.toml",
      "username_guard.toml",
      "zh_celeb.toml",
    ]);
  });

  describe.each(dictFiles)("%s", (file) => {
    const stem = basename(file, ".toml");

    it("parses as valid TOML", () => {
      const dict = loadDict(file);
      expect(dict).toBeTypeOf("object");
    });

    it("has a [meta] block with list_name matching filename stem", () => {
      const dict = loadDict(file);
      expect(dict.meta).toBeDefined();
      expect(dict.meta.list_name).toBe(stem);
      // Dict versions are semver-ish strings maintained per-list; they are
      // deliberately NOT pinned to package.json's version — a changeset bump
      // of the package must not invalidate every shipped dictionary.
      expect(dict.meta.version).toBeTypeOf("string");
      expect(dict.meta.version).toMatch(VERSION_RE);
      expect(VALID_REVIEW_CADENCES.has(dict.meta.review_cadence ?? "")).toBe(true);
      expect(dict.meta.last_updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${dict.meta.last_updated}T00:00:00Z`).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it("entries conform to the closed schema", () => {
      const dict = loadDict(file);
      const entries = dict.entries ?? [];
      expect(Array.isArray(entries)).toBe(true);
      for (const entry of entries) {
        const discriminators = ENTRY_DISCRIMINATORS.filter(
          (key) => typeof entry[key] === "string" && (entry[key] as string).length > 0,
        );
        expect(discriminators).toHaveLength(1);
        expect(VALID_SEVERITIES.has(entry.severity ?? "")).toBe(true);
        expect(VALID_CATEGORIES.has(entry.category ?? "")).toBe(true);
        // `applies` is OPTIONAL. When omitted, the Rust consumer
        // (arinova-chat apps/rust-server moderation/dict.rs) applies the
        // entry to every Tier-1 action input: image_gen.input,
        // voice_tts.input, and web_search.input. Entries that do declare
        // it must use the closed vocabulary and be non-empty.
        if (entry.applies !== undefined) {
          expect(Array.isArray(entry.applies)).toBe(true);
          expect(entry.applies.length).toBeGreaterThan(0);
          for (const applies of entry.applies) expect(VALID_APPLIES.has(applies)).toBe(true);
        }
        for (const alias of entry.aliases ?? []) expect(alias).toBeTypeOf("string");
        for (const locale of entry.locale ?? []) expect(locale).toBeTypeOf("string");
        if (entry.audit !== undefined) expect(entry.audit).toBeTypeOf("string");
        if (entry.note !== undefined) expect(entry.note).toBeTypeOf("string");
        if (entry.source_ref !== undefined) {
          expect(Number.isInteger(entry.source_ref)).toBe(true);
          expect(entry.source_ref).toBeGreaterThanOrEqual(0);
          expect(entry.source_ref).toBeLessThan(dict.meta.source_refs?.length ?? 0);
        }
      }
    });
  });

  it("has no duplicate discriminators or normalized key/alias collisions across dictionaries", () => {
    const discriminators = new Map<string, string>();
    const names = new Map<string, string>();
    const normalize = (value: string) => value.normalize("NFC").toLocaleLowerCase("en-US");
    for (const file of dictFiles) {
      for (const [index, entry] of (loadDict(file).entries ?? []).entries()) {
        const discriminator = ENTRY_DISCRIMINATORS.find((key) => typeof entry[key] === "string")!;
        const value = entry[discriminator] as string;
        const identity = `${discriminator}:${normalize(value)}`;
        expect(discriminators.has(identity), `${identity} duplicates ${discriminators.get(identity)}`).toBe(false);
        discriminators.set(identity, `${file}:${index}`);
        if (entry.key) {
          for (const name of [entry.key, ...(entry.aliases ?? [])]) {
            const normalized = normalize(name);
            expect(names.has(normalized), `${name} collides with ${names.get(normalized)}`).toBe(false);
            names.set(normalized, `${file}:${index}`);
          }
        }
      }
    }
  });

  describe("AC3 — seed entry counts match Iris §8", () => {
    it("zh_celeb has 20 entries", () => {
      expect(loadDict("zh_celeb.toml").entries?.length).toBe(20);
    });
    it("ip_keyword has 17 entries (Iris §8.3 verbatim)", () => {
      const entries = loadDict("ip_keyword.toml").entries ?? [];
      expect(entries).toHaveLength(17);
      expect(entries.find((entry) => entry.key === "超人")?.severity).toBe("warn");
      expect(entries.find((entry) => entry.key === "寶可夢")?.aliases).toContain("Pokemon");
    });
    it("fraud_pattern has 10 regex entries", () => {
      expect(loadDict("fraud_pattern.toml").entries?.length).toBe(10);
    });
    it("url_allow has 6 domains", () => {
      expect(loadDict("url_allow.toml").entries?.length).toBe(6);
    });
    it("url_deny ships a bounded, non-empty generated baseline", () => {
      const entries = loadDict("url_deny.toml").entries ?? [];
      const allowDomains = new Set(
        (loadDict("url_allow.toml").entries ?? []).map((entry) => entry.domain),
      );
      expect(entries).toHaveLength(ENTRIES_PER_SOURCE * SOURCES.length);
      expect(new Set(entries.map((entry) => entry.domain)).size).toBe(entries.length);
      for (const entry of entries) {
        expect(entry.domain).toMatch(/^[a-z0-9][a-z0-9.-]*\.[a-z0-9-]+$/);
        for (const allowed of allowDomains) {
          expect(entry.domain === allowed || entry.domain?.endsWith(`.${allowed}`)).toBe(false);
        }
        expect(entry.severity).toBe("block");
        expect(entry.applies).toEqual(["web_search.output"]);
        // Rust consumer contract: audit_note must carry the feed URL.
        expect(entry.audit).toMatch(/^source=https:\/\//);
        expect(entry.audit).toContain("https://raw.githubusercontent.com/");
        expect(entry.source_ref).toBeTypeOf("number");
      }
    });
    it("minor_safety_zh has 3 pattern-family stub entries (Iris §8.5 verbatim)", () => {
      expect(loadDict("minor_safety_zh.toml").entries?.length).toBe(3);
    });
    it("username_guard seeds reserved/profanity/celebrity coverage", () => {
      const dict = loadDict("username_guard.toml");
      expect(dict.entries?.length).toBeGreaterThanOrEqual(40);
      for (const entry of dict.entries ?? []) {
        expect(entry.severity).toBe("block");
        expect(entry.applies).toEqual(["username.input"]);
      }
      expect(dict.entries?.find((entry) => entry.key === "hitler")?.category).toBe("hate-symbol");
      expect(dict.entries?.find((entry) => entry.pattern?.includes("nazi"))?.category).toBe("hate-symbol");
    });
  });

  describe("AC3 — minor_safety_zh.toml triple-sign gate (Casey static-grep)", () => {
    const dict = loadDict("minor_safety_zh.toml");
    const entries = dict.entries ?? [];
    const ALLOWED_ENTRY_FIELDS = new Set([
      "family",
      "pattern_stub",
      "category",
      "severity",
      "applies",
      "audit",
    ]);
    const FORBIDDEN_ENUMERATION_FIELDS = [
      "terms",
      "keywords",
      "aliases",
      "examples",
      "phrases",
      "synonyms",
      "key",
      "pattern",
      "domain",
    ];

    it("contains exactly the three approved Iris §8.5 families", () => {
      expect(entries.map((e) => e.family)).toEqual([
        "age-marker + sexual-context",
        "grooming-script-private-contact",
        "material-request-targeting-minor",
      ]);
    });

    it.each(entries.map((e, i) => [i, e] as const))(
      "entry[%i] uses only approved fields (no explicit term enumeration)",
      (_i, entry) => {
        for (const k of Object.keys(entry)) {
          expect(ALLOWED_ENTRY_FIELDS.has(k)).toBe(true);
        }
      },
    );

    it("every block family carries a non-empty audit directive", () => {
      for (const entry of entries.filter((candidate) => candidate.severity === "block")) {
        expect(entry.audit?.trim()).toBeTruthy();
      }
    });

    it.each(FORBIDDEN_ENUMERATION_FIELDS)(
      "no entry carries forbidden enumeration field %s",
      (field) => {
        for (const entry of entries) {
          expect(entry).not.toHaveProperty(field);
        }
      },
    );

    it("raw file contains no `aliases = [` / `keywords = [` / `terms = [` markers", () => {
      const raw = readFileSync(join(DICT_DIR, "minor_safety_zh.toml"), "utf-8");
      for (const marker of ["aliases", "keywords", "terms", "examples", "phrases", "synonyms"]) {
        expect(raw).not.toMatch(new RegExp(`\\b${marker}\\s*=\\s*\\[`));
      }
    });
  });
});
