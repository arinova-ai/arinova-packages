import { describe, expect, it } from "vitest";
import {
  buildEnrichedBody,
  collapseToolBlocks,
  formatFileSize,
  mediaUrlsToMarkdown,
  resolveMentions,
  stripMediaLines,
} from "./inbound.js";

describe("inbound payload helpers", () => {
  it("collapses consecutive tool blocks while preserving surrounding text", () => {
    const input = [
      "Starting",
      "[Bash] ls",
      "📎 first",
      "[Read] package.json",
      "📎 second",
      "Done",
    ].join("\n");

    expect(collapseToolBlocks(input)).toBe([
      "Starting",
      "[Read] package.json",
      "📎 second",
      "Done",
    ].join("\n"));
  });

  it("strips streaming MEDIA token lines", () => {
    expect(stripMediaLines("hello\nMEDIA: https://cdn/image.png\n  media: file.jpg\nworld"))
      .toBe("hello\nworld");
  });

  it("converts delivered media urls to markdown images", () => {
    expect(mediaUrlsToMarkdown(["https://cdn/a.png", "https://cdn/b.jpg"]))
      .toBe("![](https://cdn/a.png)\n![](https://cdn/b.jpg)");
  });

  it("builds enriched body with group, attachments, reply, and history context", () => {
    const body = buildEnrichedBody("please summarize", {
      taskId: "task-1",
      conversationId: "conv-1",
      conversationType: "group",
      text: "please summarize",
      timestamp: 1000,
      members: [
        { agentId: "agent-a", agentName: "Alice" },
        { agentId: "agent-b", agentName: "Bob" },
      ],
      attachments: [{
        id: "file-1",
        fileName: "report.pdf",
        fileType: "application/pdf",
        fileSize: 1536,
        url: "https://cdn/report.pdf",
      }],
      replyTo: {
        role: "assistant",
        content: "line 1\nline 2",
        senderAgentName: "Researcher",
      },
      history: [{
        role: "user",
        content: "previous question",
        senderAgentName: "Alice",
        createdAt: "2026-06-10T00:00:00Z",
      }],
    });

    expect(body).toContain("[Group: Alice, Bob]");
    expect(body).toContain("- report.pdf (application/pdf, 1.5KB) https://cdn/report.pdf");
    expect(body).toContain("> Replying to Researcher:\n> line 1\n> line 2");
    expect(body).toContain("[History]\n[Alice]: previous question");
    expect(body.endsWith("\n\nplease summarize")).toBe(true);
  });

  it("resolves mentions case-insensitively and deduplicates ids", () => {
    expect(resolveMentions("@Alice ping @alice and @Bob", [
      { agentId: "agent-a", agentName: "Alice" },
      { agentId: "agent-b", agentName: "Bob" },
    ])).toEqual(["agent-a", "agent-b"]);
  });

  it("formats attachment sizes", () => {
    expect(formatFileSize(512)).toBe("512B");
    expect(formatFileSize(2048)).toBe("2.0KB");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0MB");
  });
});
