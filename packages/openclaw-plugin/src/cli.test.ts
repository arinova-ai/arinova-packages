import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAccount: vi.fn(),
  apiCall: vi.fn(),
  exchangeBotToken: vi.fn(),
  replaceConfigFile: vi.fn(),
}));

vi.mock("./tools.js", () => ({
  resolveAccount: mocks.resolveAccount,
  apiCall: mocks.apiCall,
}));
vi.mock("./auth.js", () => ({ exchangeBotToken: mocks.exchangeBotToken }));

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
  apiUrl: "https://api.test.arinova.ai",
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
  it("executes the real message request mapper", async () => {
    const arinova = await buildCli();
    await arinova.child("message", "send").handler?.({
      conversationId: "conv/1", content: "hello", replyTo: "message-2",
    });
    expect(mocks.apiCall).toHaveBeenCalledWith({
      method: "POST",
      url: "https://api.test.arinova.ai/api/v1/messages/send",
      token: "ari_test123",
      body: { conversationId: "conv/1", content: "hello", replyTo: "message-2" },
    });
  });

  it("sends notebook scope in note list and create requests", async () => {
    const arinova = await buildCli();
    await arinova.child("note", "list").handler?.({ notebookId: "book/1", limit: "5" });
    expect(mocks.apiCall).toHaveBeenLastCalledWith(expect.objectContaining({
      method: "GET",
      url: "https://api.test.arinova.ai/api/v1/notes?limit=5&notebookId=book%2F1",
    }));
    await arinova.child("note", "create").handler?.({ notebookId: "book/1", title: "Title" });
    expect(mocks.apiCall).toHaveBeenLastCalledWith(expect.objectContaining({
      method: "POST",
      body: { notebookId: "book/1", title: "Title", content: "", tags: [] },
    }));
  });

  it("uses the verified board unarchive endpoint", async () => {
    const arinova = await buildCli();
    await arinova.child("kanban", "board", "unarchive").handler?.({ boardId: "board/1" });
    expect(mocks.apiCall).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      url: "https://api.test.arinova.ai/api/v1/kanban/boards/board%2F1/unarchive",
    }));
  });

  it("registers setup under the same root and persists paired credentials", async () => {
    const arinova = await buildCli();
    await arinova.child("setup-openclaw").handler?.({ token: "ari_new", apiUrl: "https://new.test" });
    expect(mocks.exchangeBotToken).toHaveBeenCalledWith({ apiUrl: "https://new.test", botToken: "ari_new" });
    expect(mocks.replaceConfigFile).toHaveBeenCalledWith(expect.objectContaining({
      nextConfig: expect.objectContaining({
        channels: expect.objectContaining({
          "openclaw-arinova-ai": expect.objectContaining({ botToken: "ari_new", agentId: "agent-new" }),
        }),
      }),
    }));
  });
});
