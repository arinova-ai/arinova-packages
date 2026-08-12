import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
  clientUpload: vi.fn(),
  clientDelete: vi.fn(),
  clientDownload: vi.fn(),
  clientGet: vi.fn(),
  clientPatch: vi.fn(),
  clientPost: vi.fn(),
  clientPut: vi.fn(),
  clientRequest: vi.fn(),
  clientStream: vi.fn(),
  getOpts: vi.fn(() => ({
    token: "ari_cli_token",
    apiUrl: "https://api.example.test",
    profileName: "default",
  })),
  del: vi.fn(),
  get: vi.fn(),
  output: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  printError: vi.fn(),
  printNote: vi.fn(),
  printResult: vi.fn(),
  printSuccess: vi.fn(),
  printWarning: vi.fn(),
  uploadMultipart: vi.fn(),
  listProfiles: vi.fn((): Array<{
    name: string; profile: { type: "user" | "bot"; apiKey: string };
  }> => []),
  getProfile: vi.fn(),
  removeProfile: vi.fn(),
}));

vi.mock("../api.js", () => ({
  apiCall: mocks.apiCall,
  getOpts: mocks.getOpts,
  output: mocks.output,
}));

vi.mock("../client.js", () => ({
  ApiClient: class ApiClient {
    get(path: string) {
      return mocks.clientGet(path);
    }
    post(path: string, body?: unknown, headers?: Record<string, string>) {
      return headers === undefined
        ? mocks.clientPost(path, body)
        : mocks.clientPost(path, body, headers);
    }
    put(path: string, body?: unknown) {
      return mocks.clientPut(path, body);
    }
    patch(path: string, body?: unknown) {
      return mocks.clientPatch(path, body);
    }
    delete(path: string) {
      return mocks.clientDelete(path);
    }
    upload(path: string, form: FormData, method?: string) {
      return mocks.clientUpload(path, form, method);
    }
    download(path: string, destination: string, force?: boolean) {
      return mocks.clientDownload(path, destination, force);
    }
    request(request: unknown) {
      return mocks.clientRequest(request);
    }
    stream(path: string, body?: unknown) {
      return mocks.clientStream(path, body);
    }
  },
  buildQuery: (values: Record<string, unknown>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== null) query.set(key, String(value));
    }
    const rendered = query.toString();
    return rendered ? `?${rendered}` : "";
  },
  UnsupportedCommandError: class UnsupportedCommandError extends Error {
    code = "UNSUPPORTED_COMMAND";
  },
  del: mocks.del,
  encodePathSegment: (value: string) => encodeURIComponent(value),
  get: mocks.get,
  patch: mocks.patch,
  post: mocks.post,
  put: mocks.put,
  uploadMultipart: mocks.uploadMultipart,
  resolveClient: vi.fn(() => ({
    get: mocks.clientGet,
    post: mocks.clientPost,
    put: mocks.clientPut,
    patch: mocks.clientPatch,
    delete: mocks.clientDelete,
    upload: mocks.clientUpload,
    download: mocks.clientDownload,
    request: mocks.clientRequest,
    stream: mocks.clientStream,
  })),
}));

vi.mock("../output.js", () => ({
  printError: mocks.printError,
  printNote: mocks.printNote,
  printResult: mocks.printResult,
  printSuccess: mocks.printSuccess,
  printWarning: mocks.printWarning,
  table: vi.fn(),
}));

// theme.ts resolves keys via config.resolveApiKey — mock it so tests stay
// hermetic and never read the real ~/.arinova-cli/config.
vi.mock("../config.js", () => ({
  resolveApiKey: vi.fn(() => ({
    apiKey: "ari_cli_theme_token",
    profileName: "default",
    source: "test",
  })),
  getEndpoint: vi.fn(() => "https://api.example.test"),
  getEnvironmentLabel: vi.fn(() => "test"),
  getProfile: mocks.getProfile,
  listProfiles: mocks.listProfiles,
  removeProfile: mocks.removeProfile,
}));

const { registerFileCommands } = await import("./file.js");
const { registerCommunity } = await import("./community.js");
const { registerConversation } = await import("./conversation.js");
const { registerExpert } = await import("./expert.js");
const { registerKanbanCommands } = await import("./kanban.js");
const { registerMemoryCommands } = await import("./memory.js");
const { registerMessageCommands } = await import("./message.js");
const { registerNoteCommands } = await import("./note.js");
const { registerNotebookCommands } = await import("./notebook.js");
const { registerPainterCommands } = await import("./painter.js");
const { registerTheme } = await import("./theme.js");
const { registerMemoCommands, registerWikiCommands } = await import("./wiki.js");
const { registerUserCommands } = await import("./user.js");
const { registerSearchCommands } = await import("./search.js");
const { registerResolveCommands } = await import("./resolve.js");
const { registerSkill } = await import("./skill.js");
const { registerSpace } = await import("./space.js");
const { registerAgentCommands } = await import("./agent.js");
const { registerSticker } = await import("./sticker.js");
const { registerCalendarCommands } = await import("./calendar.js");
const { registerDocCommands } = await import("./doc.js");
const { registerFormCommands } = await import("./form.js");
const { registerMindmapCommands } = await import("./mindmap.js");
const { registerSlideCommands } = await import("./slide.js");
const { registerWorkbookCommands } = await import("./workbook.js");
const { registerImageCommands } = await import("./image.js");
const { registerAutomationCommands } = await import("./automation.js");
const { registerEconomyChatCommands } = await import("./economy-chat.js");
const { registerApp } = await import("./app.js");
const { registerList } = await import("./list.js");
const { registerStats } = await import("./stats.js");
const { registerAutoSendCommands } = await import("./auto-send.js");
const { registerProfile } = await import("./profile.js");

const tempDirs: string[] = [];

function createProgram(register: (program: Command) => void) {
  const program = new Command();
  program.exitOverride();
  program.name("arinova");
  register(program);
  return program;
}

describe("CLI command API request shapes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiCall.mockResolvedValue([]);
    mocks.clientUpload.mockResolvedValue({ fileId: "file-1" });
    mocks.clientDelete.mockResolvedValue({ ok: true });
    mocks.clientDownload.mockResolvedValue(undefined);
    mocks.clientGet.mockResolvedValue([]);
    mocks.clientPatch.mockResolvedValue({ ok: true });
    mocks.clientPost.mockResolvedValue({ ok: true });
    mocks.clientPut.mockResolvedValue({ ok: true });
    mocks.clientRequest.mockResolvedValue({ ok: true });
    mocks.clientStream.mockResolvedValue(new ReadableStream());
    mocks.del.mockResolvedValue({});
    mocks.get.mockResolvedValue([]);
    mocks.patch.mockResolvedValue({ ok: true });
    mocks.post.mockResolvedValue({ ok: true });
    mocks.put.mockResolvedValue({ ok: true });
    mocks.uploadMultipart.mockResolvedValue({ ok: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("kanban board create sends the expected JSON body", async () => {
    const program = createProgram(registerKanbanCommands);

    await program.parseAsync(["node", "arinova", "kanban", "board", "create", "--name", "Roadmap"]);

    expect(mocks.apiCall).toHaveBeenCalledWith({
      method: "POST",
      url: "https://api.example.test/api/v1/kanban/boards",
      token: "ari_cli_token",
      body: { name: "Roadmap" },
    });
    expect(mocks.output).toHaveBeenCalledWith([]);
  });

  it("kanban card list paginates and filters hex id prefixes client-side", async () => {
    mocks.apiCall
      .mockResolvedValueOnce([
        { id: "abcd1234", title: "First", description: "" },
        { id: "ffff9999", title: "Other", description: "different text" },
      ])
      .mockResolvedValueOnce([]);
    const program = createProgram(registerKanbanCommands);

    await program.parseAsync(["node", "arinova", "kanban", "card", "list", "--search", "abcd"]);

    expect(mocks.apiCall).toHaveBeenCalledWith(expect.objectContaining({
      method: "GET",
      url: "https://api.example.test/api/v1/kanban/cards?limit=100&offset=0",
      token: "ari_cli_token",
    }));
    expect(mocks.output).toHaveBeenCalledWith([
      { id: "abcd1234", title: "First", description: "" },
    ]);
  });

  it("kanban label create sends board label request body", async () => {
    const program = createProgram(registerKanbanCommands);

    await program.parseAsync([
      "node",
      "arinova",
      "kanban",
      "label",
      "create",
      "--board-id",
      "board-1",
      "--name",
      "Bug",
      "--color",
      "#ef4444",
    ]);

    expect(mocks.apiCall).toHaveBeenCalledWith({
      method: "POST",
      url: "https://api.example.test/api/v1/kanban/boards/board-1/labels",
      token: "ari_cli_token",
      body: { name: "Bug", color: "#ef4444" },
    });
  });

  it("painter create parses price amount and sends album request body", async () => {
    const program = createProgram(registerPainterCommands);

    await program.parseAsync([
      "node",
      "arinova",
      "painter",
      "create",
      "--name",
      "Watercolor",
      "--description",
      "Soft style",
      "--category",
      "watercolor",
      "--price-type",
      "credits",
      "--price-amount",
      "12",
    ]);

    expect(mocks.apiCall).toHaveBeenCalledWith({
      method: "POST",
      url: "https://api.example.test/api/painter/albums",
      token: "ari_cli_token",
      body: {
        name: "Watercolor",
        description: "Soft style",
        category: "watercolor",
        priceType: "credits",
        priceAmount: 12,
      },
    });
  });

  it("painter stats formats album statistics output", async () => {
    mocks.apiCall.mockResolvedValueOnce({
      name: "Watercolor",
      generationCount: 3,
      ratingAvg: 4.5,
      images: [{ id: "img-1" }, { id: "img-2" }],
      isPublic: true,
      priceType: "credits",
      category: "watercolor",
    });
    const program = createProgram(registerPainterCommands);

    await program.parseAsync(["node", "arinova", "painter", "stats", "--id", "album-1"]);

    expect(mocks.output).toHaveBeenCalledWith({
      name: "Watercolor",
      generationCount: 3,
      ratingAvg: 4.5,
      imageCount: 2,
      isPublic: true,
      priceType: "credits",
      category: "watercolor",
    });
  });

  it("expert create fails fast without calling the removed API", async () => {
    const program = createProgram(registerExpert);

    await expect(
      program.parseAsync([
        "node",
        "arinova",
        "expert",
        "create",
        "--name",
        "Support Bot",
      ]),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_COMMAND" });
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("community add-agent uses camelCase and lounge unpublish fails fast", async () => {
    const program = createProgram(registerCommunity);

    await program.parseAsync(["node", "arinova", "community", "add-agent", "community-1", "agent-1"]);
    await expect(program.parseAsync([
      "node", "arinova", "lounge", "unpublish", "lounge-1",
    ])).rejects.toMatchObject({ code: "UNSUPPORTED_COMMAND" });

    expect(mocks.post).toHaveBeenCalledWith("/api/v1/communities/community-1/agents", {
      agentId: "agent-1",
    });
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("community list/show/update use the current v1 routes and PUT update", async () => {
    const program = createProgram(registerCommunity);

    await program.parseAsync(["node", "arinova", "community", "list"]);
    await program.parseAsync(["node", "arinova", "community", "show", "community/1"]);
    await program.parseAsync([
      "node",
      "arinova",
      "community",
      "update",
      "community-1",
      "--name",
      "Renamed",
    ]);

    expect(mocks.get).toHaveBeenNthCalledWith(1, "/api/v1/communities");
    expect(mocks.get).toHaveBeenNthCalledWith(
      2,
      "/api/v1/communities/community%2F1",
    );
    expect(mocks.put).toHaveBeenCalledWith(
      "/api/v1/communities/community-1",
      { name: "Renamed" },
    );
  });

  it("memo is canonical and wiki is a warning-only alias to memo routes", async () => {
    const program = createProgram((root) => {
      registerMemoCommands(root);
      registerWikiCommands(root);
    });

    await program.parseAsync([
      "node",
      "arinova",
      "memo",
      "create",
      "--conversation-id",
      "conv-1",
      "--title",
      "Plan",
    ]);
    await program.parseAsync(["node", "arinova", "wiki", "list"]);

    expect(mocks.apiCall).toHaveBeenNthCalledWith(1, {
      method: "POST",
      url: "https://api.example.test/api/v1/memo",
      token: "ari_cli_token",
      body: {
        conversationId: "conv-1",
        title: "Plan",
        content: "",
        tags: [],
      },
    });
    expect(mocks.apiCall).toHaveBeenNthCalledWith(2, {
      method: "GET",
      url: "https://api.example.test/api/v1/memo",
      token: "ari_cli_token",
    });
    expect(mocks.printWarning).toHaveBeenCalledWith(
      "'arinova wiki' is deprecated; use 'arinova memo'.",
    );
  });

  it("conversation create uses agent-scoped v1 route and required type", async () => {
    const program = createProgram(registerConversation);

    await program.parseAsync([
      "node",
      "arinova",
      "conversation",
      "create",
      "--agent-id",
      "agent/1",
      "--type",
      "alert",
    ]);

    expect(mocks.apiCall).toHaveBeenCalledWith({
      method: "POST",
      url: "https://api.example.test/api/v1/agents/agent%2F1/conversations",
      token: "ari_cli_token",
      body: { type: "alert" },
    });
  });

  it("user commands call the OAuth v1 profile and agents routes", async () => {
    const program = createProgram(registerUserCommands);

    await program.parseAsync(["node", "arinova", "user", "profile"]);
    await program.parseAsync(["node", "arinova", "user", "agents"]);

    expect(mocks.apiCall).toHaveBeenNthCalledWith(1, {
      method: "GET",
      url: "https://api.example.test/api/v1/user/profile",
      token: "ari_cli_token",
    });
    expect(mocks.apiCall).toHaveBeenNthCalledWith(2, {
      method: "GET",
      url: "https://api.example.test/api/v1/user/agents",
      token: "ari_cli_token",
    });
  });

  it("theme upload sends manifest and bundle as multipart fields", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arinova-cli-theme-"));
    tempDirs.push(dir);
    const manifest = join(dir, "theme.json");
    const bundle = join(dir, "bundle.zip");
    await writeFile(manifest, "{\"name\":\"dark\"}");
    await writeFile(bundle, "zip-data");
    const program = createProgram(registerTheme);

    await program.parseAsync(["node", "arinova", "theme", "upload", manifest, bundle]);

    expect(mocks.uploadMultipart).toHaveBeenCalledWith("/api/v1/themes/upload", {
      manifest: expect.any(Blob),
      bundle: expect.any(Blob),
    }, "POST");
    expect(mocks.printResult).toHaveBeenCalledWith({ ok: true });
  });

  it("theme upload rejects missing bundle paths before uploading", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arinova-cli-theme-"));
    tempDirs.push(dir);
    const manifest = join(dir, "theme.json");
    await writeFile(manifest, "{\"name\":\"dark\"}");
    const program = createProgram(registerTheme);

    await expect(program.parseAsync([
      "node",
      "arinova",
      "theme",
      "upload",
      manifest,
      join(dir, "missing.zip"),
    ])).rejects.toThrow("File not found");

    expect(mocks.uploadMultipart).not.toHaveBeenCalled();
  });

  it("theme upload rejects invalid manifest JSON before uploading", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arinova-cli-theme-"));
    tempDirs.push(dir);
    const manifest = join(dir, "theme.json");
    await writeFile(manifest, "{not json");
    const program = createProgram(registerTheme);

    await expect(program.parseAsync([
      "node", "arinova", "theme", "upload", manifest,
    ])).rejects.toThrow("Invalid theme manifest JSON");

    expect(mocks.uploadMultipart).not.toHaveBeenCalled();
  });

  it("theme update uses PUT multipart and reports API errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arinova-cli-theme-"));
    tempDirs.push(dir);
    const manifest = join(dir, "theme.json");
    await writeFile(manifest, "{\"name\":\"dark\"}");
    const error = new Error("upload failed");
    mocks.uploadMultipart.mockRejectedValueOnce(error);
    const program = createProgram(registerTheme);

    await expect(program.parseAsync([
      "node", "arinova", "theme", "update", "theme-1", manifest,
    ])).rejects.toThrow("upload failed");

    expect(mocks.uploadMultipart).toHaveBeenCalledWith("/api/v1/themes/theme-1", {
      manifest: expect.any(Blob),
    }, "PUT");
  });

  it("theme publish and unpublish patch status", async () => {
    const program = createProgram(registerTheme);

    await program.parseAsync(["node", "arinova", "theme", "publish", "theme-1"]);
    await program.parseAsync(["node", "arinova", "theme", "unpublish", "theme-1"]);

    expect(mocks.patch).toHaveBeenNthCalledWith(1, "/api/v1/themes/theme-1/status", {
      status: "published",
    });
    expect(mocks.patch).toHaveBeenNthCalledWith(2, "/api/v1/themes/theme-1/status", {
      status: "draft",
    });
    expect(mocks.printResult).toHaveBeenCalledTimes(2);
  });

  it("file upload posts multipart form data to the v1 upload endpoint", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arinova-cli-file-"));
    tempDirs.push(dir);
    const file = join(dir, "note.txt");
    await writeFile(file, "hello");
    const program = createProgram(registerFileCommands);

    await program.parseAsync([
      "node",
      "arinova",
      "file",
      "upload",
      "--conversation-id",
      "conv-1",
      "--file",
      file,
    ]);

    expect(mocks.clientUpload).toHaveBeenCalledWith(
      "/api/v1/files/upload",
      expect.any(FormData),
    );
    const form = mocks.clientUpload.mock.calls[0][1] as FormData;
    expect(form.get("conversationId")).toBe("conv-1");
    const uploaded = form.get("file") as File;
    expect(uploaded.name).toBe("note.txt");
    expect(uploaded.size).toBe(5);
    expect(mocks.output).toHaveBeenCalledWith({ fileId: "file-1" });
  });

  it("message search and feedback use encoded v1 routes and contract bodies", async () => {
    const program = createProgram(registerMessageCommands);
    await program.parseAsync(["node", "arinova", "message", "search", "-q", "hello", "--conversation-id", "conv/a", "--limit", "5"]);
    await program.parseAsync(["node", "arinova", "message", "feedback", "get", "--message-id", "msg/a"]);
    await program.parseAsync(["node", "arinova", "message", "feedback", "set", "--message-id", "msg/a", "--rating", "down"]);

    expect(mocks.apiCall).toHaveBeenNthCalledWith(1, {
      method: "GET",
      url: "https://api.example.test/api/v1/messages/search?q=hello&conversationId=conv%2Fa&limit=5",
      token: "ari_cli_token",
    });
    expect(mocks.apiCall).toHaveBeenNthCalledWith(2, {
      method: "GET",
      url: "https://api.example.test/api/v1/messages/msg%2Fa/feedback",
      token: "ari_cli_token",
    });
    expect(mocks.apiCall).toHaveBeenNthCalledWith(3, {
      method: "POST",
      url: "https://api.example.test/api/v1/messages/msg%2Fa/feedback",
      token: "ari_cli_token",
      body: { helpful: false },
    });
  });

  it("memory CRUD uses server casing and import lifecycle uses official paths", async () => {
    const program = createProgram(registerMemoryCommands);
    await program.parseAsync(["node", "arinova", "memory", "create", "--agent", "agent-1", "--category", "knowledge", "--summary", "fact", "--pattern-key", "p1"]);
    await program.parseAsync(["node", "arinova", "memory", "update", "mem/a", "--tier", "warm"]);
    await program.parseAsync(["node", "arinova", "memory", "grant", "set", "--agent", "agent-1", "--target-agent", "agent-2", "--granted", "true"]);
    await program.parseAsync(["node", "arinova", "memory", "import", "confirm", "cap/a", "--entries", '[{"entryId":"entry-1","action":"create"}]']);

    expect(mocks.clientPost).toHaveBeenNthCalledWith(1, "/api/v1/memories", {
      agent_id: "agent-1",
      category: "knowledge",
      summary: "fact",
      detail: undefined,
      pattern_key: "p1",
    });
    expect(mocks.clientPatch).toHaveBeenCalledWith("/api/v1/memories/mem%2Fa", {
      category: undefined, tier: "warm", summary: undefined, detail: undefined,
    });
    expect(mocks.clientPut).toHaveBeenCalledWith("/api/v1/memories/grants", {
      agent_id: "agent-1", target_agent_id: "agent-2", granted: true,
    });
    expect(mocks.clientPost).toHaveBeenNthCalledWith(2, "/api/v1/memories/import/cap%2Fa/confirm", {
      entries: [{ entryId: "entry-1", action: "create" }],
    });
  });

  it("note and notebook lifecycle commands use encoded official routes", async () => {
    const program = new Command().exitOverride().name("arinova");
    registerNoteCommands(program);
    registerNotebookCommands(program);
    await program.parseAsync(["node", "arinova", "note", "thread", "add", "--note-id", "note/a", "--content", "reply"]);
    await program.parseAsync(["node", "arinova", "notebook", "archive", "--id", "book/a"]);
    await program.parseAsync(["node", "arinova", "notebook", "unarchive", "--id", "book/a"]);

    expect(mocks.apiCall).toHaveBeenNthCalledWith(1, {
      method: "POST", url: "https://api.example.test/api/v1/notes/note%2Fa/thread",
      token: "ari_cli_token", body: { content: "reply" },
    });
    expect(mocks.apiCall).toHaveBeenNthCalledWith(2, {
      method: "POST", url: "https://api.example.test/api/v1/notebooks/book%2Fa/archive",
      token: "ari_cli_token",
    });
    expect(mocks.apiCall).toHaveBeenNthCalledWith(3, {
      method: "POST", url: "https://api.example.test/api/v1/notebooks/book%2Fa/unarchive",
      token: "ari_cli_token",
    });
  });

  it("kanban additions use contract routes and archive fails before any request", async () => {
    const program = createProgram(registerKanbanCommands);
    await program.parseAsync(["node", "arinova", "kanban", "board", "unarchive", "--board-id", "board/a"]);
    await program.parseAsync(["node", "arinova", "kanban", "card", "bulk-move", "--moves", '[{"cardId":"c1","toColumnId":"col1"}]']);
    expect(mocks.apiCall).toHaveBeenNthCalledWith(1, {
      method: "POST", url: "https://api.example.test/api/v1/kanban/boards/board%2Fa/unarchive",
      token: "ari_cli_token",
    });
    expect(mocks.apiCall).toHaveBeenNthCalledWith(2, {
      method: "POST", url: "https://api.example.test/api/v1/kanban/cards/bulk-move",
      token: "ari_cli_token", body: { moves: [{ cardId: "c1", toColumnId: "col1" }] },
    });
    const calls = mocks.apiCall.mock.calls.length;
    await expect(program.parseAsync(["node", "arinova", "kanban", "card", "archive", "--card-id", "c1"]))
      .rejects.toMatchObject({ code: "UNSUPPORTED_COMMAND" });
    expect(mocks.apiCall).toHaveBeenCalledTimes(calls);
  });

  it("file center, content search, and resolve commands preserve request contracts", async () => {
    const root = new Command().exitOverride().name("arinova");
    registerFileCommands(root);
    registerSearchCommands(root);
    registerResolveCommands(root);
    await root.parseAsync(["node", "arinova", "file", "move", "file/a", "--space-id", "space-1"]);
    await root.parseAsync(["node", "arinova", "search", "content", "-q", "deploy", "--entity-types", "note,kanban"]);
    await root.parseAsync(["node", "arinova", "resolve", "batch", "--conversation-id", "conv-1", "--content", "see abcdef1"]);

    expect(mocks.clientPost).toHaveBeenNthCalledWith(1, "/api/v1/files/file%2Fa/move", {
      spaceId: "space-1", folderId: undefined,
    });
    expect(mocks.clientGet).toHaveBeenCalledWith("/api/v1/search/content?q=deploy&entity_types=note%2Ckanban");
    expect(mocks.clientPost).toHaveBeenNthCalledWith(2, "/api/v1/resolve-identifiers", {
      conversationId: "conv-1", content: "see abcdef1", agentId: undefined,
      messageId: undefined, maxTokens: undefined,
    });
  });

  it("skill catalog and package lifecycle commands use v1 casing and confirmation", async () => {
    const root = new Command().exitOverride().name("arinova");
    registerSkill(root);
    await root.parseAsync(["node", "arinova", "skill", "prompt", "image/edit"]);
    await root.parseAsync(["node", "arinova", "skill", "suggestion", "restore", "suggestion/a"]);
    await root.parseAsync([
      "node", "arinova", "skill-package", "install",
      "--version", "version/a", "--agent", "agent-1", "--idempotency-key", "install-1",
      "--entry-keys", "one,two",
    ]);
    await root.parseAsync([
      "node", "arinova", "skill-package", "update", "install/a",
      "--target-version", "version-2", "--idempotency-key", "update-1", "--confirm",
    ]);

    expect(mocks.get).toHaveBeenCalledWith("/api/v1/skills/image%2Fedit/prompt");
    expect(mocks.patch).toHaveBeenCalledWith("/api/v1/skills/suggestions/suggestion%2Fa", {
      status: "accepted",
    });
    expect(mocks.post).toHaveBeenNthCalledWith(1, "/api/v1/skill-package-versions/version%2Fa/install", {
      agentId: "agent-1",
      entryKeys: ["one", "two"],
      activationMode: undefined,
      idempotencyKey: "install-1",
    });
    expect(mocks.post).toHaveBeenNthCalledWith(2, "/api/v1/agent-skill-packages/install%2Fa/update", {
      targetVersionId: "version-2",
      entryKeys: undefined,
      activationMode: undefined,
      confirm: true,
      idempotencyKey: "update-1",
    });
  });

  it("agent package-resource query parses arguments and encodes the agent id", async () => {
    const program = createProgram(registerAgentCommands);
    await program.parseAsync([
      "node", "arinova", "agent", "skill-resource-query",
      "--id", "agent/a", "--tool-name", "read_file", "--request-id", "req-1",
      "--arguments", '{"path":"README.md"}',
    ]);
    expect(mocks.apiCall).toHaveBeenCalledWith({
      method: "POST",
      url: "https://api.example.test/api/v1/agents/agent%2Fa/skill-package-resources/query",
      token: "ari_cli_token",
      body: {
        toolName: "read_file",
        requestId: "req-1",
        arguments: { path: "README.md" },
        conversationId: undefined,
      },
    });
  });

  it("space generic/owned, storage, version, and product routes remain distinct", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arinova-cli-space-"));
    tempDirs.push(dir);
    const bundle = join(dir, "bundle.zip");
    await writeFile(bundle, "zip bytes");
    const program = createProgram(registerSpace);

    await program.parseAsync(["node", "arinova", "space", "list", "--search", "game"]);
    await program.parseAsync(["node", "arinova", "space", "owned"]);
    await program.parseAsync(["node", "arinova", "space", "storage", "set", "space/a", "save/1", "--value", '{"score":9}']);
    await program.parseAsync(["node", "arinova", "space", "version", "create", "space/a", "--bundle", bundle]);
    await program.parseAsync(["node", "arinova", "space", "version", "publish", "space/a", "version/a"]);
    await program.parseAsync(["node", "arinova", "space", "version", "preview", "space/a", "version/a"]);
    await program.parseAsync(["node", "arinova", "space", "version", "scan", "space/a", "version/a"]);
    await program.parseAsync(["node", "arinova", "space", "version", "rescan", "space/a", "version/a"]);
    await program.parseAsync(["node", "arinova", "space", "products", "list", "space/a"]);
    await program.parseAsync([
      "node", "arinova", "space", "products", "create", "space/a",
      "--key", "coins.small", "--name", "Coins", "--price-points", "25", "--kind", "consumable",
    ]);
    await program.parseAsync([
      "node", "arinova", "space", "products", "update", "space/a", "coins.small",
      "--price-points", "30", "--active", "false",
    ]);
    await program.parseAsync(["node", "arinova", "space", "products", "deactivate", "space/a", "coins.small"]);
    await program.parseAsync(["node", "arinova", "space", "products", "wind-down", "space/a", "pro.monthly"]);

    expect(mocks.get).toHaveBeenNthCalledWith(1, "/api/v1/spaces?search=game");
    expect(mocks.get).toHaveBeenNthCalledWith(2, "/api/v1/spaces/owned");
    expect(mocks.put).toHaveBeenCalledWith("/api/v1/spaces/space%2Fa/storage/save%2F1", {
      value: { score: 9 },
    });
    expect(mocks.uploadMultipart).toHaveBeenCalledWith(
      "/api/v1/spaces/space%2Fa/versions",
      { bundle: expect.any(Blob) },
    );
    expect(mocks.post).toHaveBeenCalledWith(
      "/api/v1/spaces/space%2Fa/versions/version%2Fa/publish",
    );
    expect(mocks.post).toHaveBeenCalledWith(
      "/api/v1/spaces/space%2Fa/versions/version%2Fa/preview",
    );
    expect(mocks.get).toHaveBeenCalledWith(
      "/api/v1/spaces/space%2Fa/versions/version%2Fa/scan",
    );
    expect(mocks.post).toHaveBeenCalledWith(
      "/api/v1/spaces/space%2Fa/versions/version%2Fa/scan",
    );
    expect(mocks.get).toHaveBeenCalledWith("/api/v1/creator/spaces/space%2Fa/products");
    expect(mocks.post).toHaveBeenCalledWith("/api/v1/creator/spaces/space%2Fa/products", {
      productKey: "coins.small",
      name: "Coins",
      description: "",
      pricePoints: 25,
      kind: "consumable",
      active: true,
    });
    expect(mocks.put).toHaveBeenCalledWith(
      "/api/v1/creator/spaces/space%2Fa/products/coins.small",
      { name: undefined, description: undefined, pricePoints: 30, active: false },
    );
    expect(mocks.del).toHaveBeenCalledWith(
      "/api/v1/creator/spaces/space%2Fa/products/coins.small",
    );
    expect(mocks.post).toHaveBeenCalledWith(
      "/api/v1/creator/spaces/space%2Fa/products/pro.monthly/wind-down",
    );
  });

  it("space publish fails locally and points to version publish", async () => {
    const program = createProgram(registerSpace);
    await expect(program.parseAsync([
      "node", "arinova", "space", "publish", "space-1",
    ])).rejects.toMatchObject({ code: "UNSUPPORTED_COMMAND" });
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("sticker publish shortcuts fail closed instead of bypassing review", async () => {
    const program = createProgram(registerSticker);
    await expect(program.parseAsync([
      "node", "arinova", "sticker", "publish", "pack-1",
    ])).rejects.toMatchObject({ code: "UNSUPPORTED_COMMAND" });
    await expect(program.parseAsync([
      "node", "arinova", "sticker", "unpublish", "pack-1",
    ])).rejects.toMatchObject({ code: "UNSUPPORTED_COMMAND" });
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("calendar create/update preserve typed event fields", async () => {
    const program = createProgram(registerCalendarCommands);
    await program.parseAsync([
      "node", "arinova", "calendar", "event", "create",
      "--title", "Launch", "--timezone", "UTC", "--start-at", "2026-08-01T10:00:00Z",
      "--end-at", "2026-08-01T11:00:00Z", "--metadata", '{"kind":"release"}',
      "--reminders", "10,30",
    ]);
    await program.parseAsync([
      "node", "arinova", "calendar", "event", "delete", "event/a",
      "--delete-scope", "series",
    ]);
    expect(mocks.post).toHaveBeenCalledWith("/api/v1/calendar/events", expect.objectContaining({
      title: "Launch",
      timezone: "UTC",
      metadata: { kind: "release" },
      reminders: [10, 30],
    }));
    expect(mocks.del).toHaveBeenCalledWith(
      "/api/v1/calendar/events/event%2Fa?deleteScope=series",
    );
  });

  it("docs and forms use lifecycle routes and version concurrency fields", async () => {
    const root = new Command().exitOverride().name("arinova");
    registerDocCommands(root);
    registerFormCommands(root);
    await root.parseAsync(["node", "arinova", "doc", "create", "--title", "Spec", "--content", '{"type":"doc"}']);
    await root.parseAsync(["node", "arinova", "doc", "archive", "doc/a"]);
    await root.parseAsync([
      "node", "arinova", "form", "field", "add", "form/a",
      "--type", "text", "--label", "Name", "--required",
    ]);
    await root.parseAsync([
      "node", "arinova", "form", "version", "restore", "form/a", "version/a",
      "--expected-head-version-id", "head-1", "--idempotency-key", "restore-1",
    ]);
    expect(mocks.post).toHaveBeenNthCalledWith(1, "/api/v1/docs", {
      title: "Spec", contentJson: { type: "doc" }, pageSettings: undefined, spaceId: undefined,
    });
    expect(mocks.post).toHaveBeenNthCalledWith(2, "/api/v1/docs/doc%2Fa/archive");
    expect(mocks.post).toHaveBeenNthCalledWith(3, "/api/v1/forms/form%2Fa/fields", {
      fieldType: "text", label: "Name", helpText: undefined, required: true,
      options: undefined, validation: undefined, sortKey: undefined, imageAssetId: undefined,
    });
    expect(mocks.post).toHaveBeenNthCalledWith(
      4,
      "/api/v1/forms/form%2Fa/versions/version%2Fa/restore",
      {
        expectedHeadVersionId: "head-1",
        idempotencyKey: "restore-1",
        correlationId: undefined,
      },
    );
  });

  it("mindmap node, outline, delete-batch, and version routes are encoded", async () => {
    const program = createProgram(registerMindmapCommands);
    await program.parseAsync(["node", "arinova", "mindmap", "outline", "put", "map/a", "--outline", "- Root"]);
    await program.parseAsync([
      "node", "arinova", "mindmap", "node", "move", "node/a",
      "--body", '{"newParentId":"parent-1","sortKey":"a0"}',
    ]);
    await program.parseAsync([
      "node", "arinova", "mindmap", "node", "restore-batch", "map/a", "batch/a",
      "--client-mutation-id", "mutation-1",
    ]);
    await program.parseAsync([
      "node", "arinova", "mindmap", "version", "copy", "map/a", "version/a",
      "--idempotency-key", "copy-1",
    ]);
    expect(mocks.put).toHaveBeenCalledWith("/api/v1/mindmaps/map%2Fa/outline", {
      outline: "- Root",
    });
    expect(mocks.post).toHaveBeenNthCalledWith(1, "/api/v1/mindmaps/nodes/node%2Fa/move", {
      newParentId: "parent-1", sortKey: "a0",
    });
    expect(mocks.post).toHaveBeenNthCalledWith(
      2,
      "/api/v1/mindmaps/map%2Fa/node-delete-batches/batch%2Fa/restore",
      { clientMutationId: "mutation-1" },
    );
    expect(mocks.post).toHaveBeenNthCalledWith(
      3,
      "/api/v1/mindmaps/map%2Fa/versions/version%2Fa/copy",
      { idempotencyKey: "copy-1", correlationId: undefined },
    );
  });

  it("slides enforce expectedVersion and expose export binary download", async () => {
    const program = createProgram(registerSlideCommands);
    await program.parseAsync([
      "node", "arinova", "slide", "item", "update", "deck/a", "slide/a",
      "--expected-version", "3", "--content", '{"type":"slide","children":[]}',
    ]);
    await program.parseAsync([
      "node", "arinova", "slide", "export", "start", "deck/a",
      "--save-to-space-id", "space-1",
    ]);
    await program.parseAsync([
      "node", "arinova", "slide", "export", "download", "deck/a", "job/a",
      "--output", "/tmp/deck.pdf", "--force",
    ]);
    expect(mocks.patch).toHaveBeenCalledWith(
      "/api/v1/slides/decks/deck%2Fa/slides/slide%2Fa",
      expect.objectContaining({ expectedVersion: 3, content: { type: "slide", children: [] } }),
    );
    expect(mocks.post).toHaveBeenCalledWith("/api/v1/slides/decks/deck%2Fa/export", {
      format: "pdf", saveToSpaceId: "space-1",
    });
    expect(mocks.clientDownload).toHaveBeenCalledWith(
      "/api/v1/slides/decks/deck%2Fa/export/job%2Fa/download",
      "/tmp/deck.pdf",
      true,
    );
  });

  it("workbook import/export and version routes use official contracts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arinova-cli-workbook-"));
    tempDirs.push(dir);
    const input = join(dir, "book.xlsx");
    await writeFile(input, "xlsx");
    const program = createProgram(registerWorkbookCommands);
    await program.parseAsync([
      "node", "arinova", "workbook", "import", "create",
      "--file-id", "file-1", "--space-id", "space-1",
    ]);
    await program.parseAsync([
      "node", "arinova", "workbook", "import", "into", "book/a",
      "--file", input, "--base-version", "4",
    ]);
    await program.parseAsync([
      "node", "arinova", "workbook", "export", "direct", "book/a",
      "--format", "csv", "--sheet-id", "sheet/a", "--output", "/tmp/book.csv",
    ]);
    expect(mocks.post).toHaveBeenCalledWith("/api/v1/workbooks/import", {
      fileId: "file-1", spaceId: "space-1",
    });
    expect(mocks.clientUpload).toHaveBeenCalledWith(
      "/api/v1/workbooks/book%2Fa/import", expect.any(FormData),
    );
    expect(mocks.clientDownload).toHaveBeenCalledWith(
      "/api/v1/workbooks/book%2Fa/export?format=csv&sheetId=sheet%2Fa",
      "/tmp/book.csv",
      undefined,
    );
  });

  it("image upload, revision concurrency, and SSRF-safe proxy preserve headers and paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arinova-cli-image-"));
    tempDirs.push(dir);
    const input = join(dir, "image.png");
    await writeFile(input, "png");
    const program = createProgram(registerImageCommands);
    await program.parseAsync([
      "node", "arinova", "image", "asset", "create",
      "--file", input, "--role", "embedded", "--idempotency-key", "upload-1",
      "--document-type", "slide", "--document-id", "doc-1",
    ]);
    await program.parseAsync([
      "node", "arinova", "image", "project", "commit-revision", "project/a",
      "--source-version-id", "version-1", "--preview-image-asset-id", "asset-1",
      "--document", '{"schemaVersion":1,"canvas":{"width":1,"height":1},"elements":[]}',
      "--idempotency-key", "revision-1", "--expected-revision", "7",
    ]);
    await program.parseAsync([
      "node", "arinova", "external-image", "fetch",
      "--url", "https://images.example/a b.png", "--output", "/tmp/external.png",
    ]);
    expect(mocks.clientRequest).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      path: "/api/v1/image-assets",
      form: expect.any(FormData),
      headers: { "Idempotency-Key": "upload-1" },
    }));
    expect(mocks.clientPost).toHaveBeenCalledWith(
      "/api/v1/image-projects/project%2Fa/revisions",
      expect.objectContaining({
        sourceVersionId: "version-1",
        previewImageAssetId: "asset-1",
        idempotencyKey: "revision-1",
      }),
      { "If-Match": '"7"' },
    );
    expect(mocks.clientDownload).toHaveBeenCalledWith(
      "/api/v1/external-images/content?url=https%3A%2F%2Fimages.example%2Fa+b.png",
      "/tmp/external.png",
      undefined,
    );
  });

  it("actions keep confirmation explicit and support both cancellation identities", async () => {
    const program = createProgram(registerAutomationCommands);
    await program.parseAsync([
      "node", "arinova", "action", "call", "--body",
      '{"id":"call-1","action":"arinova.test","arguments":{},"dryRun":true}',
    ]);
    await program.parseAsync(["node", "arinova", "action", "confirmation", "approve", "confirm/a"]);
    await program.parseAsync(["node", "arinova", "action", "cancel", "--row-id", "row/a"]);
    expect(mocks.post).toHaveBeenNthCalledWith(1, "/api/v1/actions/call", {
      id: "call-1", action: "arinova.test", arguments: {}, dryRun: true,
    });
    expect(mocks.post).toHaveBeenNthCalledWith(2, "/api/v1/actions/confirm/confirm%2Fa");
    expect(mocks.post).toHaveBeenNthCalledWith(3, "/api/v1/actions/by-id/row%2Fa/cancel");
  });

  it("workflow, cron, and trigger commands preserve bodies and lifecycle routes", async () => {
    const program = createProgram(registerAutomationCommands);
    await program.parseAsync([
      "node", "arinova", "workflow", "create", "--name", "Deploy",
      "--graph", '{"nodes":[],"edges":[]}', "--max-concurrent-runs", "2",
    ]);
    await program.parseAsync([
      "node", "arinova", "cron", "job", "create",
      "--body", '{"agentId":"agent-1","message":"hello","schedule":{"kind":"once","timezone":"UTC","runAt":"2026-08-01T00:00:00Z"}}',
      "--dry-run",
    ]);
    await program.parseAsync(["node", "arinova", "trigger", "disable", "trigger/a"]);
    expect(mocks.post).toHaveBeenNthCalledWith(1, "/api/v1/workflows", {
      name: "Deploy",
      description: undefined,
      graph: { nodes: [], edges: [] },
      variables: undefined,
      maxConcurrentRuns: 2,
      maxDurationSeconds: undefined,
    });
    expect(mocks.post).toHaveBeenNthCalledWith(
      2,
      "/api/v1/platform-cron/jobs?dryRun=true",
      expect.objectContaining({ agentId: "agent-1", message: "hello" }),
    );
    expect(mocks.patch).toHaveBeenCalledWith(
      "/api/v1/platform-triggers/triggers/trigger%2Fa/enabled",
      { enabled: false },
    );
  });

  it("webhook management excludes inbound and delivery ack carries idempotency", async () => {
    const program = createProgram(registerAutomationCommands);
    await program.parseAsync([
      "node", "arinova", "webhook", "create",
      "--body", '{"name":"Deploy hook","events":["deploy.completed"]}',
    ]);
    await program.parseAsync([
      "node", "arinova", "webhook", "fire-event", "payload", "hook/a", "event/a",
    ]);
    await program.parseAsync([
      "node", "arinova", "delivery", "ack", "delivery/a",
      "--idempotency-key", "ack-1",
    ]);
    expect(mocks.post).toHaveBeenCalledWith("/api/v1/webhooks", {
      name: "Deploy hook", events: ["deploy.completed"],
    });
    expect(mocks.get).toHaveBeenCalledWith(
      "/api/v1/webhooks/hook%2Fa/fire-events/event%2Fa/payload",
    );
    expect(mocks.clientPost).toHaveBeenCalledWith(
      "/api/v1/deliveries/delivery%2Fa/ack",
      undefined,
      { "Idempotency-Key": "ack-1" },
    );
  });

  it("autopilot settings/evaluate keep agent and conversation identity explicit", async () => {
    const program = createProgram(registerAutomationCommands);
    await program.parseAsync([
      "node", "arinova", "autopilot", "settings", "get",
      "--agent-id", "agent-1", "--conversation-id", "conv-1",
    ]);
    await program.parseAsync([
      "node", "arinova", "autopilot", "evaluate",
      "--agent-id", "agent-1", "--conversation-id", "conv-1", "--dry-run",
    ]);
    expect(mocks.get).toHaveBeenCalledWith(
      "/api/v1/autopilot/settings?agentId=agent-1&conversationId=conv-1",
    );
    expect(mocks.post).toHaveBeenCalledWith("/api/v1/autopilot/evaluate", {
      agentId: "agent-1", conversationId: "conv-1", dryRun: true,
    });
  });

  it("economy purchase requires idempotency and chat follows the server request type", async () => {
    const program = createProgram(registerEconomyChatCommands);
    await program.parseAsync([
      "node", "arinova", "economy", "purchase",
      "--space-id", "space-1", "--amount", "25", "--product-id", "coins",
      "--idempotency-key", "purchase-1",
    ]);
    await program.parseAsync([
      "node", "arinova", "chat", "complete",
      "--agent-id", "agent-1", "--messages", '[{"role":"user","content":"Hi"}]',
      "--context", '{"locale":"en"}',
    ]);
    expect(mocks.post).toHaveBeenNthCalledWith(1, "/api/v1/economy/purchase", {
      spaceId: "space-1",
      productId: "coins",
      amount: 25,
      description: undefined,
      idempotencyKey: "purchase-1",
    });
    expect(mocks.post).toHaveBeenNthCalledWith(2, "/api/v1/agent/chat", {
      agentId: "agent-1",
      prompt: undefined,
      systemPrompt: undefined,
      messages: [{ role: "user", content: "Hi" }],
      context: { locale: "en" },
    });
  });

  it("app, list, and stats commands use encoded current routes", async () => {
    await createProgram(registerApp).parseAsync(["node", "arinova", "app", "show", "app/a"]);
    await createProgram(registerList).parseAsync(["node", "arinova", "list", "--type", "theme"]);
    await createProgram(registerStats).parseAsync(["node", "arinova", "stats", "revenue", "--period", "7d"]);
    expect(mocks.get).toHaveBeenNthCalledWith(1, "/api/v1/developer/apps/app%2Fa");
    expect(mocks.get).toHaveBeenNthCalledWith(2, "/api/v1/creator/themes");
    expect(mocks.get).toHaveBeenNthCalledWith(3, "/api/v1/creator/revenue?period=7d");
  });

  it("profile list remains local and auto-send fails before any request", async () => {
    mocks.listProfiles.mockReturnValue([{ name: "bot", profile: { type: "bot", apiKey: "ari_secret" } }]);
    await createProgram(registerProfile).parseAsync(["node", "arinova", "profile", "list"]);
    expect(mocks.listProfiles).toHaveBeenCalledOnce();
    const autoSend = createProgram(registerAutoSendCommands);
    await expect(autoSend.parseAsync([
      "node", "arinova", "auto-send", "list", "--conversation-id", "conv-1",
    ])).rejects.toMatchObject({ code: "UNSUPPORTED_COMMAND" });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.apiCall).not.toHaveBeenCalled();
  });
});
