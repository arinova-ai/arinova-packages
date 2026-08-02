# @arinova-ai/cli

## 0.1.0

### Minor Changes

- 7f57244: Harden profile resolution, request contracts, and streaming. Breaking behavior changes: commands no longer fall back to the first configured profile when `--profile`/`ARINOVA_PROFILE` is absent (single-profile scripts must set one or the other); `file url` now requires confirmation (`--yes`) in non-interactive runs; a corrupt config file fails commands loudly (with a backup) instead of being silently ignored; error output is no longer prefixed with `Error:` and `--json` errors are single-line. Also unifies command error handling and splits theme helpers into dedicated modules.
- b445f6c: Align the CLI with the pinned Arinova `/api/v1` contract, add core, Office,
  automation, economy, and chat resources, and unify auth, output, pagination,
  binary, multipart, stream, completion, and safety behavior.
