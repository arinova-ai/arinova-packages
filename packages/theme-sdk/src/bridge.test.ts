import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

const bridgeSource = readFileSync(new URL("./bridge.js", import.meta.url), "utf8");
const runtimeSource = bridgeSource.slice(
  bridgeSource.indexOf("(function () {"),
  bridgeSource.indexOf("})();") + 5,
);
const BRIDGE_SHA256 = "12db11dc0d5b1b0ef543ed21c69381363f74ec877158986d5236a786044033aa";

type Runtime = ReturnType<typeof loadBridge>;
const runtimes: Runtime[] = [];

function loadBridge(options: {
  token?: string;
  parentOrigin?: string;
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
  });
  const postMessage = vi.fn();
  Object.defineProperty(win, "postMessage", { value: postMessage, configurable: true });

  new win.Function(bridgeSource)();

  const send = (
    data: Record<string, unknown>,
    event: { origin?: string; source?: MessageEventSource | null } = {},
  ) => {
    win.dispatchEvent(new win.MessageEvent("message", {
      data,
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
  it("pins the host-shared runtime digest", () => {
    expect(createHash("sha256").update(runtimeSource).digest("hex")).toBe(BRIDGE_SHA256);
  });

  it("sends ready with the bridge token to the configured parent origin", () => {
    const runtime = loadBridge();
    expect(runtime.postMessage).toHaveBeenCalledWith(
      { type: "ready", bridgeToken: "bridge-1" },
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
      { type: "theme:ready", bridgeToken: runtime.token },
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
});

describe("SDK behavior", () => {
  it("stamps outbound messages and exposes agent/JSON conveniences", async () => {
    const runtime = loadBridge({ assetBase: "https://cdn.test/theme" });
    const { sdk } = await initialize(runtime);
    expect(sdk.getAgent("a1")).toMatchObject({ id: "a1" });
    expect(sdk.agent).toMatchObject({ id: "a1" });
    sdk.selectAgent("a1");
    expect(runtime.postMessage).toHaveBeenCalledWith(
      { type: "agent:select", agentId: "a1", bridgeToken: runtime.token },
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
    ["/assets/theme/", "/icon.png", "https://theme.test/assets/theme/icon.png"],
    ["https://cdn.test/theme", "icon.png", "https://cdn.test/theme/icon.png"],
    ["/assets/theme/", "../secret.json", "https://theme.test/assets/secret.json"],
  ])("pins assetUrl(%s, %s)", async (assetBase, relative, expected) => {
    const runtime = loadBridge({ assetBase });
    const { sdk } = await initialize(runtime);
    expect(sdk.assetUrl(relative)).toBe(expected);
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
    expect(calls).toEqual(["first", "second"]);
    runtime.send({
      type: "agents:update",
      bridgeToken: runtime.token,
      agents: [{ id: "a3" }],
    });
    expect(calls).toEqual(["first", "second", "first"]);
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
});
