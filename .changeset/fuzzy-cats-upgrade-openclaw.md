---
"@arinova-ai/openclaw-arinova-ai": patch
---

Restore compatibility with OpenClaw 2026.7 plugin SDK subpaths, runtime config APIs, reply streaming behavior, channel manifest setup, and gateway lifecycle hooks. Legacy credential config keys (email/password/sessionToken) are now ignored: authentication is botToken-only, and configs still carrying the old keys keep loading.
