export const BUILTIN_TOOLS = [
  {
    name: "arinova_health",
    description:
      "Reports MCP process health, Arinova connection state, manifest status, queue depth, and last error. Does not invoke any platform action.",
    inputSchema: { type: "object" as const, properties: {} },
    handler: "health" as const,
  },
  {
    name: "arinova_refresh_manifest",
    description:
      "Refreshes the Arinova action manifest and reports the current version and action count. Clients are notified when exposed tools or their action bindings change.",
    inputSchema: { type: "object" as const, properties: {} },
    handler: "refresh_manifest" as const,
  },
] as const;

export const BUILTIN_TOOL_NAMES = new Set<string>(
  BUILTIN_TOOLS.map((tool) => tool.name),
);
