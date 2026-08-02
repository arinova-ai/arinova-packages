import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { McpServerConfig } from "./config.js";
import type { ArinovaClient } from "./arinova-client.js";
import type { McpToolDefinition, ToolMapping } from "./tool-mapping.js";
import { normalizeResult, shouldReportAsError } from "./result.js";
import { ActionExecutionError } from "./errors.js";
import { logger } from "./logger.js";
import { BUILTIN_TOOLS } from "./builtins.js";
import type { ActionCallOptions } from "./action-types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import packageJson from "../package.json" with { type: "json" };

export const PACKAGE_VERSION = packageJson.version;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function toolMappingFingerprint(tools: McpToolDefinition[]): string {
  return JSON.stringify(
    [...tools]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((tool) => stableValue({
        name: tool.name,
        actionName: tool.actionName,
        description: tool.description,
        inputSchema: tool.inputSchema,
        maxExecutionMs: tool.maxExecutionMs,
        maxArgumentsBytes: tool.maxArgumentsBytes,
      })),
  );
}

function textResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    ...(isError && { isError: true }),
  };
}

function errorResult(
  code: string,
  message: string,
  options: {
    action?: string;
    callId?: string;
    statusCode?: number;
    details?: Record<string, unknown>;
  } = {},
) {
  return textResult(
    {
      ok: false,
      status: "error",
      ...(options.action && { action: options.action }),
      ...(options.callId && { callId: options.callId }),
      error: {
        code,
        message,
        ...(options.statusCode && { statusCode: options.statusCode }),
        ...(options.details && { details: options.details }),
      },
    },
    true,
  );
}

export class ArinovaMcpServer {
  private server: Server;
  private client: ArinovaClient;
  private config: McpServerConfig;
  private dynamicTools = new Map<string, McpToolDefinition>();
  private toolsLoaded = false;
  private toolLoadPromise: Promise<void> | null = null;

  constructor(config: McpServerConfig, client: ArinovaClient) {
    this.config = config;
    this.client = client;

    this.server = new Server(
      { name: "arinova-mcp", version: PACKAGE_VERSION },
      {
        capabilities: {
          tools: { listChanged: true },
        },
      },
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      await this.ensureToolsLoaded();
      return { tools: this.getToolList() };
    });

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        const { name, arguments: args } = request.params;
        return this.handleToolCall(name, args ?? {});
      },
    );
  }

  private getToolList() {
    return [
      ...BUILTIN_TOOLS.map(({ handler: _handler, ...tool }) => tool),
      ...[...this.dynamicTools.values()].map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    ];
  }

  private async handleToolCall(name: string, args: Record<string, unknown>) {
    const builtin = BUILTIN_TOOLS.find((tool) => tool.name === name);
    switch (builtin?.handler) {
      case "health":
        return this.handleHealth();
      case "refresh_manifest":
        return this.handleRefreshManifest();
      default:
        return this.handleActionCall(name, args);
    }
  }

  private handleHealth() {
    return textResult(this.client.getHealthData());
  }

  private async handleRefreshManifest() {
    try {
      const mapping = await this.client.loadManifest();
      const changed = this.applyToolMapping(mapping);

      return textResult({
        ...this.client.getManifestInfo(),
        toolListChanged: changed,
      });
    } catch (err) {
      return textResult(
        {
          ok: false,
          status: "manifest_unavailable",
          error: err instanceof Error ? err.message : String(err),
        },
        true,
      );
    }
  }

  private applyToolMapping(mapping: ToolMapping, notify = true): boolean {
    const changed =
      toolMappingFingerprint([...this.dynamicTools.values()])
      !== toolMappingFingerprint(mapping.tools);
    this.dynamicTools = new Map(mapping.tools.map((tool) => [tool.name, tool]));
    this.toolsLoaded = true;
    if (changed && notify) {
      this.server.sendToolListChanged().catch((err) => {
        logger.warn(
          `Failed to notify MCP client about tool list change: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
    return changed;
  }

  private async handleActionCall(
    toolName: string,
    args: Record<string, unknown>,
  ) {
    const toolDef = this.resolveTool(toolName);
    if (!toolDef) {
      return errorResult(
        "UNKNOWN_TOOL",
        `Tool "${toolName}" is not registered. Call arinova_refresh_manifest to update the tool list.`,
      );
    }

    const { actionArgs, options } = splitActionInput(args);
    const validationError = this.validateArgs(toolDef, actionArgs);
    if (validationError) {
      return errorResult("INVALID_ARGUMENTS", validationError.message, {
        action: toolDef.actionName,
        details: validationError.details,
      });
    }

    return this.dispatchAction(toolDef, actionArgs, options);
  }

  private resolveTool(toolName: string): McpToolDefinition | undefined {
    return this.dynamicTools.get(toolName);
  }

  private validateArgs(
    toolDef: McpToolDefinition,
    args: Record<string, unknown>,
  ): { message: string; details: Record<string, unknown> } | undefined {
    if (toolDef.validateArguments(args)) return undefined;
    const errors = toolDef.validateArguments.errors ?? [];
    return {
      message: `Arguments do not match the input schema for ${toolDef.actionName}`,
      details: { validationErrors: errors },
    };
  }

  private async dispatchAction(
    toolDef: McpToolDefinition,
    args: Record<string, unknown>,
    options: Partial<ActionCallOptions>,
  ) {

    const startTime = Date.now();
    logger.info(`Action call start: ${toolDef.actionName}`);

    try {
      const result = await this.client.callAction(toolDef.actionName, args, {
        ...options,
        timeoutMs: toolDef.maxExecutionMs ?? options.timeoutMs,
      }, toolDef.maxArgumentsBytes);

      const elapsed = Date.now() - startTime;
      const response = normalizeResult(result);
      logger.info(
        `Action call end: ${toolDef.actionName} callId=${result.callId} status=${result.status} traceId=${result.traceId ?? "none"} elapsed=${elapsed}ms`,
      );

      return textResult(response, shouldReportAsError(response));
    } catch (err) {
      const elapsed = Date.now() - startTime;
      const code =
        err instanceof ActionExecutionError ? err.code : "EXECUTION_ERROR";
      const message = err instanceof Error ? err.message : String(err);

      logger.error(
        `Action call error: ${toolDef.actionName} code=${code} elapsed=${elapsed}ms error=${message}`,
      );

      return errorResult(code, message, {
        action: toolDef.actionName,
        callId: err instanceof ActionExecutionError ? err.callId : undefined,
        statusCode:
          err instanceof ActionExecutionError ? err.statusCode : undefined,
        details: err instanceof ActionExecutionError ? err.details : undefined,
      });
    }
  }

  private async ensureToolsLoaded(): Promise<void> {
    if (this.toolsLoaded) return;
    if (this.toolLoadPromise) return this.toolLoadPromise;

    this.toolLoadPromise = (async () => {
      try {
        await this.client.connect();
        const mapping =
          this.client.getToolMapping() ?? (await this.client.loadManifest());
        this.applyToolMapping(mapping, false);
      } catch (err) {
        logger.warn(
          `MCP tool list requested before manifest was available: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        this.toolLoadPromise = null;
      }
    })();

    return this.toolLoadPromise;
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.connectTransport(transport);
    logger.info("MCP stdio server started");

    if (this.config.startupMode === "strict") {
      await this.initializeStrict();
    } else {
      this.initializeLazy();
    }

  }

  async connectTransport(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }

  private async initializeStrict(): Promise<void> {
    logger.info("Strict startup: connecting and loading manifest");
    await this.client.connect();
    const mapping = await this.client.loadManifest();
    this.applyToolMapping(mapping);
  }

  private initializeLazy(): void {
    logger.info("Lazy startup: deferring connection and manifest load");
    this.connectAndLoadInBackground();
  }

  private connectAndLoadInBackground(): void {
    (async () => {
      try {
        await this.client.connect();
        const mapping = await this.client.loadManifest();
        this.applyToolMapping(mapping);
      } catch (err) {
        logger.warn(
          `Background initialization failed: ${err instanceof Error ? err.message : String(err)}. Tools will be available after successful arinova_refresh_manifest.`,
        );
      }
    })();
  }

  async shutdown(): Promise<void> {
    logger.info("Shutting down MCP server");
    await this.client.drain(this.config.actionTimeoutMs);
    this.client.disconnect();
    await this.server.close();
  }
}

const ACTION_OPTION_KEYS = new Set<keyof ActionCallOptions>([
  "callId",
  "taskId",
  "conversationId",
  "messageId",
  "parentCallId",
  "reason",
  "metadata",
  "dryRun",
  "timeoutMs",
]);

function splitActionInput(args: Record<string, unknown>): {
  actionArgs: Record<string, unknown>;
  options: Partial<ActionCallOptions>;
} {
  const { _arinova, ...actionArgs } = args;
  if (!_arinova || typeof _arinova !== "object" || Array.isArray(_arinova)) {
    return { actionArgs, options: {} };
  }
  const options = Object.fromEntries(
    Object.entries(_arinova as Record<string, unknown>).filter(([key]) =>
      ACTION_OPTION_KEYS.has(key as keyof ActionCallOptions),
    ),
  ) as Partial<ActionCallOptions>;
  return { actionArgs, options };
}
