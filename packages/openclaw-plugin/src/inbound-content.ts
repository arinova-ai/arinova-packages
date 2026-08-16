import type { ArinovaChatInboundMessage } from "./types.js";

const TOOL_LINE_RE = /^\[(Bash|Read|Write|Edit|Grep|Glob|WebFetch|WebSearch|Task|Skill|NotebookEdit)\]/;
const RESULT_PREFIX = "📎";
const MEDIA_LINE_RE = /^\s*MEDIA:\s/i;

export function collapseToolBlocks(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const output: string[] = [];
  let pendingTool: string[] | null = null;
  let inResult = false;
  let fence: string | null = null;

  for (const line of lines) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]![0];
      if (fence === marker) fence = null;
      else if (fence === null) fence = marker;
    }

    if (fence === null && TOOL_LINE_RE.test(line)) {
      pendingTool = [line];
      inResult = false;
    } else if (pendingTool !== null) {
      if (line === "") {
        pendingTool.push(line);
        if (inResult) inResult = false;
      } else if (line.startsWith(RESULT_PREFIX)) {
        pendingTool.push(line);
        inResult = true;
      } else if (inResult) {
        pendingTool.push(line);
      } else {
        output.push(...pendingTool);
        pendingTool = null;
        output.push(line);
      }
    } else {
      output.push(line);
    }
  }

  if (pendingTool) output.push(...pendingTool);
  return output.join("\n");
}

export function stripMediaLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      if (MEDIA_LINE_RE.test(line)) return false;
      const token = line.trim().toUpperCase();
      return !token || !"MEDIA:".startsWith(token);
    })
    .join("\n");
}

export function mediaUrlsToMarkdown(urls: string[]): string {
  return urls.map((url) => `![](${url})`).join("\n");
}

export function buildEnrichedBody(
  rawBody: string,
  message: ArinovaChatInboundMessage,
): string {
  const sections: string[] = [];
  const sender = message.senderAgentName ?? message.senderUsername;
  if (sender) sections.push(`[Sender: ${sender}]`);

  if (message.conversationType === "group" && message.members?.length) {
    const names = message.members.map((member) => member.agentName).join(", ");
    sections.push(`[Group: ${names}]`);
  }
  if (message.attachments?.length) {
    const lines = message.attachments.map((attachment) => {
      const size = formatFileSize(attachment.fileSize);
      return `- ${attachment.fileName} (${attachment.fileType}, ${size}) ${attachment.url}`;
    });
    sections.push(`[Attachments]\n${lines.join("\n")}`);
  }
  if (message.replyTo) {
    const replySender = message.replyTo.senderAgentName ?? message.replyTo.role;
    const quoted = message.replyTo.content
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    sections.push(`> Replying to ${replySender}:\n${quoted}`);
  }
  if (message.history?.length) {
    const historyLines = message.history.map((entry) => {
      const historySender = entry.senderAgentName ?? entry.senderUsername ?? entry.role;
      return `[${historySender}]: ${entry.content}`;
    });
    sections.push(`[History]\n${historyLines.join("\n")}`);
  }
  return sections.length === 0
    ? rawBody
    : `${sections.join("\n\n")}\n\n${rawBody}`;
}

export function resolveMentions(
  text: string,
  members?: { agentId: string; agentName: string }[],
): string[] {
  if (!members?.length) return [];
  const matches: Array<{ start: number; end: number; agentId: string }> = [];
  const sorted = [...members].sort((left, right) => right.agentName.length - left.agentName.length);
  for (const member of sorted) {
    const escaped = member.agentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^\\w@])@${escaped}(?=$|[^\\w])`, "giu");
    for (const match of text.matchAll(pattern)) {
      const start = (match.index ?? 0) + match[1]!.length;
      const end = start + member.agentName.length + 1;
      if (!matches.some((existing) => start < existing.end && end > existing.start)) {
        matches.push({ start, end, agentId: member.agentId });
      }
    }
  }
  const ids = new Set<string>();
  for (const match of matches.sort((left, right) => left.start - right.start)) {
    ids.add(match.agentId);
  }
  return [...ids];
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
