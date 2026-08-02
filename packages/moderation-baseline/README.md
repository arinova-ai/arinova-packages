# @arinova-ai/moderation-baseline

Maintained moderation dictionaries and the deterministic URL denylist updater
used by Arinova services. Schema, normalization, ownership, and sensitive-list
review rules are documented in [`dict/README.md`](./dict/README.md).

Run `pnpm test` to compile and behavior-check every regex and dictionary entry.
Run `pnpm update:url-deny` to refresh the generated URL snapshot from its pinned
HTTPS feeds; unchanged entry sets leave the file and `last_updated` untouched.
