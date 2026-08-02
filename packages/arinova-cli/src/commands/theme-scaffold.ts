const ID_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

// ── Helpers ─────────────────────────────────────────────────

/** Slugify a theme name into a valid kebab-case id (server rule: ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$, ≤100). */
export function slugifyThemeId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
  return slug.length > 0 && ID_RE.test(slug) ? slug : "my-theme";
}

/** The scaffolded theme.js — runtime-correct and CSP-safe (CSSOM styling, string currentTask). */
export function scaffoldThemeJs(name: string): string {
  return `// ${name} — Arinova Office theme
// The runtime calls only init(sdk, container). Subscribe to viewport changes
// with sdk.onResize(). The runtime CSP blocks author style elements and inline
// style attributes, so set styles via the CSSOM (element.style) in JS instead.

export default {
  init(sdk, container) {
    const grid = document.createElement("div");
    Object.assign(grid.style, {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
      gap: "12px",
      padding: "16px",
      height: "100%",
      alignContent: "start",
      boxSizing: "border-box",
      fontFamily: "system-ui, sans-serif",
    });
    container.appendChild(grid);

    const BORDER = {
      working: "#4ade80", idle: "#64748b", blocked: "#f87171",
      collaborating: "#60a5fa", unbound: "#334155",
    };

    function render(agents) {
      grid.replaceChildren();
      agents.forEach((a) => {
        const card = document.createElement("div");
        Object.assign(card.style, {
          background: "#1e293b",
          borderRadius: "12px",
          padding: "16px",
          cursor: "pointer",
          color: "#f1f5f9",
          border: "2px solid " + (BORDER[a.status] || "transparent"),
        });

        const nameEl = document.createElement("div");
        Object.assign(nameEl.style, { fontSize: "16px", fontWeight: "600" });
        nameEl.textContent = (a.emoji || "🤖") + " " + a.name;

        const roleEl = document.createElement("div");
        Object.assign(roleEl.style, { fontSize: "13px", color: "#94a3b8", marginTop: "2px" });
        roleEl.textContent = a.role || "";

        card.append(nameEl, roleEl);

        // currentTask is a plain string (undefined when idle).
        if (a.currentTask) {
          const taskEl = document.createElement("div");
          Object.assign(taskEl.style, { fontSize: "12px", color: "#4ade80", marginTop: "8px" });
          taskEl.textContent = a.currentTask;
          card.append(taskEl);
        }

        card.addEventListener("click", () => sdk.selectAgent(a.id));
        grid.append(card);
      });
    }

    render(sdk.agents);
    sdk.onAgentsChange(render);
    sdk.onResize((size) => {
      grid.style.gridTemplateColumns =
        size.width < 480 ? "1fr" : "repeat(auto-fill, minmax(160px, 1fr))";
    });
  },
};
`;
}
