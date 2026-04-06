#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { setJsonMode } from "./output.js";
import { migrateConfigIfNeeded } from "./config.js";

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
import { registerWikiCommands } from "./commands/wiki.js";
import { registerAutoSendCommands } from "./commands/auto-send.js";
import { registerPainterCommands } from "./commands/painter.js";
import { registerAgentCommands } from "./commands/agent.js";
import { registerCapsuleCommands } from "./commands/capsule.js";
import { registerProfile } from "./commands/profile.js";

const program = new Command();

program
  .name("arinova")
  .description("Arinova CLI — manage messages, notes, kanban, memory, creator tools, and more")
  .version(pkg.version)
  .option("--token <botToken>", "Bot/API token override (ari_...)")
  .option("--profile <name>", "Profile to use (required for most commands)")
  .option("--api-url <url>", "API endpoint override")
  .option("--json", "Output in JSON format")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    if (opts.json) {
      setJsonMode(true);
    }
    // Auto-migrate legacy config on first run
    migrateConfigIfNeeded();
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
registerWikiCommands(program);
registerAutoSendCommands(program);
registerPainterCommands(program);
registerAgentCommands(program);
registerCapsuleCommands(program);

// Profile management
registerProfile(program);

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

program.parseAsync().then(
  () => process.exit(0),
  (err) => {
    if (err instanceof Error) console.error(err.message);
    process.exit(1);
  },
);
