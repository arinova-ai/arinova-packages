/**
 * @arinova-ai/spaces-sdk — browser entry.
 *
 * Build apps on Arinova: OAuth-PKCE login, embedded-Space `connect()`, the
 * user's profile/agents, economy history, managed commerce/storage, and agent
 * chat — all with the user's OAuth token.
 *
 * Secret-bearing confidential token exchange lives in
 * `@arinova-ai/spaces-sdk/server` and is
 * intentionally NOT exported here so a client secret can never reach a browser.
 */
export { Arinova } from "./client.js";
export { ArinovaError } from "./http.js";
export { WagerApi } from "./resources.js";
export * from "./types.js";
