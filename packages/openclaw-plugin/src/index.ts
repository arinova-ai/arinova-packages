import {
  emptyPluginConfigSchema,
  type OpenClawConfig,
  type OpenClawPluginApi,
} from "openclaw/plugin-sdk/core";
import { arinovaChatPlugin } from "./channel.js";
import { setArinovaChatRuntime } from "./runtime.js";
import { exchangeBotToken } from "./auth.js";
import { registerOffice, shutdown as shutdownOffice } from "./office/index.js";
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

    // CLI: openclaw arinova setup-openclaw --token <bot-token> [--api-url <url>]
    api.registerCli(
      async (ctx) => {
        const arinova = ctx.program.commands.find((c: any) => c.name() === "arinova")
          ?? ctx.program.command("arinova").description("Arinova Chat commands");
        arinova
          .command("setup-openclaw")
          .description("Connect to an Arinova Chat bot using a bot token")
          .requiredOption("--token <bot-token>", "Bot token from Arinova Chat bot settings (ari_...)")
          .option("--api-url <url>", "Arinova Chat backend URL (default: https://api.chat.arinova.ai)")
          .action(async (opts: { token: string; apiUrl?: string }) => {
            const channelCfg = (ctx.config as Record<string, unknown>).channels as Record<string, unknown> | undefined;
            const arinovaCfg = (channelCfg?.["openclaw-arinova-ai"] ?? {}) as Record<string, unknown>;
            const apiUrl = opts.apiUrl ?? (arinovaCfg.apiUrl as string | undefined) ?? "https://api.chat.arinova.ai";

            console.log(`Connecting to ${apiUrl} using bot token...`);

            try {
              const result = await exchangeBotToken({
                apiUrl,
                botToken: opts.token,
              });
              console.log(`Connected! Agent: "${result.name}" (id: ${result.agentId})`);

              // Persist to config
              const arinovaUpdate: Record<string, unknown> = {
                ...arinovaCfg,
                enabled: true,
                apiUrl,
                agentId: result.agentId,
                botToken: opts.token,
              };

              const updatedCfg = {
                ...ctx.config,
                channels: {
                  ...channelCfg,
                  "openclaw-arinova-ai": arinovaUpdate,
                },
              };

              await api.runtime.config.replaceConfigFile({
                nextConfig: updatedCfg as OpenClawConfig,
                afterWrite: { mode: "auto" },
              });
              console.log("Config saved to openclaw.json");
              console.log("\nRestart the gateway to connect: openclaw gateway start");
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`Connection failed: ${msg}`);
              process.exit(1);
            }
          });
      },
      { commands: ["arinova"] },
    );
  },
};

// Office integration re-exports
export { officeState, handleSSEConnection, ingestHookEvent, configure as configureOffice } from "./office/index.js";
export { initialize as initializeOffice, shutdown as shutdownOffice } from "./office/index.js";
export type { AgentState, AgentStatus, TokenUsage, OfficeStatusEvent, InternalEvent, InternalEventType } from "./office/types.js";

export default plugin;
