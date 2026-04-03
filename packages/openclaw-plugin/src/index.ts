import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { arinovaChatPlugin } from "./channel.js";
import { setArinovaChatRuntime } from "./runtime.js";
import { exchangeBotToken } from "./auth.js";
import { registerOffice, shutdown as shutdownOffice } from "./office/index.js";
import { registerCli } from "./cli.js";

const plugin: {
  id: string;
  name: string;
  description: string;
  configSchema: ReturnType<typeof emptyPluginConfigSchema>;
  register: (api: OpenClawPluginApi) => void;
  destroy: () => void;
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

    // Inject Arinova Chat tool docs into agent context
    (api as unknown as { on: (event: string, cb: (...args: unknown[]) => unknown) => void }).on("before_prompt_build", (_event: unknown, ctx: unknown) => {
      const ctxRec = ctx as Record<string, unknown>;
      const provider = ctxRec.messageProvider as string | undefined;
      if (provider !== "openclaw-arinova-ai") return;

      const accountId = ctxRec.accountId as string | undefined;
      const channels = (api.config as Record<string, unknown>).channels as Record<string, unknown> | undefined;
      const arinova = (channels?.["openclaw-arinova-ai"] ?? {}) as Record<string, unknown>;
      const apiUrl = (arinova.apiUrl as string) ?? "https://api.chat.arinova.ai";
      const accounts = (arinova.accounts ?? {}) as Record<string, Record<string, unknown>>;
      const account = accountId ? accounts[accountId] : undefined;
      const botToken = account?.botToken as string | undefined;

      if (!botToken) return;

      return {
        prependContext: `[Arinova Chat Integration]
You are connected to Arinova Chat. Here are the APIs available to you:

## Proactive Messaging
To send a message to the user without waiting for their input:
\`\`\`
curl -s -X POST ${apiUrl}/api/v1/messages/send \\
  -H "Authorization: Bearer ${botToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"conversationId": "<CONVERSATION_ID>", "content": "<MESSAGE>"}'
\`\`\`
The conversationId is available from the inbound message context (the From field contains openclaw-arinova-ai:<conversationId>).

## File Upload
To upload a file and get a URL:
\`\`\`
curl -s -X POST ${apiUrl}/api/v1/files/upload \\
  -H "Authorization: Bearer ${botToken}" \\
  -F "conversationId=<CONVERSATION_ID>" \\
  -F "file=@/path/to/file;type=image/png"
\`\`\`
Response: {"url": "https://...", "fileName": "...", "fileType": "...", "fileSize": 1234}

## Sending Images
After uploading, use markdown image syntax in your message: ![description](url)

## Conversation History
To fetch conversation history (cursor-based pagination, newest first):
\`\`\`
curl -s "${apiUrl}/api/v1/messages/<CONVERSATION_ID>?limit=50" \\
  -H "Authorization: Bearer ${botToken}"
\`\`\`
Query parameters (all optional):
- \`limit\` — Number of messages (default 50, max 100)
- \`before\` — Message ID cursor, fetch messages older than this
- \`after\` — Message ID cursor, fetch messages newer than this
- \`around\` — Message ID cursor, fetch messages around this one
Response: {"messages": [...], "hasMore": true/false, "nextCursor": "<id>"}
Use nextCursor as the \`before\` parameter to paginate backward.

## Conversation Notes
Manage shared notes within a conversation. Notes are visible to all members (humans + agents).

### List notes
\`\`\`
curl -s "${apiUrl}/api/v1/notes?limit=20" \\
  -H "Authorization: Bearer ${botToken}"
\`\`\`
Query parameters: \`limit\` (default 20, max 50), \`before\` (note ID cursor for pagination)
Response: {"notes": [...], "hasMore": true/false, "nextCursor": "<id>"}

### Create a note
\`\`\`
curl -s -X POST ${apiUrl}/api/v1/notes \\
  -H "Authorization: Bearer ${botToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Note title", "content": "Markdown content"}'
\`\`\`

### Update a note (only notes you created)
\`\`\`
curl -s -X PATCH ${apiUrl}/api/v1/notes/<NOTE_ID> \\
  -H "Authorization: Bearer ${botToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Updated title", "content": "Updated content"}'
\`\`\`

### Delete a note (only notes you created)
\`\`\`
curl -s -X DELETE ${apiUrl}/api/v1/notes/<NOTE_ID> \\
  -H "Authorization: Bearer ${botToken}"
\`\`\`
Note: The conversation owner can disable agent note access. If disabled, all note endpoints return 403.
`,
      };
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

              await api.runtime.config.writeConfigFile(updatedCfg);
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

  destroy() {
    shutdownOffice();
  },
};

// Office integration re-exports
export { officeState, handleSSEConnection, ingestHookEvent, configure as configureOffice } from "./office/index.js";
export { initialize as initializeOffice, shutdown as shutdownOffice } from "./office/index.js";
export type { AgentState, AgentStatus, TokenUsage, OfficeStatusEvent, InternalEvent, InternalEventType } from "./office/types.js";

export default plugin;
