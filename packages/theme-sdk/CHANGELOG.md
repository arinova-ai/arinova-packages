# @arinova-ai/theme-sdk

## 0.2.1

### Patch Changes

- 1c96b21: Harden credential-bearing endpoints, inbound group authorization, office event forwarding, and theme asset loading. The deprecated `HookEvent` and `HookEventType` aliases are removed; use `InternalEvent` and `InternalEventType`.

## 0.2.0

### Minor Changes

- d16cce6: Harden the iframe bridge trust boundary, add protocol-versioned envelopes and handshake diagnostics, enforce flat asset containment, and expose host-owned SDK state through read-only runtime accessors. Outbound messages fan out across the parent-origin allowlist until the first validated inbound message pins the real origin; a late init recovers a handshake timeout; leading-slash flat asset paths stay supported; loadJSON always rejects instead of throwing synchronously; resize preserves a host-declared isMobile.
