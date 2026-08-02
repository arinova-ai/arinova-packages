import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

const bridgeSource = readFileSync(new URL("./bridge.js", import.meta.url), "utf8");
const typesSource = readFileSync(new URL("./types.d.ts", import.meta.url), "utf8");
const readmeSource = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const runtimeSource = bridgeSource.replace(/^\/\*\*[\s\S]*?\*\/\s*/, "").trim();
const BRIDGE_SHA256 = "0dd653af7648b276eccbb3987ea6cbe34765d6054ce04e296c2243252eabed0c";

type Runtime = ReturnType<typeof loadBridge>;
const runtimes: Runtime[] = [];

function loadBridge(options: {
  token?: string;
  parentOrigin?: string;
  parentOrigins?: string[];
  assetBase?: string;
} = {}) {
  const token = options.token ?? "bridge-1";
  const dom = new JSDOM('<div id="container"></div>', {
    url: `https://theme.test/runtime${token ? `#bridgeToken=${token}` : ""}`,
    runScripts: "outside-only",
  });
  const win = dom.window;
  Object.defineProperties(win, {
    __ARINOVA_THEME_ID__: { value: "theme-1", configurable: true },
    __ARINOVA_ASSETS_BASE__: { value: options.assetBase ?? "/assets/theme-1", configurable: true },
    __ARINOVA_PARENT_ORIGIN__: { value: options.parentOrigin ?? "https://chat.test", configurable: true },
    __ARINOVA_PARENT_ORIGINS__: { value: options.parentOrigins, configurable: true },
  });
  const postMessage = vi.fn();
  Object.defineProperty(win, "postMessage", { value: postMessage, configurable: true });

  new win.Function(bridgeSource)();

  const send = (
    data: Record<string, unknown>,
    event: { origin?: string; source?: MessageEventSource | null } = {},
  ) => {
    win.dispatchEvent(new win.MessageEvent("message", {
      data: { protocol: 1, ...data },
      origin: event.origin ?? "https://chat.test",
      source: event.source === undefined ? win : event.source,
    }));
  };
  const runtime = { dom, win, postMessage, send, token };
  runtimes.push(runtime);
  return runtime;
}

async function initialize(runtime: Runtime, initFirst = false) {
  let sdk: Record<string, any> | undefined;
  const theme = { init: vi.fn((value: Record<string, any>) => { sdk = value; }) };
  const init = {
    type: "init",
    bridgeToken: runtime.token,
    themeId: "theme-1",
    themeVersion: "2.3.4",
    agents: [{ id: "a1", name: "Ada" }],
    bindings: [],
    connectedAgents: [],
    width: 900,
    height: 700,
  };
  if (initFirst) {
    runtime.send(init);
    runtime.win.__ARINOVA_REGISTER_THEME__(theme);
  } else {
    runtime.win.__ARINOVA_REGISTER_THEME__(theme);
    runtime.send(init);
  }
  await Promise.resolve();
  await Promise.resolve();
  return { sdk: sdk!, theme };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const runtime of runtimes.splice(0)) runtime.dom.window.close();
});

describe("bridge trust boundary", () => {
  it("pins the complete published runtime digest", () => {
    expect(createHash("sha256").update(runtimeSource).digest("hex")).toBe(BRIDGE_SHA256);
    expect(runtimeSource.match(/\}\)\(\);/g)).toHaveLength(1);
    expect(runtimeSource.startsWith("(function () {")).toBe(true);
    expect(runtimeSource.endsWith("})();")).toBe(true);
    expect(createHash("sha256").update(`${runtimeSource}\nmalicious()`).digest("hex")).not.toBe(BRIDGE_SHA256);
  });

  it("keeps the canonical message tables represented in bridge documentation", () => {
    const inbound = ["init", "agents:update", "bindings:update", "connectedAgents:update", "resize"];
    const outbound = ["ready", "theme:ready", "theme:error", "agent:select", "agent:openChat", "agent:bind", "agent:unbind", "navigate"];
    for (const type of [...inbound, ...outbound]) {
      expect(runtimeSource).toContain(`\"${type}\"`);
      expect(readmeSource).toContain(`\`${type}\``);
    }
  });

  it("sends ready with the bridge token to the configured parent origin", () => {
    const runtime = loadBridge();
    expect(runtime.postMessage).toHaveBeenCalledWith(
      { type: "ready", protocol: 1, bridgeToken: "bridge-1" },
      "https://chat.test",
    );
  });

  it.each([
    ["wrong origin", { origin: "https://evil.test" }, "bridge-1"],
    ["wrong source", { source: {} as MessageEventSource }, "bridge-1"],
    ["wrong token", {}, "wrong"],
    ["missing token", {}, undefined],
  ])("ignores init from %s", async (_label, event, bridgeToken) => {
    const runtime = loadBridge();
    vi.spyOn(runtime.win.console, "warn").mockImplementation(() => {});
    const init = vi.fn();
    runtime.win.__ARINOVA_REGISTER_THEME__({ init });
    runtime.send({ type: "init", bridgeToken }, event);
    await Promise.resolve();
    expect(init).not.toHaveBeenCalled();
  });

  it("ignores every inbound message when the URL bridge token is empty", async () => {
    const runtime = loadBridge({ token: "" });
    const init = vi.fn();
    runtime.win.__ARINOVA_REGISTER_THEME__({ init });
    runtime.send({ type: "init", bridgeToken: "" });
    await Promise.resolve();
    expect(init).not.toHaveBeenCalled();
  });

  it("gates unknown protocols and safely ignores malformed/prototype message types", async () => {
    const runtime = loadBridge();
    const init = vi.fn();
    runtime.win.__ARINOVA_REGISTER_THEME__({ init });
    for (const data of [null, "text", 1, {}, { type: "__proto__" }, { type: "constructor" }, { type: "unknown" }]) {
      expect(() => runtime.send(data as Record<string, unknown>)).not.toThrow();
    }
    runtime.send({ type: "init", protocol: 2, bridgeToken: runtime.token });
    await Promise.resolve();
    expect(init).not.toHaveBeenCalled();
  });

  it("accepts a versionless init during the protocol-1 rollout", async () => {
    const runtime = loadBridge();
    const init = vi.fn();
    runtime.win.__ARINOVA_REGISTER_THEME__({ init });
    runtime.send({ type: "init", protocol: undefined, bridgeToken: runtime.token });
    await Promise.resolve();
    expect(init).toHaveBeenCalledOnce();
  });

  it("fans ready across the allowlist, then pins sends to the origin that spoke", async () => {
    const runtime = loadBridge({ parentOrigins: ["https://chat.test", "https://preview.test"] });
    // Before any inbound message the parent's origin is unknown: the ready
    // handshake must reach every allowlisted origin (never "*").
    const readyTargets = runtime.postMessage.mock.calls
      .filter(([payload]) => payload.type === "ready")
      .map(([, target]) => target);
    expect(readyTargets.sort()).toEqual(["https://chat.test", "https://preview.test"]);
    expect(runtime.postMessage.mock.calls.some(([, target]) => target === "*")).toBe(false);

    let sdk: Record<string, any> | undefined;
    const init = vi.fn((value: Record<string, any>) => { sdk = value; });
    runtime.win.__ARINOVA_REGISTER_THEME__({ init });
    runtime.send({ type: "init", bridgeToken: runtime.token }, { origin: "https://preview.test" });
    await Promise.resolve();
    expect(init).toHaveBeenCalledOnce();
    runtime.postMessage.mockClear();
    sdk!.navigate("/home");
    const laterTargets = runtime.postMessage.mock.calls.map(([, target]) => target);
    expect(laterTargets).toEqual(["https://preview.test"]);
  });

  it.each([
    ["parent origin", { parentOrigin: "" }],
    ["asset base", { assetBase: "" }],
  ])("fails loudly when %s is missing", (_label, options) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const runtime = loadBridge(options);
    expect(error).toHaveBeenCalled();
    expect(runtime.postMessage).not.toHaveBeenCalled();
    expect(runtime.win.__ARINOVA_REGISTER_THEME__).toBeUndefined();
  });
});

describe("theme lifecycle", () => {
  it.each([false, true])("runs async init exactly once in either ordering (initFirst=%s)", async (initFirst) => {
    const runtime = loadBridge();
    const { sdk, theme } = await initialize(runtime, initFirst);
    runtime.win.__ARINOVA_REGISTER_THEME__(theme);
    runtime.send({ type: "init", bridgeToken: runtime.token });
    await Promise.resolve();
    expect(theme.init).toHaveBeenCalledTimes(1);
    expect(sdk.themeVersion).toBe("2.3.4");
    expect(runtime.postMessage).toHaveBeenCalledWith(
      { type: "theme:ready", protocol: 1, bridgeToken: runtime.token },
      "https://chat.test",
    );
  });

  it("reports one sanitized async initialization error", async () => {
    const runtime = loadBridge();
    vi.spyOn(runtime.win.console, "error").mockImplementation(() => {});
    runtime.win.__ARINOVA_REGISTER_THEME__({
      init: () => Promise.reject(new Error("bad\nsecret\tmessage".padEnd(400, "x"))),
    });
    runtime.send({ type: "init", bridgeToken: runtime.token });
    let errorCall: any[] | undefined;
    await vi.waitFor(() => {
      errorCall = runtime.postMessage.mock.calls.find(([message]) => message.type === "theme:error");
      expect(errorCall).toBeDefined();
    });
    expect(errorCall?.[0]).toMatchObject({ type: "theme:error", stage: "initialization" });
    expect(errorCall?.[0].message).not.toMatch(/[\n\t]/);
    expect(errorCall?.[0].message.length).toBeLessThanOrEqual(300);
    expect(runtime.postMessage.mock.calls.filter(([message]) => message.type === "theme:error")).toHaveLength(1);
  });

  it("reports a handshake timeout and clears it after init", async () => {
    vi.useFakeTimers();
    const timedOut = loadBridge();
    vi.spyOn(timedOut.win.console, "error").mockImplementation(() => {});
    await vi.advanceTimersByTimeAsync(12_000);
    expect(timedOut.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "theme:error", protocol: 1, stage: "handshake" }),
      "https://chat.test",
    );

    const initialized = loadBridge();
    await initialize(initialized);
    initialized.postMessage.mockClear();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(initialized.postMessage.mock.calls.some(([message]) => message.type === "theme:error")).toBe(false);
  });

  it("recovers when init arrives after a handshake timeout", async () => {
    vi.useFakeTimers();
    const runtime = loadBridge();
    vi.spyOn(runtime.win.console, "error").mockImplementation(() => {});
    const theme = { init: vi.fn() };
    runtime.win.__ARINOVA_REGISTER_THEME__(theme);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(runtime.postMessage.mock.calls.some(
      ([message]) => message.type === "theme:error" && message.stage === "handshake",
    )).toBe(true);

    // A throttled tab or slow parent can complete the handshake late — the
    // theme must still boot instead of staying blank until an iframe reload.
    runtime.send({ type: "init", bridgeToken: runtime.token });
    await vi.advanceTimersByTimeAsync(0);
    expect(theme.init).toHaveBeenCalledOnce();
    expect(runtime.postMessage.mock.calls.some(([message]) => message.type === "theme:ready")).toBe(true);
  });

  it("keeps a host-declared isMobile across resizes", async () => {
    const runtime = loadBridge();
    let sdk: Record<string, any> | undefined;
    runtime.win.__ARINOVA_REGISTER_THEME__({ init: (value: Record<string, any>) => { sdk = value; } });
    runtime.send({ type: "init", bridgeToken: runtime.token, width: 1024, height: 768, isMobile: true });
    await Promise.resolve();
    expect(sdk!.isMobile).toBe(true);
    runtime.send({ type: "resize", bridgeToken: runtime.token, width: 1400, height: 900 });
    expect(sdk!.isMobile).toBe(true);
  });

  it("guards duplicate bridge loads and reports post-ready runtime failures", async () => {
    const runtime = loadBridge();
    const warn = vi.spyOn(runtime.win.console, "warn").mockImplementation(() => {});
    vi.spyOn(runtime.win.console, "error").mockImplementation(() => {});
    new runtime.win.Function(bridgeSource)();
    expect(warn).toHaveBeenCalledWith("[arinova-sdk] bridge is already loaded");
    expect(runtime.postMessage.mock.calls.filter(([message]) => message.type === "ready")).toHaveLength(1);

    await initialize(runtime);
    runtime.win.__ARINOVA_REPORT_THEME_ERROR__("runtime", new Error("late failure"));
    expect(runtime.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "theme:error", protocol: 1, stage: "runtime", message: "late failure" }),
      "https://chat.test",
    );
  });

  it("covers default registration, missing init, and synchronous init failure", async () => {
    const defaultRuntime = loadBridge();
    const defaultInit = vi.fn();
    defaultRuntime.win.__ARINOVA_REGISTER_THEME__({ default: { init: defaultInit } });
    defaultRuntime.send({ type: "init", bridgeToken: defaultRuntime.token });
    await Promise.resolve();
    await Promise.resolve();
    expect(defaultInit).toHaveBeenCalledOnce();

    for (const module of [null, {}]) {
      const runtime = loadBridge();
      vi.spyOn(runtime.win.console, "error").mockImplementation(() => {});
      runtime.send({ type: "init", bridgeToken: runtime.token });
      runtime.win.__ARINOVA_REGISTER_THEME__(module as never);
      expect(runtime.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "theme:error", stage: "registration" }),
        "https://chat.test",
      );
    }

    const syncRuntime = loadBridge();
    vi.spyOn(syncRuntime.win.console, "error").mockImplementation(() => {});
    syncRuntime.win.__ARINOVA_REGISTER_THEME__({ init: () => { throw new Error("sync failure"); } });
    syncRuntime.send({ type: "init", bridgeToken: syncRuntime.token });
    await vi.waitFor(() => expect(syncRuntime.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "theme:error", stage: "initialization" }),
      "https://chat.test",
    ));
  });
});

describe("SDK behavior", () => {
  it("stamps outbound messages and exposes agent/JSON conveniences", async () => {
    const runtime = loadBridge({ assetBase: "https://cdn.test/theme" });
    const { sdk } = await initialize(runtime);
    expect(sdk.getAgent("a1")).toMatchObject({ id: "a1" });
    expect(sdk.agent).toMatchObject({ id: "a1" });
    sdk.selectAgent("a1");
    expect(runtime.postMessage).toHaveBeenCalledWith(
      { type: "agent:select", protocol: 1, agentId: "a1", bridgeToken: runtime.token },
      "https://chat.test",
    );
    Object.defineProperty(runtime.win, "fetch", {
      value: vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ value: 1 }) }),
      configurable: true,
    });
    await expect(sdk.loadJSON("data.json")).resolves.toEqual({ value: 1 });
    expect(runtime.win.fetch).toHaveBeenCalledWith("https://cdn.test/theme/data.json");
  });

  it.each([
    ["/assets/theme", "icon.png", "https://theme.test/assets/theme/icon.png"],
    ["https://cdn.test/theme", "icon.png", "https://cdn.test/theme/icon.png"],
  ])("pins assetUrl(%s, %s)", async (assetBase, relative, expected) => {
    const runtime = loadBridge({ assetBase });
    const { sdk } = await initialize(runtime);
    expect(sdk.assetUrl(relative)).toBe(expected);
  });

  it.each(["../secret.json", "nested/icon.png", "https://evil.test/x", "a\\b.png"])(
    "rejects non-flat asset path %s",
    async (relative) => {
      const runtime = loadBridge();
      const { sdk } = await initialize(runtime);
      expect(() => sdk.assetUrl(relative)).toThrow(/flat filename/);
    },
  );

  it("normalizes a leading slash to a flat asset and rejects it via loadJSON, not a sync throw", async () => {
    const runtime = loadBridge();
    const { sdk } = await initialize(runtime);
    expect(sdk.assetUrl("/icon.png")).toBe(sdk.assetUrl("icon.png"));
    // loadJSON's contract is Promise<T>: an invalid path must reject, never
    // throw synchronously out of the call.
    await expect(sdk.loadJSON("nested/data.json")).rejects.toThrow(/flat filename/);
  });

  it("snapshot-broadcasts through unsubscribe and isolates callback failures", async () => {
    const runtime = loadBridge();
    vi.spyOn(runtime.win.console, "error").mockImplementation(() => {});
    const { sdk } = await initialize(runtime);
    const calls: string[] = [];
    let unsubscribeSecond = () => {};
    sdk.onAgentsChange(() => {
      calls.push("first");
      unsubscribeSecond();
      throw new Error("subscriber failure");
    });
    unsubscribeSecond = sdk.onAgentsChange(() => calls.push("second"));
    runtime.send({
      type: "agents:update",
      bridgeToken: runtime.token,
      agents: [{ id: "a2" }],
    });
    expect(calls).toEqual(["first"]);
    runtime.send({
      type: "agents:update",
      bridgeToken: runtime.token,
      agents: [{ id: "a3" }],
    });
    expect(calls).toEqual(["first", "first"]);
  });

  it("updates state before broadcast and ignores non-array updates", async () => {
    const runtime = loadBridge();
    const { sdk } = await initialize(runtime);
    const seen: unknown[] = [];
    sdk.onAgentsChange((agents: unknown[]) => seen.push(agents));
    runtime.send({ type: "agents:update", bridgeToken: runtime.token, agents: "bad" });
    expect(seen).toEqual([]);
    runtime.send({
      type: "agents:update",
      bridgeToken: runtime.token,
      agents: [{ id: "a2" }],
    });
    expect(sdk.agents).toEqual([{ id: "a2" }]);
    expect(seen).toEqual([[{ id: "a2" }]]);
  });

  it("validates init fields and exposes host state as read-only", async () => {
    const runtime = loadBridge();
    let sdk: Record<string, unknown> | undefined;
    runtime.win.__ARINOVA_REGISTER_THEME__({ init: (value: Record<string, unknown>) => { sdk = value; } });
    runtime.send({
      type: "init",
      bridgeToken: runtime.token,
      themeId: 123,
      themeVersion: {},
      user: "not-a-user",
      agents: [],
      width: 900,
    });
    await Promise.resolve();
    expect(sdk).toMatchObject({ themeId: "theme-1", themeVersion: "0.0.0", user: null, width: 900 });
    expect(() => { (sdk as Record<string, unknown>).agents = [{ id: "attacker" }]; }).toThrow();
    expect(sdk?.agents).toEqual([]);
  });

  it("keeps every runtime SDK member represented in the public declaration", async () => {
    const runtime = loadBridge();
    const { sdk } = await initialize(runtime);
    const declaration = typesSource.slice(
      typesSource.indexOf("export interface ArinovaSDK"),
      typesSource.indexOf("export interface ThemeModule"),
    );
    for (const key of Object.keys(sdk)) {
      expect(declaration, `missing ArinovaSDK.${key}`).toMatch(new RegExp(`\\b${key}\\b`));
    }
  });

  it("table-drives bindings, connected agents, and mobile resize updates", async () => {
    const runtime = loadBridge();
    const { sdk } = await initialize(runtime);
    const bindings: unknown[] = [];
    const connected: unknown[] = [];
    const sizes: unknown[] = [];
    sdk.onBindingsChange((value: unknown) => bindings.push(value));
    sdk.onConnectedAgentsChange((value: unknown) => connected.push(value));
    sdk.onResize((value: unknown) => sizes.push(value));
    runtime.send({ type: "bindings:update", bridgeToken: runtime.token, bindings: [{ slotIndex: 0, agentId: "a1" }] });
    runtime.send({ type: "connectedAgents:update", bridgeToken: runtime.token, connectedAgents: [{ id: "a2" }] });
    runtime.send({ type: "resize", bridgeToken: runtime.token, width: 500, height: 600 });
    expect(bindings).toEqual([[{ slotIndex: 0, agentId: "a1" }]]);
    expect(connected).toEqual([[{ id: "a2" }]]);
    expect(sizes).toEqual([{ width: 500, height: 600 }]);
    expect(sdk.isMobile).toBe(true);
    runtime.send({ type: "resize", bridgeToken: runtime.token, width: "bad" });
    expect(sizes).toHaveLength(1);
  });

  it("surfaces postMessage cloning failures instead of swallowing them", async () => {
    const runtime = loadBridge();
    const error = vi.spyOn(runtime.win.console, "error").mockImplementation(() => {});
    runtime.postMessage.mockImplementation(() => { throw new runtime.win.DOMException("cannot clone", "DataCloneError"); });
    runtime.win.__ARINOVA_REGISTER_THEME__({ init: vi.fn() });
    runtime.send({ type: "init", bridgeToken: runtime.token });
    await Promise.resolve();
    await Promise.resolve();
    expect(error).toHaveBeenCalledWith("[arinova-sdk] failed to post theme:ready", expect.anything());
  });
});
