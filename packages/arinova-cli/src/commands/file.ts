import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Command } from "commander";
import { getOpts, output } from "../api.js";
import { ApiClient } from "../client.js";

export function registerFileCommands(program: Command): void {
  const file = program.command("file").description("File commands");

  file.command("upload")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--file-path <path>", "Path to file")
    .action(async (opts: { conversationId: string; filePath: string }) => {
      const { token, apiUrl } = getOpts(file);
      const data = readFileSync(opts.filePath);
      const form = new FormData();
      form.append("file", new Blob([data]), basename(opts.filePath));
      form.append("conversationId", opts.conversationId);

      const client = new ApiClient({ endpoint: apiUrl, token });
      output(await client.upload("/api/v1/files/upload", form));
    });
}
