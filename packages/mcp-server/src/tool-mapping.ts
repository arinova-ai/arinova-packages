import type { ActionDefinition, ActionManifest } from "./manifest.js";
import { logger } from "./logger.js";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  actionName: string;
  maxExecutionMs?: number;
  maxArgumentsBytes?: number;
}

export interface ToolMapping {
  tools: McpToolDefinition[];
  toolToAction: Map<string, string>;
  skippedActions: SkippedAction[];
}

export interface SkippedAction {
  actionName: string;
  reason: string;
}

export function normalizeToolName(actionName: string): string {
  return actionName.replace(/\./g, "_");
}

export function buildToolDescription(action: ActionDefinition): string {
  const lines: string[] = [];
  lines.push(`Arinova action: ${action.name}.`);

  const desc = action.description ?? action.promptSummary;
  if (desc) {
    lines.push(desc);
  }

  if (action.deprecated) {
    const replacement = action.replacementAction
      ? ` Use ${action.replacementAction} instead.`
      : "";
    lines.push(`DEPRECATED.${replacement}`);
  }

  if (action.confirmation) {
    lines.push(
      `Confirmation policy: ${action.confirmation}. Returns requires_confirmation when user approval is needed; do not treat that as success.`,
    );
  }

  return lines.join(" ");
}

function defaultInputSchema(): Record<string, unknown> {
  return { type: "object", properties: {} };
}

export function mapManifestToTools(manifest: ActionManifest): ToolMapping {
  const tools: McpToolDefinition[] = [];
  const toolToAction = new Map<string, string>();
  const skippedActions: SkippedAction[] = [];
  const seenToolNames = new Map<string, string>();

  for (const action of manifest.actions) {
    if (action.removed) {
      continue;
    }

    if (!action.inputSchema) {
      logger.warn(
        `Action ${action.name} has no inputSchema; skipping tool registration`,
      );
      skippedActions.push({
        actionName: action.name,
        reason: "missing_input_schema",
      });
      continue;
    }

    const toolName = normalizeToolName(action.name);

    const existing = seenToolNames.get(toolName);
    if (existing) {
      logger.warn(
        `Tool name collision: "${toolName}" maps to both "${existing}" and "${action.name}"; skipping "${action.name}"`,
      );
      skippedActions.push({
        actionName: action.name,
        reason: `collision_with_${existing}`,
      });
      continue;
    }

    seenToolNames.set(toolName, action.name);

    if (action.deprecated) {
      logger.warn(
        `Action ${action.name} is deprecated${action.replacementAction ? `; replacement: ${action.replacementAction}` : ""}`,
      );
    }

    tools.push({
      name: toolName,
      description: buildToolDescription(action),
      inputSchema: action.inputSchema ?? defaultInputSchema(),
      actionName: action.name,
      maxExecutionMs: action.maxExecutionMs,
      maxArgumentsBytes: action.maxArgumentsBytes,
    });

    toolToAction.set(toolName, action.name);
  }

  logger.info(
    `Mapped ${tools.length} tools from ${manifest.actions.length} actions; skipped ${skippedActions.length}`,
  );

  return { tools, toolToAction, skippedActions };
}
