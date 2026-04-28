# isb-epic-006: Phase 5 — Durability, Observability, and Documentation

| Field | Value |
|-------|-------|
| Phase | 5 |
| Status | `backlog` |
| Priority | `medium` |
| Created | 2026-04-28 |
| Depends on | isb-epic-005 (Phase 4) |

## Objective

Make the backend service operationally traceable with durable session/run identifiers, structured request tracing, and API-level observability. Update architecture docs that became obsolete after the service split.

## Tickets

| Ticket | Title | Priority |
|--------|-------|----------|
| isb-0027 | Durable session and run identifiers | high |
| isb-0028 | Request tracing IDs across protocol, system, and agent logs | high |
| isb-0029 | API-level observability (separate from app.log and agents.log) | medium |
| isb-0030 | Update technical-stack.md, agent-observability-logging.md, workflow.md | medium |

## Acceptance Criteria

- A single OpenCode request can be traced across protocol, system, and agent observability logs using stable IDs
- Documentation no longer describes the old in-process TUI as the primary runtime
- `pnpm check` and `pnpm build` exit 0
