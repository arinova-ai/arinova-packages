# @arinova-ai/mcp-server

## 0.1.1

### Patch Changes

- 0b24386: Split manifest ETag caching, bounded request limiting, and HTTP action execution out of the MCP client coordinator while preserving connection, drain, abort, and error-normalization behavior.

## 0.1.0

### Minor Changes

- 319ae2f: Harden manifest and action HTTP boundaries, validate generated MCP tools and arguments, expose structured errors and intermediate results, make shutdown cancellable, and add real MCP transport plus CLI and coverage regression tests. Requires Node >= 20.10 (JSON import attributes).
