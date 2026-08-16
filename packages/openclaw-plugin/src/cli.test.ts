import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = {
    sendMessage: vi.fn(),
    replyToMessage: vi.fn(),
    fetchHistory: vi.fn(),
    listNotes: vi.fn(),
    createNote: vi.fn(),
    listBoardsWithOptions: vi.fn(),
    unarchiveBoard: vi.fn(),
    listCards: vi.fn(),
  };
  return {
    client,
    ArinovaAgent: vi.fn(() => client),
    resolveAccount: vi.fn(),
    apiCall: vi.fn(),
    exchangeBotToken: vi.fn(),
    replaceConfigFile: vi.fn(),
  };
});

vi.mock("./tools.js", () => ({
  resolveAccount: mocks.resolveAccount,
  apiCall: mocks.apiCall,
}));
vi.mock("./auth.js", () => ({ exchangeBotToken: mocks.exchangeBotToken }));
vi.mock("@arinova-ai/agent-sdk", () => ({ ArinovaAgent: mocks.ArinovaAgent }));

import { registerCli, resolveAccountWithOverrides } from "./cli.js";

class FakeCommand {
  children = new Map<string, FakeCommand>();
  handler?: (opts: any) => Promise<void>;
  values: Record<string, unknown> = {};
  command(spec: string) {
    const child = new FakeCommand();
    this.children.set(spec.split(" ")[0]!, child);
    return child;
  }
  description() { return this; }
  option() { return this; }
  requiredOption() { return this; }
  action(handler: (opts: any) => Promise<void>) { this.handler = handler; return this; }
  opts() { return this.values; }
  child(...path: string[]): FakeCommand {
    let current: FakeCommand = this;
    for (const name of path) current = current.children.get(name)!;
    return current;
  }
}

const ACCOUNT = {
  accountId: "default",
  enabled: true,
  name: "Test Bot",
  apiUrl: "https://api.chat.arinova.ai",
  botToken: "ari_test123",
  agentId: "agent-1",
  config: {},
};

async function buildCli() {
  const program = new FakeCommand();
  let registration: ((ctx: any) => Promise<void>) | undefined;
  const api = {
    registerCli: vi.fn((handler: (ctx: any) => Promise<void>) => { registration = handler; }),
    runtime: { config: { replaceConfigFile: mocks.replaceConfigFile } },
  };
  registerCli(api as never);
  await registration!({ program, config: {} });
  return program.child("arinova");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveAccount.mockReturnValue(ACCOUNT);
  mocks.apiCall.mockResolvedValue({ ok: true });
  mocks.exchangeBotToken.mockResolvedValue({ agentId: "agent-new", name: "New Bot" });
});

describe("resolveAccountWithOverrides", () => {
  it("uses token, named account, and default account in priority order", () => {
    expect(resolveAccountWithOverrides({ agent: "named", token: "direct" })).toMatchObject({
      accountId: "cli-override", botToken: "direct",
    });
    expect(mocks.resolveAccount).not.toHaveBeenCalledWith("named");
    resolveAccountWithOverrides({ agent: "named" });
    expect(mocks.resolveAccount).toHaveBeenCalledWith("named");
    resolveAccountWithOverrides({});
    expect(mocks.resolveAccount).toHaveBeenCalledWith();
  });

  it("uses staging URL for a direct token without local config", () => {
    mocks.resolveAccount.mockImplementation(() => { throw new Error("missing"); });
    expect(resolveAccountWithOverrides({ token: "direct" }).apiUrl)
      .toBe("https://api.chat-staging.arinova.ai");
  });
});

describe("registered CLI commands", () => {
  it("routes message sends through the typed SDK client", async () => {
    const arinova = await buildCli();
    await arinova.child("message", "send").handler?.({
      conversationId: "conv/1", content: "hello", replyTo: "message-2",
    });
    expect(mocks.client.replyToMessage).toHaveBeenCalledWith(
      "conv/1", "hello", "message-2",
    );
    expect(mocks.apiCall).not.toHaveBeenCalled();
  });

  it("sends notebook scope through typed note methods", async () => {
    const arinova = await buildCli();
    await arinova.child("note", "list").handler?.({ notebookId: "book/1", limit: "5" });
    expect(mocks.client.listNotes).toHaveBeenLastCalledWith({
      notebookId: "book/1", limit: 5,
    });
    await arinova.child("note", "create").handler?.({ notebookId: "book/1", title: "Title" });
    expect(mocks.client.createNote).toHaveBeenLastCalledWith({
      notebookId: "book/1", title: "Title", content: "", tags: [],
    });
  });

  it("uses the typed board unarchive method", async () => {
    const arinova = await buildCli();
    await arinova.child("kanban", "board", "unarchive").handler?.({ boardId: "board/1" });
    expect(mocks.client.unarchiveBoard).toHaveBeenCalledWith("board/1");
  });

  it("always applies bounded defaults to paginated list commands", async () => {
    const arinova = await buildCli();
    await arinova.child("message", "list").handler?.({ conversationId: "conv-1" });
    await arinova.child("note", "list").handler?.({ notebookId: "book-1" });
    await arinova.child("kanban", "board", "list").handler?.({});
    await arinova.child("kanban", "card", "list").handler?.({});

    expect(mocks.client.fetchHistory).toHaveBeenCalledWith("conv-1", { limit: 50 });
    expect(mocks.client.listNotes).toHaveBeenCalledWith({ notebookId: "book-1", limit: 50 });
    expect(mocks.client.listBoardsWithOptions).toHaveBeenCalledWith({ limit: 50 });
    expect(mocks.client.listCards).toHaveBeenCalledWith({ limit: 50 });
  });

  it("does not register removed wiki or unsupported card archive commands", async () => {
    const arinova = await buildCli();
    expect(arinova.children.has("wiki")).toBe(false);
    expect(arinova.child("kanban", "card").children.has("archive")).toBe(false);
  });

  it("registers setup under the same root and persists paired credentials", async () => {
    const arinova = await buildCli();
    await arinova.child("setup-openclaw").handler?.({ token: "ari_new", apiUrl: "https://api.chat.arinova.ai" });
    expect(mocks.exchangeBotToken).toHaveBeenCalledWith({ apiUrl: "https://api.chat.arinova.ai", botToken: "ari_new" });
    expect(mocks.replaceConfigFile).toHaveBeenCalledWith(expect.objectContaining({
      nextConfig: expect.objectContaining({
        channels: expect.objectContaining({
          "openclaw-arinova-ai": expect.objectContaining({ botToken: "ari_new", agentId: "agent-new" }),
        }),
      }),
    }));
  });
});
