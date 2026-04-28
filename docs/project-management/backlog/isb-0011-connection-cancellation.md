# isb-0011: Connection cancellation handling

| Field | Value |
|-------|-------|
| Epic | isb-epic-002 |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `medium` |
| Created | 2026-04-28 |
| Dependencies | isb-0010 |

## Description

Add cancellation handling for closed HTTP connections during SSE streaming. When a client disconnects mid-stream, the server must detect the closed connection, stop emitting events, and clean up resources without throwing unhandled errors.

## Acceptance Criteria

- [ ] Server detects client disconnect during SSE stream
- [ ] No unhandled errors when client closes connection mid-stream
- [ ] Logs record the cancellation event
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/responses.controller.ts`
