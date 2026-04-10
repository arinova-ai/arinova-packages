# @arinova-ai/agent-sdk

TypeScript SDK for connecting AI agents to [Arinova Chat](https://chat.arinova.ai) via WebSocket. Handles authentication, streaming responses, and automatic reconnection.

## Install

```bash
npm install @arinova-ai/agent-sdk
```

## Quick Start

```ts
import { ArinovaAgent } from "@arinova-ai/agent-sdk";

const agent = new ArinovaAgent({
  serverUrl: "wss://chat.arinova.ai",
  botToken: "your-bot-token",
});

agent.onTask(async (task) => {
  // Stream chunks to the user
  task.sendChunk("Hello, ");
  task.sendChunk("I'm processing your request...\n\n");

  // Do your work here (call an LLM, run a tool, etc.)
  const result = await doSomething(task.content);

  // Send the final complete response
  task.sendComplete(result);
});

agent.on("connected", () => {
  console.log("Agent connected to Arinova Chat");
});

agent.on("disconnected", () => {
  console.log("Agent disconnected");
});

agent.on("error", (err) => {
  console.error("Agent error:", err.message);
});

await agent.connect();
```

## API Reference

### `new ArinovaAgent(options)`

Creates a new agent instance.

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `serverUrl` | `string` | Yes | -- | WebSocket server URL (e.g. `wss://chat.arinova.ai` or `ws://localhost:21001`) |
| `botToken` | `string` | Yes | -- | Bot token from the Arinova dashboard |
| `reconnectInterval` | `number` | No | `5000` | Milliseconds to wait before reconnecting after a disconnect |
| `pingInterval` | `number` | No | `30000` | Milliseconds between keep-alive pings |

### `agent.onTask(handler)`

Registers the task handler. Called each time a user sends a message to your agent. The handler receives a `TaskContext` object and may return a `Promise`.

```ts
agent.onTask(async (task: TaskContext) => {
  // handle the task
});
```

### `agent.on(event, listener)`

Subscribes to lifecycle events.

| Event | Listener Signature | Description |
|---|---|---|
| `"connected"` | `() => void` | Fired after successful authentication |
| `"disconnected"` | `() => void` | Fired when the WebSocket connection closes |
| `"error"` | `(error: Error) => void` | Fired on authentication failure, connection errors, or message parse errors |

### `agent.connect()`

Connects to the server and authenticates with the bot token. Returns a `Promise<void>` that resolves on successful authentication or rejects on auth failure.

```ts
try {
  await agent.connect();
} catch (err) {
  console.error("Failed to connect:", err);
}
```

The agent automatically reconnects on unexpected disconnects. It does **not** reconnect on authentication errors.

### `agent.disconnect()`

Closes the WebSocket connection and stops automatic reconnection.

```ts
agent.disconnect();
```

### `TaskContext`

The object passed to your `onTask` handler.

| Property | Type | Description |
|---|---|---|
| `taskId` | `string` | Unique task ID assigned by the server |
| `conversationId` | `string` | ID of the conversation this task belongs to |
| `content` | `string` | The user's message text |
| `sendChunk(chunk)` | `(chunk: string) => void` | Send a streaming text chunk to the user |
| `sendComplete(content)` | `(content: string) => void` | Mark the task as complete with the full response |
| `sendError(error)` | `(error: string) => void` | Mark the task as failed with an error message |

If your `onTask` handler throws, the SDK automatically calls `sendError` with the error message.

### `agent.sendMessage(conversationId, content)`

Send a proactive message to a conversation. Uses WebSocket if connected, otherwise falls back to HTTP POST.

```ts
await agent.sendMessage("conv-id", "Hello from the agent!");
```

### `agent.uploadFile(conversationId, file, fileName, fileType?)`

Upload a file to R2 storage. Returns an `UploadResult` with the public URL.

```ts
const result = await agent.uploadFile("conv-id", buffer, "image.png");
console.log(result.url);
```

### `agent.fetchHistory(conversationId, options?)`

Fetch conversation message history with pagination.

| Option | Type | Description |
|---|---|---|
| `before` | `string` | Fetch messages before this message ID |
| `after` | `string` | Fetch messages after this message ID |
| `around` | `string` | Fetch messages around this message ID |
| `limit` | `number` | Max messages to return (default 50, max 100) |

---

### Notes API

#### `agent.listNotes(conversationId, options?)`

List notes in a conversation. Supports pagination, tag filtering, and archived notes.

```ts
const { notes, hasMore } = await agent.listNotes("conv-id", { tags: ["sprint-1"], limit: 10 });
```

#### `agent.createNote(conversationId, body)`

Create a note. Body: `{ title: string, content?: string, tags?: string[] }`.

```ts
const note = await agent.createNote("conv-id", { title: "Meeting Notes", content: "...", tags: ["meeting"] });
```

#### `agent.updateNote(conversationId, noteId, body)`

Update a note. Body: `{ title?: string, content?: string, tags?: string[] }`.

#### `agent.deleteNote(conversationId, noteId)`

Delete a note.

#### `agent.shareNote(conversationId, noteId)`

Share a note as a rich preview card in a conversation.

```ts
const result = await agent.shareNote("conv-id", "note-id");
```

---

### Kanban API

#### Board CRUD

##### `agent.listBoards()`

List the owner's kanban boards. Returns `KanbanBoard[]`.

```ts
const boards = await agent.listBoards();
```

##### `agent.createBoard(body)`

Create a new board. If `columns` is omitted, the server creates 5 default columns.

```ts
const board = await agent.createBoard({ name: "Sprint Board" });
// Or with custom columns:
const board2 = await agent.createBoard({ name: "Custom", columns: [{ name: "Backlog" }, { name: "Done" }] });
```

##### `agent.updateBoard(boardId, body)`

Update a board's name.

```ts
await agent.updateBoard("board-id", { name: "New Name" });
```

##### `agent.archiveBoard(boardId)`

Archive a board.

```ts
await agent.archiveBoard("board-id");
```

#### Column Management

##### `agent.listColumns(boardId)`

List columns for a board. Returns `KanbanColumn[]`.

##### `agent.createColumn(boardId, body)`

Create a column. Body: `{ name: string, sortOrder?: number }`.

```ts
const col = await agent.createColumn("board-id", { name: "In Review" });
```

##### `agent.updateColumn(columnId, body)`

Update a column. Body: `{ name?: string, sortOrder?: number }`.

##### `agent.deleteColumn(columnId)`

Delete a column.

##### `agent.reorderColumns(boardId, columnIds)`

Reorder columns by providing an ordered array of column IDs.

```ts
await agent.reorderColumns("board-id", ["col-3", "col-1", "col-2"]);
```

#### Card Operations

##### `agent.listCards()`

List all kanban cards for the agent's owner.

##### `agent.createCard(body)`

Create a card. Body: `{ title, description?, priority?, columnName?, columnId?, boardId? }`.

```ts
const card = await agent.createCard({ title: "Fix login bug", priority: "high", columnName: "To Do" });
```

##### `agent.updateCard(cardId, body)`

Update a card. Body: `{ title?, description?, priority?, columnId?, sortOrder? }`.

##### `agent.completeCard(cardId)`

Mark a card as complete (moves it to the Done column).

```ts
const card = await agent.completeCard("card-id");
```

##### `agent.listArchivedCards(boardId, options?)`

List archived cards with pagination. Options: `{ page?: number, limit?: number }`.

```ts
const { cards, total } = await agent.listArchivedCards("board-id", { page: 1, limit: 20 });
```

#### Card-Commit Links

##### `agent.addCardCommit(cardId, body)`

Link a git commit to a card. Body: `{ commitHash: string, message?: string }`.

```ts
await agent.addCardCommit("card-id", { commitHash: "abc1234", message: "fix: resolve login issue" });
```

##### `agent.listCardCommits(cardId)`

List commits linked to a card. Returns `CardCommit[]`.

#### Card-Note Links

##### `agent.linkCardNote(cardId, noteId)`

Link a note to a card.

```ts
await agent.linkCardNote("card-id", "note-id");
```

##### `agent.unlinkCardNote(cardId, noteId)`

Unlink a note from a card.

##### `agent.listCardNotes(cardId)`

List notes linked to a card. Returns `CardNote[]`.

#### Label Management

##### `agent.listLabels(boardId)`

List labels for a board. Returns `KanbanLabel[]`.

```ts
const labels = await agent.listLabels("board-id");
```

##### `agent.createLabel(boardId, body)`

Create a label. Body: `{ name: string, color?: string }`.

```ts
const label = await agent.createLabel("board-id", { name: "Bug", color: "#ff0000" });
```

##### `agent.updateLabel(labelId, body)`

Update a label. Body: `{ name?: string, color?: string }`.

##### `agent.deleteLabel(labelId)`

Delete a label.

##### `agent.addCardLabel(cardId, labelId)`

Add a label to a card.

```ts
await agent.addCardLabel("card-id", "label-id");
```

##### `agent.removeCardLabel(cardId, labelId)`

Remove a label from a card.

---

### Memory API

#### `agent.queryMemory(options)`

Search agent memories using hybrid search (embedding + keyword + recency).

```ts
const memories = await agent.queryMemory({ query: "deployment process", limit: 5 });
memories.forEach((m) => console.log(m.category, m.content));
```

---

### Types

```ts
interface KanbanBoard { id: string; name: string; createdAt: string }
interface KanbanColumn { id: string; boardId: string; name: string; sortOrder: number }
interface KanbanCard { id: string; columnId: string; columnName?: string; title: string; description: string | null; priority: string | null; dueDate: string | null; sortOrder: number; createdBy: string | null; createdAt: string | null; updatedAt: string | null; archivedAt?: string | null }
interface CreateBoardBody { name: string; columns?: { name: string }[] }
interface UpdateBoardBody { name: string }
interface CreateCardBody { title: string; description?: string; priority?: string; columnName?: string; columnId?: string; boardId?: string }
interface UpdateCardBody { title?: string; description?: string; priority?: string; columnId?: string; sortOrder?: number }
interface CreateColumnBody { name: string; sortOrder?: number }
interface UpdateColumnBody { name?: string; sortOrder?: number }
interface AddCommitBody { commitHash: string; message?: string }
interface CardCommit { cardId: string; commitHash: string; message: string; createdAt: string }
interface CardNote { id: string; title: string; tags: string[]; createdAt: string }
interface KanbanLabel { id: string; boardId: string; name: string; color: string | null }
interface CreateLabelBody { name: string; color?: string }
interface UpdateLabelBody { name?: string; color?: string }
interface ArchivedCardsResult { cards: KanbanCard[]; total: number; page: number; limit: number }
interface Note { id: string; conversationId: string; title: string; content: string; tags?: string[]; createdAt: string; updatedAt: string }
interface MemoryEntry { content: string; category: string; score: number }
```

## Getting a Bot Token

1. Open the [Arinova Chat](https://chat.arinova.ai) dashboard.
2. Navigate to your bot settings (or create a new bot).
3. Copy the bot token from the settings page.
4. Pass the token as `botToken` when creating your `ArinovaAgent`.

Keep your bot token secret. Do not commit it to version control -- use environment variables instead.

## License

MIT
