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
3. Automation: cron jobs in `.github/workflows/` pull external feeds (165, abuse.ch,
   blocklistproject, hagezi); diff PR auto-opened daily.

## Hot reload

`BaselineKeyword` / `BaselineUrlList` providers (in `apps/rust-server`) watch
mtime of `dict/*.toml` and rebuild internal tries on change. No service restart
needed. File writes MUST use write-temp + rename atomic pattern to avoid
partial-write parser crashes.

## Audit

Every dict hit is logged per Web PRD §7.5 audit module.
Retention: 90 days (per Linda 2026-05-23 verdict; Web PRD §15 Q11).

## File inventory

| File | Source | Severity gate |
|---|---|---|
| `dict/zh_celeb.toml`         | Iris seed §8.2; Wikipedia category diff extension | block |
| `dict/ip_keyword.toml`       | Iris seed §8.3; press kits + JPO trademark DB     | block / warn |
| `dict/fraud_pattern.toml`    | 165 NPA + 中國反詐中心 monthly                    | block |
| `dict/minor_safety_zh.toml`  | TRIPLE-SIGN GATE — private submodule (separate card) | block / review |
| `dict/url_deny.toml`         | Daily cron (abuse.ch + blocklistproject + hagezi) | block |
| `dict/url_allow.toml`        | Curated whitelist (Wikipedia / GitHub / .gov / arxiv etc) | allow |
