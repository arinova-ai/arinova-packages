# @arinova-ai/agent-sdk

## 0.2.0

### Minor Changes

- 4a0ebd3: Route OpenClaw CLI commands through typed agent SDK methods, bound list results by default, and remove the retired wiki and unsupported card-archive commands. Add typed reply, bounded board-list, and board-unarchive REST helpers to the agent SDK.

### Patch Changes

- 6964b9d: Split WebSocket connection binding, authentication retry, outbound buffering, and fair task scheduling into focused modules while preserving the `ArinovaAgent` API. Export the runtime and aggregate board result type contracts from the package entry point.

## 0.1.0

### Minor Changes

- 8bd0784: **Breaking:** removed `ArinovaAgent.shareNote()` and the `ShareNoteResult` type. The method posted to `/api/v1/notes/{noteId}/share`, a route that has never existed on the Arinova server, so every call failed with a 404. Note sharing into a conversation is being restored on the session-authenticated web surface; an agent-facing equivalent needs its own permission model and will ship as a new method when that exists.
- 96bb770: Harden authenticated WebSocket ordering, reconnect and connect cancellation state, task scheduling boundaries, action results, REST request failures, URL encoding, and offline stream recovery. Type changes for strict-TS consumers: `TaskContext.content` is now `string | undefined` and `TokenClaimedData.agentId` is `string | null` (both reflect actual runtime behavior).
