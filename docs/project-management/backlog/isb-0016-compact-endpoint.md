# isb-0016: Add /v1/responses/compact stub or implementation

| Field | Value |
|-------|-------|
| Epic | isb-epic-003 |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `medium` |
| Created | 2026-04-28 |
| Dependencies | isb-0013 |

## Description

Add `POST /v1/responses/compact` endpoint. If the compliance scope requires a real implementation, compact the conversation. Otherwise, provide a stub that returns a proper OpenResponses error indicating the feature is not yet supported.

## Acceptance Criteria

- [ ] `POST /v1/responses/compact` endpoint exists
- [ ] Returns correct OpenResponses shape (either CompactResource or error)
- [ ] Does not break existing compliance tests
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/responses.controller.ts`
- `src/international-space-bar-server/openresponses/responses.service.ts`
