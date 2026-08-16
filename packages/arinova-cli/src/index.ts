#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isJsonMode, printWarning, setJsonMode } from "./output.js";
import { migrateConfigIfNeeded } from "./config.js";
import { configureClientDefaults } from "./client.js";
import { registerCompletion } from "./completion.js";
import { requireNonInteractiveConfirmation } from "./safety.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));

import { registerMessageCommands } from "./commands/message.js";
import { registerFileCommands } from "./commands/file.js";
import { registerNoteCommands } from "./commands/note.js";
import { registerNotebookCommands } from "./commands/notebook.js";
import { registerMemoryCommands } from "./commands/memory.js";
import { registerKanbanCommands } from "./commands/kanban.js";
import { registerAuth } from "./commands/auth.js";
import { registerSticker } from "./commands/sticker.js";
import { registerExpert } from "./commands/expert.js";
import { registerTheme } from "./commands/theme.js";
import { registerCommunity } from "./commands/community.js";
import { registerSpace } from "./commands/space.js";
import { registerStats } from "./commands/stats.js";
import { registerList } from "./commands/list.js";
import { registerApp } from "./commands/app.js";
import { registerSetupOpenclaw } from "./commands/setup-openclaw.js";
import { registerConversation } from "./commands/conversation.js";
import { registerSkill } from "./commands/skill.js";
import { registerSearchCommands } from "./commands/search.js";
import { registerResolveCommands } from "./commands/resolve.js";
import { registerMemoCommands } from "./commands/wiki.js";
import { registerAutoSendCommands } from "./commands/auto-send.js";
import { registerPainterCommands } from "./commands/painter.js";
import { registerAgentCommands } from "./commands/agent.js";
import { registerProfile } from "./commands/profile.js";
import { registerUserCommands } from "./commands/user.js";
import { registerCalendarCommands } from "./commands/calendar.js";
import { registerDocCommands } from "./commands/doc.js";
import { registerFormCommands } from "./commands/form.js";
import { registerMindmapCommands } from "./commands/mindmap.js";
import { registerSlideCommands } from "./commands/slide.js";
import { registerWorkbookCommands } from "./commands/workbook.js";
import { registerImageCommands } from "./commands/image.js";
import { registerAutomationCommands } from "./commands/automation.js";
import { registerEconomyChatCommands } from "./commands/economy-chat.js";

const program = new Command();

program
  .name("arinova")
  .description("Arinova CLI — manage messages, notes, kanban, memory, creator tools, and more")
  .version(pkg.version)
  .option("--token <botToken>", "Deprecated token override; visible in the process list (use --profile)")
  .option("--profile <name>", "Profile to use (required for most commands)")
  .option("--api-url <url>", "API endpoint override")
  .option("--json", "Output in JSON format")
  .option("--yes", "Confirm side effects in non-interactive environments")
  .hook("preAction", (thisCommand, actionCommand) => {
    const opts = actionCommand.optsWithGlobals();
    if (opts.json) {
      setJsonMode(true);
    }
    if (opts.token) {
      printWarning(
        "--token exposes credentials in the process list; store the token in a named profile instead.",
      );
    }
    // Auto-migrate legacy config on first run
    migrateConfigIfNeeded();
    configureClientDefaults({
      endpoint: opts.apiUrl as string | undefined,
      token: opts.token as string | undefined,
      profileName: opts.profile as string | undefined,
    });
    requireNonInteractiveConfirmation(actionCommand);
  });

// Existing agent commands (bot token based)
registerMessageCommands(program);
registerFileCommands(program);
registerNoteCommands(program);
registerNotebookCommands(program);
registerMemoryCommands(program);
registerKanbanCommands(program);
registerConversation(program);
registerSkill(program);
registerSearchCommands(program);
registerResolveCommands(program);
registerMemoCommands(program);
registerAutoSendCommands(program);
registerPainterCommands(program);
registerAgentCommands(program);

// Profile management
registerProfile(program);
registerUserCommands(program);
registerCalendarCommands(program);
registerDocCommands(program);
registerFormCommands(program);
registerMindmapCommands(program);
registerSlideCommands(program);
registerWorkbookCommands(program);
registerImageCommands(program);
registerAutomationCommands(program);
registerEconomyChatCommands(program);

// Creator commands (config-based auth)
registerAuth(program);
registerSticker(program);
registerExpert(program);
registerTheme(program);
registerCommunity(program);
registerSpace(program);
registerStats(program);
registerList(program);
registerApp(program);
registerSetupOpenclaw(program);
registerCompletion(program);

program.parseAsync().then(
  () => {
    // Flush stdout before exiting — process.exit(0) can truncate piped output
    process.stdout.write("", () => process.exit(0));
  },
  (err) => {
    if (
      err instanceof Error &&
      !(err as Error & { reported?: boolean }).reported
    ) {
      const value = err as Error & {
        code?: string;
        status?: number;
        details?: unknown;
      };
      if (isJsonMode()) {
        console.error(JSON.stringify({
          error: {
            status: value.status,
            code: value.code,
            message: value.message,
            details: value.details,
          },
        }));
      } else {
        console.error(value.code ? `${value.code}: ${value.message}` : value.message);
      }
    }
    process.exit(1);
  },
);
