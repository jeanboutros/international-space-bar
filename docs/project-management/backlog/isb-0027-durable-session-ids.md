# isb-0027: Durable session and run identifiers

| Field | Value |
|-------|-------|
| Epic | isb-epic-006 |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `high` |
| Created | 2026-04-28 |
| Dependencies | isb-0026 |

## Description

Add durable session/run identifiers that persist across requests. Each response should carry a run ID, and chained conversations (via `previous_response_id`) should share a session ID.

## Acceptance Criteria

- [ ] Each response has a unique run ID
- [ ] Chained conversations share a session ID
- [ ] IDs are stable, not regenerated on retry
- [ ] IDs appear in response metadata and logs
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/responses.service.ts`
- `src/international-space-bar-server/openresponses/agent-runtime.port.ts`
