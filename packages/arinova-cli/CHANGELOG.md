# @arinova-ai/cli

## 0.2.1

### Patch Changes

- 779f8c9: Fix managed Space list and version commands, remove retired cron confirmation endpoints, allow local Space build commands in non-interactive use, and refresh the server route/auth contracts.

## 0.2.0

### Minor Changes

- d39c28b: Add the managed Space bundle workflow to the CLI and expose commerce, purchase bridge, inventory, and storage APIs in the Spaces SDK. The contracts align with arinova-chat server commit `bf339484156c6f47c440b6690cf1d10bebad8698`.
- 4168c13: Route all CLI commands through the configured `ApiClient`, add conditional ETag reads, and warn when credentials are supplied through the process-visible `--token` flag. Remove the retired `wiki` alias and unsupported Kanban card archive, card-label list, slide member, and lounge command surfaces.

### Patch Changes

- 727e846: Validate theme manifests consistently before upload, update, development, and build; split theme commands into focused modules; and make the embedded theme bridge dependency and drift checks explicit. Remote list commands now send a bounded default page size through the shared pagination helper.
- 1c96b21: Harden credential-bearing endpoints, inbound group authorization, office event forwarding, and theme asset loading. The deprecated `HookEvent` and `HookEventType` aliases are removed; use `InternalEvent` and `InternalEventType`.
- fc9b6ed: Unify resource CRUD, pagination, export, permissions, and unavailable-command registration. List requests now send a bounded default limit, automation products are split into focused modules, and command-scoped clients are reused across related requests.

## 0.1.0

### Minor Changes

- 7f57244: Harden profile resolution, request contracts, and streaming. Breaking behavior changes: commands no longer fall back to the first configured profile when `--profile`/`ARINOVA_PROFILE` is absent (single-profile scripts must set one or the other); `file url` now requires confirmation (`--yes`) in non-interactive runs; a corrupt config file fails commands loudly (with a backup) instead of being silently ignored; error output is no longer prefixed with `Error:` and `--json` errors are single-line. Also unifies command error handling and splits theme helpers into dedicated modules.
- b445f6c: Align the CLI with the pinned Arinova `/api/v1` contract, add core, Office,
  automation, economy, and chat resources, and unify auth, output, pagination,
  binary, multipart, stream, completion, and safety behavior.
