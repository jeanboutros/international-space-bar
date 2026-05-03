# isb-0026: Interrupt handling with Command({ resume }) behind runtime port

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-005 |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `medium`     |
| Created      | 2026-04-28   |
| Dependencies | isb-0025     |

## Description

Preserve the existing DeepAgents resume shape using `Command({ resume })` behind the runtime port. Map client approval decisions to LangGraph interrupt resume commands.

## Acceptance Criteria

- [ ] Interrupt state is persisted and retrievable
- [ ] Client resume decision maps to `Command({ resume })` in LangGraph
- [ ] Interrupt IDs visible in logs and stream events
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/director-runtime.service.ts`
- `src/international-space-bar-server/openresponses/agent-runtime.port.ts`
