# @arinova-ai/agent-sdk

## 0.1.0

### Minor Changes

- 8bd0784: **Breaking:** removed `ArinovaAgent.shareNote()` and the `ShareNoteResult` type. The method posted to `/api/v1/notes/{noteId}/share`, a route that has never existed on the Arinova server, so every call failed with a 404. Note sharing into a conversation is being restored on the session-authenticated web surface; an agent-facing equivalent needs its own permission model and will ship as a new method when that exists.
- 96bb770: Harden authenticated WebSocket ordering, reconnect and connect cancellation state, task scheduling boundaries, action results, REST request failures, URL encoding, and offline stream recovery. Type changes for strict-TS consumers: `TaskContext.content` is now `string | undefined` and `TokenClaimedData.agentId` is `string | null` (both reflect actual runtime behavior).
