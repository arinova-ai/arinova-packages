import type { OpenClawConfig, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { normalizeTrustedApiUrl } from "../api-endpoint.js";
import { exchangeBotToken } from "../auth.js";
import type { CliCommand } from "./api-commands.js";

export function registerSetupCommand(
  arinova: CliCommand,
  config: OpenClawConfig,
  api: OpenClawPluginApi,
): void {
  arinova
    .command("setup-openclaw")
    .description("Connect to an Arinova Chat bot using a bot token")
    .requiredOption("--token <bot-token>", "Bot token from Arinova Chat bot settings (ari_...)")
    .option("--api-url <url>", "Arinova Chat backend URL")
    .action(async (opts: { token: string; apiUrl?: string }) => {
      const channelConfig = (config as Record<string, unknown>).channels as
        | Record<string, unknown>
        | undefined;
      const current = (channelConfig?.["openclaw-arinova-ai"] ?? {}) as Record<string, unknown>;
      const apiUrl = normalizeTrustedApiUrl(
        opts.apiUrl ?? (current.apiUrl as string | undefined) ?? "https://api.chat.arinova.ai",
      );
      const result = await exchangeBotToken({ apiUrl, botToken: opts.token });
      const nextConfig = {
        ...config,
        channels: {
          ...channelConfig,
          "openclaw-arinova-ai": {
            ...current,
            enabled: true,
            apiUrl,
            agentId: result.agentId,
            botToken: opts.token,
          },
        },
      };
      await api.runtime.config.replaceConfigFile({
        nextConfig: nextConfig as OpenClawConfig,
        afterWrite: { mode: "auto" },
      });
      console.log(`Connected to ${apiUrl} as "${result.name}" (${result.agentId}).`);
    });
}
