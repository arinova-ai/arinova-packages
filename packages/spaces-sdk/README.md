# @arinova-ai/spaces-sdk

Build apps on Arinova — OAuth-PKCE login, the user's agents, an in-app economy, and agent chat.

```bash
npm install @arinova-ai/spaces-sdk
```

## Two hosts

Arinova runs on two origins, and the SDK talks to both:

| | Host | Used for |
|---|---|---|
| **API** | `https://api.chat.arinova.ai` | `/oauth/token`, all `/api/v1/*` — the SDK's default `apiUrl` |
| **Consent UI** | `https://chat.arinova.ai` | the login/consent page — the SDK's default `authUrl` |

`GET api.chat.arinova.ai/oauth/authorize` 302-redirects to the consent page, so you always point the SDK at the **API** host and it handles the rest. (The old `chat.arinova.ai` default did not serve the API and 404'd.)

## Quick start

### Standalone (external website)

```js
import { Arinova } from "@arinova-ai/spaces-sdk";

const arinova = new Arinova({
  clientId: "my-app",                     // from `arinova app create`
  scopes: ["profile", "agents", "economy"],
});

// Popup PKCE login → resolves with a session
const session = await arinova.connect();  // or arinova.connect({ mode: "redirect" })
console.log(session.user.name, session.accessToken);

await arinova.economy.balance();          // { balance }
```

Redirect mode instead of a popup:

```js
await arinova.connect({ mode: "redirect" });   // navigates to Arinova
// …on your redirect_uri page:
const session = await new Arinova({ clientId: "my-app" }).handleCallback();
```

### Embedded Space (iframe inside Arinova Chat)

```js
const arinova = new Arinova({ clientId: "my-app" });
const { user, accessToken, agents } = await arinova.connect();  // auto-detects the iframe
```

Inside an iframe, `connect()` receives auth from the Arinova parent via `postMessage` — **validated against the `authUrl` origin** (a foreign embedder can't inject a token). To be embeddable, register a Space and give its iframe URL:

```bash
arinova space create --name "My Game" --url "https://mygame.example.com"
```

> A **Space** (embeddable, `space create --url`) and an **OAuth app** (`app create` → `client_id`) are separate things. The `client_id` is for standalone login; a Space is what makes your app appear inside Arinova. Embedded auth also requires your Space origin to be authorized by Arinova — see *Embedding* below.

### Server side (secrets — never in the browser)

Confidential token exchange lives in a **separate entry** so a `clientSecret` can't reach a browser bundle:

```js
import { ArinovaServer } from "@arinova-ai/spaces-sdk/server";

const server = new ArinovaServer({ clientId: "my-app", clientSecret: process.env.ARINOVA_SECRET });
const session = await server.exchangeCode({ code, redirectUri });
```

## API reference

### `new Arinova(config)` — browser client

| Option | Type | Default |
|---|---|---|
| `clientId` | `string` | **required** |
| `apiUrl` | `string` | `https://api.chat.arinova.ai` |
| `authUrl` | `string` | `https://chat.arinova.ai` |
| `redirectUri` | `string` | `${location.origin}/callback` |
| `scopes` | `ArinovaScope[]` | `["profile"]` |

**Auth**

- `connect(options?)` → `Promise<ArinovaSession>` — one entry point. In an iframe: origin-validated `postMessage` auth. Standalone: PKCE popup (`mode:"popup"`, default) or `mode:"redirect"`. Rejects with a clear error on timeout / unauthorized origin / empty token.
- `login(options?)` → popup resolves with a session; `mode:"redirect"` navigates away.
- `handleCallback()` → `Promise<ArinovaSession>` — call on your `redirectUri` page (redirect mode).
- `session` (getter) · `accessToken` (getter) · `logout()`.

**Resources** (use the session's token automatically)

| Call | Scope | Returns |
|---|---|---|
| `user.profile()` | `profile` | `ArinovaUser` |
| `user.agents()` | `agents` | `AgentInfo[]` |
| `economy.balance()` | `economy` | `{ balance }` |
| `economy.purchase({ spaceId, productId?, amount, description?, idempotencyKey? })` | `economy` | `{ transactionId, newBalance, spaceId, creatorShare, idempotentReplay }` |
| `economy.transactions({ limit?, offset? })` | `economy` | `{ transactions, total, limit, offset }` |
| `agent.chat({ agentId, prompt?\|messages?, systemPrompt?, context? })` | `agents` | `{ response, agentId }` |
| `agent.chatStream(params)` | `agents` | `AsyncGenerator<AgentChatEvent>` |

```js
for await (const ev of arinova.agent.chatStream({ agentId, prompt: "Hi" })) {
  if (ev.type === "chunk") process.stdout.write(ev.content);
  if (ev.type === "done") console.log("\n[done]");
}
```

### `new ArinovaServer(config)` — `@arinova-ai/spaces-sdk/server`

`{ clientId, clientSecret, apiUrl? }`. `exchangeCode({ code, redirectUri, codeVerifier? })` performs a confidential authorization-code exchange. App-secret wallet mutation endpoints have been retired.

## Scopes

Space-separated on the wire; pass an array to the SDK. Recognized: `profile`, `email`, `agents`, `economy`. Economy and agent calls return `403 insufficient_scope` without `economy` / `agents` — request them up front:

```js
new Arinova({ clientId: "my-app", scopes: ["profile", "agents", "economy"] });
```

## Registration

- **OAuth app** (standalone login): `arinova app create --name "My App" --redirect-uri "https://myapp.com/callback"` → prints your `Client ID`. `--redirect-uri` is required; its **origin** must match your callback (path may differ). No `client_secret` for CLI-created apps — they are public/PKCE.
- **Space** (embeddable): run `arinova space create --name "My App" --url "https://myapp.com"` to make it embeddable, then `arinova space publish <id>` to list it.

## Embedding

Packaged Spaces run in a sandboxed opaque-origin iframe. The host injects a one-time `bridgeToken` into the runtime URL and binds the iframe through an authenticated ready handshake before it sends `arinova:auth`; the SDK also verifies that auth comes from the expected parent window and Arinova host.

**Requesting permissions inside a Space.** Embedded sessions start with only `profile`. Ask separately for `agents` or `economy`; Arinova shows the user a consent prompt and, on approval, re-issues the session with the requested scope:

```js
const session = await arinova.connect(); // embedded session (profile)
await arinova.requestScope("economy");   // prompts the user; resolves with an economy-scoped session
await arinova.economy.purchase({
  spaceId: session.spaceId,
  amount: 50,
  idempotencyKey: crypto.randomUUID(),
});
```

`requestScope()` rejects immediately when the host denies the request. If its
timeout expires, a later approval cannot resolve that already-rejected call;
call `requestScope()` again to observe a subsequent approval.

## PKCE flow

1. The SDK generates a `code_verifier` and `code_challenge = BASE64URL(SHA-256(verifier))` (S256 — the only method Arinova accepts).
2. It opens `apiUrl/oauth/authorize?...` (popup or redirect); Arinova shows the consent page on the frontend host.
3. After approval, Arinova returns to your `redirectUri` with `?code=...&state=...`.
4. The SDK exchanges `code` + `code_verifier` at `apiUrl/oauth/token` (JSON) for the access token — no secret needed.

## redirect_uri rules

- The registered URI's **origin** (scheme + host + port) must match the `redirectUri` you use (public/PKCE clients match by origin; confidential clients match exactly).
- Use HTTPS in production; the token is scoped to your app.

## License

See the root repository license.
