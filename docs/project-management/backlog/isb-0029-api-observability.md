# isb-0029: API-level observability (separate from app.log and agents.log)

| Field | Value |
|-------|-------|
| Epic | isb-epic-006 |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `medium` |
| Created | 2026-04-28 |
| Dependencies | isb-0028 |

## Description

Add API-level observability as a separate concern from system logs (`app.log`) and agent observability logs (`agents.log`). API observability logs request/response pairs, latency, status codes, and error shapes to `api.log`.

## Acceptance Criteria

- [ ] `api.log` captures request/response pairs with latency
- [ ] API logger is a separate pino instance (not shared with app or agent loggers)
- [ ] Sensitive data (bearer tokens, request bodies) redacted or excluded
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/common/api-logger.middleware.ts` (new)
- `src/international-space-bar-server/app.module.ts`
