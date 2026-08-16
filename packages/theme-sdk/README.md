# @arinova-ai/theme-sdk

Build interactive visual themes for Arinova Office — the virtual workspace where AI agents live and work.

---

## Table of Contents

1. [What Is an Office Theme?](#1-what-is-an-office-theme)
2. [Quick Start](#2-quick-start)
3. [Theme Manifest (`theme.json`)](#3-theme-manifest-themejson)
4. [SDK API Reference](#4-sdk-api-reference)
5. [Lifecycle](#5-lifecycle)
6. [Styling & Assets under the Runtime CSP](#6-styling--assets-under-the-runtime-csp)
7. [Examples](#7-examples)
8. [Publishing Lifecycle](#8-publishing-lifecycle)
9. [Monetization & Licensing](#9-monetization--licensing)
10. [Versioning & Ownership](#10-versioning--ownership)
11. [TypeScript Types](#11-typescript-types)
12. [PostMessage Protocol](#12-postmessage-protocol)

---

## 1. What Is an Office Theme?

Every Arinova user has a **virtual office** — a personal workspace where their AI agents carry out tasks. An **Office Theme** is the visual layer of that room: the background, the characters, the animations, and how agent activity is rendered.

### How it works

```
┌─────────────────────────────────────────┐
│  Arinova Host App                        │
│  ┌────────────────────────────────────┐  │
│  │  Theme runtime iframe (sandboxed)  │  │
│  │  · host injects the bridge script  │  │
│  │  · your theme.js runs here         │  │
│  │  · bridge <-> host over postMessage│  │
│  └────────────────────────────────────┘  │
│  [Agent Panel]  [Chat]  [Settings]       │
└─────────────────────────────────────────┘
```

- Your theme runs inside a **sandboxed iframe** (`sandbox="allow-scripts"`, so its origin is opaque) served by the Arinova runtime.
- The runtime injects a **bridge script** that passes an immutable-view `sdk` object to your `init` function and speaks a secured `postMessage` protocol with the host.
- Through the SDK your theme receives **live agent data** and can **send actions** back to the host (select an agent, open a chat, navigate, bind/unbind agents to slots).
- Agents have real-time statuses — `working`, `idle`, `blocked`, `collaborating`, `unbound` — visualize them however you like.

> The bridge is injected for you. You do not include it — you only ship `theme.js` (and assets). `src/bridge.js` is the versioned reference used by local tooling and pinned as a complete-file digest so deployments can synchronize it without accepting prepended or appended code.

The JavaScript bridge is a runtime script, not an importable library entry:
loading it executes its iframe IIFE immediately. Tooling that needs the raw
script can resolve the exported `@arinova-ai/theme-sdk/bridge.js` subpath and
read the file.

### Key concepts

| Concept | Description |
|---|---|
| **Office** | A user's virtual workspace containing one or more AI agents |
| **Agent** | An AI entity that performs tasks — name, role, emoji, status, activity |
| **Theme** | A self-contained `theme.js` + assets package that renders the office scene |
| **Slot** | A position in the theme an agent can be bound to (`0 .. maxAgents-1`) |
| **Binding** | The mapping between a slot and a specific agent |

### Picture-in-Picture (PiP)

Users can shrink the office into a small floating window. Handle small viewports gracefully — subscribe to `sdk.onResize(cb)` to adapt your layout.

---

## 2. Quick Start

### Install the CLI

```bash
npm install -g @arinova-ai/cli
```

### Scaffold a theme

```bash
arinova theme init my-theme
cd my-theme
```

This creates:

```
my-theme/
├── theme.json     # manifest (id, name, version, author, preview, entry, …)
├── theme.js       # your entry point — export default { init(sdk, container) }
└── preview.png    # required preview image (replace with a real 16:9 screenshot)
```

Asset files (`png`, `jpg`, `svg`, `mp3`, `glb`, …) live **flat** next to `theme.js` — the runtime serves a single, flat filename namespace, so **no subdirectories**.

### Develop locally

```bash
arinova theme dev        # http://localhost:3100
```

The dev server serves the **real** SDK bridge and drives it over the real protocol with mock agent data, so behavior matches production (same API surface, `sdk.onResize` for resize, flat assets, string `currentTask`).

### Build & upload

```bash
arinova theme build                          # packages a flat <id>.zip
arinova theme upload theme.json my-theme.zip  # upload (creates a draft)
arinova theme publish my-theme                # publish once your review is approved
```

`upload` uploads a **draft** and runs an automated safety scan — see [Publishing Lifecycle](#8-publishing-lifecycle).

### Entry point

Your `theme.js` must `export default` an object with an `init` function:

```js
export default {
  init(sdk, container) {
    // sdk — the Arinova SDK (agent data, actions, environment)
    // container — the DOM element to render into
  },
};
```

The runtime calls **only** `init`. There are no `resize()` / `destroy()` hooks — subscribe to viewport changes via `sdk.onResize(cb)`.

---

## 3. Theme Manifest (`theme.json`)

```jsonc
{
  "id": "my-theme",                 // REQUIRED. kebab-case, ≤100 chars, globally unique & permanent
  "name": "My Theme",               // REQUIRED. 1–100 characters
  "version": "1.0.0",               // REQUIRED. semver X.Y.Z
  "entry": "theme.js",              // REQUIRED. must be "theme.js" (the runtime always loads theme.js)
  "preview": "preview.png",         // REQUIRED in the bundle. flat filename at the zip root
  "author": { "name": "You", "id": "your-creator-id" },
  "description": "A short description (≤ ~500 chars by convention).",
  "tags": ["cozy", "modern"],
  "license": "standard",            // "standard" | "exclusive" (default "standard")
  "price": 0,                       // integer points, ≥ 0. 0 or omitted = free
  "maxAgents": 6                    // slots the theme exposes; Binding.slotIndex runs 0..maxAgents-1
}
```

**Validation enforced on upload** (fail these and the upload is rejected):

| Field | Rule |
|---|---|
| `id` | matches `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`, ≤100 chars. Globally unique; permanently owned by the first author to claim it (re-uploading someone else's id → `403`). |
| `name` | 1–100 characters |
| `version` | semver `X.Y.Z` |
| `entry` / `preview` | relative, path-safe (no leading `/`, no `..`, no `:`); the preview must exist as a flat entry at the bundle root |
| `price` | integer ≥ 0 |
| bundle files | only allowed extensions: `png jpg jpeg webp gif svg glb gltf mp3 ogg wav json js css html` (no font files); images ≤ 10 MB, audio ≤ 5 MB, bundle ≤ 200 MB, `theme.json` ≤ 256 KB |

`maxAgents` is optional. If omitted, the server derives it from `zones` capacity, else defaults to `1`.

---

## 4. SDK API Reference

The `sdk` object is passed to your `init(sdk, container)`.

### Agent data (read-only)

| Member | Type | Description |
|---|---|---|
| `sdk.agents` | `Agent[]` | All agents in the office. Derive one with `sdk.agents[0]` or `sdk.agents.find(a => a.id === id)`. |
| `sdk.onAgentsChange(cb)` | `(cb: (agents: Agent[]) => void) => () => void` | Subscribe to agent updates. Returns an unsubscribe function. |

**Agent statuses:** `working` · `idle` · `blocked` · `collaborating` · `unbound`.

### Agent actions

| Method | Signature | Description |
|---|---|---|
| `sdk.selectAgent(agentId)` | `(agentId: string) => void` | Highlight an agent in the host UI |
| `sdk.openChat(agentId)` | `(agentId: string) => void` | Open the chat panel for an agent |
| `sdk.navigate(path)` | `(path: string) => void` | Navigate the host app to a route |

### Bindings

| Member | Type | Description |
|---|---|---|
| `sdk.connectedAgents` | `ConnectedAgent[]` | Agents available to be bound |
| `sdk.bindings` | `Binding[]` | Current slot-to-agent mappings |
| `sdk.bindAgent(slotIndex, agentId)` | `(number, string) => void` | Assign an agent to a slot |
| `sdk.unbindAgent(slotIndex)` | `(number) => void` | Clear a slot |
| `sdk.onBindingsChange(cb)` | `(cb) => () => void` | Subscribe to binding changes |
| `sdk.onConnectedAgentsChange(cb)` | `(cb) => () => void` | Subscribe to connected-agent changes |

### Assets

| Method | Signature | Description |
|---|---|---|
| `sdk.assetUrl(path)` | `(relativePath: string) => string` | Resolve a **flat** asset filename (e.g. `"bg.png"`) to a same-origin URL. Filenames are a single segment — no subdirectories. To load JSON: `fetch(sdk.assetUrl("data.json")).then(r => r.json())`. |
| `sdk.loadJSON(path)` | `<T>(relativePath: string) => Promise<T>` | Load and parse a JSON theme asset with SDK memoization, force-cache semantics, and a 15-second timeout. |
| `sdk.getAgent(id)` | `(id: string) => Agent \| undefined` | Find an office agent by id. |
| `sdk.agent` | `Agent \| null` | First office agent convenience accessor. |

### Environment & viewport

| Member | Type | Description |
|---|---|---|
| `sdk.width` / `sdk.height` | `number` | Current viewport size (px) |
| `sdk.onResize(cb)` | `(cb: (size: { width: number; height: number }) => void) => () => void` | Subscribe to viewport changes. **This is the only resize mechanism.** Returns unsubscribe. |
| `sdk.isMobile` | `boolean` | Whether the device is mobile |
| `sdk.pixelRatio` | `number` | Device pixel ratio |
| `sdk.user` | `User \| null` | Current user (`null` until the host `init` arrives) |
| `sdk.themeId` | `string` | This theme's id |
| `sdk.themeVersion` | `string` | Active theme manifest version supplied by the host |

---

## 5. Lifecycle

The runtime invokes **only** `init(sdk, container)`, once. There is **no** `resize()` or `destroy()` module hook — historic examples that exported them never ran in production.

- To react to viewport changes, subscribe with `sdk.onResize(cb)` inside `init`.
- Any cleanup you'd put in `destroy()` isn't needed: the whole iframe is torn down when the theme unloads.

```js
export default {
  init(sdk, container) {
    const stop = sdk.onResize(({ width, height }) => layout(width, height));
    // `stop()` unsubscribes if you ever need to.
  },
};
```

---

## 6. Styling & Assets under the Runtime CSP

The runtime enforces a strict Content-Security-Policy. It changes how you style and load things:

- **No author `<style>` blocks and no inline `style="…"` attributes** — `style-src` is nonce-based with no `unsafe-inline`, so both are dropped. **Set styles via the CSSOM instead**: `el.style.color = "#fff"` or `Object.assign(el.style, { … })`, and build DOM with `createElement`. (A constructable/adopted stylesheet also works.)
- **Images:** `img-src 'self' data: blob:` — bundle images as flat assets (`sdk.assetUrl`) or use `data:` / `blob:` URIs. Remote image hosts are blocked.
- **Fetch:** `connect-src 'self'` — you may `fetch(sdk.assetUrl(...))` for same-origin assets; cross-origin requests are blocked.
- **Fonts:** `font-src 'self'` **and** font files (`woff`, `woff2`, `ttf`, …) are **not** an allowed bundle extension, so custom fonts effectively can't be shipped. Use the system font stack (`system-ui`, …). (A base64 `data:` `@font-face` is the only theoretical path and is not recommended.)
- **Assets are a flat namespace:** `sdk.assetUrl("sprite.png")` resolves to a single filename — subdirectories 404. Keep every asset flat at the bundle root.

---

## 7. Examples

All examples are CSP-safe (CSSOM styling) and use the real SDK surface.

### Hello World — first agent's name & status

```js
export default {
  init(sdk, container) {
    const el = document.createElement("div");
    Object.assign(el.style, {
      display: "flex", alignItems: "center", justifyContent: "center",
      width: "100%", height: "100%",
      fontFamily: "system-ui, sans-serif", fontSize: "24px",
      color: "#fff", background: "#1a1a2e",
    });
    container.appendChild(el);

    function render() {
      const a = sdk.agents[0];
      el.textContent = a ? `${a.emoji} ${a.name} — ${a.status}` : "No agent";
    }

    render();
    sdk.onAgentsChange(render);
  },
};
```

### Single Agent — status card with task & context

```js
export default {
  init(sdk, container) {
    Object.assign(container.style, {
      background: "#0f172a", color: "#e2e8f0",
      fontFamily: "system-ui, sans-serif", height: "100%",
    });

    const card = document.createElement("div");
    Object.assign(card.style, {
      position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
      background: "#1e293b", borderRadius: "16px", padding: "32px",
      minWidth: "320px", textAlign: "center", cursor: "pointer",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    });
    container.appendChild(card);

    const emoji = mk("div", { fontSize: "48px", marginBottom: "8px" });
    const name = mk("div", { fontSize: "20px", fontWeight: "600" });
    const role = mk("div", { fontSize: "14px", color: "#94a3b8", marginTop: "4px" });
    const status = mk("div", { fontSize: "14px", marginTop: "16px" });
    const task = mk("div", { fontSize: "13px", color: "#94a3b8", marginTop: "16px" });
    const ctx = mk("div", { fontSize: "12px", color: "#64748b", marginTop: "8px" });
    card.append(emoji, name, role, status, task, ctx);

    const DOT = { working: "#22c55e", idle: "#eab308", blocked: "#ef4444" };

    function render() {
      const a = sdk.agents[0];
      if (!a) return;
      emoji.textContent = a.emoji;
      name.textContent = a.name;
      role.textContent = a.role;
      status.textContent = "● " + a.status;
      status.style.color = DOT[a.status] || "#94a3b8";
      task.textContent = a.currentTask || "";        // currentTask is a string
      ctx.textContent = a.tokenUsage?.contextPercent ? `Context: ${a.tokenUsage.contextPercent}` : "";
    }

    render();
    sdk.onAgentsChange(render);
    card.addEventListener("click", () => {
      const a = sdk.agents[0];
      if (a) sdk.openChat(a.id);
    });

    function mk(tag, style) {
      const node = document.createElement(tag);
      Object.assign(node.style, style);
      return node;
    }
  },
};
```

### Multi-Agent — slot grid with binding support

```js
export default {
  init(sdk, container) {
    const SLOT_COUNT = 6; // match your manifest `maxAgents`

    const grid = document.createElement("div");
    Object.assign(grid.style, {
      display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
      gap: "12px", padding: "16px", height: "100%", boxSizing: "border-box",
      background: "#111827", fontFamily: "system-ui, sans-serif",
    });
    container.appendChild(grid);

    function agentById(id) {
      return sdk.agents.find((a) => a.id === id);
    }

    function render() {
      grid.replaceChildren();
      for (let i = 0; i < SLOT_COUNT; i++) {
        const binding = sdk.bindings.find((b) => b.slotIndex === i);
        const slot = document.createElement("div");
        Object.assign(slot.style, {
          background: "#1f2937", borderRadius: "12px",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "16px", cursor: "pointer", color: "#e5e7eb",
          border: "2px solid transparent",
        });

        if (binding) {
          const agent = agentById(binding.agentId);
          if (agent) {
            slot.style.borderColor =
              agent.status === "working" ? "#22c55e" : agent.status === "blocked" ? "#ef4444" : "transparent";
            const emoji = document.createElement("div");
            emoji.style.fontSize = "32px";
            emoji.textContent = agent.emoji;
            const name = document.createElement("div");
            Object.assign(name.style, { fontSize: "14px", fontWeight: "600", marginTop: "8px" });
            name.textContent = agent.name;
            const info = document.createElement("div");
            Object.assign(info.style, { fontSize: "12px", color: "#9ca3af", marginTop: "4px" });
            info.textContent = `${agent.role} · ${agent.status}`;
            slot.append(emoji, name, info);
            slot.addEventListener("click", () => sdk.selectAgent(agent.id));
          } else {
            slot.textContent = binding.agentName || "Unknown";
          }
        } else {
          slot.textContent = "+ Empty Slot";
          slot.style.color = "#4b5563";
          const idx = i;
          slot.addEventListener("click", () => {
            const bound = new Set(sdk.bindings.map((b) => b.agentId));
            const free = sdk.connectedAgents.find((a) => !bound.has(a.id));
            if (free) sdk.bindAgent(idx, free.id);
          });
        }
        grid.append(slot);
      }
    }

    render();
    sdk.onAgentsChange(render);
    sdk.onBindingsChange(render);
    sdk.onConnectedAgentsChange(render);
    sdk.onResize(({ width }) => {
      grid.style.gridTemplateColumns = width < 480 ? "repeat(2, 1fr)" : "repeat(3, 1fr)";
    });
  },
};
```

---

## 8. Publishing Lifecycle

Uploading is **not** publishing. The flow:

1. **`arinova theme upload theme.json <id>.zip`** — stores your theme as a **draft** (`published = false`).
2. **Automated safety scan** — the server scans your `theme.js` (plus name/description). If it flags high risk, the upload is blocked as `pending_review` and returns HTTP `422 THEME_SAFETY_REVIEW_REQUIRED`; a human review is queued. A clean theme is recorded with `review_status = approved`.
3. **`arinova theme publish <id>`** — flips the theme to published. Only allowed once `review_status = approved` (otherwise `409`).

States: `draft` → (`pending_review`) → `approved` → `published`. Use `arinova theme unpublish <id>` to return to draft.

---

## 9. Monetization & Licensing

Set in `theme.json`:

- **`price`** — integer points, `≥ 0`. `0` or omitted = free.
- **`license`** — `"standard"` (default) or `"exclusive"`.

Marketplace rules to know:

- Buyers have a **1-hour refund window** after purchase.
- Creators earn a **revenue share** on each sale; a refund within the window **claws back** the corresponding share.
- A buyer who refunds a theme **cannot repurchase** it.

---

## 10. Versioning & Ownership

- **`id` is a permanent, globally-unique, author-owned handle.** The first author to upload an id owns it; anyone else uploading that id gets `403`.
- **`version` must be semver** and should increase across updates.
- **Re-uploading** the same id (yours) **overwrites in place**, **resets the theme to unpublished**, and **re-triggers the safety review**. Publish again after approval to make the update live.

---

## 11. TypeScript Types

Full definitions ship in [`src/types.d.ts`](./src/types.d.ts). Summary:

```ts
type AgentStatus = "working" | "idle" | "blocked" | "collaborating" | "unbound";

interface AgentActivity {
  time: string;                 // preformatted display string (NOT ISO)
  text: string;
}

interface AgentTokenUsage {
  contextPercent?: string;      // e.g. "42%"
}

interface Agent {
  id: string;
  name: string;
  role: string;
  emoji: string;
  color: string;                // CSS hex
  status: AgentStatus;
  online?: boolean;
  currentTask?: string;         // plain string title, or undefined when idle
  taskStartedAt?: number;       // epoch ms; elapsed = Date.now() - taskStartedAt
  recentActivity: AgentActivity[];
  model?: string;
  tokenUsage?: AgentTokenUsage;
}

interface User { id: string; name: string; username: string }
interface ConnectedAgent { id: string; name: string; avatarUrl?: string }
interface Binding { slotIndex: number; agentId: string; agentName?: string }
interface Size { width: number; height: number }

interface ArinovaSDK {
  readonly agents: Agent[];
  onAgentsChange(cb: (agents: Agent[]) => void): () => void;

  readonly connectedAgents: ConnectedAgent[];
  readonly bindings: Binding[];
  bindAgent(slotIndex: number, agentId: string): void;
  unbindAgent(slotIndex: number): void;
  onBindingsChange(cb: (bindings: Binding[]) => void): () => void;
  onConnectedAgentsChange(cb: (connectedAgents: ConnectedAgent[]) => void): () => void;

  assetUrl(relativePath: string): string;
  getAgent(id: string): Agent | undefined;
  loadJSON<T = unknown>(relativePath: string): Promise<T>;
  readonly agent: Agent | null;

  selectAgent(agentId: string): void;
  openChat(agentId: string): void;
  navigate(path: string): void;

  onResize(cb: (size: Size) => void): () => void;

  readonly width: number;
  readonly height: number;
  readonly isMobile: boolean;
  readonly pixelRatio: number;
  readonly user: User | null;
  readonly themeId: string;
  readonly themeVersion: string; // active manifest version
}

interface ThemeModule {
  init(sdk: ArinovaSDK, container: HTMLElement): void | Promise<void>;
  // No resize()/destroy() — the runtime never calls them. Use sdk.onResize().
}

interface ThemeManifest {
  id: string; name: string; version: string; entry: string;
  preview?: string; description?: string;
  author?: { name: string; id: string };
  tags?: string[];
  license?: "standard" | "exclusive";
  price?: number; renderer?: string; maxAgents?: number;
}
```

---

## 12. PostMessage Protocol

You normally never touch this — the bridge abstracts it. Every outbound message
carries `protocol: 1` and a per-iframe `bridgeToken`. During the protocol-1
rollout the bridge also accepts a versionless inbound message as version 1, but
rejects every unknown explicit version. It also rejects inbound messages whose
token, parent-window source, origin, type, or payload schema does not match.
`sdk.emit` and arbitrary custom events are not supported.

The `bridgeToken` prevents messages from crossing between sibling iframe
instances; it is not a secret from the theme itself and is not the theme's
security boundary. Containment comes from the host's sandboxed iframe and CSP,
plus strict source/origin validation. Preview rollouts may supply an explicit
origin allowlist while outbound messages remain pinned to the primary origin.

The host first waits for the bridge-level `ready` handshake. After `init` and
theme registration have both arrived (in either order), the bridge runs
`theme.init()` exactly once and awaits it. It then sends `theme:ready`; a
registration error, synchronous throw, rejected initialization promise, or
explicit `window.__ARINOVA_REPORT_THEME_ERROR__(stage, error)` sends one
sanitized `theme:error` instead.
If `init` never arrives, the bridge emits a `handshake` error after 12 seconds.

**Host → theme iframe** (each also includes `protocol: 1` and `bridgeToken`):

| Message | Payload |
|---|---|
| `init` | `{ type, user, themeId, themeVersion, isMobile, pixelRatio, agents, connectedAgents, bindings, width, height }` |
| `agents:update` | `{ type, agents }` |
| `bindings:update` | `{ type, bindings }` |
| `connectedAgents:update` | `{ type, connectedAgents }` |
| `resize` | `{ type, width, height }` |

**Theme iframe → host** (each also includes `protocol: 1` and `bridgeToken`):

| Message | Payload |
|---|---|
| `ready` | `{ type }` |
| `theme:ready` | `{ type }` — after `theme.init()` resolves |
| `theme:error` | `{ type, stage, message }` — sanitized initialization failure |
| `agent:select` | `{ type, agentId }` |
| `agent:openChat` | `{ type, agentId }` |
| `agent:bind` | `{ type, slotIndex, agentId }` |
| `agent:unbind` | `{ type, slotIndex }` |
| `navigate` | `{ type, path }` |

---

## License

See the root repository license.
