import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Command } from "commander";
import { getOpts, output } from "../api.js";

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

      const res = await fetch(`${apiUrl}/api/v1/files/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        console.error(`Error ${res.status}: ${await res.text()}`);
        process.exit(1);
      }
      output(await res.json());
    });
}
