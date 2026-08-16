import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { registerApiCommands } from "./cli/api-commands.js";
import { registerSetupCommand } from "./cli/setup.js";

export { defineApiCommand, resolveAccountWithOverrides } from "./cli/api-commands.js";

export function registerCli(api: OpenClawPluginApi): void {
  api.registerCli(
    async (ctx) => {
      const arinova = ctx.program
        .command("arinova")
        .description("Arinova Chat commands")
        .option("--agent <name>", "Account name from openclaw config")
        .option("--token <botToken>", "Bot token (overrides --agent and default)");

      registerSetupCommand(arinova, ctx.config, api);
      registerApiCommands(arinova);
    },
    { commands: ["arinova"] },
  );
}
