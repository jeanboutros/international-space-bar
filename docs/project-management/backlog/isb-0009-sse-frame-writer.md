# isb-0009: SSE frame writer utility

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-002 |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `high`       |
| Created      | 2026-04-28   |
| Dependencies | isb-0004     |

## Description

Create a reusable SSE frame writer that serializes OpenResponses streaming events into `event:` + `data:` SSE format. The writer should handle proper newline framing, JSON serialization, and flushing.

## Acceptance Criteria

- [ ] SSE writer produces correct `event: <type>\ndata: <json>\n\n` format
- [ ] Writer handles flush/drain for Express response streams
- [ ] Unit tests cover frame formatting
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/sse-writer.ts` (new)
- `src/international-space-bar-server/openresponses/sse-writer.test.ts` (new)
