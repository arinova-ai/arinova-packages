---
"@arinova-ai/mcp-server": patch
---

Split manifest ETag caching, bounded request limiting, and HTTP action execution out of the MCP client coordinator while preserving connection, drain, abort, and error-normalization behavior.
