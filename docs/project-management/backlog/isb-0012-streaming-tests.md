# isb-0012: Streaming tests and OpenCode validation

| Field | Value |
|-------|-------|
| Epic | isb-epic-002 |
| Status | `backlog` |
| Assignee | Tester |
| Priority | `high` |
| Created | 2026-04-28 |
| Dependencies | isb-0010 |

## Description

Add integration tests for the streaming route. Verify SSE event format, ordering, and content. Validate that OpenCode can consume streaming responses from the backend without hanging.

## Acceptance Criteria

- [ ] Integration test verifies `response.created` → deltas → `response.completed` ordering
- [ ] Test verifies SSE frame format (`event:` + `data:` lines)
- [ ] Test verifies delta content reconstructs to "pong"
- [ ] Manual or scripted OpenCode validation documented
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/responses.controller.test.ts`
