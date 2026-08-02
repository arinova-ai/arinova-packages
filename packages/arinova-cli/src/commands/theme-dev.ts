/**
 * Dev runtime HTML. Mirrors the production runtime: sets the same globals, loads
 * the REAL bridge, and drives it over the real postMessage protocol (bridgeToken
 * + origin checks) from an in-page host emulator with mock data shaped exactly
 * like the real Agent. Same document acts as parent, so window.parent === window.
 */
export function generateDevHtml(themeId: string, themeName: string): string {
  const safeId = JSON.stringify(themeId);
  const safeTitle = escapeHtml(themeName);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle} — Dev</title>
</head>
<body style="margin:0">
<div id="container" style="width:100vw;height:100vh"></div>
<script>
  // Must run before bridge.js: globals + a per-session bridge token in the hash.
  window.__ARINOVA_THEME_ID__ = ${safeId};
  window.__ARINOVA_ASSETS_BASE__ = "/assets";
  window.__ARINOVA_PARENT_ORIGIN__ = location.origin;
  if (!/bridgeToken=/.test(location.hash)) location.hash = "bridgeToken=arinova-dev";
</script>
<script src="/bridge.js"></script>
<script>
  // In-page host emulator — speaks the real protocol to the bridge.
  (function () {
    var TOKEN = new URLSearchParams(location.hash.slice(1)).get("bridgeToken") || "";
    var ORIGIN = location.origin;
    var NAMES = ["Alice", "Bob", "Charlie", "Diana", "Eve"];
    var ROLES = ["Engineer", "Designer", "PM", "QA", "Writer"];
    var EMOJIS = ["\\uD83D\\uDC69\\u200D\\uD83D\\uDCBB", "\\uD83D\\uDC68\\u200D\\uD83D\\uDD27", "\\uD83E\\uDDD1\\u200D\\uD83C\\uDFA8", "\\uD83E\\uDDD1\\u200D\\uD83D\\uDD2C", "\\u270D\\uFE0F"];
    var COLORS = ["#f472b6", "#60a5fa", "#4ade80", "#fbbf24", "#a78bfa"];
    var STATUSES = ["working", "idle", "blocked", "collaborating"];

    function makeAgents() {
      var now = Date.now();
      return NAMES.map(function (name, i) {
        var status = STATUSES[Math.floor(Math.random() * STATUSES.length)];
        return {
          id: "agent-" + (i + 1),
          name: name,
          role: ROLES[i],
          emoji: EMOJIS[i],
          color: COLORS[i],
          status: status,
          online: true,
          currentTask: status === "working" ? "Working on task #" + (i + 1) : undefined,
          taskStartedAt: status === "working" ? now - Math.floor(Math.random() * 600000) : undefined,
          recentActivity: [{ time: new Date().toLocaleTimeString(), text: "Status: " + status }],
          model: "claude-sonnet-4-5",
          tokenUsage: { contextPercent: Math.floor(Math.random() * 100) + "%" },
        };
      });
    }

    var agents = makeAgents();
    var connectedAgents = agents.map(function (a) { return { id: a.id, name: a.name }; });
    var bindings = [];
    var user = { id: "dev-user", name: "Developer", username: "dev" };

    function post(msg) {
      msg.bridgeToken = TOKEN;
      window.postMessage(msg, ORIGIN);
    }
    function sendInit() {
      post({
        type: "init", user: user, themeId: ${safeId}, themeVersion: "0.0.0",
        isMobile: window.innerWidth < 768, pixelRatio: window.devicePixelRatio || 1,
        agents: agents, connectedAgents: connectedAgents, bindings: bindings,
        width: window.innerWidth, height: window.innerHeight,
      });
    }

    window.addEventListener("message", function (e) {
      if (e.source !== window || e.origin !== ORIGIN) return;
      var d = e.data;
      if (!d || typeof d.type !== "string" || d.bridgeToken !== TOKEN) return;
      switch (d.type) {
        case "ready": sendInit(); break;
        case "agent:select": console.log("[dev] selectAgent", d.agentId); break;
        case "agent:openChat": console.log("[dev] openChat", d.agentId); break;
        case "navigate": console.log("[dev] navigate", d.path); break;
        case "agent:bind":
          bindings = bindings.filter(function (b) { return b.slotIndex !== d.slotIndex; });
          bindings.push({ slotIndex: d.slotIndex, agentId: d.agentId });
          post({ type: "bindings:update", bindings: bindings });
          break;
        case "agent:unbind":
          bindings = bindings.filter(function (b) { return b.slotIndex !== d.slotIndex; });
          post({ type: "bindings:update", bindings: bindings });
          break;
      }
    });

    setInterval(function () {
      agents = makeAgents();
      post({ type: "agents:update", agents: agents });
    }, 5000);

    window.addEventListener("resize", function () {
      post({ type: "resize", width: window.innerWidth, height: window.innerHeight });
    });
  })();
</script>
<script type="module">
  import theme from "/theme.js";
  window.__ARINOVA_REGISTER_THEME__(theme);
</script>
<script>
  var es = new EventSource("/__reload");
  es.onmessage = function (e) { if (e.data === "reload") location.reload(); };
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
