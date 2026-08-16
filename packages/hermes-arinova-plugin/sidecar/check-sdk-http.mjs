import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { ArinovaAgent } from "@arinova-ai/agent-sdk";
import { buildAgentOptions, createControlServer, listen } from "./runtime.mjs";
import {
  EXPECTED_HTTP_SDK_METHODS,
  EXPECTED_UPLOAD_MIME_TYPES,
  assertEmptyBody,
  card,
  cardCommit,
  cardNote,
  historyResult,
  json,
  jsonBody,
  label,
  memoryEntries,
  note,
  rawJson,
  readBody,
  searchParams,
  text
} from "./check-sdk-http-fixtures.mjs";

const requests = [];
let remainingListBoardFailures = 0;
let duplicateNextListBoards = false;
const calledMethods = new Set();
function requestFor(method, path) {
  const request = requests.find((entry) => entry.method === method && entry.path === path);
  assert.ok(request, `missing ${method} ${path}`);
  return request;
}

function requestsFor(method, path) {
  const matches = requests.filter((entry) => entry.method === method && entry.path === path);
  assert.ok(matches.length > 0, `missing ${method} ${path}`);
  return matches;
}

const backend = createServer(async (req, res) => {
  const body = await readBody(req);
  const url = new URL(req.url, "http://127.0.0.1");
  requests.push({
    method: req.method,
    path: url.pathname,
    search: url.search,
    auth: req.headers.authorization,
    contentType: req.headers["content-type"] || "",
    body
  });

  if (url.pathname === "/api/v1/messages/send") {
    const parsed = JSON.parse(body.toString("utf8") || "{}");
    if (parsed.conversationId === "missing") {
      res.writeHead(404, {
        "Content-Type": "text/plain",
        "Content-Length": "20"
      });
      return res.end("invalid conversation");
    }
    return json(res, 200, { ok: true });
  }
  if (url.pathname === "/api/v1/files/upload") {
    assert.match(String(req.headers["content-type"]), /multipart\/form-data/);
    const uploadBody = body.toString("latin1");
    assert.match(uploadBody, /name="conversationId"\r\n\r\nconv-1/);
    if (body.toString("latin1").includes("duplicate-json.bin")) {
      return rawJson(res, 200, '{"url":"https://file/a","url":"https://file/b","fileName":"duplicate-json.bin","fileType":"application/octet-stream","fileSize":2}');
    }
    if (body.toString("latin1").includes("huge.bin")) {
      res.writeHead(413, {
        "Content-Type": "text/plain",
        "Content-Length": "14"
      });
      return res.end("file too large");
    }
    if (body.toString("latin1").includes("unknown.blobx")) {
      assert.match(uploadBody, /name="file"; filename="unknown\.blobx"/);
      assert.match(uploadBody, /Content-Type: application\/octet-stream/);
      return json(res, 200, { url: "https://file/unknown.blobx", fileName: "unknown.blobx", fileType: "application/octet-stream", fileSize: 2 });
    }
    assert.match(uploadBody, /name="file"; filename="hello\.txt"/);
    assert.match(uploadBody, /Content-Type: text\/plain/);
    return json(res, 200, { url: "https://file", fileName: "hello.txt", fileType: "text/plain", fileSize: 2 });
  }
  if (url.pathname === "/api/v1/messages/conv-1") {
    if (url.searchParams.get("before") === "duplicate-json") {
      return rawJson(res, 200, '{"messages":[],"messages":[{"id":"dupe"}],"hasMore":false}');
    }
    if (url.searchParams.get("before") === "bad-cursor") {
      res.writeHead(400, {
        "Content-Type": "text/plain",
        "Content-Length": "14"
      });
      return res.end("cursor expired");
    }
    if (url.searchParams.get("before") === "msg-9") {
      return json(res, 200, historyResult());
    }
    return json(res, 200, { messages: [], hasMore: false });
  }
  if (url.pathname === "/api/v1/notes" && req.method === "GET") {
    if (url.searchParams.get("before") === "bad-note-cursor") {
      res.writeHead(410, {
        "Content-Type": "text/plain",
        "Content-Length": "13"
      });
      return res.end("notes expired");
    }
    return json(res, 200, { notes: [note()], hasMore: true, nextCursor: "note-cursor-1" });
  }
  if (url.pathname === "/api/v1/notes" && req.method === "POST") {
    const parsed = JSON.parse(body.toString("utf8") || "{}");
    if (parsed.title === "Duplicate Json Note") {
      return rawJson(res, 200, '{"id":"note-1","id":"note-2","title":"Duplicate"}');
    }
    if (parsed.title === "Bad Note") {
      res.writeHead(422, {
        "Content-Type": "text/plain",
        "Content-Length": "12"
      });
      return res.end("note invalid");
    }
    return json(res, 200, note());
  }
  if (url.pathname === "/api/v1/notes/note-locked" && req.method === "PATCH") {
    res.writeHead(423, {
      "Content-Type": "text/plain",
      "Content-Length": "11"
    });
    return res.end("note locked");
  }
  if (url.pathname === "/api/v1/notes/note-1" && req.method === "PATCH") {
    return json(res, 200, note("Updated"));
  }
  if (url.pathname === "/api/v1/notes/note%2Fslash" && req.method === "PATCH") {
    return json(res, 200, note("Encoded"));
  }
  if (url.pathname === "/api/v1/notes/note-missing" && req.method === "DELETE") {
    res.writeHead(404, {
      "Content-Type": "text/plain",
      "Content-Length": "12"
    });
    return res.end("note missing");
  }
  if (url.pathname === "/api/v1/notes/note-1" && req.method === "DELETE") {
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === "/api/v1/kanban/boards" && req.method === "GET") {
    if (duplicateNextListBoards) {
      duplicateNextListBoards = false;
      return rawJson(res, 200, '[{"id":"board-1","id":"board-2","name":"Board"}]');
    }
    if (remainingListBoardFailures > 0) {
      remainingListBoardFailures -= 1;
      return text(res, 503, "boards unavailable");
    }
    return json(res, 200, [{ id: "board-1", name: "Board", createdAt: "now" }]);
  }
  if (url.pathname === "/api/v1/kanban/boards" && req.method === "POST") {
    const parsed = JSON.parse(body.toString("utf8") || "{}");
    if (parsed.name === "Bad Board") {
      res.writeHead(422, {
        "Content-Type": "text/plain",
        "Content-Length": "13"
      });
      return res.end("board invalid");
    }
    return json(res, 200, { id: "board-1", name: "Board", createdAt: "now" });
  }
  if (url.pathname === "/api/v1/kanban/boards/board-locked" && req.method === "PATCH") {
    res.writeHead(423, {
      "Content-Type": "text/plain",
      "Content-Length": "12"
    });
    return res.end("board locked");
  }
  if (url.pathname === "/api/v1/kanban/boards/board-1" && req.method === "PATCH") {
    return json(res, 200, { id: "board-1", name: "Updated", createdAt: "now" });
  }
  if (url.pathname === "/api/v1/kanban/boards/board%2Fslash" && req.method === "PATCH") {
    return json(res, 200, { id: "board/slash", name: "Encoded Board", createdAt: "now" });
  }
  if (url.pathname === "/api/v1/kanban/boards/board-missing/archive") {
    res.writeHead(404, {
      "Content-Type": "text/plain",
      "Content-Length": "13"
    });
    return res.end("board missing");
  }
  if (url.pathname === "/api/v1/kanban/boards/board-1/archive") {
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === "/api/v1/kanban/boards/board-1/columns" && req.method === "GET") {
    return json(res, 200, [{ id: "col-1", boardId: "board-1", name: "Todo", sortOrder: 1 }]);
  }
  if (url.pathname === "/api/v1/kanban/boards/board-missing/columns" && req.method === "GET") {
    return text(res, 404, "columns missing");
  }
  if (url.pathname === "/api/v1/kanban/boards/board-1/columns" && req.method === "POST") {
    const parsed = JSON.parse(body.toString("utf8") || "{}");
    if (parsed.name === "Bad Column") {
      res.writeHead(422, {
        "Content-Type": "text/plain",
        "Content-Length": "14"
      });
      return res.end("column invalid");
    }
    return json(res, 200, { id: "col-1", boardId: "board-1", name: "Todo", sortOrder: 1 });
  }
  if (url.pathname === "/api/v1/kanban/columns/col-locked" && req.method === "PATCH") {
    res.writeHead(423, {
      "Content-Type": "text/plain",
      "Content-Length": "13"
    });
    return res.end("column locked");
  }
  if (url.pathname === "/api/v1/kanban/columns/col-1" && req.method === "PATCH") {
    return json(res, 200, { id: "col-1", boardId: "board-1", name: "Doing", sortOrder: 1 });
  }
  if (url.pathname === "/api/v1/kanban/columns/col-missing" && req.method === "DELETE") {
    res.writeHead(404, {
      "Content-Type": "text/plain",
      "Content-Length": "14"
    });
    return res.end("column missing");
  }
  if (url.pathname === "/api/v1/kanban/columns/col-1" && req.method === "DELETE") {
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === "/api/v1/kanban/boards/board-locked/columns/reorder") {
    res.writeHead(409, {
      "Content-Type": "text/plain",
      "Content-Length": "18"
    });
    return res.end("column order stale");
  }
  if (url.pathname === "/api/v1/kanban/boards/board-1/columns/reorder") {
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === "/api/v1/kanban/cards" && req.method === "GET") {
    if (url.searchParams.get("search") === "explode") {
      return text(res, 503, "cards unavailable");
    }
    return json(res, 200, [card()]);
  }
  if (url.pathname === "/api/v1/kanban/cards" && req.method === "POST") {
    const parsed = JSON.parse(body.toString("utf8") || "{}");
    if (parsed.title === "Bad Card") {
      return text(res, 422, "card invalid");
    }
    return json(res, 200, card());
  }
  if (url.pathname === "/api/v1/kanban/cards/error-card" && req.method === "PATCH") {
    res.writeHead(409, {
      "Content-Type": "text/plain",
      "Content-Length": "11"
    });
    return res.end("card locked");
  }
  if (url.pathname === "/api/v1/kanban/cards/card-1" && req.method === "PATCH") {
    return json(res, 200, card());
  }
  if (url.pathname === "/api/v1/kanban/cards/card%2Fslash" && req.method === "PATCH") {
    return json(res, 200, { ...card(), id: "card/slash", title: "Encoded Card" });
  }
  if (url.pathname === "/api/v1/kanban/cards/card-missing/complete") {
    return text(res, 404, "card missing");
  }
  if (url.pathname === "/api/v1/kanban/cards/card-1/complete") {
    return json(res, 200, card());
  }
  if (url.pathname === "/api/v1/kanban/boards/board-missing/archived-cards") {
    return text(res, 404, "archive missing");
  }
  if (url.pathname === "/api/v1/kanban/boards/board-1/archived-cards") {
    return json(res, 200, { cards: [card()], total: 1, page: 1, limit: 10 });
  }
  if (url.pathname === "/api/v1/kanban/cards/card-1/commits" && req.method === "POST") {
    const parsed = JSON.parse(body.toString("utf8") || "{}");
    if (parsed.commitHash === "bad") {
      return text(res, 422, "commit invalid");
    }
    return json(res, 200, cardCommit());
  }
  if (url.pathname === "/api/v1/kanban/cards/card-missing/commits" && req.method === "GET") {
    return text(res, 404, "commits missing");
  }
  if (url.pathname === "/api/v1/kanban/cards/card-1/commits" && req.method === "GET") {
    return json(res, 200, [cardCommit()]);
  }
  if (url.pathname === "/api/v1/kanban/cards/card-1/notes" && req.method === "POST") {
    const parsed = JSON.parse(body.toString("utf8") || "{}");
    if (parsed.noteId === "note-missing") {
      return text(res, 404, "card note missing");
    }
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === "/api/v1/kanban/cards/card-missing/notes" && req.method === "GET") {
    return text(res, 404, "card notes missing");
  }
  if (url.pathname === "/api/v1/kanban/cards/card-1/notes" && req.method === "GET") {
    return json(res, 200, [cardNote()]);
  }
  if (url.pathname === "/api/v1/kanban/cards/card-1/notes/note-missing") {
    return text(res, 404, "card note missing");
  }
  if (url.pathname === "/api/v1/kanban/cards/card-1/notes/note-1") {
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === "/api/v1/kanban/cards/card%2Fslash/notes/note%2Fslash") {
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === "/api/v1/kanban/boards/board-missing/labels" && req.method === "GET") {
    return text(res, 404, "labels missing");
  }
  if (url.pathname === "/api/v1/kanban/boards/board-1/labels" && req.method === "GET") {
    return json(res, 200, [label()]);
  }
  if (url.pathname === "/api/v1/kanban/boards/board-1/labels" && req.method === "POST") {
    const parsed = JSON.parse(body.toString("utf8") || "{}");
    if (parsed.name === "Bad Label") {
      return text(res, 422, "label invalid");
    }
    return json(res, 200, label("Bug", "#ff0000"));
  }
  if (url.pathname === "/api/v1/kanban/labels/label-locked" && req.method === "PATCH") {
    return text(res, 423, "label locked");
  }
  if (url.pathname === "/api/v1/kanban/labels/label-1" && req.method === "PATCH") {
    return json(res, 200, label("Feature", "#00ff00"));
  }
  if (url.pathname === "/api/v1/kanban/labels/label-missing" && req.method === "DELETE") {
    return text(res, 404, "label missing");
  }
  if (url.pathname === "/api/v1/kanban/labels/label-1" && req.method === "DELETE") {
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === "/api/v1/kanban/cards/card-1/labels" && req.method === "POST") {
    const parsed = JSON.parse(body.toString("utf8") || "{}");
    if (parsed.labelId === "label-missing") {
      return text(res, 404, "card label missing");
    }
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === "/api/v1/kanban/cards/card-1/labels/label-missing") {
    return text(res, 404, "card label missing");
  }
  if (url.pathname === "/api/v1/kanban/cards/card-1/labels/label-1") {
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === "/api/v1/kanban/cards/card%2Fslash/labels/label%2Fslash") {
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === "/api/v1/memories/search") {
    if (url.searchParams.get("q") === "duplicate-json") {
      return rawJson(res, 200, '[{"summary":"Memory","summary":"Duplicate","detail":null,"category":"project","score":1}]');
    }
    if (url.searchParams.get("q") === "explode") {
      res.writeHead(502, {
        "Content-Type": "text/plain",
        "Content-Length": "19"
      });
      return res.end("memory backend down");
    }
    return json(res, 200, [
      { id: "mem-1", category: "project", summary: "Summary", detail: "Detail", score: 0.9, source: "system" },
      { id: "mem-2", category: "shared", summary: "Shared", detail: null, score: 0.8, source: "shared-from-A1B2C3D4" },
      { id: "mem-3", category: "self", summary: "Self", detail: null, score: 0.7, source: "user" },
      { id: "mem-4", category: "unknown", summary: "Unknown", detail: null, score: 0.6, source: "legacy-import" },
      { id: "mem-5", category: "legacy", summary: "No Source", detail: null, score: 0.5 }
    ]);
  }
  if (url.pathname === "/api/v1/skills/memo/prompt") {
    return json(res, 200, { promptContent: "Prompt", promptTemplate: "Template", parameters: [] });
  }
  if (url.pathname === "/api/v1/skills/duplicate-json/prompt") {
    return rawJson(res, 200, '{"promptContent":"Prompt","promptContent":"Duplicate","promptTemplate":"Template","parameters":[]}');
  }
  if (url.pathname === "/api/v1/skills/missing/prompt") {
    res.writeHead(404, {
      "Content-Type": "text/plain",
      "Content-Length": "13"
    });
    return res.end("skill missing");
  }
  if (url.pathname === "/api/v1/skills/skill%20with%2Fslash/prompt") {
    return json(res, 200, {
      promptContent: "Encoded Prompt",
      promptTemplate: "Encoded Template",
      parameters: [
        {
          name: "topic",
          type: "string",
          required: true,
          enum: ["sdk", "bridge"],
          default: "sdk",
          nested: { preserves: ["unknown", "metadata"] }
        }
      ]
    });
  }

  json(res, 404, { error: `unhandled ${req.method} ${url.pathname}` });
});

backend.listen(0, "127.0.0.1");
await once(backend, "listening");

const sharedToken = "bridge-token";
const agent = new ArinovaAgent(
  buildAgentOptions({
    serverUrl: `ws://127.0.0.1:${backend.address().port}/`,
    botToken: "ari_test",
    env: { ARINOVA_CONCURRENCY_MODE: "agent-wide" }
  })
);
const { controlServer } = createControlServer({
  agent,
  adapterUrl: "http://127.0.0.1:1",
  sharedToken,
  onShutdown: () => {}
});
await listen(controlServer, 0, "127.0.0.1");
const controlPort = controlServer.address().port;

async function sdk(method, args = []) {
  if (EXPECTED_HTTP_SDK_METHODS.includes(method)) calledMethods.add(method);
  const res = await fetch(`http://127.0.0.1:${controlPort}/agent-sdk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Arinova-Bridge-Token": sharedToken
    },
    body: JSON.stringify({ method, args })
  });
  const body = await res.json();
  assert.equal(res.status, 200, `${method}: ${JSON.stringify(body)}`);
  return body.result;
}

async function sdkError(method, args = []) {
  if (EXPECTED_HTTP_SDK_METHODS.includes(method)) calledMethods.add(method);
  const res = await fetch(`http://127.0.0.1:${controlPort}/agent-sdk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Arinova-Bridge-Token": sharedToken
    },
    body: JSON.stringify({ method, args })
  });
  const body = await res.json();
  assert.equal(res.status, 500, `${method}: ${JSON.stringify(body)}`);
  return body.error;
}

try {
  await sdk("sendMessage", ["conv-1", "hello"]);
  await sdk("sendMessage", ["conv-empty", ""]);
  assert.match(
    await sdkError("sendMessage", ["missing", "hello"]),
    /sendMessage failed \(404\): invalid conversation/
  );
  assert.equal((await sdk("getAgentId", [])), null);
  assert.equal((await sdk("getOnboardingSeed", [])), null);
  assert.deepEqual(await sdk("uploadFile", ["conv-1", { base64: "SGk=" }, "hello.txt", "text/plain"]), {
    url: "https://file",
    fileName: "hello.txt",
    fileType: "text/plain",
    fileSize: 2
  });
  assert.deepEqual(await sdk("uploadFile", ["conv-1", { base64: "SGk=" }, "unknown.blobx"]), {
    url: "https://file/unknown.blobx",
    fileName: "unknown.blobx",
    fileType: "application/octet-stream",
    fileSize: 2
  });
  assert.match(
    await sdkError("uploadFile", ["conv-1", { base64: "SGk=" }, "huge.bin", "application/octet-stream"]),
    /Upload failed \(413\): file too large/
  );
  assert.match(
    await sdkError("uploadFile", ["conv-1", { base64: "SGk=" }, "duplicate-json.bin", "application/octet-stream"]),
    /uploadFile returned malformed JSON: JSON object contains duplicate key: url/
  );
  assert.match(
    await sdkError("fetchHistory", ["conv-1", { before: "bad-cursor" }]),
    /fetchHistory failed \(400\): cursor expired/
  );
  assert.match(
    await sdkError("fetchHistory", ["conv-1", { before: "duplicate-json" }]),
    /fetchHistory returned malformed JSON: JSON object contains duplicate key: messages/
  );
  assert.deepEqual(await sdk("fetchHistory", ["conv-1", { before: "msg-9", after: "msg-1", around: "msg-5", limit: 1 }]), historyResult());
  assert.deepEqual(await sdk("fetchHistory", ["conv-1", { before: "", after: "", around: "", limit: 0 }]), {
    messages: [],
    hasMore: false
  });
  assert.deepEqual(await sdk("fetchHistory", ["conv-1"]), {
    messages: [],
    hasMore: false
  });
  assert.deepEqual(await sdk("listNotes", [{ before: "note-9", limit: 1, offset: 2, tags: ["work", "ai"], archived: true }]), {
    notes: [note()],
    hasMore: true,
    nextCursor: "note-cursor-1"
  });
  assert.match(
    await sdkError("listNotes", [{ before: "bad-note-cursor" }]),
    /listNotes failed \(410\): notes expired/
  );
  assert.deepEqual(await sdk("listNotes", [{ before: "", limit: 0, offset: 0, tags: [], archived: false }]), {
    notes: [note()],
    hasMore: true,
    nextCursor: "note-cursor-1"
  });
  assert.deepEqual(await sdk("listNotes", []), {
    notes: [note()],
    hasMore: true,
    nextCursor: "note-cursor-1"
  });
  assert.deepEqual(await sdk("createNote", [{ title: "Note", content: "Body", tags: ["work"], notebookId: "book-1" }]), note());
  assert.deepEqual(await sdk("createNote", [{ title: "Title only" }]), note());
  assert.match(
    await sdkError("createNote", [{ title: "Duplicate Json Note" }]),
    /createNote returned malformed JSON: JSON object contains duplicate key: id/
  );
  assert.match(
    await sdkError("createNote", [{ title: "Bad Note" }]),
    /createNote failed \(422\): note invalid/
  );
  assert.deepEqual(await sdk("updateNote", ["note-1", { title: "Updated", content: "Body 2", tags: ["ai"] }]), note("Updated"));
  assert.deepEqual(await sdk("updateNote", ["note-1", { tags: ["solo"] }]), note("Updated"));
  assert.deepEqual(await sdk("updateNote", ["note/slash", { title: "Encoded" }]), note("Encoded"));
  assert.match(
    await sdkError("updateNote", ["note-locked", { title: "Blocked" }]),
    /updateNote failed \(423\): note locked/
  );
  assert.equal(await sdk("deleteNote", ["note-1"]), null);
  assert.match(
    await sdkError("deleteNote", ["note-missing"]),
    /deleteNote failed \(404\): note missing/
  );
  assert.deepEqual(await sdk("listBoards", []), [{ id: "board-1", name: "Board", createdAt: "now" }]);
  duplicateNextListBoards = true;
  assert.match(
    await sdkError("listBoards", []),
    /listBoards returned malformed JSON: JSON object contains duplicate key: id/
  );
  const listBoardRequestsBeforeRetryFailure = requestsFor("GET", "/api/v1/kanban/boards").length;
  remainingListBoardFailures = 3;
  assert.match(
    await sdkError("listBoards", []),
    /listBoards failed \(503\): boards unavailable/
  );
  assert.equal(
    requestsFor("GET", "/api/v1/kanban/boards").length - listBoardRequestsBeforeRetryFailure,
    3,
    "listBoards should stop after its bounded retry budget"
  );
  assert.deepEqual(await sdk("createCard", [{ title: "Card", description: "Desc", priority: "high", columnName: "Todo", columnId: "col-1", boardId: "board-1" }]), card());
  assert.deepEqual(await sdk("updateCard", ["card-1", { title: "Card", description: "Desc 2", priority: "urgent", columnId: "col-1", sortOrder: 7 }]), card());
  assert.deepEqual(await sdk("updateCard", ["card-1", { sortOrder: 8 }]), card());
  assert.deepEqual(await sdk("updateCard", ["card/slash", { title: "Encoded Card" }]), { ...card(), id: "card/slash", title: "Encoded Card" });
  assert.match(
    await sdkError("updateCard", ["error-card", { title: "Blocked" }]),
    /updateCard failed \(409\): card locked/
  );
  assert.deepEqual(await sdk("createBoard", [{ name: "Board", columns: [{ name: "Todo" }, { name: "Done" }] }]), {
    id: "board-1",
    name: "Board",
    createdAt: "now"
  });
  assert.deepEqual(await sdk("createBoard", [{ name: "Board without columns" }]), {
    id: "board-1",
    name: "Board",
    createdAt: "now"
  });
  assert.match(
    await sdkError("createBoard", [{ name: "Bad Board" }]),
    /createBoard failed \(422\): board invalid/
  );
  assert.deepEqual(await sdk("updateBoard", ["board-1", { name: "Updated" }]), {
    id: "board-1",
    name: "Updated",
    createdAt: "now"
  });
  assert.deepEqual(await sdk("updateBoard", ["board/slash", { name: "Encoded Board" }]), {
    id: "board/slash",
    name: "Encoded Board",
    createdAt: "now"
  });
  assert.match(
    await sdkError("updateBoard", ["board-locked", { name: "Blocked" }]),
    /updateBoard failed \(423\): board locked/
  );
  assert.equal(await sdk("archiveBoard", ["board-1"]), null);
  assert.match(
    await sdkError("archiveBoard", ["board-missing"]),
    /archiveBoard failed \(404\): board missing/
  );
  assert.deepEqual(await sdk("listColumns", ["board-1"]), [
    { id: "col-1", boardId: "board-1", name: "Todo", sortOrder: 1 }
  ]);
  assert.match(
    await sdkError("listColumns", ["board-missing"]),
    /listColumns failed \(404\): columns missing/
  );
  assert.deepEqual(await sdk("createColumn", ["board-1", { name: "Todo", sortOrder: 3 }]), {
    id: "col-1",
    boardId: "board-1",
    name: "Todo",
    sortOrder: 1
  });
  assert.deepEqual(await sdk("createColumn", ["board-1", { name: "No sort column" }]), {
    id: "col-1",
    boardId: "board-1",
    name: "Todo",
    sortOrder: 1
  });
  assert.match(
    await sdkError("createColumn", ["board-1", { name: "Bad Column" }]),
    /createColumn failed \(422\): column invalid/
  );
  assert.deepEqual(await sdk("updateColumn", ["col-1", { name: "Doing", sortOrder: 4 }]), {
    id: "col-1",
    boardId: "board-1",
    name: "Doing",
    sortOrder: 1
  });
  assert.deepEqual(await sdk("updateColumn", ["col-1", { sortOrder: 5 }]), {
    id: "col-1",
    boardId: "board-1",
    name: "Doing",
    sortOrder: 1
  });
  assert.match(
    await sdkError("updateColumn", ["col-locked", { name: "Blocked" }]),
    /updateColumn failed \(423\): column locked/
  );
  assert.equal(await sdk("deleteColumn", ["col-1"]), null);
  assert.match(
    await sdkError("deleteColumn", ["col-missing"]),
    /deleteColumn failed \(404\): column missing/
  );
  assert.equal(await sdk("reorderColumns", ["board-1", ["col-1"]]), null);
  assert.match(
    await sdkError("reorderColumns", ["board-locked", ["col-2", "col-1"]]),
    /reorderColumns failed \(409\): column order stale/
  );
  assert.match(
    await sdkError("createCard", [{ title: "Bad Card" }]),
    /createCard failed \(422\): card invalid/
  );
  assert.deepEqual(await sdk("listCards", [{ search: "Card", limit: 1, offset: 5 }]), [card()]);
  assert.match(
    await sdkError("listCards", [{ search: "explode" }]),
    /listCards failed \(503\): cards unavailable/
  );
  assert.deepEqual(await sdk("listCards", [{ search: "", limit: 0, offset: 0 }]), [card()]);
  assert.deepEqual(await sdk("listCards"), [card()]);
  assert.deepEqual(await sdk("completeCard", ["card-1"]), card());
  assert.match(
    await sdkError("completeCard", ["card-missing"]),
    /completeCard failed \(404\): card missing/
  );
  assert.deepEqual(await sdk("listArchivedCards", ["board-1", { page: 1, limit: 20 }]), {
    cards: [card()],
    total: 1,
    page: 1,
    limit: 10
  });
  assert.match(
    await sdkError("listArchivedCards", ["board-missing", { page: 1 }]),
    /listArchivedCards failed \(404\): archive missing/
  );
  assert.deepEqual(await sdk("listArchivedCards", ["board-1", { page: 0, limit: 0 }]), {
    cards: [card()],
    total: 1,
    page: 1,
    limit: 10
  });
  assert.deepEqual(await sdk("listArchivedCards", ["board-1"]), {
    cards: [card()],
    total: 1,
    page: 1,
    limit: 10
  });
  assert.deepEqual(await sdk("addCardCommit", ["card-1", { commitHash: "abc", message: "commit" }]), cardCommit());
  assert.deepEqual(await sdk("addCardCommit", ["card-1", { commitHash: "def" }]), cardCommit());
  assert.match(
    await sdkError("addCardCommit", ["card-1", { commitHash: "bad" }]),
    /addCardCommit failed \(422\): commit invalid/
  );
  assert.deepEqual(await sdk("listCardCommits", ["card-1"]), [cardCommit()]);
  assert.match(
    await sdkError("listCardCommits", ["card-missing"]),
    /listCardCommits failed \(404\): commits missing/
  );
  assert.equal(await sdk("linkCardNote", ["card-1", "note-1"]), null);
  assert.match(
    await sdkError("linkCardNote", ["card-1", "note-missing"]),
    /linkCardNote failed \(404\): card note missing/
  );
  assert.equal(await sdk("unlinkCardNote", ["card-1", "note-1"]), null);
  assert.equal(await sdk("unlinkCardNote", ["card/slash", "note/slash"]), null);
  assert.match(
    await sdkError("unlinkCardNote", ["card-1", "note-missing"]),
    /unlinkCardNote failed \(404\): card note missing/
  );
  assert.deepEqual(await sdk("listCardNotes", ["card-1"]), [cardNote()]);
  assert.match(
    await sdkError("listCardNotes", ["card-missing"]),
    /listCardNotes failed \(404\): card notes missing/
  );
  assert.deepEqual(await sdk("listLabels", ["board-1"]), [label()]);
  assert.match(
    await sdkError("listLabels", ["board-missing"]),
    /listLabels failed \(404\): labels missing/
  );
  assert.deepEqual(await sdk("createLabel", ["board-1", { name: "Bug", color: "#ff0000" }]), label("Bug", "#ff0000"));
  assert.deepEqual(await sdk("createLabel", ["board-1", { name: "No color" }]), label("Bug", "#ff0000"));
  assert.match(
    await sdkError("createLabel", ["board-1", { name: "Bad Label" }]),
    /createLabel failed \(422\): label invalid/
  );
  assert.deepEqual(await sdk("updateLabel", ["label-1", { name: "Feature", color: "#00ff00" }]), label("Feature", "#00ff00"));
  assert.deepEqual(await sdk("updateLabel", ["label-1", { color: "#0000ff" }]), label("Feature", "#00ff00"));
  assert.match(
    await sdkError("updateLabel", ["label-locked", { name: "Blocked" }]),
    /updateLabel failed \(423\): label locked/
  );
  assert.equal(await sdk("deleteLabel", ["label-1"]), null);
  assert.match(
    await sdkError("deleteLabel", ["label-missing"]),
    /deleteLabel failed \(404\): label missing/
  );
  assert.equal(await sdk("addCardLabel", ["card-1", "label-1"]), null);
  assert.match(
    await sdkError("addCardLabel", ["card-1", "label-missing"]),
    /addCardLabel failed \(404\): card label missing/
  );
  assert.equal(await sdk("removeCardLabel", ["card-1", "label-1"]), null);
  assert.equal(await sdk("removeCardLabel", ["card/slash", "label/slash"]), null);
  assert.match(
    await sdkError("removeCardLabel", ["card-1", "label-missing"]),
    /removeCardLabel failed \(404\): card label missing/
  );
  assert.deepEqual((await sdk("queryMemory", [{ query: "Summary", limit: 3 }]))[0], memoryEntries()[0]);
  assert.deepEqual((await sdk("queryMemory", [{ query: "Shared", limit: 2 }]))[1], memoryEntries()[1]);
  assert.deepEqual((await sdk("queryMemory", [{ query: "Self", limit: 2 }]))[2], memoryEntries()[2]);
  assert.equal(Object.hasOwn((await sdk("queryMemory", [{ query: "Unknown", limit: 2 }]))[3], "origin"), false);
  assert.equal(Object.hasOwn((await sdk("queryMemory", [{ query: "No Source", limit: 2 }]))[4], "origin"), false);
  assert.deepEqual(await sdk("queryMemory", [{ query: "", limit: 0 }]), memoryEntries());
  assert.match(
    await sdkError("queryMemory", [{ query: "explode", limit: 1 }]),
    /queryMemory failed \(502\): memory backend down/
  );
  assert.match(
    await sdkError("queryMemory", [{ query: "duplicate-json", limit: 1 }]),
    /queryMemory returned malformed JSON: JSON object contains duplicate key: summary/
  );
  assert.deepEqual(await sdk("fetchSkillPrompt", ["memo"]), {
    promptContent: "Prompt",
    promptTemplate: "Template",
    parameters: []
  });
  assert.deepEqual(await sdk("fetchSkillPrompt", ["skill with/slash"]), {
    promptContent: "Encoded Prompt",
    promptTemplate: "Encoded Template",
    parameters: [
      {
        name: "topic",
        type: "string",
        required: true,
        enum: ["sdk", "bridge"],
        default: "sdk",
        nested: { preserves: ["unknown", "metadata"] }
      }
    ]
  });
  assert.match(
    await sdkError("fetchSkillPrompt", ["missing"]),
    /fetchSkillPrompt failed \(404\): skill missing/
  );
  assert.match(
    await sdkError("fetchSkillPrompt", ["duplicate-json"]),
    /fetchSkillPrompt returned malformed JSON: JSON object contains duplicate key: promptContent/
  );

  assert.deepEqual(jsonBody(requestFor("POST", "/api/v1/messages/send")), { conversationId: "conv-1", content: "hello" });
  assert.deepEqual(jsonBody(requestsFor("POST", "/api/v1/messages/send")[1]), { conversationId: "conv-empty", content: "" });
  const duplicateHistoryRequest = requestsFor("GET", "/api/v1/messages/conv-1").find(
    (request) => request.search === "?before=duplicate-json"
  );
  assert.ok(duplicateHistoryRequest, "missing duplicate-json fetchHistory request");
  assertEmptyBody(duplicateHistoryRequest);
  const pagedHistoryRequest = requestsFor("GET", "/api/v1/messages/conv-1").find(
    (request) => request.search === "?before=msg-9&after=msg-1&around=msg-5&limit=1"
  );
  assert.ok(pagedHistoryRequest, "missing paged fetchHistory request");
  assert.deepEqual(Object.fromEntries(searchParams(pagedHistoryRequest)), {
    before: "msg-9",
    after: "msg-1",
    around: "msg-5",
    limit: "1"
  });
  assertEmptyBody(pagedHistoryRequest);
  const emptyHistoryRequest = requestsFor("GET", "/api/v1/messages/conv-1").find(
    (request) => request.search === "?limit=0"
  );
  assert.ok(emptyHistoryRequest, "missing empty fetchHistory request");
  assert.deepEqual(Object.fromEntries(searchParams(emptyHistoryRequest)), {
    limit: "0"
  });
  assertEmptyBody(emptyHistoryRequest);
  const defaultHistoryRequest = requestsFor("GET", "/api/v1/messages/conv-1").find((request) => request.search === "");
  assert.ok(defaultHistoryRequest, "missing default fetchHistory request");
  assertEmptyBody(defaultHistoryRequest);
  assert.deepEqual(Object.fromEntries(searchParams(requestFor("GET", "/api/v1/notes"))), {
    before: "note-9",
    limit: "1",
    offset: "2",
    tags: "work,ai",
    archived: "true"
  });
  assertEmptyBody(requestFor("GET", "/api/v1/notes"));
  const badNotesRequest = requestsFor("GET", "/api/v1/notes").find(
    (request) => request.search === "?before=bad-note-cursor"
  );
  assert.ok(badNotesRequest, "missing bad-cursor listNotes request");
  assertEmptyBody(badNotesRequest);
  const emptyNotesRequest = requestsFor("GET", "/api/v1/notes").find(
    (request) => request.search === "?limit=0&offset=0"
  );
  assert.ok(emptyNotesRequest, "missing empty listNotes request");
  assert.deepEqual(Object.fromEntries(searchParams(emptyNotesRequest)), {
    limit: "0",
    offset: "0"
  });
  assertEmptyBody(emptyNotesRequest);
  const defaultNotesRequest = requestsFor("GET", "/api/v1/notes").find(
    (request) => request.search === ""
  );
  assert.ok(defaultNotesRequest, "missing default listNotes request");
  assertEmptyBody(defaultNotesRequest);
  assert.deepEqual(jsonBody(requestFor("POST", "/api/v1/notes")), {
    title: "Note",
    content: "Body",
    tags: ["work"],
    notebookId: "book-1"
  });
  assert.deepEqual(jsonBody(requestsFor("POST", "/api/v1/notes")[1]), {
    title: "Title only"
  });
  assert.deepEqual(jsonBody(requestsFor("POST", "/api/v1/notes")[2]), {
    title: "Duplicate Json Note"
  });
  assert.deepEqual(jsonBody(requestsFor("POST", "/api/v1/notes")[3]), {
    title: "Bad Note"
  });
  assert.deepEqual(Object.fromEntries(searchParams(requestFor("PATCH", "/api/v1/notes/note-1"))), {});
  assert.deepEqual(jsonBody(requestFor("PATCH", "/api/v1/notes/note-1")), {
    title: "Updated",
    content: "Body 2",
    tags: ["ai"]
  });
  assert.deepEqual(Object.fromEntries(searchParams(requestsFor("PATCH", "/api/v1/notes/note-1")[1])), {});
  assert.deepEqual(jsonBody(requestsFor("PATCH", "/api/v1/notes/note-1")[1]), {
    tags: ["solo"]
  });
  assert.deepEqual(Object.fromEntries(searchParams(requestFor("PATCH", "/api/v1/notes/note%2Fslash"))), {});
  assert.deepEqual(jsonBody(requestFor("PATCH", "/api/v1/notes/note%2Fslash")), {
    title: "Encoded"
  });
  assert.deepEqual(Object.fromEntries(searchParams(requestFor("PATCH", "/api/v1/notes/note-locked"))), {});
  assert.deepEqual(jsonBody(requestFor("PATCH", "/api/v1/notes/note-locked")), {
    title: "Blocked"
  });
  assert.deepEqual(Object.fromEntries(searchParams(requestFor("DELETE", "/api/v1/notes/note-1"))), {});
  assertEmptyBody(requestFor("DELETE", "/api/v1/notes/note-1"));
  assert.deepEqual(Object.fromEntries(searchParams(requestFor("DELETE", "/api/v1/notes/note-missing"))), {});
  assertEmptyBody(requestFor("DELETE", "/api/v1/notes/note-missing"));
  assertEmptyBody(requestFor("GET", "/api/v1/kanban/boards"));
  assert.deepEqual(jsonBody(requestFor("POST", "/api/v1/kanban/cards")), {
    title: "Card",
    description: "Desc",
    priority: "high",
    columnName: "Todo",
    columnId: "col-1",
    boardId: "board-1"
  });
  assert.deepEqual(jsonBody(requestFor("PATCH", "/api/v1/kanban/cards/card-1")), {
    title: "Card",
    description: "Desc 2",
    priority: "urgent",
    columnId: "col-1",
    sortOrder: 7
  });
  assert.deepEqual(jsonBody(requestsFor("PATCH", "/api/v1/kanban/cards/card-1")[1]), { sortOrder: 8 });
  assert.deepEqual(jsonBody(requestFor("PATCH", "/api/v1/kanban/cards/card%2Fslash")), { title: "Encoded Card" });
  assert.deepEqual(jsonBody(requestFor("POST", "/api/v1/kanban/boards")), {
    name: "Board",
    columns: [{ name: "Todo" }, { name: "Done" }]
  });
  assert.deepEqual(jsonBody(requestsFor("POST", "/api/v1/kanban/boards")[1]), {
    name: "Board without columns"
  });
  assert.deepEqual(jsonBody(requestFor("PATCH", "/api/v1/kanban/boards/board-1")), { name: "Updated" });
  assert.deepEqual(jsonBody(requestFor("PATCH", "/api/v1/kanban/boards/board%2Fslash")), { name: "Encoded Board" });
  assertEmptyBody(requestFor("POST", "/api/v1/kanban/boards/board-1/archive"));
  assertEmptyBody(requestFor("GET", "/api/v1/kanban/boards/board-1/columns"));
  assert.deepEqual(jsonBody(requestFor("POST", "/api/v1/kanban/boards/board-1/columns")), { name: "Todo", sortOrder: 3 });
  assert.deepEqual(jsonBody(requestsFor("POST", "/api/v1/kanban/boards/board-1/columns")[1]), { name: "No sort column" });
  assert.deepEqual(jsonBody(requestFor("PATCH", "/api/v1/kanban/columns/col-1")), { name: "Doing", sortOrder: 4 });
  assert.deepEqual(jsonBody(requestsFor("PATCH", "/api/v1/kanban/columns/col-1")[1]), { sortOrder: 5 });
  assertEmptyBody(requestFor("DELETE", "/api/v1/kanban/columns/col-1"));
  assert.deepEqual(jsonBody(requestFor("POST", "/api/v1/kanban/boards/board-1/columns/reorder")), { columnIds: ["col-1"] });
  assert.deepEqual(Object.fromEntries(searchParams(requestFor("GET", "/api/v1/kanban/cards"))), {
    search: "Card",
    limit: "1",
    offset: "5"
  });
  assertEmptyBody(requestFor("GET", "/api/v1/kanban/cards"));
  const emptyCardsRequest = requestsFor("GET", "/api/v1/kanban/cards").find((request) => request.search === "?limit=0&offset=0");
  assert.ok(emptyCardsRequest, "missing empty listCards request");
  assert.deepEqual(Object.fromEntries(searchParams(emptyCardsRequest)), {
    limit: "0",
    offset: "0"
  });
  assertEmptyBody(emptyCardsRequest);
  const defaultCardsRequest = requestsFor("GET", "/api/v1/kanban/cards").find((request) => request.search === "");
  assert.ok(defaultCardsRequest, "missing default listCards request");
  assertEmptyBody(defaultCardsRequest);
  assertEmptyBody(requestFor("POST", "/api/v1/kanban/cards/card-1/complete"));
  assert.deepEqual(Object.fromEntries(searchParams(requestFor("GET", "/api/v1/kanban/boards/board-1/archived-cards"))), {
    page: "1",
    limit: "20"
  });
  assertEmptyBody(requestFor("GET", "/api/v1/kanban/boards/board-1/archived-cards"));
  assert.deepEqual(Object.fromEntries(searchParams(requestsFor("GET", "/api/v1/kanban/boards/board-1/archived-cards")[1])), {
    page: "0",
    limit: "0"
  });
  assertEmptyBody(requestsFor("GET", "/api/v1/kanban/boards/board-1/archived-cards")[1]);
  const defaultArchivedCardsRequest = requestsFor("GET", "/api/v1/kanban/boards/board-1/archived-cards").find((request) => request.search === "");
  assert.ok(defaultArchivedCardsRequest, "missing default listArchivedCards request");
  assertEmptyBody(defaultArchivedCardsRequest);
  assert.deepEqual(jsonBody(requestFor("POST", "/api/v1/kanban/cards/card-1/commits")), {
    commitHash: "abc",
    message: "commit"
  });
  assert.deepEqual(jsonBody(requestsFor("POST", "/api/v1/kanban/cards/card-1/commits")[1]), {
    commitHash: "def"
  });
  assertEmptyBody(requestFor("GET", "/api/v1/kanban/cards/card-1/commits"));
  assert.deepEqual(jsonBody(requestFor("POST", "/api/v1/kanban/cards/card-1/notes")), { noteId: "note-1" });
  assertEmptyBody(requestFor("GET", "/api/v1/kanban/cards/card-1/notes"));
  assertEmptyBody(requestFor("DELETE", "/api/v1/kanban/cards/card-1/notes/note-1"));
  assertEmptyBody(requestFor("DELETE", "/api/v1/kanban/cards/card%2Fslash/notes/note%2Fslash"));
  assertEmptyBody(requestFor("GET", "/api/v1/kanban/boards/board-1/labels"));
  assert.deepEqual(jsonBody(requestFor("POST", "/api/v1/kanban/boards/board-1/labels")), {
    name: "Bug",
    color: "#ff0000"
  });
  assert.deepEqual(jsonBody(requestsFor("POST", "/api/v1/kanban/boards/board-1/labels")[1]), {
    name: "No color"
  });
  assert.deepEqual(jsonBody(requestFor("PATCH", "/api/v1/kanban/labels/label-1")), {
    name: "Feature",
    color: "#00ff00"
  });
  assert.deepEqual(jsonBody(requestsFor("PATCH", "/api/v1/kanban/labels/label-1")[1]), {
    color: "#0000ff"
  });
  assertEmptyBody(requestFor("DELETE", "/api/v1/kanban/labels/label-1"));
  assert.deepEqual(jsonBody(requestFor("POST", "/api/v1/kanban/cards/card-1/labels")), { labelId: "label-1" });
  assertEmptyBody(requestFor("DELETE", "/api/v1/kanban/cards/card-1/labels/label-1"));
  assertEmptyBody(requestFor("DELETE", "/api/v1/kanban/cards/card%2Fslash/labels/label%2Fslash"));
  assertEmptyBody(requestFor("GET", "/api/v1/skills/memo/prompt"));
  assertEmptyBody(requestFor("GET", "/api/v1/skills/skill%20with%2Fslash/prompt"));
  assert.deepEqual(Object.fromEntries(searchParams(requestFor("GET", "/api/v1/memories/search"))), {
    q: "Summary",
    limit: "3"
  });
  assertEmptyBody(requestFor("GET", "/api/v1/memories/search"));
  const emptyMemoryRequest = requestsFor("GET", "/api/v1/memories/search").find((request) => request.search === "?q=&limit=0");
  assert.ok(emptyMemoryRequest, "missing empty queryMemory request");
  assert.deepEqual(Object.fromEntries(searchParams(emptyMemoryRequest)), {
    q: "",
    limit: "0"
  });
  assertEmptyBody(emptyMemoryRequest);

  for (const request of requests) {
    assert.equal(request.auth, "Bearer ari_test", `${request.method} ${request.path} missing auth`);
  }
  assert.deepEqual([...calledMethods].sort(), EXPECTED_HTTP_SDK_METHODS.toSorted());
  assert.ok(requests.length >= 35);
  console.log("sidecar sdk http OK");
} finally {
  controlServer.close();
  backend.close();
}
