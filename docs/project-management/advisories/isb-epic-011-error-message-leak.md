# Advisory: Error message information disclosure

| Field | Value |
|-------|-------|
| Status | `open` |
| Source | isb-epic-011 (Phase C review, Security Reviewer) |
| Severity | MEDIUM |
| Category | `security` |
| Finding | `response.failed` SSE events expose verbatim `err.message` to clients, potentially leaking internal infrastructure details. |
| Details | The `catch` block in `ResponseStream.run()` captures errors and forwards `err instanceof Error ? err.message : String(err)` directly into the `response.failed` event payload. Error messages from LangGraph, Ollama, or internal crashes can contain connection strings, file paths, internal hostnames, or library-specific context. Fix: log the full error server-side, emit a generic "An internal error occurred" to the client, and map to a fixed set of safe error codes. |
| Resolution | |
