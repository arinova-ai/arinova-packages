# @arinova-ai/openclaw-arinova-ai

## 0.0.74

### Patch Changes

- c44e963: Restore compatibility with OpenClaw 2026.7 plugin SDK subpaths, runtime config APIs, reply streaming behavior, channel manifest setup, and gateway lifecycle hooks. Legacy credential config keys (email/password/sessionToken) are now ignored: authentication is botToken-only, and configs still carrying the old keys keep loading.
- Updated dependencies [8bd0784]
- Updated dependencies [96bb770]
  - @arinova-ai/agent-sdk@0.1.0
