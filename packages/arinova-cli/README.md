# Arinova CLI

`@arinova-ai/cli` manages Arinova resources through the current `/api/v1`
contract. The checked-in route fixture is pinned to server commit
`0f6ea5e79be2b0fa41b9521796f1ff3d3765a85b`.

## Install and authenticate

```sh
pnpm add --global @arinova-ai/cli
arinova auth login
arinova --profile my-agent auth set-token ari_xxx
arinova --profile my-agent auth whoami
```

Global options are `--profile`, `--token`, `--api-url`, `--json`, and `--yes`.
Precedence is an explicit `--token`, the selected `--profile`, then the active
profile. `--token` is runtime-only and is never persisted. Side-effect commands
fail closed in a non-interactive process unless `--yes` is supplied.

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

## Managed Space bundles

Managed Spaces are uploaded bundles, not external iframe URLs. Create an OAuth
app first, then use its `clientId` as the exact `id` in `space.json`:

```sh
arinova app create \
  --name "My Space" \
  --client-id my-space \
  --redirect-uri "https://example.invalid/space-oauth-callback"
arinova space create --name "My Space"
arinova space init my-space
cd my-space
# Replace YOUR_OAUTH_CLIENT_ID in space.json with the returned Client ID.
arinova space build
arinova space version create <space-id> --bundle dist/my-space-1.0.0.zip
arinova space version preview <space-id> <version-id>
arinova space version publish <space-id> <version-id>
```

`space build` packs `space.json` plus nested web assets and mirrors the server's
manifest, path, extension, `<base>`, symlink, file-count, and size checks. The
generated manifest pre-allows the selected Arinova API origin because an opaque
managed iframe cannot reach it through CSP `connect-src 'self'` alone.

`space version rollback` is a fresh publish operation: it runs the current
safety scan again, revokes all Space OAuth tokens, and disconnects online
players. A rejected version can be inspected with `space version scan` and
retried with `space version rescan` after an underlying scanner false positive
is fixed. Content fixes require a replacement bundle with a bumped manifest
version.

`space storage *` is a runtime API. Pass a Space-bound OAuth access token via
the global `--token`; a creator API key is not valid for these commands.

Creator catalog management is available under `space products` (`list`,
`create`, `update`, `deactivate`, and `wind-down`). Deactivation blocks new
purchases but leaves existing subscription renewals active; `wind-down`
cancels those renewals at the current period end.

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
- `auto-send` and `expert` fail before issuing known-invalid requests.
- `wiki` remains a deprecated alias for `memo` for one minor release.
- Painter and `setup-openclaw` remain explicit legacy compatibility surfaces
  because the server has no equivalent public `/api/v1` contract.
- Card archive/unarchive, direct sticker publish/unpublish, and slide members
  fail as unsupported where the pinned server contract has no safe route.

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
