import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiCall: vi.fn(),
  getOpts: vi.fn(() => ({
    token: "ari_cli_token",
    apiUrl: "https://api.example.test",
    profileName: "default",
  })),
  get: vi.fn(),
  output: vi.fn(),
  printError: vi.fn(),
  printResult: vi.fn(),
  printSuccess: vi.fn(),
  uploadMultipart: vi.fn(),
}));

vi.mock("../api.js", () => ({
  apiCall: mocks.apiCall,
  getOpts: mocks.getOpts,
  output: mocks.output,
}));

vi.mock("../client.js", () => ({
  del: vi.fn(),
  get: mocks.get,
  patch: vi.fn(),
  uploadMultipart: mocks.uploadMultipart,
}));

vi.mock("../output.js", () => ({
  printError: mocks.printError,
  printResult: mocks.printResult,
  printSuccess: mocks.printSuccess,
  table: vi.fn(),
}));

const { registerFileCommands } = await import("./file.js");
const { registerKanbanCommands } = await import("./kanban.js");
const { registerTheme } = await import("./theme.js");

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
    mocks.get.mockResolvedValue([]);
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
    });
    expect(mocks.printResult).toHaveBeenCalledWith({ ok: true });
  });

  it("file upload posts multipart form data to the v1 upload endpoint", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arinova-cli-file-"));
    tempDirs.push(dir);
    const file = join(dir, "note.txt");
    await writeFile(file, "hello");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ fileId: "file-1" }), { status: 200 }),
    );
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

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.test/api/v1/files/upload");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ Authorization: "Bearer ari_cli_token" });
    const form = init?.body as FormData;
    expect(form.get("conversationId")).toBe("conv-1");
    const uploaded = form.get("file") as File;
    expect(uploaded.name).toBe("note.txt");
    expect(uploaded.size).toBe(5);
    expect(mocks.output).toHaveBeenCalledWith({ fileId: "file-1" });
  });
});
