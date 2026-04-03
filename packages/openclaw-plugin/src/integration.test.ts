/**
 * Integration tests for OpenClaw Plugin — hit staging API with real bot token.
 * Skipped when no token is available.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const API_URL = "https://api.chat-staging.arinova.ai";
const CONV_ID = process.env.TEST_CONVERSATION_ID ?? "db39d380-f132-45a2-929b-1cac8b98bbd8";

/** Resolve bot token from env or openclaw config. */
function resolveToken(): string {
  if (process.env.TEST_BOT_TOKEN) return process.env.TEST_BOT_TOKEN;
  try {
    const configPath = join(homedir(), ".openclaw", "openclaw.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const accounts = config?.channels?.["openclaw-arinova-ai"]?.accounts ?? {};
    for (const acc of Object.values(accounts) as any[]) {
      if (acc.botToken) return acc.botToken;
    }
  } catch {}
  return "";
}

const TOKEN = resolveToken();
const HAS_TOKEN = TOKEN.length > 0;

/** Direct API call helper. */
async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  };
  const opts: RequestInit = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_URL}${path}`, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text as unknown as T; }
}

/** Cleanup helper that logs failures. */
async function tryDelete(path: string) {
  try {
    await api("DELETE", path);
  } catch (e) {
    console.error(`[cleanup] DELETE ${path} failed:`, (e as Error).message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Message
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(!HAS_TOKEN)("message integration", () => {
  it("send message to conversation", async () => {
    const res = await api<{ messageId: string }>("POST", "/api/v1/messages/send", {
      conversationId: CONV_ID,
      content: "__plugin_test_msg__",
    });
    expect(res.messageId).toBeDefined();
  });

  it("list messages in conversation", async () => {
    const res = await api<{ messages: unknown[] }>("GET", `/api/v1/messages/${CONV_ID}?limit=5`);
    expect(res.messages).toBeDefined();
    expect(Array.isArray(res.messages)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Note CRUD
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(!HAS_TOKEN)("note integration", () => {
  let notebookId: string;
  let noteId: string;

  beforeAll(async () => {
    // Find a notebook
    const res = await api<any>("GET", "/api/v1/notebooks");
    const notebooks = Array.isArray(res) ? res : res?.notebooks ?? [];
    if (notebooks.length > 0) {
      notebookId = notebooks[0].id;
    }
  });

  it("create note", async () => {
    if (!notebookId) return;
    const res = await api<{ id: string }>("POST", "/api/v1/notes", {
      notebookId,
      title: "__plugin_test_note__",
      content: "integration test",
    });
    expect(res.id).toBeDefined();
    noteId = res.id;
  });

  it("list notes — find created note", async () => {
    const res = await api<{ notes: any[] }>("GET", "/api/v1/notes?search=__plugin_test_note__");
    expect(res.notes).toBeDefined();
    if (noteId) {
      expect(res.notes.some((n: any) => n.id === noteId)).toBe(true);
    }
  });

  it("update note", async () => {
    if (!noteId) return;
    const res = await api("PATCH", `/api/v1/notes/${noteId}`, {
      title: "__plugin_test_note_updated__",
    });
    expect(res).toBeDefined();
  });

  it("delete note (cleanup)", async () => {
    if (!noteId) return;
    await tryDelete(`/api/v1/notes/${noteId}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Notebook CRUD
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(!HAS_TOKEN)("notebook integration", () => {
  let notebookId: string;

  afterAll(async () => {
    // Cleanup stale test notebooks
    const res = await api<any>("GET", "/api/v1/notebooks").catch(() => []);
    const notebooks = Array.isArray(res) ? res : res?.notebooks ?? [];
    for (const nb of notebooks) {
      if (typeof nb.name === "string" && nb.name.startsWith("__plugin_test")) {
        await api("PATCH", `/api/v1/notebooks/${nb.id}`, { archived: true }).catch(() => {});
        await tryDelete(`/api/v1/notebooks/${nb.id}`);
      }
    }
  });

  it("create notebook", async () => {
    const res = await api<{ id: string }>("POST", "/api/v1/notebooks", {
      name: "__plugin_test_notebook__",
    });
    expect(res.id).toBeDefined();
    notebookId = res.id;
  });

  it("list notebooks — find created", async () => {
    const res = await api<any>("GET", "/api/v1/notebooks");
    const notebooks = Array.isArray(res) ? res : res?.notebooks ?? [];
    expect(Array.isArray(notebooks)).toBe(true);
    if (notebookId) {
      expect(notebooks.some((nb: any) => nb.id === notebookId)).toBe(true);
    }
  });

  it("rename notebook", async () => {
    if (!notebookId) return;
    const res = await api("PATCH", `/api/v1/notebooks/${notebookId}`, {
      name: "__plugin_test_notebook_renamed__",
    });
    expect(res).toBeDefined();
  });

  it("archive + delete notebook (cleanup)", async () => {
    if (!notebookId) return;
    await api("PATCH", `/api/v1/notebooks/${notebookId}`, { archived: true });
    await tryDelete(`/api/v1/notebooks/${notebookId}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Kanban CRUD
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(!HAS_TOKEN)("kanban integration", () => {
  let boardId: string;
  let cardId: string;

  afterAll(async () => {
    // Cleanup stale test boards
    const boards = await api<any[]>("GET", "/api/v1/kanban/boards?includeArchived=true").catch(() => []);
    for (const b of boards) {
      if (typeof b.name === "string" && b.name.startsWith("__plugin_test")) {
        await tryDelete(`/api/v1/kanban/boards/${b.id}`);
      }
    }
  });

  it("create board", async () => {
    const res = await api<{ id: string }>("POST", "/api/v1/kanban/boards", {
      name: "__plugin_test_board__",
    });
    expect(res.id).toBeDefined();
    boardId = res.id;
  });

  it("create card on board", async () => {
    if (!boardId) return;
    const res = await api<{ id: string }>("POST", "/api/v1/kanban/cards", {
      title: "__plugin_test_card__",
      boardId,
      description: "test card",
    });
    expect(res.id).toBeDefined();
    cardId = res.id;
  });

  it("update card", async () => {
    if (!cardId) return;
    const res = await api("PATCH", `/api/v1/kanban/cards/${cardId}`, {
      title: "__plugin_test_card_updated__",
    });
    expect(res).toBeDefined();
  });

  it("list cards", async () => {
    const res = await api<any[]>("GET", "/api/v1/kanban/cards");
    expect(Array.isArray(res)).toBe(true);
  });

  it("archive board (cleanup)", async () => {
    if (!boardId) return;
    await api("PATCH", `/api/v1/kanban/boards/${boardId}`, { archived: true }).catch(() => {});
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Wiki CRUD
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(!HAS_TOKEN)("wiki integration", () => {
  let pageId: string;

  afterAll(async () => {
    // Cleanup stale test wiki pages
    const pages = await api<any[]>("GET", `/api/v1/wiki?conversationId=${CONV_ID}`).catch(() => []);
    if (Array.isArray(pages)) {
      for (const p of pages) {
        if (typeof p.title === "string" && p.title.startsWith("__plugin_test")) {
          await tryDelete(`/api/v1/wiki/${p.id}`);
        }
      }
    }
  });

  it("create wiki page", async () => {
    const res = await api<{ id: string }>("POST", "/api/v1/wiki", {
      conversationId: CONV_ID,
      title: "__plugin_test_wiki__",
      content: "integration test content",
      tags: ["test"],
    });
    expect(res.id).toBeDefined();
    pageId = res.id;
  });

  it("list wiki pages — find created", async () => {
    const pages = await api<any[]>("GET", `/api/v1/wiki?conversationId=${CONV_ID}`);
    expect(Array.isArray(pages)).toBe(true);
    if (pageId) {
      expect(pages.some((p: any) => p.id === pageId)).toBe(true);
    }
  });

  it("get wiki page", async () => {
    if (!pageId) return;
    const page = await api<{ id: string; title: string }>("GET", `/api/v1/wiki/${pageId}`);
    expect(page.id).toBe(pageId);
    expect(page.title).toBe("__plugin_test_wiki__");
  });

  it("update wiki page", async () => {
    if (!pageId) return;
    const res = await api("PATCH", `/api/v1/wiki/${pageId}`, {
      title: "__plugin_test_wiki_updated__",
    });
    expect(res).toBeDefined();
  });

  it("delete wiki page (cleanup)", async () => {
    if (!pageId) return;
    await tryDelete(`/api/v1/wiki/${pageId}`);
    pageId = "";
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Search
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(!HAS_TOKEN)("search integration", () => {
  it("search returns results object", async () => {
    const res = await api<Record<string, unknown>>("GET", "/api/v1/search?q=test&limit=3");
    expect(res).toBeDefined();
    expect(typeof res).toBe("object");
  });
});
