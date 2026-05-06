# @arinova-ai/mcp-server

MCP server bridge for Arinova platform actions. Exposes Arinova backend actions as [Model Context Protocol](https://modelcontextprotocol.io/) tools for use in MCP-capable agents (Claude Desktop, Cursor, Codex, etc.).

## Install

```bash
npm install -g @arinova-ai/mcp-server
```

## MCP Client Configuration

Add to your MCP client config (e.g. `claude_desktop_config.json`, `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "arinova": {
      "command": "npx",
      "args": ["-y", "@arinova-ai/mcp-server"],
      "env": {
        "ARINOVA_BOT_TOKEN": "ari_xxx",
        "ARINOVA_SERVER_URL": "wss://<your-arinova-host>",
        "ARINOVA_API_URL": "https://<your-arinova-api-host>"
      }
    }
  }
}
```

## Configuration

| Variable | CLI Flag | Default | Description |
|---|---|---|---|
| `ARINOVA_BOT_TOKEN` | `--token` | *required* | Agent bot token |
| `ARINOVA_SERVER_URL` | `--server-url` | *required* | WebSocket base URL |
| `ARINOVA_API_URL` | `--api-url` | derived from WS URL | HTTP API base URL |
| `ARINOVA_STARTUP_MODE` | `--strict-startup` | `lazy` | `lazy` or `strict` |
| `ARINOVA_ACTION_TIMEOUT_MS` | | `60000` | Action execution timeout |
| `ARINOVA_MAX_CONCURRENT_ACTIONS` | | `4` | Max concurrent action calls |
| `ARINOVA_ACTION_QUEUE_LIMIT` | | `32` | Max queued action calls |
| `ARINOVA_LOG_LEVEL` | `--log-level` | `warn` | `debug`, `info`, `warn`, `error` |

CLI flags override environment variables.

### URL Derivation

If `ARINOVA_API_URL` is omitted, it is derived from `ARINOVA_SERVER_URL` by replacing `wss:` with `https:` (or `ws:` with `http:`), keeping the host unchanged. Set `ARINOVA_API_URL` explicitly if the WebSocket and HTTP hosts differ.

## Built-in Tools

| Tool | Description |
|---|---|
| `arinova_health` | Reports connection state, manifest status, queue depth, last error |
| `arinova_refresh_manifest` | Re-fetches the action manifest and updates the tool list |

## How It Works

1. On startup, the MCP server connects to Arinova via bot token.
2. It fetches the scoped action manifest from the backend HTTP API.
3. Each backend action becomes an MCP tool (e.g. `arinova.kanban.add_commit` becomes `arinova_kanban_add_commit`).
4. When an MCP client calls a tool, the server executes the action via WebSocket and returns the structured result.
5. Backend permissions, confirmations, and audit logging are preserved.

### Action Results

Success:
```json
{ "ok": true, "status": "success", "action": "...", "callId": "...", "result": {} }
```

Error:
```json
{ "ok": false, "status": "error", "action": "...", "error": { "code": "PERMISSION_DENIED", "message": "..." } }
```

Confirmation required:
```json
{ "ok": false, "status": "requires_confirmation", "action": "...", "confirmation": { "confirmationId": "...", "title": "...", "summary": "...", "expiresAt": "..." } }
```

## Local Development

```bash
pnpm --filter @arinova-ai/mcp-server build
pnpm --filter @arinova-ai/mcp-server test
node packages/mcp-server/dist/cli.js --token ari_xxx --server-url wss://...
```

## Action Call Protocol

Minimum supported protocol version: `2026-05-05` (as advertised by `@arinova-ai/agent-sdk`).
