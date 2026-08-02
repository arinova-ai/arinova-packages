---
"@arinova-ai/agent-sdk": minor
---

**Breaking:** removed `ArinovaAgent.shareNote()` and the `ShareNoteResult` type. The method posted to `/api/v1/notes/{noteId}/share`, a route that has never existed on the Arinova server, so every call failed with a 404. Note sharing into a conversation is being restored on the session-authenticated web surface; an agent-facing equivalent needs its own permission model and will ship as a new method when that exists.
