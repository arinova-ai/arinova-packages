/**
 * Arinova Office Theme SDK — Bridge Script
 *
 * ⚠️ SOURCE OF TRUTH: this file MUST stay byte-for-byte in sync with the
 * `SDK_BRIDGE_STUB` constant in the arinova-chat server at
 *   apps/rust-server/src/routes/themes/sdk.rs
 * That stub is what the host actually injects into the runtime iframe in
 * production (and serves at `GET /sdk/bridge.js`). This published copy is the
 * reference authors/tools (e.g. the CLI `arinova theme dev` harness) run
 * against — if the two drift, local dev stops matching production. Any change
 * here must be mirrored there, and vice versa.
 *
 * Runs inside the theme iframe. It:
 *  - reads a per-iframe `bridgeToken` from the URL hash and the parent origin
 *    from `window.__ARINOVA_PARENT_ORIGIN__`, then stamps the token on every
 *    outbound message and posts only to that origin;
 *  - rejects any inbound message whose source, origin, or token does not match;
 *  - exposes a global `sdk` object to theme code via `theme.init(sdk, container)`.
 *
 * Protocol (host -> iframe): init | agents:update | bindings:update |
 *   connectedAgents:update | resize   (every message carries `bridgeToken`)
 * Protocol (iframe -> host): ready | agent:select | agent:openChat |
 *   agent:bind | agent:unbind | navigate
 *
 * The runtime calls ONLY `theme.init(sdk, container)`. There are no `resize()`
 * or `destroy()` lifecycle hooks — subscribe to viewport changes via
 * `sdk.onResize(cb)` instead.
 */
(function () {
  var THEME_ID = window.__ARINOVA_THEME_ID__ || "";
  var ASSET_BASE = window.__ARINOVA_ASSETS_BASE__ || "";
  var PARENT_ORIGIN = window.__ARINOVA_PARENT_ORIGIN__ || "";
  var BRIDGE_TOKEN = new URLSearchParams(window.location.hash.slice(1)).get("bridgeToken") || "";
  var mountTarget = document.getElementById("container");

  var channels = { agents: [], bindings: [], connectedAgents: [], resize: [] };
  function subscribe(channel, cb) {
    var list = channels[channel];
    if (!list || typeof cb !== "function") return function () {};
    list.push(cb);
    return function () {
      var idx = list.indexOf(cb);
      if (idx !== -1) list.splice(idx, 1);
    };
  }
  function broadcast(channel, payload) {
    var list = channels[channel];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      try { list[i](payload); } catch (err) { console.error("[arinova-sdk]", err); }
    }
  }

  function send(type, body) {
    var payload = { type: type };
    if (body) for (var k in body) if (Object.prototype.hasOwnProperty.call(body, k)) payload[k] = body[k];
    payload.bridgeToken = BRIDGE_TOKEN;
    try { window.parent.postMessage(payload, PARENT_ORIGIN); } catch (e) {}
  }

  function joinAsset(rel) {
    var base = new URL(ASSET_BASE.replace(/\/?$/, "/"), window.location.href);
    if (!rel) return base.href;
    var clean = String(rel).replace(/^\/+/, "");
    return new URL(clean, base).href;
  }

  var sdk = {
    themeId: THEME_ID,
    themeVersion: "0.0.0",
    user: null,
    agents: [],
    bindings: [],
    connectedAgents: [],
    width: window.innerWidth,
    height: window.innerHeight,
    isMobile: window.innerWidth < 768,
    pixelRatio: window.devicePixelRatio || 1,
    assetUrl: joinAsset,
    onAgentsChange: function (cb) { return subscribe("agents", cb); },
    onBindingsChange: function (cb) { return subscribe("bindings", cb); },
    onConnectedAgentsChange: function (cb) { return subscribe("connectedAgents", cb); },
    onResize: function (cb) { return subscribe("resize", cb); },
    selectAgent: function (agentId) { send("agent:select", { agentId: agentId }); },
    openChat: function (agentId) { send("agent:openChat", { agentId: agentId }); },
    bindAgent: function (slotIndex, agentId) { send("agent:bind", { slotIndex: slotIndex, agentId: agentId }); },
    unbindAgent: function (slotIndex) { send("agent:unbind", { slotIndex: slotIndex }); },
    navigate: function (path) { send("navigate", { path: path }); }
  };

  var hostReady = false;
  var pending = null;
  function runTheme(theme) {
    if (!theme || typeof theme.init !== "function") return;
    try { theme.init(sdk, mountTarget); }
    catch (err) { console.error("[arinova-sdk] theme.init threw", err); }
  }

  window.__ARINOVA_REGISTER_THEME__ = function (mod) {
    var theme = (mod && mod.default) ? mod.default : mod;
    if (!theme) return;
    if (hostReady) runTheme(theme);
    else pending = theme;
  };

  function applyInit(data) {
    if (data.themeId) sdk.themeId = data.themeId;
    if (data.themeVersion) sdk.themeVersion = data.themeVersion;
    if (data.user) sdk.user = data.user;
    if (Array.isArray(data.agents)) sdk.agents = data.agents;
    if (Array.isArray(data.bindings)) sdk.bindings = data.bindings;
    if (Array.isArray(data.connectedAgents)) sdk.connectedAgents = data.connectedAgents;
    if (typeof data.width === "number") sdk.width = data.width;
    if (typeof data.height === "number") sdk.height = data.height;
    if (typeof data.isMobile === "boolean") sdk.isMobile = data.isMobile;
    if (typeof data.pixelRatio === "number") sdk.pixelRatio = data.pixelRatio;
    if (!hostReady) {
      hostReady = true;
      if (pending) { var p = pending; pending = null; runTheme(p); }
    }
    broadcast("agents", sdk.agents);
    broadcast("bindings", sdk.bindings);
    broadcast("connectedAgents", sdk.connectedAgents);
    broadcast("resize", { width: sdk.width, height: sdk.height });
  }

  var handlers = {
    "init": applyInit,
    "agents:update": function (d) {
      if (Array.isArray(d.agents)) { sdk.agents = d.agents; broadcast("agents", sdk.agents); }
    },
    "bindings:update": function (d) {
      if (Array.isArray(d.bindings)) { sdk.bindings = d.bindings; broadcast("bindings", sdk.bindings); }
    },
    "connectedAgents:update": function (d) {
      if (Array.isArray(d.connectedAgents)) { sdk.connectedAgents = d.connectedAgents; broadcast("connectedAgents", sdk.connectedAgents); }
    },
    "resize": function (d) {
      if (typeof d.width === "number") sdk.width = d.width;
      if (typeof d.height === "number") sdk.height = d.height;
      broadcast("resize", { width: sdk.width, height: sdk.height });
    }
  };

  window.addEventListener("message", function (e) {
    if (e.source !== window.parent || e.origin !== PARENT_ORIGIN) return;
    var data = e.data;
    if (!data || typeof data.type !== "string") return;
    if (!BRIDGE_TOKEN || data.bridgeToken !== BRIDGE_TOKEN) return;
    var handler = handlers[data.type];
    if (handler) handler(data);
  });

  send("ready");
})();
