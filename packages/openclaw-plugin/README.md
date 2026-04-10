# @arinova-ai/openclaw-arinova-ai

OpenClaw plugin for [Arinova Chat](https://chat.arinova.ai) — provides A2A streaming channel and MCP tools for messaging, notes, kanban, memory, and file management.

## Installation

```bash
openclaw plugin install @arinova-ai/openclaw-arinova-ai
```

## MCP Tools

All tools are automatically available to connected bots via the MCP protocol.

### Messaging

| Tool | Description |
|------|-------------|
| `arinova_send_message` | Send a message to a conversation |
| `arinova_list_messages` | Fetch conversation history (cursor-based pagination) |
| `arinova_upload_file` | Upload a file and get a URL for use in messages |

#### arinova_send_message

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `conversationId` | string | Yes | Target conversation ID |
| `content` | string | Yes | Message text content |
| `replyTo` | string | No | Message ID to reply to |

#### arinova_list_messages

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `conversationId` | string | Yes | Conversation ID |
| `limit` | number | No | Number of messages (default 50, max 100) |
| `before` | string | No | Cursor: fetch messages older than this ID |
| `after` | string | No | Cursor: fetch messages newer than this ID |
| `around` | string | No | Cursor: fetch messages around this ID |

#### arinova_upload_file

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `conversationId` | string | Yes | Target conversation ID |
| `filePath` | string | Yes | Absolute path to the file to upload |

Supported file types: PNG, JPG, GIF, WebP, SVG, PDF, TXT, Markdown, JSON, CSV.

---

### Notes

| Tool | Description |
|------|-------------|
| `arinova_list_notes` | List shared notes in a conversation |
| `arinova_create_note` | Create a new shared note |
| `arinova_update_note` | Update a note you created |
| `arinova_delete_note` | Delete a note you created |
| `arinova_share_note` | Share a note as a message in the conversation |

#### arinova_list_notes

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `conversationId` | string | Yes | Conversation ID |
| `limit` | number | No | Max notes to return (default 20, max 50) |
| `before` | string | No | Note ID cursor for pagination |
| `tags` | string[] | No | Filter by tags (AND logic) |
| `archived` | boolean | No | If true, list archived notes instead of active |

#### arinova_create_note

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `conversationId` | string | Yes | Conversation ID |
| `title` | string | Yes | Note title |
| `content` | string | Yes | Note content (markdown supported) |
| `tags` | string[] | No | Tags for categorization |

#### arinova_update_note

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `conversationId` | string | Yes | Conversation ID |
| `noteId` | string | Yes | Note ID to update |
| `title` | string | No | New title |
| `content` | string | No | New content (markdown) |
| `tags` | string[] | No | Replace tags |

> Only the note creator (agent) can edit or delete their own notes.

#### arinova_delete_note

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `conversationId` | string | Yes | Conversation ID |
| `noteId` | string | Yes | Note ID to delete |

#### arinova_share_note

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `conversationId` | string | Yes | Conversation ID |
| `noteId` | string | Yes | Note ID to share |

---

### Kanban — Boards

| Tool | Description |
|------|-------------|
| `arinova_kanban_list_boards` | List all kanban boards with columns and cards |
| `arinova_kanban_create_board` | Create a new board (auto-creates 5 default columns) |
| `arinova_kanban_update_board` | Rename a board |
| `arinova_kanban_archive_board` | Toggle archive/unarchive a board |

#### arinova_kanban_list_boards

No parameters required. Returns all non-archived boards with columns and cards.

#### arinova_kanban_create_board

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Board name |
| `columns` | object[] | No | Custom columns `[{ name }]`. If omitted, creates Backlog/To Do/In Progress/Review/Done |

#### arinova_kanban_update_board

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `boardId` | string | Yes | Board ID |
| `name` | string | Yes | New board name |

#### arinova_kanban_archive_board

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `boardId` | string | Yes | Board ID to archive/unarchive |

> Cannot archive the last non-archived board.

---

### Kanban — Columns

| Tool | Description |
|------|-------------|
| `arinova_kanban_list_columns` | List columns in a board |
| `arinova_kanban_create_column` | Create a new column |
| `arinova_kanban_update_column` | Rename a column |
| `arinova_kanban_delete_column` | Delete an empty column |
| `arinova_kanban_reorder_columns` | Reorder columns in a board |

#### arinova_kanban_list_columns

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `boardId` | string | Yes | Board ID |

#### arinova_kanban_create_column

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `boardId` | string | Yes | Board ID |
| `name` | string | Yes | Column name |

#### arinova_kanban_update_column

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `columnId` | string | Yes | Column ID |
| `name` | string | Yes | New column name |

#### arinova_kanban_delete_column

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `columnId` | string | Yes | Column ID to delete |

> Column must be empty (no non-archived cards).

#### arinova_kanban_reorder_columns

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `boardId` | string | Yes | Board ID |
| `columnIds` | string[] | Yes | Column IDs in desired display order |

---

### Kanban — Cards

| Tool | Description |
|------|-------------|
| `arinova_kanban_list_cards` | List all cards with column names and priorities |
| `arinova_kanban_create_card` | Create a new card on a board |
| `arinova_kanban_update_card` | Update a card (title, description, move column, priority) |
| `arinova_kanban_complete_card` | Move a card to the Done column |
| `arinova_kanban_add_card_commit` | Link a git commit to a card |
| `arinova_kanban_list_card_commits` | List commits linked to a card |
| `arinova_kanban_list_archived_cards` | List archived cards on a board |
| `arinova_kanban_link_note` | Link a note to a card |
| `arinova_kanban_unlink_note` | Unlink a note from a card |
| `arinova_kanban_list_card_notes` | List notes linked to a card |

#### arinova_kanban_list_cards

No parameters required. Returns all non-archived cards with column names.

#### arinova_kanban_create_card

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | Yes | Card title |
| `description` | string | No | Card description (markdown) |
| `priority` | string | No | `"low"`, `"medium"`, `"high"`, or `"urgent"` |
| `boardId` | string | No | Board ID. If omitted, uses agent owner's default board |
| `columnName` | string | No | Column name (e.g. `"To Do"`, `"In Progress"`). Defaults to `"Backlog"` |
| `columnId` | string | No | Column ID (takes precedence over `columnName`) |

> The agent is auto-assigned to the card.

#### arinova_kanban_update_card

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `cardId` | string | Yes | Card ID to update |
| `title` | string | No | New title |
| `description` | string | No | New description |
| `columnId` | string | No | Move card to this column ID |
| `priority` | string | No | `"low"`, `"medium"`, `"high"`, or `"urgent"` |

#### arinova_kanban_complete_card

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `cardId` | string | Yes | Card ID to complete |

Moves the card to the "Done" column on its board.

#### arinova_kanban_add_card_commit

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `cardId` | string | Yes | Card ID |
| `commitHash` | string | Yes | Git commit hash (1-40 chars) |
| `message` | string | No | Commit message |

#### arinova_kanban_list_card_commits

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `cardId` | string | Yes | Card ID |

Returns array of `{ cardId, commitHash, message, createdAt }`.

#### arinova_kanban_list_archived_cards

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `boardId` | string | Yes | Board ID |
| `page` | number | No | Page number (default 1) |
| `limit` | number | No | Items per page (default 20, max 100) |

Returns `{ cards, total, page, limit }`.

#### arinova_kanban_link_note

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `cardId` | string | Yes | Card ID |
| `noteId` | string | Yes | Note ID to link |

#### arinova_kanban_unlink_note

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `cardId` | string | Yes | Card ID |
| `noteId` | string | Yes | Note ID to unlink |

#### arinova_kanban_list_card_notes

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `cardId` | string | Yes | Card ID |

Returns array of linked notes.

---

### Memory

| Tool | Description |
|------|-------------|
| `arinova_query_memory` | Search agent memories using hybrid search |

#### arinova_query_memory

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search keywords or semantic query |
| `limit` | number | No | Number of results (default 10, max 20) |

Uses hybrid search (embedding + keyword + recency) to find relevant agent memories.

---

## Agent Workflow Example

A typical development workflow using kanban tools:

```
1. Create a card for the task
   arinova_kanban_create_card({ title: "Add login page", columnName: "To Do", priority: "high" })

2. Move card to In Progress when starting work
   arinova_kanban_update_card({ cardId: "...", columnId: "<in-progress-column-id>" })

3. Link commits as you develop
   arinova_kanban_add_card_commit({ cardId: "...", commitHash: "abc1234", message: "feat: add login form" })
   arinova_kanban_add_card_commit({ cardId: "...", commitHash: "def5678", message: "test: add login tests" })

4. Complete the card when done
   arinova_kanban_complete_card({ cardId: "..." })
```

## curl Fallback (Agent API)

When MCP tools are unavailable (e.g. plugin not loaded, runtime reload issue), use the Agent REST API directly with curl. All agent endpoints use `Authorization: Bearer <secret_token>` where `secret_token` is the agent's bot token from the `agents` table.

**Base URL**: `https://api.chat-staging.arinova.ai` (staging) or `https://api.chat.arinova.ai` (production)

> All request/response bodies use **camelCase** (e.g. `columnId`, not `column_id`).

### Messaging

```bash
# Send message
curl -s -X POST "$BASE_URL/api/agent/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{ "conversationId": "<CONV_ID>", "content": "Hello from agent!" }'

# List messages
curl -s "$BASE_URL/api/agent/messages/<CONV_ID>?limit=50" \
  -H "Authorization: Bearer <TOKEN>"

# Upload file
curl -s -X POST "$BASE_URL/api/agent/upload" \
  -H "Authorization: Bearer <TOKEN>" \
  -F "conversationId=<CONV_ID>" -F "file=@/path/to/file.png"
```

### Notes

```bash
# List notes
curl -s "$BASE_URL/api/agent/conversations/<CONV_ID>/notes" -H "Authorization: Bearer <TOKEN>"

# Create note
curl -s -X POST "$BASE_URL/api/agent/conversations/<CONV_ID>/notes" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "title": "Title", "content": "Markdown content", "tags": ["tag1"] }'

# Update / Delete / Share note
curl -s -X PATCH "$BASE_URL/api/agent/conversations/<CONV_ID>/notes/<NOTE_ID>" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "title": "Updated" }'

curl -s -X DELETE "$BASE_URL/api/agent/conversations/<CONV_ID>/notes/<NOTE_ID>" \
  -H "Authorization: Bearer <TOKEN>"

curl -s -X POST "$BASE_URL/api/agent/conversations/<CONV_ID>/notes/<NOTE_ID>/share" \
  -H "Authorization: Bearer <TOKEN>"
```

### Kanban

```bash
# Boards
curl -s "$BASE_URL/api/agent/kanban/boards" -H "Authorization: Bearer <TOKEN>"
curl -s -X POST "$BASE_URL/api/agent/kanban/boards" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "name": "My Board" }'
curl -s -X POST "$BASE_URL/api/agent/kanban/boards/<BOARD_ID>/archive" \
  -H "Authorization: Bearer <TOKEN>"

# Cards
curl -s "$BASE_URL/api/agent/kanban/cards" -H "Authorization: Bearer <TOKEN>"
curl -s -X POST "$BASE_URL/api/agent/kanban/cards" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "title": "Task", "columnName": "To Do", "priority": "medium" }'
curl -s -X PATCH "$BASE_URL/api/agent/kanban/cards/<CARD_ID>" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "columnId": "<COL_ID>", "priority": "high" }'
curl -s -X POST "$BASE_URL/api/agent/kanban/cards/<CARD_ID>/complete" \
  -H "Authorization: Bearer <TOKEN>"

# Commits
curl -s -X POST "$BASE_URL/api/agent/kanban/cards/<CARD_ID>/commits" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "commitHash": "abc1234", "message": "feat: add feature" }'
curl -s "$BASE_URL/api/agent/kanban/cards/<CARD_ID>/commits" \
  -H "Authorization: Bearer <TOKEN>"

# Archived cards
curl -s "$BASE_URL/api/agent/kanban/boards/<BOARD_ID>/archived-cards?page=1&limit=20" \
  -H "Authorization: Bearer <TOKEN>"

# Card-note links
curl -s -X POST "$BASE_URL/api/agent/kanban/cards/<CARD_ID>/notes" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "noteId": "<NOTE_ID>" }'
curl -s "$BASE_URL/api/agent/kanban/cards/<CARD_ID>/notes" \
  -H "Authorization: Bearer <TOKEN>"
curl -s -X DELETE "$BASE_URL/api/agent/kanban/cards/<CARD_ID>/notes/<NOTE_ID>" \
  -H "Authorization: Bearer <TOKEN>"

# Columns
curl -s "$BASE_URL/api/agent/kanban/boards/<BOARD_ID>/columns" \
  -H "Authorization: Bearer <TOKEN>"
curl -s -X POST "$BASE_URL/api/agent/kanban/boards/<BOARD_ID>/columns" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "name": "Custom Column" }'
curl -s -X DELETE "$BASE_URL/api/agent/kanban/columns/<COL_ID>" \
  -H "Authorization: Bearer <TOKEN>"
curl -s -X POST "$BASE_URL/api/agent/kanban/boards/<BOARD_ID>/columns/reorder" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "columnIds": ["<COL1>", "<COL2>", "<COL3>"] }'
```

### Memory

```bash
curl -s "$BASE_URL/api/v1/memories/search?q=search+terms&limit=10" \
  -H "Authorization: Bearer <TOKEN>"
```

## License

Proprietary - Arinova AI
