---
"@arinova-ai/theme-sdk": minor
---

Harden the iframe bridge trust boundary, add protocol-versioned envelopes and handshake diagnostics, enforce flat asset containment, and expose host-owned SDK state through read-only runtime accessors. Outbound messages fan out across the parent-origin allowlist until the first validated inbound message pins the real origin; a late init recovers a handshake timeout; leading-slash flat asset paths stay supported; loadJSON always rejects instead of throwing synchronously; resize preserves a host-declared isMobile.
