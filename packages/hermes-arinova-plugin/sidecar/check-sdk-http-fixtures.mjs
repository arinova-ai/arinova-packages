import assert from "node:assert/strict";

export const EXPECTED_UPLOAD_MIME_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json"
};
export const EXPECTED_HTTP_SDK_METHODS = [
  "sendMessage",
  "uploadFile",
  "fetchHistory",
  "listNotes",
  "createNote",
  "updateNote",
  "deleteNote",
  "listBoards",
  "createCard",
  "updateCard",
  "createBoard",
  "updateBoard",
  "archiveBoard",
  "listColumns",
  "createColumn",
  "updateColumn",
  "deleteColumn",
  "reorderColumns",
  "listCards",
  "completeCard",
  "listArchivedCards",
  "addCardCommit",
  "listCardCommits",
  "linkCardNote",
  "unlinkCardNote",
  "listCardNotes",
  "listLabels",
  "createLabel",
  "updateLabel",
  "deleteLabel",
  "addCardLabel",
  "removeCardLabel",
  "queryMemory",
  "fetchSkillPrompt"
];
export function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": String(payload.length)
  });
  res.end(payload);
}

export function text(res, status, body) {
  const payload = Buffer.from(body);
  res.writeHead(status, {
    "Content-Type": "text/plain",
    "Content-Length": String(payload.length)
  });
  res.end(payload);
}

export function rawJson(res, status, body) {
  const payload = Buffer.from(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": String(payload.length)
  });
  res.end(payload);
}

export async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export function jsonBody(request) {
  assert.match(String(request.contentType), /application\/json/);
  return JSON.parse(request.body.toString("utf8"));
}

export function searchParams(request) {
  return new URLSearchParams(request.search.slice(1));
}

export function assertEmptyBody(request) {
  assert.equal(request.body.length, 0, `${request.method} ${request.path} unexpectedly sent a request body`);
}

export function card(id = "card-1") {
  return {
    id,
    columnId: "col-1",
    columnName: "Todo",
    title: "Card",
    description: null,
    priority: null,
    dueDate: null,
    sortOrder: 1,
    createdBy: null,
    createdAt: null,
    updatedAt: null,
    archivedAt: null
  };
}

export function cardCommit() {
  return {
    cardId: "card-1",
    commitHash: "abc",
    message: "commit",
    createdAt: "now"
  };
}

export function note(title = "Note") {
  return {
    id: "note-1",
    conversationId: "conv-1",
    creatorId: "agent-1",
    creatorType: "agent",
    creatorName: "Agent",
    agentId: "agent-1",
    agentName: "Agent",
    title,
    content: "Body",
    tags: ["work", "ai"],
    createdAt: "now",
    updatedAt: "later"
  };
}

export function cardNote() {
  return {
    id: "note-1",
    title: "Note",
    tags: [],
    createdAt: "now"
  };
}

export function label(name = "Bug", color = null) {
  return {
    id: "label-1",
    boardId: "board-1",
    name,
    color
  };
}

export function memoryEntries() {
  return [
    {
      content: "Summary\nDetail",
      category: "project",
      score: 0.9,
      origin: "system"
    },
    {
      content: "Shared",
      category: "shared",
      score: 0.8,
      origin: "shared-from-a1b2c3d4"
    },
    {
      content: "Self",
      category: "self",
      score: 0.7,
      origin: "self"
    },
    {
      content: "Unknown",
      category: "unknown",
      score: 0.6
    },
    {
      content: "No Source",
      category: "legacy",
      score: 0.5
    }
  ];
}

export function historyResult() {
  return {
    messages: [
      {
        id: "hist-http-1",
        conversationId: "conv-1",
        seq: 7,
        role: "assistant",
        content: "history response",
        status: "sent",
        senderAgentId: "agent-helper",
        senderAgentName: "Helper",
        senderUserId: "user-1",
        senderUsername: "User",
        replyToId: "reply-http-1",
        threadId: "thread-http-1",
        createdAt: "2026-06-29T02:00:00.000Z",
        updatedAt: "2026-06-29T02:00:01.000Z",
        attachments: [
          {
            id: "hist-http-att-1",
            fileName: "history-http.txt",
            fileType: "text/plain",
            fileSize: 9,
            url: "https://files.example/history-http.txt"
          }
        ]
      }
    ],
    hasMore: true,
    nextCursor: "hist-http-1"
  };
}
