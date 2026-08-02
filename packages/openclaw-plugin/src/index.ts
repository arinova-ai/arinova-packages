import {
  emptyPluginConfigSchema,
  type OpenClawPluginApi,
} from "openclaw/plugin-sdk/core";
import { arinovaChatPlugin } from "./channel.js";
import { setArinovaChatRuntime } from "./runtime.js";
import { initialize as initializeOffice, registerOffice, shutdown as shutdownOffice } from "./office/index.js";
import { registerCli } from "./cli.js";

export function buildArinovaPromptContext(): { prependContext: string } {
  return {
    prependContext: `[Arinova Chat Integration]
You are connected to Arinova Chat through authenticated channel capabilities managed by the host.
Reply normally; the channel streams your response automatically.
Never request, print, or construct authentication credentials or Authorization headers.
`,
  };
}

const plugin: {
  id: string;
  name: string;
  description: string;
  configSchema: ReturnType<typeof emptyPluginConfigSchema>;
  register: (api: OpenClawPluginApi) => void;
} = {
  id: "openclaw-arinova-ai",
  name: "Arinova Chat",
  description: "Arinova Chat channel plugin with Virtual Office integration (A2A protocol with native streaming)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setArinovaChatRuntime(api.runtime);
    api.registerChannel({ plugin: arinovaChatPlugin });

    // Virtual Office: register hooks and start tick loop
    registerOffice(api);

    // CLI: openclaw arinova <subcommand>
    registerCli(api);

    // Inject only a credential-free, allowlisted projection into model context.
    api.on("before_prompt_build", (_event, ctx) => {
      const provider = ctx.messageProvider;
      if (provider !== "openclaw-arinova-ai") return;
      return buildArinovaPromptContext();
    });

    // Hint on gateway start if not configured
    api.on("gateway_start", () => {
      initializeOffice();
      const channels = (api.config as Record<string, unknown>).channels as Record<string, unknown> | undefined;
      const arinova = (channels?.["openclaw-arinova-ai"] ?? {}) as Record<string, unknown>;
      const hasUrl = Boolean(arinova.apiUrl);
      // Check for agent token at top level or inside accounts
      let hasAgent = Boolean(arinova.agentId || arinova.botToken);
      if (!hasAgent && arinova.accounts && typeof arinova.accounts === "object") {
        const accounts = arinova.accounts as Record<string, { botToken?: string }>;
        hasAgent = Object.values(accounts).some((a) => Boolean(a?.botToken));
      }

      if (!hasUrl || !hasAgent) {
        api.logger.warn("[openclaw-arinova-ai] Not configured yet.");
        api.logger.warn("[openclaw-arinova-ai] Run:  arinova setup-openclaw");
        api.logger.warn("[openclaw-arinova-ai] Or manually: arinova auth login && arinova setup-openclaw");
      }
    });

    api.on("gateway_stop", () => {
      shutdownOffice();
    });

  },
};

// Office integration re-exports
export { officeState, handleSSEConnection, ingestHookEvent, configure as configureOffice } from "./office/index.js";
export { initialize as initializeOffice, isHealthy, shutdown as shutdownOffice } from "./office/index.js";
export type { AgentState, AgentStatus, TokenUsage, OfficeStatusEvent, InternalEvent, InternalEventType } from "./office/types.js";

export default plugin;
