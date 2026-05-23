import { readFileSync, readdirSync } from "node:fs";
import { join, basename, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parse as parseToml } from "smol-toml";

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
};

type Dict = {
  meta: Meta;
  entries?: Entry[];
};

const VERSION_RE = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/;
const VALID_SEVERITIES = new Set(["block", "warn", "review", "allow"]);
const ENTRY_DISCRIMINATORS = ["key", "pattern", "pattern_stub", "domain"] as const;

function loadDict(file: string): Dict {
  const raw = readFileSync(join(DICT_DIR, file), "utf-8");
  return parseToml(raw) as unknown as Dict;
}

const dictFiles = readdirSync(DICT_DIR).filter((f) => extname(f) === ".toml").sort();

describe("moderation-baseline/dict — schema validation", () => {
  it("ships the expected 6 seed dict files", () => {
    expect(dictFiles).toEqual([
      "fraud_pattern.toml",
      "ip_keyword.toml",
      "minor_safety_zh.toml",
      "url_allow.toml",
      "url_deny.toml",
      "zh_celeb.toml",
    ]);
  });

  describe.each(dictFiles)("%s", (file) => {
    const stem = basename(file, ".toml");
    const dict = loadDict(file);

    it("parses as valid TOML", () => {
      expect(dict).toBeTypeOf("object");
    });

    it("has a [meta] block with list_name matching filename stem", () => {
      expect(dict.meta).toBeDefined();
      expect(dict.meta.list_name).toBe(stem);
    });

    it("has a semver-ish version pinned to 0.1.0-seed", () => {
      expect(dict.meta.version).toMatch(VERSION_RE);
      expect(dict.meta.version).toBe("0.1.0-seed");
    });

    it("entries (if present) is an array", () => {
      const entries = dict.entries ?? [];
      expect(Array.isArray(entries)).toBe(true);
    });

    const entries = dict.entries ?? [];
    if (entries.length > 0) {
      it.each(entries.map((e, i) => [i, e] as const))(
        "entry[%i] conforms to schema",
        (_i, entry) => {
          const discriminators = ENTRY_DISCRIMINATORS.filter(
            (k) => typeof entry[k] === "string" && (entry[k] as string).length > 0,
          );
          expect(discriminators).toHaveLength(1);

          if (entry.severity !== undefined) {
            expect(VALID_SEVERITIES.has(entry.severity)).toBe(true);
          }
          if (entry.applies !== undefined) {
            expect(Array.isArray(entry.applies)).toBe(true);
            for (const a of entry.applies) expect(typeof a).toBe("string");
          }
          if (entry.aliases !== undefined) {
            expect(Array.isArray(entry.aliases)).toBe(true);
            for (const a of entry.aliases) expect(typeof a).toBe("string");
          }
          if (entry.locale !== undefined) {
            expect(Array.isArray(entry.locale)).toBe(true);
            for (const a of entry.locale) expect(typeof a).toBe("string");
          }
          if (entry.category !== undefined) expect(typeof entry.category).toBe("string");
          if (entry.note !== undefined) expect(typeof entry.note).toBe("string");
        },
      );
    }
  });

  describe("AC3 — seed entry counts match Iris §8", () => {
    it("zh_celeb has 20 entries", () => {
      expect(loadDict("zh_celeb.toml").entries?.length).toBe(20);
    });
    it("ip_keyword has 17 entries (Iris §8.3 verbatim)", () => {
      expect(loadDict("ip_keyword.toml").entries?.length).toBe(17);
    });
    it("fraud_pattern has 10 regex entries", () => {
      expect(loadDict("fraud_pattern.toml").entries?.length).toBe(10);
    });
    it("url_allow has 6 domains", () => {
      expect(loadDict("url_allow.toml").entries?.length).toBe(6);
    });
    it("url_deny is empty (pull-only seed)", () => {
      expect(loadDict("url_deny.toml").entries ?? []).toEqual([]);
    });
    it("minor_safety_zh has 3 pattern-family stub entries (Iris §8.5 verbatim)", () => {
      expect(loadDict("minor_safety_zh.toml").entries?.length).toBe(3);
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
