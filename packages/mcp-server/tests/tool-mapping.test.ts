import { describe, it, expect } from "vitest";
import {
  normalizeToolName,
  buildToolDescription,
  mapManifestToTools,
} from "../src/tool-mapping.js";
import type { ActionDefinition, ActionManifest } from "../src/manifest.js";

describe("normalizeToolName", () => {
  it("converts dots to underscores", () => {
    expect(normalizeToolName("arinova.kanban.add_commit")).toBe(
      "arinova_kanban_add_commit",
    );
  });

  it("handles no dots", () => {
    expect(normalizeToolName("simple_action")).toBe("simple_action");
  });

  it("handles multiple consecutive dots", () => {
    expect(normalizeToolName("a..b")).toBe("a__b");
  });
});

describe("buildToolDescription", () => {
  it("includes action name", () => {
    const action: ActionDefinition = {
      name: "arinova.test.action",
      version: "1.0.0",
    };
    expect(buildToolDescription(action)).toContain(
      "Arinova action: arinova.test.action.",
    );
  });

  it("includes description", () => {
    const action: ActionDefinition = {
      name: "arinova.test.action",
      version: "1.0.0",
      description: "Does something",
    };
    expect(buildToolDescription(action)).toContain("Does something");
  });

  it("uses promptSummary when no description", () => {
    const action: ActionDefinition = {
      name: "arinova.test.action",
      version: "1.0.0",
      promptSummary: "Summary text",
    };
    expect(buildToolDescription(action)).toContain("Summary text");
  });

  it("marks deprecated actions", () => {
    const action: ActionDefinition = {
      name: "arinova.test.action",
      version: "1.0.0",
      deprecated: true,
      replacementAction: "arinova.test.new_action",
    };
    const desc = buildToolDescription(action);
    expect(desc).toContain("DEPRECATED");
    expect(desc).toContain("arinova.test.new_action");
  });

  it("includes confirmation policy", () => {
    const action: ActionDefinition = {
      name: "arinova.test.action",
      version: "1.0.0",
      confirmation: "user-confirm",
    };
    const desc = buildToolDescription(action);
    expect(desc).toContain("Confirmation policy: user-confirm");
    expect(desc).toContain("requires_confirmation");
  });
});

describe("mapManifestToTools", () => {
  it("maps actions to tools", () => {
    const manifest: ActionManifest = {
      manifestVersion: "1.0.0",
      actions: [
        {
          name: "arinova.kanban.add_commit",
          version: "1.0.0",
          description: "Add commit",
          inputSchema: {
            type: "object",
            properties: { cardId: { type: "string" } },
          },
        },
      ],
    };

    const mapping = mapManifestToTools(manifest);

    expect(mapping.tools).toHaveLength(1);
    expect(mapping.tools[0].name).toBe("arinova_kanban_add_commit");
    expect(mapping.tools[0].actionName).toBe("arinova.kanban.add_commit");
    expect(mapping.toolToAction.get("arinova_kanban_add_commit")).toBe(
      "arinova.kanban.add_commit",
    );
  });

  it("filters removed actions", () => {
    const manifest: ActionManifest = {
      manifestVersion: "1.0.0",
      actions: [
        {
          name: "arinova.old.action",
          version: "1.0.0",
          removed: true,
          inputSchema: { type: "object" },
        },
        {
          name: "arinova.new.action",
          version: "1.0.0",
          inputSchema: { type: "object" },
        },
      ],
    };

    const mapping = mapManifestToTools(manifest);

    expect(mapping.tools).toHaveLength(1);
    expect(mapping.tools[0].actionName).toBe("arinova.new.action");
  });

  it("skips actions without inputSchema", () => {
    const manifest: ActionManifest = {
      manifestVersion: "1.0.0",
      actions: [
        {
          name: "arinova.no_schema",
          version: "1.0.0",
        },
      ],
    };

    const mapping = mapManifestToTools(manifest);

    expect(mapping.tools).toHaveLength(0);
    expect(mapping.skippedActions).toHaveLength(1);
    expect(mapping.skippedActions[0].reason).toBe("missing_input_schema");
  });

  it("detects tool name collisions", () => {
    const manifest: ActionManifest = {
      manifestVersion: "1.0.0",
      actions: [
        {
          name: "arinova.foo_bar",
          version: "1.0.0",
          inputSchema: { type: "object" },
        },
        {
          name: "arinova.foo.bar",
          version: "1.0.0",
          inputSchema: { type: "object" },
        },
      ],
    };

    const mapping = mapManifestToTools(manifest);

    expect(mapping.tools).toHaveLength(1);
    expect(mapping.tools[0].actionName).toBe("arinova.foo_bar");
    expect(mapping.skippedActions).toHaveLength(1);
    expect(mapping.skippedActions[0].actionName).toBe("arinova.foo.bar");
    expect(mapping.skippedActions[0].reason).toContain("collision");
  });

  it("includes deprecated actions with warning", () => {
    const manifest: ActionManifest = {
      manifestVersion: "1.0.0",
      actions: [
        {
          name: "arinova.deprecated.action",
          version: "1.0.0",
          deprecated: true,
          replacementAction: "arinova.new.action",
          inputSchema: { type: "object" },
        },
      ],
    };

    const mapping = mapManifestToTools(manifest);

    expect(mapping.tools).toHaveLength(1);
    expect(mapping.tools[0].description).toContain("DEPRECATED");
  });

  it("preserves maxExecutionMs and maxArgumentsBytes", () => {
    const manifest: ActionManifest = {
      manifestVersion: "1.0.0",
      actions: [
        {
          name: "arinova.test.action",
          version: "1.0.0",
          inputSchema: { type: "object" },
          maxExecutionMs: 30000,
          maxArgumentsBytes: 1024,
        },
      ],
    };

    const mapping = mapManifestToTools(manifest);

    expect(mapping.tools[0].maxExecutionMs).toBe(30000);
    expect(mapping.tools[0].maxArgumentsBytes).toBe(1024);
  });
});
