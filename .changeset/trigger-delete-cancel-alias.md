---
"@arinova-ai/cli": patch
---

Keep `arinova trigger delete <id>` working after the legacy DELETE endpoint retires
by routing it through the trigger cancel endpoint. Print a deprecation warning to
stderr directing users to `arinova trigger cancel`.
