---
"@arinova-ai/agent-sdk": minor
---

Harden authenticated WebSocket ordering, reconnect and connect cancellation state, task scheduling boundaries, action results, REST request failures, URL encoding, and offline stream recovery. Type changes for strict-TS consumers: `TaskContext.content` is now `string | undefined` and `TokenClaimedData.agentId` is `string | null` (both reflect actual runtime behavior).
