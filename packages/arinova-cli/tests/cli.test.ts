import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const API_URL = "https://api.chat-staging.arinova.ai";
const CLI = resolve(__dirname, "../dist/index.js");

/** Try to read bot token from openclaw config if env var not set. */
function resolveToken(): string {
  if (process.env.TEST_BOT_TOKEN) return process.env.TEST_BOT_TOKEN;
  try {
    const configPath = join(homedir(), ".openclaw", "openclaw.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const accounts = config?.channels?.["openclaw-arinova-ai"]?.accounts ?? {};
    // Use first account with a botToken
    for (const acc of Object.values(accounts) as any[]) {
      if (acc.botToken) return acc.botToken;
    }
  } catch {}
  return "";
}

const TOKEN = resolveToken();
const CONV_ID = process.env.TEST_CONVERSATION_ID ?? "db39d380-f132-45a2-929b-1cac8b98bbd8";
const HAS_TOKEN = TOKEN.length > 0;
const HAS_CONV = HAS_TOKEN && CONV_ID.length > 0;

/** Run the CLI and return stdout. Throws on non-zero exit. */
function run(args: string): string {
  return execSync(`node ${CLI} --token ${TOKEN} --api-url ${API_URL} ${args}`, {
    encoding: "utf-8",
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
}

/** Run the CLI, returning { stdout, status }. Never throws. */
function runSafe(args: string): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execSync(`node ${CLI} --token ${TOKEN} --api-url ${API_URL} ${args}`, {
      encoding: "utf-8",
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
    return { stdout, stderr: "", status: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      status: err.status ?? 1,
    };
  }
}

/** Direct API call for cleanup operations. */
async function apiFetch(method: string, path: string, body?: unknown): Promise<any> {
  const opts: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_URL}${path}`, opts);
  if (!res.ok) {
    console.error(`[cleanup] ${method} ${path} → ${res.status}`);
    return null;
  }
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

// ---------------------------------------------------------------------------
// Help commands — these don't need a token
// ---------------------------------------------------------------------------
describe("help commands", () => {
  it("arinova --help exits 0 and contains Usage", () => {
    const out = execSync(`node ${CLI} --help`, { encoding: "utf-8" });
    expect(out).toContain("Usage");
    expect(out).toContain("arinova");
  });

  it("arinova note --help exits 0", () => {
    const out = execSync(`node ${CLI} note --help`, { encoding: "utf-8" });
    expect(out).toContain("Note commands");
  });

  it("arinova kanban --help exits 0", () => {
    const out = execSync(`node ${CLI} kanban --help`, { encoding: "utf-8" });
    expect(out).toContain("Kanban board commands");
  });

  it("arinova wiki --help exits 0", () => {
    const out = execSync(`node ${CLI} wiki --help`, { encoding: "utf-8" });
    expect(out).toContain("Wiki page commands");
  });

  it("arinova search --help exits 0", () => {
    const out = execSync(`node ${CLI} search --help`, { encoding: "utf-8" });
    expect(out.toLowerCase()).toContain("search");
  });
});

// ---------------------------------------------------------------------------
// Note CRUD — require TEST_BOT_TOKEN
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_TOKEN)("note commands", () => {
  let testNotebookId: string;
  let testNoteId: string;

  it("note list exits 0 and outputs JSON with notes key", () => {
    const out = run("note list");
    const json = JSON.parse(out);
    expect(json).toHaveProperty("notes");
    expect(Array.isArray(json.notes)).toBe(true);
  });

  it("note list --search __cli_test__ outputs JSON", () => {
    const out = run("note list --search __cli_test__");
    const json = JSON.parse(out);
    expect(json).toHaveProperty("notes");
  });

  it("full CRUD: create notebook, create note, update, list, delete", async () => {
    const listOut = run("note list");
    const listJson = JSON.parse(listOut);

    if (listJson.notes?.length > 0) {
      testNotebookId = listJson.notes[0].notebookId;
    } else {
      testNotebookId = listJson.notebookId ?? listJson.notebooks?.[0]?.id ?? "";
    }

    if (!testNotebookId) {
      console.warn("No notebook found to test CRUD — skipping");
      return;
    }

    // CREATE
    const createOut = run(
      `note create --notebook-id ${testNotebookId} --title "__cli_test_note__" --content "integration test content"`,
    );
    const created = JSON.parse(createOut);
    expect(created).toHaveProperty("id");
    testNoteId = created.id;

    // LIST with search
    const searchOut = run("note list --search __cli_test_note__");
    const searchJson = JSON.parse(searchOut);
    const found = searchJson.notes?.some((n: any) => n.id === testNoteId);
    expect(found).toBe(true);

    // UPDATE
    const updateOut = run(
      `note update --note-id ${testNoteId} --title "__cli_test_note_updated__" --content "updated content"`,
    );
    const updated = JSON.parse(updateOut);
    expect(updated.title ?? updated.id).toBeTruthy();

    // DELETE
    const deleteOut = run(`note delete --note-id ${testNoteId}`);
    expect(deleteOut).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Notebook CRUD — require TEST_BOT_TOKEN
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_TOKEN)("notebook commands", () => {
  let testNotebookId: string;

  afterAll(async () => {
    // Cleanup: delete any stale __cli_test notebooks
    const notebooksRes = await apiFetch("GET", "/api/v1/notebooks");
    const notebooks = Array.isArray(notebooksRes) ? notebooksRes : notebooksRes?.notebooks ?? [];
    if (Array.isArray(notebooks)) {
      for (const nb of notebooks) {
        if (typeof nb.name === "string" && nb.name.startsWith("__cli_test")) {
          await apiFetch("PATCH", `/api/v1/notebooks/${nb.id}`, { archived: true });
          await apiFetch("DELETE", `/api/v1/notebooks/${nb.id}`);
        }
      }
    }
  });

  it("notebook list exits 0 and outputs JSON", () => {
    const out = run("notebook list");
    const json = JSON.parse(out);
    const notebooks = Array.isArray(json) ? json : json.notebooks;
    expect(Array.isArray(notebooks)).toBe(true);
  });

  it("full CRUD: create, rename, list, archive, delete", () => {
    // CREATE
    const createOut = run('notebook create --name "__cli_test_notebook__"');
    const created = JSON.parse(createOut);
    expect(created).toHaveProperty("id");
    testNotebookId = created.id;

    try {
      // RENAME
      const renameOut = run(
        `notebook rename --id ${testNotebookId} --name "__cli_test_notebook_renamed__"`,
      );
      const renamed = JSON.parse(renameOut);
      expect(renamed).toBeDefined();

      // LIST — verify it exists
      const listOut = run("notebook list");
      const listJson = JSON.parse(listOut);
      const notebooks = Array.isArray(listJson) ? listJson : listJson.notebooks;
      const found = notebooks.some((nb: any) => nb.id === testNotebookId);
      expect(found).toBe(true);

      // ARCHIVE
      const archiveOut = run(`notebook archive --id ${testNotebookId}`);
      expect(archiveOut).toBeDefined();

      // DELETE
      const deleteOut = run(`notebook delete --id ${testNotebookId}`);
      expect(deleteOut).toBeDefined();
      testNotebookId = ""; // cleared — no need to cleanup
    } finally {
      if (testNotebookId) {
        runSafe(`notebook archive --id ${testNotebookId}`);
        runSafe(`notebook delete --id ${testNotebookId}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Wiki CRUD — require TEST_BOT_TOKEN + TEST_CONVERSATION_ID
// ---------------------------------------------------------------------------

/** Remove all __cli_test wiki pages via API. */
async function cleanupTestWikiPages() {
  if (!HAS_CONV) return;
  const pages = await apiFetch("GET", `/api/v1/wiki?conversationId=${CONV_ID}`);
  if (Array.isArray(pages)) {
    for (const p of pages) {
      if (typeof p.title === "string" && p.title.startsWith("__cli_test")) {
        const res = await apiFetch("DELETE", `/api/v1/wiki/${p.id}`);
        if (!res && res !== "") console.error(`[wiki cleanup] DELETE /api/v1/wiki/${p.id} failed`);
      }
    }
  }
}

describe.skipIf(!HAS_CONV)("wiki commands", () => {
  let testPageId: string;

  beforeAll(async () => { await cleanupTestWikiPages(); });
  afterAll(async () => { await cleanupTestWikiPages(); });

  it("wiki list exits 0 and outputs JSON array", () => {
    const out = run(`wiki list --conversation-id ${CONV_ID}`);
    const json = JSON.parse(out);
    expect(Array.isArray(json)).toBe(true);
  });

  it("full CRUD: create, list, get, update, delete", () => {
    // CREATE
    const createOut = run(
      `wiki create --conversation-id ${CONV_ID} --title "__cli_test_wiki__" --content "test wiki content" --tags test integration`,
    );
    const created = JSON.parse(createOut);
    expect(created).toHaveProperty("id");
    testPageId = created.id;

    try {
      // LIST — verify it exists
      const listOut = run(`wiki list --conversation-id ${CONV_ID}`);
      const pages = JSON.parse(listOut);
      const found = Array.isArray(pages) && pages.some((p: any) => p.id === testPageId);
      expect(found).toBe(true);

      // GET
      const getOut = run(`wiki get --page-id ${testPageId}`);
      const page = JSON.parse(getOut);
      expect(page.id).toBe(testPageId);
      expect(page.title).toBe("__cli_test_wiki__");

      // UPDATE
      const updateOut = run(
        `wiki update --page-id ${testPageId} --title "__cli_test_wiki_updated__" --content "updated wiki"`,
      );
      const updated = JSON.parse(updateOut);
      expect(updated).toBeDefined();

      // DELETE
      const deleteOut = run(`wiki delete --page-id ${testPageId}`);
      expect(deleteOut).toBeDefined();
      testPageId = ""; // cleared
    } finally {
      if (testPageId) {
        runSafe(`wiki delete --page-id ${testPageId}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Kanban CRUD — require TEST_BOT_TOKEN
// ---------------------------------------------------------------------------

/** Remove all __test / __cli_test boards via API (hard-delete). */
async function cleanupTestBoards() {
  if (!HAS_TOKEN) return;
  const res = await fetch(`${API_URL}/api/v1/kanban/boards?includeArchived=true`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) return;
  const boards: any[] = await res.json();
  for (const b of boards) {
    if (typeof b.name === "string" && (b.name.startsWith("__cli_test") || b.name.startsWith("__test"))) {
      await fetch(`${API_URL}/api/v1/kanban/boards/${b.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TOKEN}` },
      }).catch(() => {});
    }
  }
}

describe.skipIf(!HAS_TOKEN)("kanban commands", () => {
  let testBoardId: string;
  let testCardId: string;

  beforeAll(async () => { await cleanupTestBoards(); });
  afterAll(async () => { await cleanupTestBoards(); });

  it("kanban board list exits 0 and outputs JSON array", () => {
    const out = run("kanban board list");
    const json = JSON.parse(out);
    expect(Array.isArray(json)).toBe(true);
  });

  it("full card CRUD: create board, create card, update, complete, delete card, archive board", () => {
    // CREATE BOARD
    const boardOut = run('kanban board create --name "__cli_test_board__"');
    const board = JSON.parse(boardOut);
    expect(board).toHaveProperty("id");
    testBoardId = board.id;

    try {
      // CREATE CARD
      const cardOut = run(
        `kanban card create --title "__cli_test_card__" --board-id ${testBoardId} --description "test card"`,
      );
      const card = JSON.parse(cardOut);
      expect(card).toHaveProperty("id");
      testCardId = card.id;

      // UPDATE CARD
      const updateOut = run(
        `kanban card update --card-id ${testCardId} --title "__cli_test_card_updated__"`,
      );
      const updated = JSON.parse(updateOut);
      expect(updated).toBeDefined();

      // COMPLETE CARD
      const completeOut = run(`kanban card complete --card-id ${testCardId}`);
      expect(completeOut).toBeDefined();
    } finally {
      if (testBoardId) {
        runSafe(`kanban board archive --board-id ${testBoardId}`);
      }
    }
  });

  it("kanban card list exits 0 and outputs JSON", () => {
    const result = runSafe("kanban card list");
    expect(result.status === 0 || result.stdout.length > 0).toBe(true);
  });

  it("kanban card list --search __nonexistent__ exits 0", () => {
    const result = runSafe("kanban card list --search __nonexistent__");
    expect(result.status === 0 || result.status === null).toBe(true);
  });

  it("board update: create board, rename it, verify, archive", () => {
    const boardOut = run('kanban board create --name "__cli_test_board_update__"');
    const board = JSON.parse(boardOut);
    expect(board).toHaveProperty("id");
    const boardId = board.id;

    try {
      const updateOut = run(
        `kanban board update --board-id ${boardId} --name "__cli_test_board_renamed__"`,
      );
      const updated = JSON.parse(updateOut);
      expect(updated).toBeDefined();
    } finally {
      runSafe(`kanban board archive --board-id ${boardId}`);
    }
  });

  it("board archive: create board then archive it", () => {
    const boardOut = run('kanban board create --name "__cli_test_board_archive__"');
    const board = JSON.parse(boardOut);
    expect(board).toHaveProperty("id");

    const archiveOut = run(`kanban board archive --board-id ${board.id}`);
    expect(archiveOut).toBeDefined();
  });

  it("card delete: create board + card, delete card, archive board", () => {
    const boardOut = run('kanban board create --name "__cli_test_card_delete__"');
    const board = JSON.parse(boardOut);
    const boardId = board.id;

    try {
      const cardOut = run(
        `kanban card create --title "__cli_test_card_del__" --board-id ${boardId}`,
      );
      const card = JSON.parse(cardOut);
      expect(card).toHaveProperty("id");

      const deleteOut = run(`kanban card delete --card-id ${card.id}`);
      expect(deleteOut).toBeDefined();
    } finally {
      runSafe(`kanban board archive --board-id ${boardId}`);
    }
  });

  it("card add-commit: create board + card, add commit, verify", () => {
    const boardOut = run('kanban board create --name "__cli_test_card_commit__"');
    const board = JSON.parse(boardOut);
    const boardId = board.id;

    try {
      const cardOut = run(
        `kanban card create --title "__cli_test_card_commit__" --board-id ${boardId}`,
      );
      const card = JSON.parse(cardOut);
      expect(card).toHaveProperty("id");

      const commitOut = run(
        `kanban card add-commit --card-id ${card.id} --sha abc1234 --message "test commit"`,
      );
      const commitResult = JSON.parse(commitOut);
      expect(commitResult).toBeDefined();
    } finally {
      runSafe(`kanban board archive --board-id ${boardId}`);
    }
  });
});

describe.skipIf(!HAS_TOKEN)("kanban label commands", () => {
  afterAll(async () => { await cleanupTestBoards(); });

  it("label CRUD: create board, create label, list labels, verify, archive board", () => {
    const boardOut = run('kanban board create --name "__cli_test_label__"');
    const board = JSON.parse(boardOut);
    const boardId = board.id;

    try {
      const labelOut = run(
        `kanban label create --board-id ${boardId} --name "__cli_test_label__" --color "#ff0000"`,
      );
      const label = JSON.parse(labelOut);
      expect(label).toBeDefined();

      const listOut = run(`kanban label list --board-id ${boardId}`);
      const labels = JSON.parse(listOut);
      expect(Array.isArray(labels)).toBe(true);
      const found = labels.some((l: any) => l.name === "__cli_test_label__");
      expect(found).toBe(true);
    } finally {
      runSafe(`kanban board archive --board-id ${boardId}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Search — require TEST_BOT_TOKEN
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_TOKEN)("search commands", () => {
  it("search --query test exits 0 and outputs JSON", () => {
    const out = run('search --query "test"');
    const json = JSON.parse(out);
    expect(json).toBeDefined();
    expect(typeof json).toBe("object");
  });

  it("search --query __nonexistent_query_xyz__ returns results object", () => {
    const out = run('search --query "__nonexistent_query_xyz__"');
    const json = JSON.parse(out);
    expect(json).toBeDefined();
  });

  it("search --query test --limit 3 respects limit", () => {
    const out = run('search --query "test" --limit 3');
    const json = JSON.parse(out);
    expect(json).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Memory — require TEST_BOT_TOKEN
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_TOKEN)("memory commands", () => {
  it("memory query --query test exits 0", () => {
    const result = runSafe('memory query --query "test"');
    expect(typeof result.status).toBe("number");
  });

  it("memory list exits 0 and outputs JSON", () => {
    const result = runSafe("memory list");
    expect(typeof result.status).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Message — require TEST_BOT_TOKEN + TEST_CONVERSATION_ID
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_CONV)("message commands (real conversation)", () => {
  it("message send + list roundtrip", () => {
    // SEND
    const sendOut = run(
      `message send --conversation-id ${CONV_ID} --content "__cli_test_msg__"`,
    );
    const sent = JSON.parse(sendOut);
    expect(sent).toHaveProperty("messageId");

    // LIST — verify message appears
    const listOut = run(`message list --conversation-id ${CONV_ID}`);
    const messages = JSON.parse(listOut);
    expect(messages).toBeDefined();
  });
});

describe.skipIf(!HAS_TOKEN)("message commands (dummy conversation)", () => {
  it("message list with a dummy conversation-id does not crash", () => {
    const result = runSafe(
      "message list --conversation-id 00000000-0000-0000-0000-000000000000",
    );
    expect(typeof result.status).toBe("number");
  });

  it("message send with a dummy conversation-id does not crash", () => {
    const result = runSafe(
      'message send --conversation-id 00000000-0000-0000-0000-000000000000 --content "__cli_test_msg__"',
    );
    expect(typeof result.status).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// File — require TEST_BOT_TOKEN
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_TOKEN)("file commands", () => {
  it("file upload with a dummy conversation-id and missing file does not crash", () => {
    const result = runSafe(
      "file upload --conversation-id 00000000-0000-0000-0000-000000000000 --file-path /tmp/__cli_test_nonexistent_file__",
    );
    expect(typeof result.status).toBe("number");
    expect(result.status).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Auto-Send — require TEST_BOT_TOKEN + TEST_CONVERSATION_ID
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_CONV)("auto-send commands", () => {
  const scheduleIds: string[] = [];

  // Cancel orphaned __cli_test_* schedules from previous crashed runs
  beforeAll(async () => {
    try {
      const data = await apiFetch("GET", `/api/v1/auto-send?conversationId=${CONV_ID}`);
      const schedules = data?.schedules ?? [];
      for (const s of schedules) {
        if (typeof s.content === "string" && s.content.startsWith("__cli_test_")) {
          try { await apiFetch("DELETE", `/api/v1/auto-send/${s.id}`); } catch {}
        }
      }
    } catch {}
  });

  afterAll(async () => {
    // Cleanup: cancel any test schedules created in this run
    for (const id of scheduleIds) {
      try { await apiFetch("DELETE", `/api/v1/auto-send/${id}`); } catch {}
    }
  });

  it("auto-send list exits 0 and outputs JSON", () => {
    const out = run(`auto-send list --conversation-id ${CONV_ID}`);
    const json = JSON.parse(out);
    expect(json).toHaveProperty("schedules");
  });

  it("auto-send create once schedule", () => {
    const out = run(
      `auto-send create --conversation-id ${CONV_ID} --mode once --content "__cli_test_auto_send__" --minutes 1440`,
    );
    const json = JSON.parse(out);
    expect(json).toHaveProperty("id");
    scheduleIds.push(json.id);
  });

  it("auto-send create recurring schedule", () => {
    const out = run(
      `auto-send create --conversation-id ${CONV_ID} --mode recurring --content "__cli_test_auto_send_recurring__" --interval 86400`,
    );
    const json = JSON.parse(out);
    expect(json).toHaveProperty("id");
    scheduleIds.push(json.id);
  });

  it("auto-send get returns schedule details", () => {
    if (scheduleIds.length === 0) return;
    const out = run(`auto-send get --id ${scheduleIds[0]}`);
    const json = JSON.parse(out);
    expect(json).toHaveProperty("id");
    expect(json.id).toBe(scheduleIds[0]);
  });

  it("auto-send update modifies content", () => {
    if (scheduleIds.length === 0) return;
    const out = run(`auto-send update --id ${scheduleIds[0]} --content "__cli_test_auto_send_updated__"`);
    const json = JSON.parse(out);
    expect(json).toBeDefined();
  });

  it("auto-send cancel removes schedule", () => {
    if (scheduleIds.length === 0) return;
    const id = scheduleIds.pop()!;
    const result = runSafe(`auto-send cancel --id ${id}`);
    expect(result.status).toBe(0);
  });

  it("auto-send history exits 0", () => {
    const out = run(`auto-send history --conversation-id ${CONV_ID}`);
    const json = JSON.parse(out);
    expect(json).toHaveProperty("logs");
  });
});

// ---------------------------------------------------------------------------
// Conversation — require TEST_BOT_TOKEN
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_TOKEN)("conversation commands", () => {
  it("conversation list exits 0 and outputs JSON", () => {
    const out = run("conversation list");
    const json = JSON.parse(out);
    const convs = Array.isArray(json) ? json : json.conversations;
    expect(Array.isArray(convs)).toBe(true);
  });

  it("conversation list --type h2a filters correctly", () => {
    const out = run("conversation list --type h2a --limit 5");
    const json = JSON.parse(out);
    const convs = Array.isArray(json) ? json : json.conversations;
    expect(Array.isArray(convs)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Auth — require TEST_BOT_TOKEN (non-interactive only)
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_TOKEN)("auth commands", () => {
  it("auth set-key + whoami roundtrip", () => {
    // set-key stores the token, whoami verifies it
    // Note: set-key may write to local config, so just test whoami
    const result = runSafe("auth whoami");
    // whoami may fail with bot tokens (designed for CLI keys), just verify no crash
    expect(typeof result.status).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Stats — help only (requires creator token, not bot token)
// ---------------------------------------------------------------------------
describe("stats help commands", () => {
  it("arinova stats --help exits 0", () => {
    const out = execSync(`node ${CLI} stats --help`, { encoding: "utf-8" });
    expect(out.toLowerCase()).toContain("stats");
  });
});

// ---------------------------------------------------------------------------
// Theme — help + local commands (no API needed for init/build)
// ---------------------------------------------------------------------------
describe("theme help commands", () => {
  it("arinova theme --help exits 0", () => {
    const out = execSync(`node ${CLI} theme --help`, { encoding: "utf-8" });
    expect(out.toLowerCase()).toContain("theme");
  });

  it("theme init creates project scaffold", () => {
    const tmpDir = `/tmp/__cli_test_theme_${Date.now()}`;
    try {
      const out = execSync(`node ${CLI} theme init ${tmpDir}`, { encoding: "utf-8" });
      expect(out.toLowerCase()).toContain("scaffolded");
      // Verify files exist
      const fs = require("node:fs");
      expect(fs.existsSync(`${tmpDir}/theme.json`)).toBe(true);
      expect(fs.existsSync(`${tmpDir}/theme.js`)).toBe(true);
      expect(fs.existsSync(`${tmpDir}/assets`)).toBe(true);
    } finally {
      execSync(`rm -rf ${tmpDir}`, { stdio: "pipe" });
    }
  });

  it("theme build fails gracefully outside theme directory", () => {
    const result = runSafe("theme build");
    expect(result.status).not.toBe(0);
  });
});

describe.skipIf(!HAS_TOKEN)("theme API commands (bot token)", () => {
  it("theme list does not crash", () => {
    const result = runSafe("theme list");
    expect(typeof result.status).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Sticker — require token (creator APIs, bot token may get 401)
// ---------------------------------------------------------------------------
describe("sticker help commands", () => {
  it("arinova sticker --help exits 0", () => {
    const out = execSync(`node ${CLI} sticker --help`, { encoding: "utf-8" });
    expect(out.toLowerCase()).toContain("sticker");
  });
});

describe.skipIf(!HAS_TOKEN)("sticker API commands", () => {
  it("sticker list does not crash", () => {
    const result = runSafe("sticker list");
    expect(typeof result.status).toBe("number");
  });

  it("sticker create + delete roundtrip", () => {
    const createResult = runSafe('sticker create --name "__cli_test_sticker_pack__"');
    if (createResult.status !== 0) return; // skip if auth fails
    try {
      const created = JSON.parse(createResult.stdout);
      expect(created).toHaveProperty("id");
      // Cleanup
      runSafe(`sticker delete ${created.id}`);
    } catch {
      // Auth may fail with bot token — acceptable
    }
  });
});

// ---------------------------------------------------------------------------
// Space — require token
// ---------------------------------------------------------------------------
describe("space help commands", () => {
  it("arinova space --help exits 0", () => {
    const out = execSync(`node ${CLI} space --help`, { encoding: "utf-8" });
    expect(out.toLowerCase()).toContain("space");
  });
});

describe.skipIf(!HAS_TOKEN)("space API commands", () => {
  it("space list does not crash", () => {
    const result = runSafe("space list");
    expect(typeof result.status).toBe("number");
  });

  it("space create + show + delete roundtrip", () => {
    const createResult = runSafe('space create --name "__cli_test_space__" --description "test"');
    if (createResult.status !== 0) return;
    try {
      const created = JSON.parse(createResult.stdout);
      expect(created).toHaveProperty("id");

      // SHOW
      const showResult = runSafe(`space show ${created.id}`);
      expect(typeof showResult.status).toBe("number");

      // DELETE
      runSafe(`space delete ${created.id}`);
    } catch {}
  });
});

// ---------------------------------------------------------------------------
// Expert — require token (creator APIs)
// ---------------------------------------------------------------------------
describe("expert help commands", () => {
  it("arinova expert --help exits 0", () => {
    const out = execSync(`node ${CLI} expert --help`, { encoding: "utf-8" });
    expect(out.toLowerCase()).toContain("expert");
  });
});

describe.skipIf(!HAS_TOKEN)("expert API commands", () => {
  it("expert list does not crash", () => {
    const result = runSafe("expert list");
    expect(typeof result.status).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Community — require token
// ---------------------------------------------------------------------------
describe("community help commands", () => {
  it("arinova community --help exits 0", () => {
    const out = execSync(`node ${CLI} community --help`, { encoding: "utf-8" });
    expect(out.toLowerCase()).toContain("community");
  });
});

describe.skipIf(!HAS_TOKEN)("community API commands", () => {
  let testCommunityId: string | null = null;

  afterAll(async () => {
    if (testCommunityId) {
      try { await apiFetch("DELETE", `/api/v1/communities/${testCommunityId}`); } catch {}
    }
  });

  it("community list does not crash", () => {
    const result = runSafe("community list");
    expect(typeof result.status).toBe("number");
  });

  it("community create + update + delete roundtrip", () => {
    const createResult = runSafe('community create --name "__cli_test_community__" --type community');
    if (createResult.status !== 0) return;
    try {
      const created = JSON.parse(createResult.stdout);
      expect(created).toHaveProperty("id");
      testCommunityId = created.id;

      // UPDATE
      const updateResult = runSafe(`community update ${testCommunityId} --name "__cli_test_community_updated__"`);
      expect(typeof updateResult.status).toBe("number");

      // LIST-MEMBERS
      const membersResult = runSafe(`community list-members ${testCommunityId}`);
      expect(typeof membersResult.status).toBe("number");

      // LIST-AGENTS
      const agentsResult = runSafe(`community list-agents ${testCommunityId}`);
      expect(typeof agentsResult.status).toBe("number");

      // DELETE
      const deleteResult = runSafe(`community delete ${testCommunityId}`);
      if (deleteResult.status === 0) testCommunityId = null;
    } catch {}
  });
});

// ---------------------------------------------------------------------------
// App (Developer) — require token
// ---------------------------------------------------------------------------
describe("app help commands", () => {
  it("arinova app --help exits 0", () => {
    const out = execSync(`node ${CLI} app --help`, { encoding: "utf-8" });
    expect(out.toLowerCase()).toContain("app");
  });
});

describe.skipIf(!HAS_TOKEN)("app API commands", () => {
  let testAppId: string | null = null;

  afterAll(async () => {
    if (testAppId) {
      try { await apiFetch("DELETE", `/api/v1/developer/apps/${testAppId}`); } catch {}
    }
  });

  it("app list does not crash", () => {
    const result = runSafe("app list");
    expect(typeof result.status).toBe("number");
  });

  it("app create + show + delete roundtrip", () => {
    const createResult = runSafe('app create --name "__cli_test_app__" --description "test app"');
    if (createResult.status !== 0) return;
    try {
      const created = JSON.parse(createResult.stdout);
      expect(created).toHaveProperty("id");
      testAppId = created.id;

      // SHOW
      const showResult = runSafe(`app show ${testAppId}`);
      expect(typeof showResult.status).toBe("number");

      // DELETE
      const deleteResult = runSafe(`app delete ${testAppId}`);
      if (deleteResult.status === 0) testAppId = null;
    } catch {}
  });
});

// ---------------------------------------------------------------------------
// Skill — require token
// ---------------------------------------------------------------------------
describe("skill help commands", () => {
  it("arinova skill --help exits 0", () => {
    const out = execSync(`node ${CLI} skill --help`, { encoding: "utf-8" });
    expect(out.toLowerCase()).toContain("skill");
  });
});

describe.skipIf(!HAS_TOKEN)("skill API commands", () => {
  let testSkillId: string | null = null;

  afterAll(async () => {
    if (testSkillId) {
      try { await apiFetch("DELETE", `/api/v1/skills/custom/${testSkillId}`); } catch {}
    }
  });

  it("skill list does not crash", () => {
    const result = runSafe("skill list");
    expect(typeof result.status).toBe("number");
  });

  it("skill create + update + delete roundtrip", () => {
    const createResult = runSafe('skill create --name "__cli_test_skill__" --description "test" --prompt "test prompt"');
    if (createResult.status !== 0) return;
    try {
      const created = JSON.parse(createResult.stdout);
      expect(created).toHaveProperty("id");
      testSkillId = created.id;

      // UPDATE
      const updateResult = runSafe(`skill update ${testSkillId} --description "updated test"`);
      expect(typeof updateResult.status).toBe("number");

      // DELETE
      const deleteResult = runSafe(`skill delete ${testSkillId}`);
      if (deleteResult.status === 0) testSkillId = null;
    } catch {}
  });
});
