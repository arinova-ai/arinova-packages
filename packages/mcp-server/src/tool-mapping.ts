import type { ActionDefinition, ActionManifest } from "./manifest.js";
import { logger } from "./logger.js";
import { BUILTIN_TOOL_NAMES } from "./builtins.js";
import Ajv, { type ValidateFunction } from "ajv";

export const MAX_REMOTE_SCHEMA_BYTES = 256 * 1024;
export const MAX_REMOTE_SCHEMA_DEPTH = 32;
export const MAX_REMOTE_SCHEMA_NODES = 10_000;

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  actionName: string;
  maxExecutionMs?: number;
  maxArgumentsBytes?: number;
  validateArguments: ValidateFunction;
}

export interface ToolMapping {
  tools: McpToolDefinition[];
  skippedActions: SkippedAction[];
}

export interface SkippedAction {
  actionName: string;
  reason: string;
}

export function normalizeToolName(actionName: string): string {
  return actionName
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 128);
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

function inspectRemoteSchema(schema: Record<string, unknown>): string | undefined {
  const serialized = JSON.stringify(schema);
  if (Buffer.byteLength(serialized, "utf8") > MAX_REMOTE_SCHEMA_BYTES) {
    return `schema exceeds ${MAX_REMOTE_SCHEMA_BYTES} byte budget`;
  }

  let nodes = 0;
  const stack: Array<{ value: unknown; depth: number }> = [{ value: schema, depth: 0 }];
  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes++;
    if (nodes > MAX_REMOTE_SCHEMA_NODES) {
      return `schema exceeds ${MAX_REMOTE_SCHEMA_NODES} node budget`;
    }
    if (current.depth > MAX_REMOTE_SCHEMA_DEPTH) {
      return `schema exceeds depth ${MAX_REMOTE_SCHEMA_DEPTH}`;
    }
    if (!current.value || typeof current.value !== "object") continue;

    for (const [key, value] of Object.entries(current.value)) {
      if (key === "pattern" || key === "patternProperties") {
        return `remote schemas cannot use ${key}`;
      }
      stack.push({ value, depth: current.depth + 1 });
    }
  }
  return undefined;
}

export function mapManifestToTools(manifest: ActionManifest): ToolMapping {
  const tools: McpToolDefinition[] = [];
  const skippedActions: SkippedAction[] = [];
  const seenToolNames = new Map<string, string>();
  const ajv = new Ajv({ allErrors: true, strict: false });

  for (const action of manifest.actions) {
    if (action.removed) {
      continue;
    }

    const toolName = normalizeToolName(action.name);
    if (!toolName) {
      skippedActions.push({ actionName: action.name, reason: "invalid_tool_name" });
      continue;
    }

    if (BUILTIN_TOOL_NAMES.has(toolName)) {
      skippedActions.push({ actionName: action.name, reason: "reserved_builtin_name" });
      continue;
    }

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

    const inputSchema = action.inputSchema ?? defaultInputSchema();
    const schemaSafetyError = inspectRemoteSchema(inputSchema);
    if (schemaSafetyError) {
      logger.warn(`Action ${action.name} has an unsafe input schema: ${schemaSafetyError}`);
      skippedActions.push({ actionName: action.name, reason: "unsafe_input_schema" });
      continue;
    }
    let validateArguments: ValidateFunction;
    try {
      validateArguments = ajv.compile(inputSchema);
    } catch (err) {
      logger.warn(
        `Action ${action.name} has an invalid input schema: ${err instanceof Error ? err.message : String(err)}`,
      );
      skippedActions.push({ actionName: action.name, reason: "invalid_input_schema" });
      continue;
    }

    tools.push({
      name: toolName,
      description: buildToolDescription(action),
      inputSchema,
      actionName: action.name,
      maxExecutionMs: action.maxExecutionMs,
      maxArgumentsBytes: action.maxArgumentsBytes,
      validateArguments,
    });
  }

  logger.info(
    `Mapped ${tools.length} tools from ${manifest.actions.length} actions; skipped ${skippedActions.length}`,
  );

  return { tools, skippedActions };
}
