# moderation-baseline

Self-built moderation denylists / allowlists used by `BaselineKeyword` and
`BaselineUrlList` providers in `apps/rust-server/src/services/moderation/`.

Canonical source-of-truth: Iris Note `75dce085` v4 §8 +
card `SKILLS-PKG-MODERATION-BASELINE-DICT-SEED` Iris comments
(`e6b2f80f` / `a3f5abfa` / `4dbf16be`) on 2026-05-23.

## Ownership

- Seed: Iris (Research Specialist, 2026-05-23 spike output)
- Extension during impl + maintenance: Hank (Coding Engineer — Infra, Package lane)
- Per-file maintenance: see `[meta].maintained_by` block in each file

## Update process

1. Routine extension: PR to this directory; Iris reviews schema, Casey reviews
   semantic correctness, Linda merges.
2. Sensitive lists (`minor_safety_zh`): triple-sign gate (Iris + Casey + Linda) +
   private submodule with restricted commit ACL — see follow-up card
   `SKILLS-PKG-MODERATION-BASELINE-MINOR-SAFETY-ZH` (`749cee53`).
3. Automation: `.github/workflows/update-moderation-url-deny.yml` runs
   `pnpm --filter @arinova-ai/moderation-baseline update:url-deny` daily and
   opens a review PR when the bounded Block List Project snapshot changes.
   The updater validates domains, protects `url_allow.toml` entries, requires
   the expected count from every feed, and atomically replaces the file.

## Hot reload

`BaselineKeyword` / `BaselineUrlList` providers (in `apps/rust-server`) watch
mtime of `dict/*.toml` and rebuild internal tries on change. No service restart
needed. File writes MUST use write-temp + rename atomic pattern to avoid
partial-write parser crashes.

## Matching normalization

Consumers normalize keys, aliases, and candidate text to Unicode NFC and then
lowercase them before matching. Entries with non-ASCII spellings should include
an ASCII alias when one is commonly used (for example, `Pokémon` also ships
`Pokemon`). Pattern entries are TOML literal strings so regex backslashes cannot
turn into control characters during parsing. The `applies` field is optional:
when omitted, the Rust consumer applies the entry to every Tier-1 action input
(`image_gen.input`, `voice_tts.input`, `web_search.input`). When declared, the
schema permits only these closed targets: `image_gen.input`, `voice_tts.input`,
`web_search.input`, `web_search.output`, and `username.input`.

## Audit

Every dict hit is logged per Web PRD §7.5 audit module.
Retention: 90 days (per Linda 2026-05-23 verdict; Web PRD §15 Q11).

## File inventory

| File | Source | Severity gate |
|---|---|---|
| `dict/zh_celeb.toml`         | Iris seed §8.2; Wikipedia category diff extension | block |
| `dict/ip_keyword.toml`       | Iris seed §8.3; press kits + JPO trademark DB     | block / warn |
| `dict/fraud_pattern.toml`    | 165 NPA + 中國反詐中心 monthly                    | block |
| `dict/minor_safety_zh.toml`  | Iris seed §8.5 — 3 pattern-family stubs only (triple-sign gate); full enumeration in private submodule | block / review |
| `dict/url_deny.toml`         | Daily bounded Block List Project ransomware + scam snapshot | block |
| `dict/url_allow.toml`        | Curated whitelist (Wikipedia / GitHub / .gov / arxiv etc) | allow |

## `minor_safety_zh` special handling

`dict/minor_safety_zh.toml` is gated by a triple-sign process (Iris + Casey +
Linda must all ACK on the owning Kanban card before edits land). The file is
intentionally limited to **pattern-family regex stubs** only — three entries,
each carrying `family` / `pattern_stub` / `category` / `severity` / `audit`.

Explicit term enumeration (synonyms, keyword lists, alias arrays, example
phrases) MUST NOT appear in this file. Casey's static-grep AC3 is enforced
both as a manual review and via the schema test suite
(`tests/schema.test.ts` → "AC3 — minor_safety_zh.toml triple-sign gate").

Full term enumeration lives in a **private submodule** with restricted ACL
(Iris + Casey + Linda + Hank); Linda owns ACL setup via the legal review path
(INHOPE / IWF source access via ripple0129 → legal). Coordinate via card
`SKILLS-PKG-MODERATION-MINOR-SAFETY-ZH` (`749cee53`) and the follow-up card
opened once legal access is established.

The `audit` field on each entry indicates expected log severity in the
moderation pipeline (hard-flag → full audit log + Linda escalation; soft-flag
→ human moderation review). Pipeline-side consumption of `audit` is tracked
in card `SKILLS-MODERATION-PIPELINE` (`71b36eea`).
