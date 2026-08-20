# @arinova-ai/spaces-sdk

Build standalone Arinova OAuth apps and packaged managed Spaces with typed
profile, Agent, economy, commerce, inventory, storage, and bridge APIs.

```bash
npm install @arinova-ai/spaces-sdk
```

## Hosts and security boundaries

| Host | Default | Purpose |
|---|---|---|
| API | `https://api.chat.arinova.ai` | `/oauth/*` and `/api/v1/*` |
| Consent UI | `https://chat.arinova.ai` | Login, consent, and managed-Space parent |

`Arinova` keeps user access tokens in memory. The browser entry exports no
client-secret or direct-debit API. Confidential code exchange is isolated in
`@arinova-ai/spaces-sdk/server`.

## Standalone OAuth app

Create an app with an explicit redirect URI:

```bash
arinova app create \
  --name "My App" \
  --redirect-uri "https://myapp.example/oauth/callback"
```

Then use PKCE from the browser:

```ts
import { Arinova } from "@arinova-ai/spaces-sdk";

const arinova = new Arinova({
  clientId: "my-app-client-id",
  scopes: ["profile", "agents", "economy"],
});

const session = await arinova.connect();
console.log(session.user.name);
console.log(await arinova.economy.balance());
```

`connect()` defaults to a popup outside an iframe. Redirect mode navigates to
Arinova and must be completed on the registered callback:

```ts
await arinova.connect({ mode: "redirect" });

// On the redirect URI:
const session = await new Arinova({ clientId: "my-app-client-id" }).handleCallback();
```

## Packaged managed Space

A managed Space is a ZIP bundle, not an external iframe URL. Its OAuth Client
ID and root `space.json` `id` must match exactly. The Space resource ID is a
separate UUID used in Creator Console, CLI arguments, and API paths.

```bash
arinova space create --name "My Game"
arinova space init my-game
cd my-game
# Replace the placeholder id in space.json with the OAuth Client ID.
arinova space build
arinova space version create <space-id> --bundle dist/my-game-1.0.0.zip
arinova space version preview <space-id> <version-id>
arinova space version publish <space-id> <version-id>
```

Inside the managed iframe, `connect()` automatically waits for the host's
authenticated bridge message:

```ts
const arinova = new Arinova({ clientId: "my-game-oauth" });
const session = await arinova.connect();

await arinova.requestScope("economy");
const catalog = await arinova.commerce.products();
const inventory = await arinova.commerce.inventory();
```

The server injects `arinova:ready`; application code must not send it. The SDK
checks the exact parent window, Arinova parent origin, fragment-bound
`bridgeToken`, and protocol version. `requestScope()` sends that token and
`protocolVersion: 1` back to the host. Only one `commerce.requestPurchase()` may be
pending per client.

## Managed commerce

The retired `economy.purchase()` endpoint is intentionally absent. A Space
cannot choose a price or directly debit a player. Request a native host
confirmation instead:

```ts
const result = await arinova.commerce.requestPurchase("coins.small");
if (result.status === "purchased") {
  console.log(result.grantId, result.quantity);
}
```

Inventory is server-authoritative:

```ts
await arinova.commerce.consume("coins.small", {
  quantity: 1,
  idempotencyKey: crypto.randomUUID(),
});
```

`consume()` validates product keys, a whole quantity from 1 through 100,000,
and a 1–128-character visible-ASCII idempotency key before sending. The server
returns the remaining quantity and an idempotent replay flag.

## Managed wager buy-ins

Games request each buy-in through the native Arinova confirmation surface. The
host, not the iframe, loads the authoritative session limits and creates the
idempotency key:

```ts
const result = await arinova.wager.requestBuyIn(
  "11111111-1111-4111-8111-111111111111",
  500,
);
if (result.status === "accepted") console.log(result.stakeId);
```

The SDK accepts only a result from the configured parent origin, exact parent
window, fragment-bound bridge token, session ID, and protocol version. Only one
wager buy-in may be pending per client.

## Per-user Space storage

Storage is convenient save data, not trusted inventory or entitlement state:

```ts
const usage = await arinova.storage.list();
await arinova.storage.set("save/primary", { level: 3 });
const save = await arinova.storage.get<{ level: number }>("save/primary");
await arinova.storage.delete("save/primary");

console.log(usage.usedBytes, usage.quotaBytes, save.value.level);
```

The namespace exposes server `SPACE_STORAGE_*` errors unchanged through
`ArinovaError.code`.

## CSP and declared API origins

Managed Spaces execute with an opaque origin. CSP `connect-src 'self'` does
not match the Arinova API from that iframe. Put the API origin and every other
network origin used by the app in `space.json`:

```json
{
  "id": "my-game-oauth",
  "version": "1.0.0",
  "entry": "index.html",
  "declaredApiOrigins": ["https://api.chat.arinova.ai"],
  "requestedScopes": ["profile", "economy"]
}
```

Origins must be unique bare HTTPS origins, without paths, queries, fragments,
or credentials. The server still applies CORS and bundle safety scanning.

## API reference

### `new Arinova(config)`

| Option | Type | Default |
|---|---|---|
| `clientId` | `string` | required |
| `apiUrl` | `string` | `https://api.chat.arinova.ai` |
| `authUrl` | `string` | `https://chat.arinova.ai` |
| `redirectUri` | `string` | `${location.origin}/callback` |
| `scopes` | `ArinovaScope[]` | `["profile"]` |

Auth:

- `connect(options?)`
- `login(options?)`
- `handleCallback()`
- `requestScope(scope, options?)` for embedded `agents` or `economy`
- `session`, `accessToken`, and `logout()`

Resources use the current token automatically:

| Call | Scope/context |
|---|---|
| `user.profile()` | `profile` |
| `user.agents()` | `agents` |
| `economy.balance()` | `economy` |
| `economy.transactions({ limit?, offset? })` | `economy` |
| `agent.chat(params)` / `agent.chatStream(params)` | `agents` |
| `commerce.products()` | Space-bound session |
| `commerce.inventory()` | Space-bound session |
| `commerce.consume(productKey, params)` | Space-bound session |
| `commerce.requestPurchase(productKey)` | Embedded Space bridge |
| `wager.requestBuyIn(sessionId, amountPoints)` | Embedded Space bridge |
| `storage.list/get/set/delete` | Space-bound session |

Embedded manifests may request only `profile`, `agents`, and `economy`, and
must include `profile`. Standalone OAuth apps may also request `email` where
supported. Resource calls accept a final `{ signal, timeoutMs, retries }`.

Failures are `ArinovaError` instances with stable `status` and `code`,
including server codes such as `SPACE_INVENTORY_INSUFFICIENT` and transport
codes such as `timeout`, `aborted`, `network_error`, `protocol_mismatch`, and
`purchase_timeout`.

### Server entry

```ts
import { ArinovaServer } from "@arinova-ai/spaces-sdk/server";

const server = new ArinovaServer({
  clientId: "my-confidential-app",
  clientSecret: process.env.ARINOVA_SECRET!,
});

await server.exchangeCode({ code, redirectUri, codeVerifier });
```

`ArinovaServer` exposes confidential authorization-code exchange only. Never
put its client secret in a browser or Space bundle.

## License

See the root repository license.
