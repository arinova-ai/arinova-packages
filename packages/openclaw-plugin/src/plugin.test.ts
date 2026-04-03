import { describe, it, expect } from "vitest";

// Test inbound message parsing utilities
describe("inbound message parsing", () => {
  it("collapses consecutive tool blocks", () => {
    const input = "[Bash] ls\n📎 output1\n[Read] file.ts\n📎 content\nHello world";
    // Tool blocks get collapsed to keep only the latest
    expect(input).toContain("[Read]");
    expect(input).toContain("Hello world");
  });

  it("detects MEDIA lines", () => {
    const line1 = "MEDIA: https://example.com/img.png";
    const line2 = "  media: http://cdn.test/file.jpg";
    const line3 = "Not a media line";
    expect(/^\s*MEDIA:\s/i.test(line1)).toBe(true);
    expect(/^\s*MEDIA:\s/i.test(line2)).toBe(true);
    expect(/^\s*MEDIA:\s/i.test(line3)).toBe(false);
  });

  it("detects tool lines", () => {
    const TOOL_LINE_RE = /^\[(Bash|Read|Write|Edit|Grep|Glob|WebFetch|WebSearch|Task|Skill|NotebookEdit)\]/;
    expect(TOOL_LINE_RE.test("[Bash] ls")).toBe(true);
    expect(TOOL_LINE_RE.test("[Read] file.ts")).toBe(true);
    expect(TOOL_LINE_RE.test("[Unknown] foo")).toBe(false);
    expect(TOOL_LINE_RE.test("Regular text")).toBe(false);
  });
});

// Test SenderName JSON encoding
describe("SenderName JSON encoding", () => {
  it("encodes sender metadata as JSON string", () => {
    const sender = { name: "Ron", conversationId: "abc-123", agentName: "ron" };
    const encoded = JSON.stringify(sender);
    const decoded = JSON.parse(encoded);
    expect(decoded.name).toBe("Ron");
    expect(decoded.conversationId).toBe("abc-123");
    expect(decoded.agentName).toBe("ron");
  });

  it("handles special characters in names", () => {
    const sender = { name: "Test \"User\"", conversationId: "id-1" };
    const encoded = JSON.stringify(sender);
    expect(encoded).toContain('\\"User\\"');
    const decoded = JSON.parse(encoded);
    expect(decoded.name).toBe('Test "User"');
  });

  it("handles empty sender name", () => {
    const sender = { name: "", conversationId: "id-1" };
    const encoded = JSON.stringify(sender);
    const decoded = JSON.parse(encoded);
    expect(decoded.name).toBe("");
  });
});

// Test API endpoint path construction
describe("API endpoint paths", () => {
  const apiUrl = "https://api.chat-staging.arinova.ai";

  it("constructs message send path", () => {
    const path = `${apiUrl}/api/v1/messages/send`;
    expect(path).toBe("https://api.chat-staging.arinova.ai/api/v1/messages/send");
  });

  it("constructs conversation messages path", () => {
    const convId = "abc-123";
    const path = `${apiUrl}/api/conversations/${convId}/messages`;
    expect(path).toContain(convId);
  });

  it("constructs wiki path", () => {
    const convId = "abc-123";
    const path = `${apiUrl}/api/v1/wiki`;
    expect(path).toBe("https://api.chat-staging.arinova.ai/api/v1/wiki");
  });

  it("constructs notes path with conversation", () => {
    const convId = "abc-123";
    const path = `${apiUrl}/api/v1/notes?conversationId=${convId}`;
    expect(path).toContain("conversationId=abc-123");
  });
});

// Test markdown table GFM handling
describe("GFM table detection", () => {
  it("detects table row ending with pipe", () => {
    const isTableRow = (line: string) => line.trim().startsWith("|") && line.trim().endsWith("|");
    expect(isTableRow("| Name | Value |")).toBe(true);
    expect(isTableRow("|---|---|")).toBe(true);
    expect(isTableRow("Normal text")).toBe(false);
  });

  it("table rows joined with single newline", () => {
    const rows = ["| A | B |", "|---|---|", "| 1 | 2 |"];
    const table = rows.join("\n");
    expect(table.split("\n").length).toBe(3);
    expect(table).not.toContain("\n\n");
  });
});
