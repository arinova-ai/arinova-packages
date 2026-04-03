# @arinova-ai/spaces-sdk

SDK for building apps on Arinova — authentication, agent chat, and economy.

## Installation

```bash
npm install @arinova-ai/spaces-sdk
```

## Quick Start

### Embedded in Arinova Chat (iframe)

```js
import { Arinova } from "@arinova-ai/spaces-sdk";

const arinova = new Arinova({ appId: "your-client-id" });

// Automatically receives auth token from Arinova Chat via postMessage
const { user, accessToken, agents } = await arinova.connect();
console.log(user.name);    // "Ripple"
console.log(agents);       // User's agents available in this space
```

### Standalone (external website)

```js
const arinova = new Arinova({ appId: "your-client-id" });

// Opens popup for OAuth PKCE login
const token = await arinova.login();
console.log(token.user.name);
console.log(token.access_token);
```

## Setup

1. Register your app: `arinova-cli app create --name "My App" --redirect-uri "https://myapp.com"`
2. Copy the `Client ID` from the output
3. No `client_secret` needed — all apps use PKCE

## API Reference

### `new Arinova(config)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `appId` | `string` | *required* | Your OAuth app client_id |
| `endpoint` | `string` | `https://chat.arinova.ai` | Arinova server URL |
| `redirectUri` | `string` | `{origin}/callback` | OAuth callback URL |
| `scope` | `string` | `"profile"` | OAuth scope |

---

### Authentication

#### `arinova.connect(options?): Promise<ConnectResult>`

**Recommended for Spaces.** Auto-detects environment:
- **Inside iframe** (Arinova Chat): receives auth via postMessage from parent window
- **Outside iframe** (standalone): falls back to `login()` popup flow

```js
const { user, accessToken, agents } = await arinova.connect({ timeout: 10000 });
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | `number` | `5000` | Timeout in ms for postMessage (iframe mode) |

Returns: `{ user: { id, name, email, image }, accessToken: string, agents: Agent[] }`

#### `arinova.login(): Promise<TokenResponse>`

Opens a popup for OAuth PKCE authorization. Falls back to redirect if popup is blocked.

#### `arinova.handleCallback(): Promise<TokenResponse>`

Call on your redirect_uri page to complete the OAuth flow (redirect mode).

---

### Agent Chat

Chat with the user's AI agents. Supports streaming (SSE).

#### `POST /api/v1/agents/{agentId}/chat`

**Auth:** Bearer token (requires `agents` scope)

**Request Body:**

```json
{
  "agentId": "uuid",
  "prompt": "Hello!",
  "systemPrompt": "You are a brave adventurer's companion...",
  "messages": [
    { "role": "user", "content": "Let's go north" },
    { "role": "assistant", "content": "We arrived at the dark forest..." }
  ],
  "context": {
    "player": { "name": "Ripple", "level": 5, "hp": 120 },
    "location": { "name": "Village Square", "exits": ["north", "south"] },
    "inventory": ["Wooden Sword", "Health Potion x3"]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | `string` | Yes | The agent's UUID |
| `prompt` | `string` | No* | Single user message |
| `systemPrompt` | `string` | No | Overrides agent's default system prompt |
| `messages` | `Array<{role, content}>` | No* | Multi-turn conversation history |
| `context` | `object` | No | Game/app state, injected into system prompt as `[Context]` block |

*Either `prompt` or `messages` must be provided.

**Response:** Server-Sent Events (SSE)

```
data: {"type":"chunk","content":"Hello"}
data: {"type":"chunk","content":" there!"}
data: {"type":"done"}
```

**Usage Tips:**
- `systemPrompt` = stable character/role definition (doesn't change often)
- `context` = real-time app state (updated every request)
- `messages` = conversation history (accumulated by your app)

---

### Economy

#### `arinova.balance(): Promise<{ balance: number }>`

Get the current user's coin balance.

```js
const { balance } = await arinova.balance();
```

#### `arinova.purchase(productId, amount, description?): Promise<PurchaseResponse>`

Charge coins from the user's balance. Requires `economy` scope (via OAuth consent).

```js
const result = await arinova.purchase("health-potion", 50, "Bought Health Potion");
console.log(result.transactionId, result.newBalance);
```

#### `arinova.transactions(limit?, offset?): Promise<TransactionsResponse>`

Get the user's transaction history.

```js
const { transactions, total } = await arinova.transactions(20, 0);
```

---

## PKCE Flow

1. SDK generates `code_verifier` (random) and `code_challenge = BASE64URL(SHA256(code_verifier))`
2. User is redirected to Arinova with `code_challenge`
3. After authorization, Arinova redirects back with `code`
4. SDK exchanges `code` + `code_verifier` for `access_token` (no secret needed)

## redirect_uri Rules

- Origin match: scheme + host + port must match your registered URI
- Path can differ (SDK uses `window.location.origin + /callback` by default)
- Must use HTTPS in production
- `http://localhost` is allowed for development
