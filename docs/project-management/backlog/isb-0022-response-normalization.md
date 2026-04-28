# isb-0022: Normalize LangGraph output to internal response events

| Field | Value |
|-------|-------|
| Epic | isb-epic-004 |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `high` |
| Created | 2026-04-28 |
| Dependencies | isb-0020 |

## Description

Create a normalization layer that converts LangGraph output (AIMessage, HumanMessage, ToolMessage, streaming chunks) into internal `AgentRuntimeEvent` envelopes. These events are then converted to OpenResponses shapes by the protocol mapper.

## Acceptance Criteria

- [ ] LangGraph `AIMessage` text → internal text delta / completed events
- [ ] LangGraph streaming chunks → internal incremental delta events
- [ ] Normalization is independent of OpenResponses format (framework-free)
- [ ] Unit tests cover all LangGraph message types
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/response-normalizer.ts` (new)
- `src/international-space-bar-server/openresponses/response-normalizer.test.ts` (new)
