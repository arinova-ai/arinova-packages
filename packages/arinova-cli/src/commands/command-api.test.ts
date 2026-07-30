import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
  clientUpload: vi.fn(),
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
  printResult: vi.fn(),
  printSuccess: vi.fn(),
  printWarning: vi.fn(),
  uploadMultipart: vi.fn(),
}));

vi.mock("../api.js", () => ({
  apiCall: mocks.apiCall,
  getOpts: mocks.getOpts,
  output: mocks.output,
}));

vi.mock("../client.js", () => ({
  ApiClient: class ApiClient {
    upload(path: string, form: FormData, method?: string) {
      return mocks.clientUpload(path, form, method);
    }
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
}));

vi.mock("../output.js", () => ({
  printError: mocks.printError,
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
}));

const { registerFileCommands } = await import("./file.js");
const { registerCommunity } = await import("./community.js");
const { registerConversation } = await import("./conversation.js");
const { registerExpert } = await import("./expert.js");
const { registerKanbanCommands } = await import("./kanban.js");
const { registerPainterCommands } = await import("./painter.js");
const { registerTheme } = await import("./theme.js");
const { registerMemoCommands, registerWikiCommands } = await import("./wiki.js");
const { registerUserCommands } = await import("./user.js");

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
    await program.parseAsync(["node", "arinova", "lounge", "unpublish", "lounge-1"]);

    expect(mocks.post).toHaveBeenCalledWith("/api/v1/communities/community-1/agents", {
      agentId: "agent-1",
    });
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.printError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "UNSUPPORTED_COMMAND" }),
    );
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
    }, "POST", "ari_cli_theme_token");
    expect(mocks.printResult).toHaveBeenCalledWith({ ok: true });
  });

  it("theme upload rejects missing bundle paths before uploading", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arinova-cli-theme-"));
    tempDirs.push(dir);
    const manifest = join(dir, "theme.json");
    await writeFile(manifest, "{\"name\":\"dark\"}");
    const program = createProgram(registerTheme);

    await program.parseAsync([
      "node",
      "arinova",
      "theme",
      "upload",
      manifest,
      join(dir, "missing.zip"),
    ]);

    expect(mocks.uploadMultipart).not.toHaveBeenCalled();
    expect(mocks.printError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining("File not found"),
    }));
  });

  it("theme upload rejects invalid manifest JSON before uploading", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arinova-cli-theme-"));
    tempDirs.push(dir);
    const manifest = join(dir, "theme.json");
    await writeFile(manifest, "{not json");
    const program = createProgram(registerTheme);

    await program.parseAsync(["node", "arinova", "theme", "upload", manifest]);

    expect(mocks.uploadMultipart).not.toHaveBeenCalled();
    expect(mocks.printError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining("Invalid theme manifest JSON"),
    }));
  });

  it("theme update uses PUT multipart and reports API errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arinova-cli-theme-"));
    tempDirs.push(dir);
    const manifest = join(dir, "theme.json");
    await writeFile(manifest, "{\"name\":\"dark\"}");
    const error = new Error("upload failed");
    mocks.uploadMultipart.mockRejectedValueOnce(error);
    const program = createProgram(registerTheme);

    await program.parseAsync(["node", "arinova", "theme", "update", "theme-1", manifest]);

    expect(mocks.uploadMultipart).toHaveBeenCalledWith("/api/v1/themes/theme-1", {
      manifest: expect.any(Blob),
    }, "PUT", "ari_cli_theme_token");
    expect(mocks.printError).toHaveBeenCalledWith(error);
  });

  it("theme publish and unpublish patch status", async () => {
    const program = createProgram(registerTheme);

    await program.parseAsync(["node", "arinova", "theme", "publish", "theme-1"]);
    await program.parseAsync(["node", "arinova", "theme", "unpublish", "theme-1"]);

    expect(mocks.patch).toHaveBeenNthCalledWith(1, "/api/v1/themes/theme-1/status", {
      status: "published",
    }, "ari_cli_theme_token");
    expect(mocks.patch).toHaveBeenNthCalledWith(2, "/api/v1/themes/theme-1/status", {
      status: "draft",
    }, "ari_cli_theme_token");
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
      "--file-path",
      file,
    ]);

    expect(mocks.clientUpload).toHaveBeenCalledWith(
      "/api/v1/files/upload",
      expect.any(FormData),
      undefined,
    );
    const form = mocks.clientUpload.mock.calls[0][1] as FormData;
    expect(form.get("conversationId")).toBe("conv-1");
    const uploaded = form.get("file") as File;
    expect(uploaded.name).toBe("note.txt");
    expect(uploaded.size).toBe(5);
    expect(mocks.output).toHaveBeenCalledWith({ fileId: "file-1" });
  });
});
