/**
 * Arinova Office SDK v2 — Bridge Script
 *
 * Runs inside the theme iframe. Establishes a postMessage channel with the
 * host window and exposes a global SDK object for theme code to use.
 *
 * Protocol (host -> iframe):
 *   { type: "init", user, themeId, themeVersion, isMobile, pixelRatio, agents }
 *   { type: "agents:update", agents }
 *   { type: "resize", width, height }
 *
 * Protocol (iframe -> host):
 *   { type: "ready" }
 *   { type: "agent:select", agentId }
 *   { type: "agent:openChat", agentId }
 *   { type: "navigate", path }
 *   { type: "custom:event", event, data }
 */
(function () {
  "use strict";

  var THEME_ID = window.__ARINOVA_THEME_ID__ || "";
  var ASSETS_BASE = window.__ARINOVA_ASSETS_BASE__ || "";

  // Internal state
  var _agents = [];
  var _agentListeners = [];
  var _connectedAgents = [];
  var _bindings = [];
  var _bindingsListeners = [];
  var _user = { id: "", name: "", username: "" };
  var _themeVersion = "0.0.0";
  var _width = window.innerWidth;
  var _height = window.innerHeight;
  var _isMobile = false;
  var _pixelRatio = window.devicePixelRatio || 1;
  var _initialized = false;
  var _themeModule = null;
  var _container = null;

  // Send message to parent
  function postToHost(msg) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, "*");
    }
  }

  // ---------- SDK Object ----------

  var sdk = {
    // Agent data (read-only)
    get agents() {
      return _agents;
    },

    get agent() {
      return _agents.length > 0 ? _agents[0] : null;
    },

    onAgentsChange: function (callback) {
      _agentListeners.push(callback);
      return function () {
        var idx = _agentListeners.indexOf(callback);
        if (idx !== -1) _agentListeners.splice(idx, 1);
      };
    },

    getAgent: function (id) {
      return _agents.find(function (a) {
        return a.id === id;
      });
    },

    // Asset loading
    assetUrl: function (relativePath) {
      if (!relativePath) return "";
      // Strip leading slash
      if (relativePath.charAt(0) === "/") relativePath = relativePath.slice(1);
      return ASSETS_BASE + "/" + relativePath;
    },

    loadJSON: function (relativePath) {
      return fetch(sdk.assetUrl(relativePath)).then(function (r) {
        if (!r.ok) throw new Error("Failed to load " + relativePath);
        return r.json();
      });
    },

    loadFont: function (name, relativePath) {
      var url = sdk.assetUrl(relativePath);
      var face = new FontFace(name, "url(" + url + ")");
      return face.load().then(function (loaded) {
        document.fonts.add(loaded);
      });
    },

    // Connected agents (all agents available for binding)
    get connectedAgents() {
      return _connectedAgents;
    },

    // Bindings (slot-to-agent mappings)
    get bindings() {
      return _bindings;
    },

    bindAgent: function (slotIndex, agentId) {
      postToHost({ type: "agent:bind", slotIndex: slotIndex, agentId: agentId });
    },

    unbindAgent: function (slotIndex) {
      postToHost({ type: "agent:unbind", slotIndex: slotIndex });
    },

    onBindingsChange: function (callback) {
      _bindingsListeners.push(callback);
      return function () {
        var idx = _bindingsListeners.indexOf(callback);
        if (idx !== -1) _bindingsListeners.splice(idx, 1);
      };
    },

    // Events -> host
    selectAgent: function (agentId) {
      postToHost({ type: "agent:select", agentId: agentId });
    },

    openChat: function (agentId) {
      postToHost({ type: "agent:openChat", agentId: agentId });
    },

    navigate: function (path) {
      postToHost({ type: "navigate", path: path });
    },

    emit: function (event, data) {
      postToHost({ type: "custom:event", event: event, data: data });
    },

    // Environment info
    get width() {
      return _width;
    },
    get height() {
      return _height;
    },
    get isMobile() {
      return _isMobile;
    },
    get pixelRatio() {
      return _pixelRatio;
    },
    get user() {
      return _user;
    },
    get themeId() {
      return THEME_ID;
    },
    get themeVersion() {
      return _themeVersion;
    },
  };

  // ---------- Internal: notify listeners ----------

  function notifyBindingsListeners() {
    for (var i = 0; i < _bindingsListeners.length; i++) {
      try {
        _bindingsListeners[i](_bindings);
      } catch (e) {
        console.error("[ArinovaSDK] Bindings listener error:", e);
      }
    }
  }

  function notifyAgentListeners() {
    for (var i = 0; i < _agentListeners.length; i++) {
      try {
        _agentListeners[i](_agents);
      } catch (e) {
        console.error("[ArinovaSDK] Agent listener error:", e);
      }
    }
  }

  // ---------- Internal: init theme ----------

  function initTheme() {
    if (_initialized || !_themeModule) return;
    _initialized = true;

    _container = document.getElementById("container");
    if (!_container) {
      console.error("[ArinovaSDK] #container not found");
      return;
    }

    var mod = _themeModule.default || _themeModule;
    if (typeof mod.init === "function") {
      try {
        var result = mod.init(sdk, _container);
        if (result && typeof result.catch === "function") {
          result.catch(function (e) {
            console.error("[ArinovaSDK] theme init() error:", e);
          });
        }
      } catch (e) {
        console.error("[ArinovaSDK] theme init() error:", e);
      }
    }
  }

  // ---------- postMessage handler ----------

  window.addEventListener("message", function (e) {
    var data = e.data;
    if (!data || typeof data.type !== "string") return;

    switch (data.type) {
      case "init":
        _user = data.user || _user;
        _themeVersion = data.themeVersion || _themeVersion;
        _isMobile = !!data.isMobile;
        _pixelRatio = data.pixelRatio || _pixelRatio;
        if (data.agents) {
          _agents = data.agents;
          notifyAgentListeners();
        }
        if (data.connectedAgents) _connectedAgents = data.connectedAgents;
        if (data.bindings) {
          _bindings = data.bindings;
          notifyBindingsListeners();
        }
        if (data.width) _width = data.width;
        if (data.height) _height = data.height;
        initTheme();
        break;

      case "agents:update":
        _agents = data.agents || [];
        notifyAgentListeners();
        break;

      case "bindings:update":
        _bindings = data.bindings || [];
        notifyBindingsListeners();
        break;

      case "connectedAgents:update":
        _connectedAgents = data.connectedAgents || [];
        break;

      case "resize":
        _width = data.width || _width;
        _height = data.height || _height;
        if (_themeModule) {
          var mod = _themeModule.default || _themeModule;
          if (typeof mod.resize === "function") {
            try {
              mod.resize(_width, _height);
            } catch (e) {
              console.error("[ArinovaSDK] theme resize() error:", e);
            }
          }
        }
        break;
    }
  });

  // ---------- Expose SDK globally ----------

  window.__ARINOVA_SDK__ = sdk;

  // Also expose as ES-module-friendly global for import
  // Theme can do: const sdk = window.__ARINOVA_SDK__;

  // ---------- Auto-init when theme.js module loads ----------

  // The theme script is loaded with type="module" so it runs after this script.
  // We use a MutationObserver + polling fallback to detect when the module's
  // default export becomes available.

  // Hook into the module system: theme.js should assign its export
  // We provide a registration function as an alternative to auto-detection.
  window.__ARINOVA_REGISTER_THEME__ = function (themeModule) {
    _themeModule = themeModule;
    if (_user.id) {
      // Already received init
      initTheme();
    }
  };

  // For ES module themes that use `export default`, we need the theme.js
  // to call __ARINOVA_REGISTER_THEME__. The runtime HTML can also handle this
  // by appending a small inline script after the module loads.
  // As a convenience, we also set up a global that theme.js can import from.

  // Signal readiness to host
  postToHost({ type: "ready" });

  // Also handle window resize natively
  window.addEventListener("resize", function () {
    _width = window.innerWidth;
    _height = window.innerHeight;
    if (_themeModule) {
      var mod = _themeModule.default || _themeModule;
      if (typeof mod.resize === "function") {
        try {
          mod.resize(_width, _height);
        } catch (e) {
          console.error("[ArinovaSDK] theme resize() error:", e);
        }
      }
    }
  });
})();
