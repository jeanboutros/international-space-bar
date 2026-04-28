# isb-0030: Update technical-stack.md, agent-observability-logging.md, workflow.md

| Field | Value |
|-------|-------|
| Epic | isb-epic-006 |
| Status | `backlog` |
| Assignee | Docs Writer |
| Priority | `medium` |
| Created | 2026-04-28 |
| Dependencies | isb-0029 |

## Description

Update architecture documentation that became obsolete after the backend service split. Documents must describe the NestJS server, OpenResponses protocol, updated scripts, new source layout, and backend-service logging with protocol request IDs.

## Acceptance Criteria

- [ ] `docs/technical-stack.md` documents NestJS, OpenResponses, scripts, source layout
- [ ] `docs/agent-observability-logging.md` describes backend-service logging and protocol request IDs
- [ ] `docs/workflow.md` updated if diagrams no longer match backend architecture
- [ ] Documentation no longer describes the old in-process TUI as the primary runtime
- [ ] `pnpm check` exits 0

## Files Affected

- `docs/technical-stack.md`
- `docs/agent-observability-logging.md`
- `docs/workflow.md`
