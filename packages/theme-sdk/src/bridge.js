/**
 * Arinova Office Theme SDK — Bridge Script
 *
 * This published bridge is synchronized mechanically with the bridge served by
 * the Arinova host server. A shared SHA-256 contract test prevents dev and
 * production runtimes from drifting.
 *
 * Runs inside the theme iframe. It:
 *  - reads a per-iframe `bridgeToken` from the URL hash and the parent origin
 *    allowlist from `window.__ARINOVA_PARENT_ORIGIN(S)__`, stamps the token on
 *    every outbound message, fans outbound posts across the allowlist until
 *    the first validated inbound message pins the real parent origin;
 *  - rejects any inbound message whose source, origin, or token does not match;
 *  - passes an immutable-view `sdk` object to theme code via `theme.init(sdk, container)`.
 *
 * Protocol (host -> iframe): init | agents:update | bindings:update |
 *   connectedAgents:update | resize   (every message carries `bridgeToken`)
 * Protocol (iframe -> host): ready | theme:ready | theme:error |
 *   agent:select | agent:openChat | agent:bind | agent:unbind | navigate
 *
 * The runtime calls ONLY `theme.init(sdk, container)`. There are no `resize()`
 * or `destroy()` lifecycle hooks — subscribe to viewport changes via
 * `sdk.onResize(cb)` instead.
 */
(function () {
  var THEME_ID = window.__ARINOVA_THEME_ID__ || "";
  var ASSET_BASE = window.__ARINOVA_ASSETS_BASE__ || "";
  var PARENT_ORIGIN = window.__ARINOVA_PARENT_ORIGIN__ || "";
  var PARENT_ORIGINS = Array.isArray(window.__ARINOVA_PARENT_ORIGINS__)
    ? window.__ARINOVA_PARENT_ORIGINS__.slice()
    : [PARENT_ORIGIN];
  var BRIDGE_TOKEN = new URLSearchParams(window.location.hash.slice(1)).get("bridgeToken") || "";
  var mountTarget = document.getElementById("container");
  var PROTOCOL_VERSION = 1;
  var HANDSHAKE_TIMEOUT_MS = 12000;
  var OUTBOUND_TYPES = {
    "ready": true,
    "theme:ready": true,
    "theme:error": true,
    "agent:select": true,
    "agent:openChat": true,
    "agent:bind": true,
    "agent:unbind": true,
    "navigate": true
  };
  var ERROR_STAGES = { registration: true, initialization: true, handshake: true, runtime: true };

  function validOrigin(origin) {
    if (typeof origin !== "string" || !origin) return false;
    try {
      var parsed = new URL(origin);
      return (parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.origin === origin;
    } catch (err) {
      return false;
    }
  }
  PARENT_ORIGINS = PARENT_ORIGINS.filter(validOrigin);
  if (!validOrigin(PARENT_ORIGIN) || PARENT_ORIGINS.indexOf(PARENT_ORIGIN) === -1) {
    console.error("[arinova-sdk] invalid parent origin configuration");
    return;
  }
  if (!ASSET_BASE) {
    console.error("[arinova-sdk] missing asset base configuration");
    return;
  }
  if (window.__ARINOVA_BRIDGE_LOADED__) {
    console.warn("[arinova-sdk] bridge is already loaded");
    return;
  }
  Object.defineProperty(window, "__ARINOVA_BRIDGE_LOADED__", {
    value: true,
    writable: false,
    configurable: false
  });

  var channels = { agents: [], bindings: [], connectedAgents: [], resize: [] };
  function subscribe(channel, cb) {
    var list = channels[channel];
    if (!list || typeof cb !== "function") {
      console.warn("[arinova-sdk] cannot subscribe to unknown channel " + channel);
      return function () {};
    }
    list.push(cb);
    return function () {
      var idx = list.indexOf(cb);
      if (idx !== -1) list.splice(idx, 1);
    };
  }
  function broadcast(channel, payload) {
    var list = channels[channel];
    if (!list) return;
    var snapshot = list.slice();
    for (var i = 0; i < snapshot.length; i++) {
      if (list.indexOf(snapshot[i]) === -1) continue;
      try { snapshot[i](payload); } catch (err) { console.error("[arinova-sdk]", err); }
    }
  }

  // Until the parent has spoken we cannot know which allowlisted origin it is
  // on, so outbound messages fan out to every allowlisted origin (the browser
  // drops mismatched targetOrigin posts); afterwards they pin to the origin
  // the first validated inbound message arrived from.
  var activeParentOrigin = null;

  function send(type, body) {
    if (!Object.prototype.hasOwnProperty.call(OUTBOUND_TYPES, type)) {
      console.error("[arinova-sdk] refused unknown outbound message type " + type);
      return;
    }
    var payload = { type: type, protocol: PROTOCOL_VERSION };
    if (body) for (var k in body) {
      if (Object.prototype.hasOwnProperty.call(body, k) && k !== "type" && k !== "protocol" && k !== "bridgeToken") {
        payload[k] = body[k];
      }
    }
    payload.bridgeToken = BRIDGE_TOKEN;
    var targets = activeParentOrigin ? [activeParentOrigin] : PARENT_ORIGINS;
    for (var t = 0; t < targets.length; t++) {
      try {
        window.parent.postMessage(payload, targets[t]);
      } catch (err) {
        console.error("[arinova-sdk] failed to post " + type, err);
      }
    }
  }

  function joinAsset(rel) {
    if (!ASSET_BASE) throw new Error("Asset base is unavailable");
    var base = new URL(ASSET_BASE.replace(/\/?$/, "/"), window.location.href);
    if (!rel) return base.href;
    // A leading slash was always code-supported for flat assets — keep it.
    var clean = String(rel).replace(/^\/+/, "");
    if (/[/\\:]/.test(clean) || clean.indexOf("..") !== -1 || clean === ".") {
      throw new Error("Asset path must be a single flat filename");
    }
    var result = new URL(clean, base);
    if (result.origin !== base.origin || result.pathname.slice(0, base.pathname.length) !== base.pathname) {
      throw new Error("Asset path escapes the configured base");
    }
    return result.href;
  }

  var state = {
    themeId: THEME_ID,
    themeVersion: "0.0.0",
    user: null,
    agents: [],
    bindings: [],
    connectedAgents: [],
    width: window.innerWidth,
    height: window.innerHeight,
    isMobile: window.innerWidth < 768,
    pixelRatio: window.devicePixelRatio || 1
  };
  var jsonAssetCache = Object.create(null);
  var sdk = {
    get themeId() { return state.themeId; },
    get themeVersion() { return state.themeVersion; },
    get user() { return state.user; },
    get agents() { return state.agents; },
    get bindings() { return state.bindings; },
    get connectedAgents() { return state.connectedAgents; },
    get width() { return state.width; },
    get height() { return state.height; },
    get isMobile() { return state.isMobile; },
    get pixelRatio() { return state.pixelRatio; },
    assetUrl: joinAsset,
    getAgent: function (id) { return state.agents.find(function (a) { return a.id === id; }); },
    loadJSON: function (rel) {
      // assetUrl can throw; the declared contract is Promise<T>, so route the
      // failure into a rejection instead of a synchronous exception.
      return Promise.resolve().then(function () {
        var url = sdk.assetUrl(rel);
        if (jsonAssetCache[url]) return jsonAssetCache[url];
        var controller = new AbortController();
        var timeout = setTimeout(function () { controller.abort(); }, 15000);
        var request = fetch(url, {
          cache: "force-cache",
          signal: controller.signal
        }).then(function (r) {
          if (!r.ok) throw new Error("Failed to load " + rel);
          return r.json();
        }).finally(function () {
          clearTimeout(timeout);
        });
        jsonAssetCache[url] = request;
        request.catch(function () { delete jsonAssetCache[url]; });
        return request;
      });
    },
    get agent() { return state.agents.length ? state.agents[0] : null; },
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
  var themeStarted = false;
  var themeReady = false;
  var themeFailed = false;
  var handshakeTimer = null;

  function errorMessage(err) {
    var message = "";
    try {
      message = err && err.message ? String(err.message) : String(err || "Unknown error");
    } catch (ignored) {
      message = "Unknown error";
    }
    return message.replace(/[\r\n\t]+/g, " ").slice(0, 300);
  }

  var failedStage = null;

  function reportThemeError(stage, err) {
    if (themeFailed) return;
    if (!Object.prototype.hasOwnProperty.call(ERROR_STAGES, stage)) stage = "runtime";
    if (!themeReady) { themeFailed = true; failedStage = stage; }
    var message = errorMessage(err);
    console.error("[arinova-sdk] theme failed during " + stage, err);
    send("theme:error", { stage: stage, message: message });
  }

  function runTheme(theme) {
    if (themeStarted || themeReady || themeFailed) return;
    if (!theme || typeof theme.init !== "function") {
      reportThemeError("registration", new Error("Theme module does not export init()"));
      return;
    }
    themeStarted = true;
    Promise.resolve()
      .then(function () { return theme.init(sdk, mountTarget); })
      .then(function () {
        if (themeFailed) return;
        themeReady = true;
        send("theme:ready");
      })
      .catch(function (err) { reportThemeError("initialization", err); });
  }

  window.__ARINOVA_REGISTER_THEME__ = function (mod) {
    var theme = (mod && mod.default) ? mod.default : mod;
    if (!theme) {
      reportThemeError("registration", new Error("Theme module has no default export"));
      return;
    }
    if (hostReady) runTheme(theme);
    else pending = theme;
  };
  window.__ARINOVA_REPORT_THEME_ERROR__ = reportThemeError;

  var explicitIsMobile = null;

  function applyInit(data) {
    if (handshakeTimer !== null) { clearTimeout(handshakeTimer); handshakeTimer = null; }
    // A host that completes the handshake late (throttled tab, slow parent)
    // must still get a working theme — only the handshake failure is
    // recoverable, and only while the theme never started.
    if (themeFailed && failedStage === "handshake" && !themeStarted && !themeReady) {
      themeFailed = false;
      failedStage = null;
    }
    if (typeof data.themeId === "string" && data.themeId) state.themeId = data.themeId;
    if (typeof data.themeVersion === "string" && data.themeVersion) state.themeVersion = data.themeVersion;
    if (data.user && typeof data.user === "object" && typeof data.user.id === "string") state.user = data.user;
    if (Array.isArray(data.agents)) state.agents = data.agents;
    if (Array.isArray(data.bindings)) state.bindings = data.bindings;
    if (Array.isArray(data.connectedAgents)) state.connectedAgents = data.connectedAgents;
    if (typeof data.width === "number" && isFinite(data.width)) state.width = data.width;
    if (typeof data.height === "number" && isFinite(data.height)) state.height = data.height;
    if (typeof data.isMobile === "boolean") {
      state.isMobile = data.isMobile;
      explicitIsMobile = data.isMobile;
    } else {
      state.isMobile = state.width < 768;
      explicitIsMobile = null;
    }
    if (typeof data.pixelRatio === "number" && isFinite(data.pixelRatio) && data.pixelRatio > 0) state.pixelRatio = data.pixelRatio;
    if (!hostReady) {
      hostReady = true;
      if (pending) { var p = pending; pending = null; runTheme(p); }
    }
    broadcast("agents", state.agents);
    broadcast("bindings", state.bindings);
    broadcast("connectedAgents", state.connectedAgents);
    broadcast("resize", { width: state.width, height: state.height });
  }

  var handlers = Object.create(null);
  handlers["init"] = { apply: applyInit };
  handlers["agents:update"] = {
    valid: function (d) { return Array.isArray(d.agents); },
    apply: function (d) { state.agents = d.agents; broadcast("agents", state.agents); }
  };
  handlers["bindings:update"] = {
    valid: function (d) { return Array.isArray(d.bindings); },
    apply: function (d) { state.bindings = d.bindings; broadcast("bindings", state.bindings); }
  };
  handlers["connectedAgents:update"] = {
    valid: function (d) { return Array.isArray(d.connectedAgents); },
    apply: function (d) { state.connectedAgents = d.connectedAgents; broadcast("connectedAgents", state.connectedAgents); }
  };
  handlers.resize = {
    valid: function (d) {
      return (d.width === undefined || (typeof d.width === "number" && isFinite(d.width)))
        && (d.height === undefined || (typeof d.height === "number" && isFinite(d.height)));
    },
    apply: function (d) {
      if (typeof d.width === "number") state.width = d.width;
      if (typeof d.height === "number") state.height = d.height;
      // A host that classified the device explicitly in init keeps that
      // classification; only derived values are recomputed on resize.
      state.isMobile = explicitIsMobile !== null ? explicitIsMobile : state.width < 768;
      broadcast("resize", { width: state.width, height: state.height });
    }
  };

  function validateInbound(e) {
    if (e.source !== window.parent) return null;
    if (PARENT_ORIGINS.indexOf(e.origin) === -1) {
      console.warn("[arinova-sdk] ignored message from unexpected origin " + e.origin);
      return null;
    }
    var data = e.data;
    if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.type !== "string") return null;
    var protocol = data.protocol === undefined ? PROTOCOL_VERSION : data.protocol;
    if (protocol !== PROTOCOL_VERSION) return null;
    if (!BRIDGE_TOKEN || data.bridgeToken !== BRIDGE_TOKEN) return null;
    var entry = handlers[data.type];
    if (!entry || typeof entry.apply !== "function") return null;
    if (entry.valid && !entry.valid(data)) return null;
    return { entry: entry, data: data };
  }

  window.addEventListener("message", function (e) {
    var inbound = validateInbound(e);
    if (inbound) {
      if (activeParentOrigin === null) activeParentOrigin = e.origin;
      inbound.entry.apply(inbound.data);
    }
  });

  handshakeTimer = setTimeout(function () {
    handshakeTimer = null;
    if (!hostReady) reportThemeError("handshake", new Error("Host did not initialize the theme bridge"));
  }, HANDSHAKE_TIMEOUT_MS);
  send("ready");
})();
