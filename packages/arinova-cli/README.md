# Arinova CLI

`@arinova-ai/cli` manages Arinova resources through the current `/api/v1`
contract. The checked-in route fixture is pinned to server commit
`33b7c06ad9df8b9cb5ab9e21fff109955a3cc3cc`.

## Install and authenticate

```sh
pnpm add --global @arinova-ai/cli
arinova auth login
arinova --profile my-agent auth set-token ari_xxx
arinova --profile my-agent auth whoami
```

Global options are `--profile`, deprecated `--token`, `--api-url`, `--json`, and
`--yes`. Prefer a named profile: command-line tokens are visible to other local
processes through the process list. An explicit `--token` still has precedence
over the selected profile for compatibility and is never persisted. Side-effect
commands fail closed in a non-interactive process unless `--yes` is supplied.

`ARINOVA_ENDPOINT`, configured endpoints, and `--api-url` must be absolute HTTPS
URLs; plain HTTP is accepted only for exact loopback hosts during local
development.

Identity support is machine-readable in
[`src/contracts/command-auth.json`](src/contracts/command-auth.json). Economy
and agent-proxy chat plus `/user` identity routes require user-authorized OAuth
scopes. Delivery and selected agent action views require a bot token. Most
management resources accept a user API key or bot token, with final ownership
and scope enforcement performed by the server.

## Command reference

Run `arinova <command> --help` for every option.

| Area | Commands |
| --- | --- |
| Core | `message`, `conversation`, `memory`, `note`, `notebook`, `memo`, `kanban`, `file`, `search`, `resolve` |
| Skills and creator | `skill`, `skill-package`, `agent`, `sticker`, `theme`, `community`, `space`, `app`, `stats` |
| Office | `calendar`, `doc`, `form`, `mindmap`, `slide`, `workbook`, `image`, `external-image` |
| Automation | `action`, `workflow`, `cron`, `trigger`, `webhook`, `delivery`, `autopilot` |
| User and proxy | `user`, `profile`, `economy`, `chat` |
| Local setup | `auth`, `config`, `setup-openclaw`, `completion` |

Resource commands consistently use `list`, `show`, `create`, `update`, and
`delete`; lifecycle commands retain server terminology such as `archive`,
`publish`, `activate`, `pause`, and `cancel`.

## Output, files, and streams

Human output is the default. `--json` writes one JSON value for normal commands
and a stable JSON error envelope to stderr. Piped or `--json` SSE output is
NDJSON; a terminal renders chat chunks incrementally.

Downloads require `--output` and protect existing files unless `--force` is
given. Uploads use `--file` and preserve filename, MIME type, and bytes. SIGINT
and timeout abort the underlying request.

```sh
arinova --json note list --limit 20
arinova image asset download ASSET_ID --output image.png
arinova chat stream --agent-id AGENT_ID --prompt "Summarize this"
arinova completion zsh > ~/.zfunc/_arinova
```

## Deliberate exclusions and compatibility

- Economy `award` and `charge`, inbound webhook receivers, HUD websocket,
  analytics tracking, and moderation health are intentionally not exposed.
- `auto-send` and `expert` are migration-only compatibility surfaces. They fail
  before issuing a request and point to platform cron or agent skill packages.
- Painter and `setup-openclaw` remain explicit legacy compatibility surfaces
  because the server has no equivalent public `/api/v1` contract.
- Card archive/unarchive, card-label listing, slide members, and lounge
  unpublish are not exposed where the pinned server contract has no route.
  Direct sticker publish/unpublish fails early for the same reason.

## Contract and release checks

```sh
pnpm --filter @arinova-ai/cli lint
pnpm --filter @arinova-ai/cli test
pnpm --filter @arinova-ai/cli build
pnpm --filter @arinova-ai/cli contracts:generate
```

The tests cover request method/path/query/headers/body, HTTP error statuses,
multipart and binary integrity, pagination guards, SSE framing and interruption,
and subprocess smoke against a local fake server.

The 2026-07-31 pre-release read-only staging smoke passed for auth, calendar,
docs, forms, mindmaps, slides, workbooks, image projects, workflows, and
webhooks. User and economy routes correctly rejected the non-OAuth profile with
401; the client did not retry under another identity. Mutation smoke is covered
by the fake-server suite and must only be repeated on staging with a dedicated
test owner.
