# @arinova-ai/openclaw-arinova-ai

## 0.1.0

### Minor Changes

- 1c96b21: Harden credential-bearing endpoints, inbound group authorization, office event forwarding, and theme asset loading. The deprecated `HookEvent` and `HookEventType` aliases are removed; use `InternalEvent` and `InternalEventType`.
- 4a0ebd3: Route OpenClaw CLI commands through typed agent SDK methods, bound list results by default, and remove the retired wiki and unsupported card-archive commands. Add typed reply, bounded board-list, and board-unarchive REST helpers to the agent SDK.

### Patch Changes

- Updated dependencies [6964b9d]
- Updated dependencies [4a0ebd3]
  - @arinova-ai/agent-sdk@0.2.0

## 0.0.74

### Patch Changes

- c44e963: Restore compatibility with OpenClaw 2026.7 plugin SDK subpaths, runtime config APIs, reply streaming behavior, channel manifest setup, and gateway lifecycle hooks. Legacy credential config keys (email/password/sessionToken) are now ignored: authentication is botToken-only, and configs still carrying the old keys keep loading.
- Updated dependencies [8bd0784]
- Updated dependencies [96bb770]
  - @arinova-ai/agent-sdk@0.1.0
