# @arinova-ai/spaces-sdk

## 0.5.0

### Minor Changes

- 2ee0d47: Add confidential Managed Space LLM and wager-session helpers with scoped service-token caching, typed lifecycle responses, input validation, and one-time token refresh.

## 0.4.0

### Minor Changes

- d39c28b: Add the managed Space bundle workflow to the CLI and expose commerce, purchase bridge, inventory, and storage APIs in the Spaces SDK. The contracts align with arinova-chat server commit `bf339484156c6f47c440b6690cf1d10bebad8698`.
- bc45694: Add a strictly origin-bound managed wager buy-in bridge and typed `wager.requestBuyIn()` API.

### Patch Changes

- 118a2c1: Split embedded connection handling, OAuth-PKCE lifecycle, and authenticated resource calls out of the browser client facade while preserving its public API and authentication behavior.

## 0.3.0

### Minor Changes

- 6016a90: Harden PKCE and embedded authentication, add stable SDK error codes and request cancellation/deadline/retry options, and ensure streaming resources are released when consumers stop early.
