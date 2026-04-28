# isb-0015: Fix compliance failures for streaming-response filter

| Field | Value |
|-------|-------|
| Epic | isb-epic-003 |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `high` |
| Created | 2026-04-28 |
| Dependencies | isb-0013 |

## Description

Fix all must-fix compliance failures identified in the `streaming-response` filter gap analysis. Ensure SSE event types, ordering, field presence, and framing match the OpenResponses spec.

## Acceptance Criteria

- [ ] All must-fix `streaming-response` compliance tests pass
- [ ] Event types and sequence numbers conform to spec
- [ ] `pnpm check` exits 0

## Files Affected

- TBD based on gap analysis from isb-0013
