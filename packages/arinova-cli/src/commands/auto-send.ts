import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";

export function registerAutoSendCommands(program: Command): void {
  const autoSend = program.command("auto-send").description("Auto Send schedule commands");

  autoSend.command("list")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .description("List active auto-send schedules")
    .action(async (opts: { conversationId: string }) => {
      const { token, apiUrl } = getOpts(autoSend);
      output(await apiCall({
        method: "GET",
        url: `${apiUrl}/api/v1/auto-send?conversationId=${opts.conversationId}`,
        token,
      }));
    });

  autoSend.command("create")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--content <text>", "Message content")
    .requiredOption("--mode <mode>", "Mode: once or recurring")
    .option("--hours <n>", "Hours from now (once mode)")
    .option("--minutes <n>", "Minutes from now (once mode)")
    .option("--run-at <datetime>", "Absolute time in ISO 8601 format (once mode, mutually exclusive with --hours/--minutes)")
    .option("--interval <seconds>", "Interval in seconds (recurring mode)")
    .description("Create an auto-send schedule")
    .action(async (opts: { conversationId: string; content: string; mode: string; hours?: string; minutes?: string; runAt?: string; interval?: string }) => {
      if (opts.runAt && (opts.hours || opts.minutes)) {
        console.error("Error: --run-at cannot be used together with --hours/--minutes");
        process.exit(1);
      }
      const { token, apiUrl } = getOpts(autoSend);
      const body: Record<string, unknown> = {
        conversationId: opts.conversationId,
        mode: opts.mode,
        content: opts.content,
      };
      if (opts.runAt) body.runAt = opts.runAt;
      if (opts.hours) body.hours = parseInt(opts.hours);
      if (opts.minutes) body.minutes = parseInt(opts.minutes);
      if (opts.interval) body.intervalSeconds = parseInt(opts.interval);
      output(await apiCall({ method: "POST", url: `${apiUrl}/api/v1/auto-send`, token, body }));
    });

  autoSend.command("update")
    .requiredOption("--id <id>", "Schedule ID")
    .option("--content <text>", "New message content")
    .option("--interval <seconds>", "New interval in seconds")
    .option("--enabled <bool>", "Enable or disable")
    .description("Update an auto-send schedule")
    .action(async (opts: { id: string; content?: string; interval?: string; enabled?: string }) => {
      const { token, apiUrl } = getOpts(autoSend);
      const body: Record<string, unknown> = {};
      if (opts.content) body.content = opts.content;
      if (opts.interval) body.intervalSeconds = parseInt(opts.interval);
      if (opts.enabled != null) body.enabled = opts.enabled === "true";
      output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/v1/auto-send/${opts.id}`, token, body }));
    });

  autoSend.command("get")
    .requiredOption("--id <id>", "Schedule ID")
    .description("Get a single auto-send schedule")
    .action(async (opts: { id: string }) => {
      const { token, apiUrl } = getOpts(autoSend);
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/auto-send/${opts.id}`, token }));
    });

  autoSend.command("cancel")
    .requiredOption("--id <id>", "Schedule ID")
    .description("Cancel an auto-send schedule")
    .action(async (opts: { id: string }) => {
      const { token, apiUrl } = getOpts(autoSend);
      output(await apiCall({ method: "DELETE", url: `${apiUrl}/api/v1/auto-send/${opts.id}`, token }));
    });

  autoSend.command("history")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .option("--limit <n>", "Max entries (default 20)")
    .description("View auto-send execution history")
    .action(async (opts: { conversationId: string; limit?: string }) => {
      const { token, apiUrl } = getOpts(autoSend);
      const params = new URLSearchParams({ conversationId: opts.conversationId });
      if (opts.limit) params.set("limit", opts.limit);
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/auto-send/history?${params}`, token }));
    });
}
