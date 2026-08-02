export class FakeTask {
  constructor() {
    this.taskId = "task-1";
    this.taskKind = "trigger";
    this.userMessageId = "msg-1";
    this.content = "hello";
    this.conversationId = "conv-1";
    this.conversationName = "Project Memo";
    this.conversationType = "direct";
    this.senderUserId = "user-1";
    this.senderUsername = "User";
    this.senderAgentId = "agent-2";
    this.senderAgentName = "Helper";
    this.members = [{ agentId: "agent-3", agentName: "Researcher" }];
    this.replyTo = { role: "assistant", content: "previous", senderAgentName: "Helper" };
    this.history = [{ role: "user", content: "earlier", senderAgentName: "Helper", senderUsername: "User", createdAt: "now" }];
    this.attachments = [{ id: "file-1", fileName: "a.txt", fileType: "text/plain", fileSize: 2, url: "https://x" }];
    this.availableSkills = [{ slug: "memo", name: "Memo", slashCommand: "/memo", description: "Use memos" }];
    this.chunks = [];
    this.completed = null;
    this.completeOptions = null;
    this.errors = [];
    this.throwComplete = false;
    this.throwError = false;
    this.abortController = new AbortController();
    this.signal = this.abortController.signal;
  }

  sendChunk(value) {
    this.chunks.push(value);
  }

  sendComplete(value, options) {
    if (this.throwComplete) {
      throw new Error("complete delivery failed");
    }
    this.completed = value;
    this.completeOptions = options;
  }

  sendError(value) {
    if (this.throwError) {
      throw new Error("error delivery failed");
    }
    this.errors.push(value);
  }

  async uploadFile(file, fileName, fileType) {
    return { bytes: Array.from(file), fileName, fileType };
  }

  async fetchHistory(options) {
    if (options?.limit === 99) {
      return { messages: [{ score: Number.POSITIVE_INFINITY }], hasMore: false };
    }
    return { messages: [], hasMore: false, options };
  }

  async callAction(action, args, options) {
    return { action, args, options, status: "success" };
  }
}

export class FakeAgent {
  constructor() {
    this.handler = null;
    this.listeners = new Map();
    this.calls = [];
    this.disconnected = false;
    this.agentId = "agent-1";
    this.onboardingSeed = { kind: "first_touch_opening", seedId: "seed-1", agentId: "agent-1", action: "open", prompt: "hello" };
  }

  on(event, listener) {
    this.listeners.set(event, listener);
    return this;
  }

  onTask(handler) {
    this.handler = handler;
    return this;
  }

  emit(event, data) {
    this.listeners.get(event)?.(data);
  }

  disconnect() {
    this.disconnected = true;
  }

  async sendMessage(conversationId, content) {
    this.calls.push(["sendMessage", conversationId, content]);
    return null;
  }

  async sendTelemetry(event, data) {
    this.calls.push(["sendTelemetry", event, data]);
  }

  async reportToolCall(report) {
    this.calls.push(["reportToolCall", report]);
    return null;
  }

  async fetchHistory(conversationId, options) {
    this.calls.push(["fetchHistory", conversationId, options]);
    return { messages: [], hasMore: false, options };
  }

  async queryMemory(options) {
    this.calls.push(["queryMemory", options]);
    if (options?.query === "nonfinite") {
      return [{ content: "bad", category: "test", score: Number.NaN }];
    }
    return [{ content: "memory", category: "test", score: 1 }];
  }

  getAgentId() {
    return this.agentId;
  }

  getOnboardingSeed() {
    return this.onboardingSeed;
  }

  async uploadFile(conversationId, file, fileName, fileType) {
    this.calls.push(["uploadFile", conversationId, Array.from(file), fileName, fileType]);
    return { url: "https://file", fileName, fileType, fileSize: file.byteLength };
  }

  async reorderColumns(boardId, columnIds) {
    this.calls.push(["reorderColumns", boardId, columnIds]);
    return null;
  }

  async createCard(body) {
    this.calls.push(["createCard", body]);
    return { id: "card-1", ...body };
  }

  async callAction(action, args, options) {
    this.calls.push(["callAction", action, args, options]);
    return { action, args, options, status: "success" };
  }

  async linkCardNote(cardId, noteId) {
    this.calls.push(["linkCardNote", cardId, noteId]);
    return null;
  }
}

