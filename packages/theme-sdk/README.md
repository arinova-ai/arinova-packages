# @arinova-ai/theme-sdk

Build interactive visual themes for Arinova Office — the virtual workspace where AI agents live and work.

---

## Table of Contents

1. [What Is an Office Theme?](#1-what-is-an-office-theme)
2. [What Does a Theme Look Like?](#2-what-does-a-theme-look-like)
3. [Quick Start](#3-quick-start)
4. [SDK API Reference](#4-sdk-api-reference)
5. [TypeScript Types](#5-typescript-types)
6. [Examples](#6-examples)

---

## 1. What Is an Office Theme?

Every Arinova user has a **virtual office** — a personal workspace where their AI agents carry out tasks. Think of it as a digital room you can peek into and watch your agents work in real time.

An **Office Theme** is the visual layer of that room. It controls what the office looks like — the background, the characters, the animations, and how agent activity is rendered on screen. Themes are entirely customizable: you could build a cozy studio with pixel art characters, a futuristic command center with holographic dashboards, or a serene garden where agents meditate between tasks.

### How it works

```
┌─────────────────────────────────────────┐
│  Arinova Host App                       │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  Theme iframe                     │  │
│  │                                   │  │
│  │  Your theme code runs here.       │  │
│  │  The SDK bridges data between     │  │
│  │  the host and your theme.         │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  [Agent Panel]  [Chat]  [Settings]      │
└─────────────────────────────────────────┘
```

- Your theme runs inside a **sandboxed iframe** embedded in the Arinova host app.
- The host injects a **bridge script** (`bridge.js`) that gives your code access to an `sdk` object.
- Through the SDK, your theme receives **live agent data** (who's online, what they're doing, their status) and can **send actions** back to the host (open a chat, select an agent, navigate).
- Agents have real-time statuses — `idle`, `working`, `blocked`, `collaborating`, or `unbound` — and your theme can visualize these however you like: animations, color changes, icons, particles, anything.

### Key concepts

| Concept | Description |
|---|---|
| **Office** | A user's virtual workspace containing one or more AI agents |
| **Agent** | An AI entity (e.g., powered by Claude, GPT) that performs tasks. Each has a name, role, emoji, status, and activity history |
| **Theme** | A self-contained HTML/JS/CSS package that renders the office scene |
| **Slot** | A position in the theme where an agent can be bound (placed) |
| **Binding** | The mapping between a slot and a specific agent |
| **Bridge** | The SDK script that handles postMessage communication between your theme and the host |

---

## 2. What Does a Theme Look Like?

### Example: Cozy Studio

Imagine a warm, illustrated workspace. A wooden desk sits in the center with a glowing monitor. Your AI agent — let's call her Linda — sits at the desk typing. A status bubble above her head reads "Working on PRD review." When she finishes, she leans back and the bubble changes to "Idle." Another agent, Ron, is at a side table writing code, with a small progress bar floating near him.

**What the user sees:**

- Agents are rendered as characters in the scene, each in their designated spot (slot).
- Agent status is reflected visually — working agents animate, idle ones rest, blocked ones show a warning icon.
- Clicking an agent opens their detail panel or chat.
- Task info, token usage, and recent activity can be shown as overlays, tooltips, or HUD elements.

### Picture-in-Picture (PiP) mode

Users can shrink the office into a small floating window that hovers over other pages. Your theme should handle smaller viewports gracefully — the SDK provides `width`, `height`, and a `resize` callback so you can adapt your layout.

### What your theme controls

- **Scene rendering** — background art, furniture, decorations, particle effects
- **Agent visualization** — character sprites/avatars, animations per status, position in scene
- **Data overlays** — task titles, context usage, activity feeds
- **Interaction** — click handlers that call `sdk.selectAgent()` or `sdk.openChat()`
- **Binding UI** — let users drag agents into slots using `sdk.bindAgent()` / `sdk.unbindAgent()`

### What the host controls

- Injecting the bridge script and initializing the SDK
- Providing agent data and pushing updates
- Handling navigation, chat panels, and agent selection UI outside the iframe

---

## 3. Quick Start

### Prerequisites

Install the [Arinova CLI](https://www.npmjs.com/package/@arinova-ai/cli):

```bash
npm install -g @arinova-ai/cli
```

### Create a new theme

```bash
arinova theme init my-theme
cd my-theme
```

This scaffolds a project with:

```
my-theme/
├── theme.json          # Theme metadata (name, version, slots, preview image)
├── theme.js            # Your main entry point
└── assets/             # Images, fonts, spritesheets, JSON data
    └── preview.png
```

### Develop locally

```bash
arinova theme dev
```

Opens a local preview with mock agent data so you can iterate on your theme without deploying.

### Build for distribution

```bash
arinova theme build
```

Produces a `.zip` file ready for upload.

### Upload to Arinova

```bash
arinova theme upload
```

Publishes your theme to the Arinova theme marketplace. Users can then apply it to their office.

### Theme entry point

Your `theme.js` must export a module with at least an `init` function:

```js
export default {
  async init(sdk, container) {
    // sdk — the Arinova SDK object (agent data, actions, environment)
    // container — the #container DOM element to render into
  },

  resize(width, height) {
    // Called when the viewport changes size
  },

  destroy() {
    // Called when the theme is unloaded — clean up here
  },
};
```

The bridge script (`bridge.js`) is injected automatically by the host. You do not need to include it.

---

## 4. SDK API Reference

The `sdk` object is passed to your `init()` function and is also available globally as `window.__ARINOVA_SDK__`.

### Agent Data

Read-only access to the agents in the user's office.

| Property / Method | Type | Description |
|---|---|---|
| `sdk.agents` | `Agent[]` | All agents currently in the office |
| `sdk.agent` | `Agent \| null` | First agent (convenience shortcut) |
| `sdk.getAgent(id)` | `(id: string) => Agent \| undefined` | Look up a specific agent by ID |
| `sdk.onAgentsChange(cb)` | `(cb: (agents: Agent[]) => void) => () => void` | Subscribe to agent list updates. Returns an unsubscribe function |

**Agent statuses:**

| Status | Meaning |
|---|---|
| `"working"` | Agent is actively executing a task |
| `"idle"` | Agent is online but not doing anything |
| `"blocked"` | Agent is stuck and needs intervention |
| `"collaborating"` | Agent is working with other agents |
| `"unbound"` | Agent exists but is not assigned to a slot in this theme |

### Agent Actions

Send commands to the host app.

| Method | Signature | Description |
|---|---|---|
| `sdk.selectAgent(agentId)` | `(agentId: string) => void` | Highlight an agent in the host UI (e.g., show their detail panel) |
| `sdk.openChat(agentId)` | `(agentId: string) => void` | Open the chat panel for a specific agent |
| `sdk.navigate(path)` | `(path: string) => void` | Navigate the host app to a given route |
| `sdk.emit(event, data?)` | `(event: string, data?: unknown) => void` | Emit a custom event to the host (for advanced integrations) |

### Bindings

Manage which agents are placed in which slots of your theme.

| Property / Method | Type | Description |
|---|---|---|
| `sdk.connectedAgents` | `ConnectedAgent[]` | All agents available to be bound (includes agents not yet placed) |
| `sdk.bindings` | `Binding[]` | Current slot-to-agent mappings |
| `sdk.bindAgent(slotIndex, agentId)` | `(slotIndex: number, agentId: string) => void` | Assign an agent to a slot |
| `sdk.unbindAgent(slotIndex)` | `(slotIndex: number) => void` | Remove the agent from a slot |
| `sdk.onBindingsChange(cb)` | `(cb: (bindings: Binding[]) => void) => () => void` | Subscribe to binding changes. Returns an unsubscribe function |

### Assets

Load theme assets (images, JSON data, fonts) using resolved URLs.

| Method | Signature | Description |
|---|---|---|
| `sdk.assetUrl(path)` | `(relativePath: string) => string` | Resolve a relative path (e.g., `"sprites/idle.png"`) to a full URL |
| `sdk.loadJSON(path)` | `<T>(relativePath: string) => Promise<T>` | Fetch and parse a JSON asset |
| `sdk.loadFont(name, path)` | `(name: string, relativePath: string) => Promise<void>` | Load a custom font via the FontFace API |

### Environment

Read-only info about the current viewport and user context.

| Property | Type | Description |
|---|---|---|
| `sdk.width` | `number` | Current viewport width in pixels |
| `sdk.height` | `number` | Current viewport height in pixels |
| `sdk.isMobile` | `boolean` | `true` if the user is on a mobile device |
| `sdk.pixelRatio` | `number` | Device pixel ratio (for crisp rendering on HiDPI screens) |
| `sdk.user` | `User` | Current user: `{ id, name, username }` |
| `sdk.themeId` | `string` | The unique identifier of this theme |
| `sdk.themeVersion` | `string` | The current version string of this theme |

### Lifecycle

Your theme module can export three lifecycle hooks:

| Hook | Required | Signature | When it's called |
|---|---|---|---|
| `init` | **Yes** | `(sdk: ArinovaSDK, container: HTMLElement) => void \| Promise<void>` | Once, after the host sends the `init` message. Build your scene inside `container`. |
| `resize` | No | `(width: number, height: number) => void` | Whenever the viewport changes size (including PiP transitions). Update your layout. |
| `destroy` | No | `() => void` | When the theme is being unloaded. Release resources — remove event listeners, stop animations, dispose canvases. |

---

## 5. TypeScript Types

The full type definitions are available in [`src/types.d.ts`](./src/types.d.ts). Here is the complete reference:

```ts
type AgentStatus = "working" | "idle" | "blocked" | "collaborating" | "unbound";

interface AgentActivity {
  time: string;                   // ISO timestamp
  text: string;                   // Human-readable description
}

interface AgentTokenUsage {
  /** Context window usage percentage, e.g. "42%" */
  contextPercent?: string;
}

interface Agent {
  id: string;
  name: string;
  /** Agent description / role, e.g. "Coding Engineer" */
  role: string;
  /** Display emoji, e.g. "💻" (default: "🤖") */
  emoji: string;
  /** Accent color (CSS hex), e.g. "#3B82F6" */
  color: string;
  status: AgentStatus;
  online?: boolean;
  /** Current task title, or undefined if idle */
  currentTask?: string;
  recentActivity: AgentActivity[];
  model?: string;                 // e.g. "claude-opus-4-6"
  tokenUsage?: AgentTokenUsage;
  sessionDurationMs?: number;
  currentToolDetail?: string;     // e.g. "Reading src/index.ts"
}

interface User {
  id: string;
  name: string;
  username: string;
}

interface ConnectedAgent {
  id: string;
  name: string;
  avatarUrl?: string;
}

interface Binding {
  slotIndex: number;
  agentId: string;
  agentName?: string;
}

interface ArinovaSDK {
  // Agent Data
  readonly agents: Agent[];
  readonly agent: Agent | null;
  onAgentsChange(callback: (agents: Agent[]) => void): () => void;
  getAgent(id: string): Agent | undefined;

  // Bindings
  readonly connectedAgents: ConnectedAgent[];
  readonly bindings: Binding[];
  bindAgent(slotIndex: number, agentId: string): void;
  unbindAgent(slotIndex: number): void;
  onBindingsChange(callback: (bindings: Binding[]) => void): () => void;

  // Assets
  assetUrl(relativePath: string): string;
  loadJSON<T = unknown>(relativePath: string): Promise<T>;
  loadFont(name: string, relativePath: string): Promise<void>;

  // Agent Actions
  selectAgent(agentId: string): void;
  openChat(agentId: string): void;
  navigate(path: string): void;
  emit(event: string, data?: unknown): void;

  // Environment
  readonly width: number;
  readonly height: number;
  readonly isMobile: boolean;
  readonly pixelRatio: number;
  readonly user: User;
  readonly themeId: string;
  readonly themeVersion: string;
}

interface ThemeModule {
  init(sdk: ArinovaSDK, container: HTMLElement): void | Promise<void>;
  resize?(width: number, height: number): void;
  destroy?(): void;
}
```

---

## 6. Examples

### Hello World — Minimal theme

The simplest possible theme: display the first agent's name and status.

```js
export default {
  init(sdk, container) {
    const el = document.createElement("div");
    el.style.cssText = `
      display: flex; align-items: center; justify-content: center;
      width: 100%; height: 100%;
      font-family: system-ui; font-size: 24px; color: #fff;
      background: #1a1a2e;
    `;

    function render() {
      const a = sdk.agent;
      el.textContent = a ? `${a.emoji} ${a.name} — ${a.status}` : "No agent";
    }

    render();
    sdk.onAgentsChange(render);
    container.appendChild(el);
  },
};
```

### Single Agent — Status card with task info

A focused view for one agent showing current task and context usage.

```js
export default {
  init(sdk, container) {
    container.innerHTML = `
      <style>
        * { margin: 0; box-sizing: border-box; }
        body { background: #0f172a; color: #e2e8f0; font-family: system-ui; }
        .card {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          background: #1e293b; border-radius: 16px; padding: 32px;
          min-width: 320px; text-align: center;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        .emoji { font-size: 48px; margin-bottom: 8px; }
        .name { font-size: 20px; font-weight: 600; }
        .role { font-size: 14px; color: #94a3b8; margin-top: 4px; }
        .status { margin-top: 16px; font-size: 14px; }
        .status .dot {
          display: inline-block; width: 8px; height: 8px;
          border-radius: 50%; margin-right: 6px;
        }
        .working .dot { background: #22c55e; }
        .idle .dot { background: #eab308; }
        .blocked .dot { background: #ef4444; }
        .task { margin-top: 16px; font-size: 13px; color: #94a3b8; }
        .context { margin-top: 8px; font-size: 12px; color: #64748b; }
      </style>
      <div class="card" id="agent-card">
        <div class="emoji" id="agent-emoji"></div>
        <div class="name" id="agent-name"></div>
        <div class="role" id="agent-role"></div>
        <div class="status" id="agent-status"></div>
        <div class="task" id="agent-task"></div>
        <div class="context" id="agent-context"></div>
      </div>
    `;

    function render() {
      const a = sdk.agent;
      if (!a) return;

      document.getElementById("agent-emoji").textContent = a.emoji;
      document.getElementById("agent-name").textContent = a.name;
      document.getElementById("agent-role").textContent = a.role;

      const statusEl = document.getElementById("agent-status");
      statusEl.className = `status ${a.status}`;
      statusEl.innerHTML = `<span class="dot"></span>${a.status}`;

      const taskEl = document.getElementById("agent-task");
      taskEl.textContent = a.currentTask || "";

      const ctxEl = document.getElementById("agent-context");
      ctxEl.textContent = a.tokenUsage?.contextPercent
        ? `Context: ${a.tokenUsage.contextPercent}`
        : "";
    }

    render();
    sdk.onAgentsChange(render);

    // Click card to open chat
    document.getElementById("agent-card").addEventListener("click", () => {
      if (sdk.agent) sdk.openChat(sdk.agent.id);
    });
  },
};
```

### Multi-Agent — Grid layout with binding support

A grid that shows all bound agents and lets users bind new ones to empty slots.

```js
const SLOT_COUNT = 6;

export default {
  init(sdk, container) {
    container.innerHTML = `
      <style>
        * { margin: 0; box-sizing: border-box; }
        body { background: #111827; font-family: system-ui; }
        .grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px; padding: 16px;
          height: 100vh;
        }
        .slot {
          background: #1f2937; border-radius: 12px;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 16px; cursor: pointer;
          border: 2px solid transparent;
          transition: border-color 0.2s;
        }
        .slot:hover { border-color: #3b82f6; }
        .slot.working { border-color: #22c55e; }
        .slot.blocked { border-color: #ef4444; }
        .empty { color: #4b5563; font-size: 14px; }
        .emoji { font-size: 32px; }
        .name { color: #e5e7eb; font-size: 14px; font-weight: 600; margin-top: 8px; }
        .info { color: #9ca3af; font-size: 12px; margin-top: 4px; }
      </style>
      <div class="grid" id="grid"></div>
    `;

    const grid = document.getElementById("grid");

    function render() {
      grid.innerHTML = "";

      for (let i = 0; i < SLOT_COUNT; i++) {
        const binding = sdk.bindings.find((b) => b.slotIndex === i);
        const slot = document.createElement("div");
        slot.className = "slot";

        if (binding) {
          const agent = sdk.getAgent(binding.agentId);
          if (agent) {
            slot.classList.add(agent.status);
            slot.innerHTML = `
              <div class="emoji">${agent.emoji}</div>
              <div class="name">${agent.name}</div>
              <div class="info">${agent.role} · ${agent.status}</div>
            `;
            slot.addEventListener("click", () => sdk.selectAgent(agent.id));
          } else {
            slot.innerHTML = `<div class="name">${binding.agentName || "Unknown"}</div>`;
          }
        } else {
          slot.innerHTML = `<div class="empty">+ Empty Slot</div>`;
          slot.addEventListener("click", () => {
            // Bind the first unbound connected agent, if any
            const boundIds = new Set(sdk.bindings.map((b) => b.agentId));
            const available = sdk.connectedAgents.find((a) => !boundIds.has(a.id));
            if (available) sdk.bindAgent(i, available.id);
          });
        }

        grid.appendChild(slot);
      }
    }

    render();
    sdk.onAgentsChange(render);
    sdk.onBindingsChange(render);
  },

  resize(width, height) {
    const grid = document.getElementById("grid");
    if (!grid) return;
    // Switch to 2 columns on narrow viewports (e.g., PiP mode)
    grid.style.gridTemplateColumns = width < 480 ? "repeat(2, 1fr)" : "repeat(3, 1fr)";
  },
};
```

---

## PostMessage Protocol

For advanced use cases, here's the raw message protocol the bridge handles. You typically won't need this — the SDK abstracts it.

**Host → Theme iframe:**

| Message | Payload |
|---|---|
| `init` | `{ type: "init", user, themeId, themeVersion, isMobile, pixelRatio, width, height, agents, connectedAgents, bindings }` |
| `agents:update` | `{ type: "agents:update", agents }` |
| `bindings:update` | `{ type: "bindings:update", bindings }` |
| `connectedAgents:update` | `{ type: "connectedAgents:update", connectedAgents }` |
| `resize` | `{ type: "resize", width, height }` |

**Theme iframe → Host:**

| Message | Payload |
|---|---|
| `ready` | `{ type: "ready" }` |
| `agent:select` | `{ type: "agent:select", agentId }` |
| `agent:openChat` | `{ type: "agent:openChat", agentId }` |
| `agent:bind` | `{ type: "agent:bind", slotIndex, agentId }` |
| `agent:unbind` | `{ type: "agent:unbind", slotIndex }` |
| `navigate` | `{ type: "navigate", path }` |
| `custom:event` | `{ type: "custom:event", event, data }` |

---

## License

See the root repository license.
