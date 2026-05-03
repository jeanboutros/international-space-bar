# isb-0028: Request tracing IDs across protocol, system, and agent logs

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-006 |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `high`       |
| Created      | 2026-04-28   |
| Dependencies | isb-0027     |

## Description

Add structured request tracing using request IDs, response IDs, thread IDs, run IDs, tool call IDs, and interrupt IDs across all log layers. A single OpenCode request must be traceable from protocol logs through system logs to agent observability logs.

## Acceptance Criteria

- [ ] Request ID generated at protocol boundary and propagated to all log calls
- [ ] Response ID, thread ID, run ID included in structured log fields
- [ ] Tool call IDs and interrupt IDs logged when applicable
- [ ] System logs (`app.log`) and agent logs (`agents.log`) share correlation IDs
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/responses.controller.ts`
- `src/international-space-bar-server/openresponses/responses.service.ts`
- Logging infrastructure files
