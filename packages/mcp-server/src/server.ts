import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { McpServerConfig } from "./config.js";
import type { ArinovaClient } from "./arinova-client.js";
import type { McpToolDefinition } from "./tool-mapping.js";
import { normalizeResult, shouldReportAsError } from "./result.js";
import { ActionExecutionError } from "./errors.js";
import { logger } from "./logger.js";

const PACKAGE_VERSION = "0.0.19-staging.1";

function textResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    ...(isError && { isError: true }),
  };
}

export class ArinovaMcpServer {
  private server: Server;
  private client: ArinovaClient;
  private config: McpServerConfig;
  private dynamicTools: McpToolDefinition[] = [];
  private initialized = false;

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
    const staticTools = [
      {
        name: "arinova_health",
        description:
          "Reports MCP process health, Arinova connection state, manifest status, queue depth, and last error. Does not invoke any platform action.",
        inputSchema: { type: "object" as const, properties: {} },
      },
      {
        name: "arinova_refresh_manifest",
        description:
          "Refreshes the Arinova action manifest and reports the current version and action count. If tools changed, a restart may be required for MCP clients to see the updated tool list.",
        inputSchema: { type: "object" as const, properties: {} },
      },
    ];

    return [
      ...staticTools,
      ...this.dynamicTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    ];
  }

  private async handleToolCall(name: string, args: Record<string, unknown>) {
    switch (name) {
      case "arinova_health":
        return this.handleHealth();
      case "arinova_refresh_manifest":
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
      const previousCount = this.dynamicTools.length;
      this.dynamicTools = mapping.tools;

      const changed = previousCount !== mapping.tools.length;
      if (changed) {
        this.server.sendToolListChanged().catch(() => {});
      }

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

  private async handleActionCall(
    toolName: string,
    args: Record<string, unknown>,
  ) {
    const toolDef = this.dynamicTools.find((t) => t.name === toolName);
    if (!toolDef) {
      return textResult(
        {
          ok: false,
          status: "error",
          error: {
            code: "UNKNOWN_TOOL",
            message: `Tool "${toolName}" is not registered. Call arinova_refresh_manifest to update the tool list.`,
          },
        },
        true,
      );
    }

    if (toolDef.maxArgumentsBytes) {
      const argSize = Buffer.byteLength(JSON.stringify(args), "utf8");
      if (argSize > toolDef.maxArgumentsBytes) {
        return textResult(
          {
            ok: false,
            status: "error",
            action: toolDef.actionName,
            error: {
              code: "ARGUMENTS_TOO_LARGE",
              message: `Arguments size ${argSize} exceeds limit ${toolDef.maxArgumentsBytes}`,
            },
          },
          true,
        );
      }
    }

    const startTime = Date.now();
    logger.info(`Action call start: ${toolDef.actionName}`);

    try {
      const result = await this.client.callAction(toolDef.actionName, args, {
        timeoutMs: toolDef.maxExecutionMs,
      });

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

      return textResult(
        {
          ok: false,
          status: "error",
          action: toolDef.actionName,
          error: { code, message },
        },
        true,
      );
    }
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info("MCP stdio server started");

    if (this.config.startupMode === "strict") {
      await this.initializeStrict();
    } else {
      this.initializeLazy();
    }

    this.initialized = true;
  }

  private async initializeStrict(): Promise<void> {
    logger.info("Strict startup: connecting and loading manifest");
    await this.client.connect();
    const mapping = await this.client.loadManifest();
    this.dynamicTools = mapping.tools;
    this.server.sendToolListChanged().catch(() => {});
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
        this.dynamicTools = mapping.tools;
        this.server.sendToolListChanged().catch(() => {});
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
