# isb-0019: Protocol mapper service (OpenResponses ↔ internal events)

| Field | Value |
|-------|-------|
| Epic | isb-epic-004 |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `high` |
| Created | 2026-04-28 |
| Dependencies | isb-0018 |

## Description

Create a protocol mapper service that translates between OpenResponses request/response shapes and internal `AgentInvokeRequest`/`AgentRuntimeEvent` types. This decouples the OpenResponses wire format from the agent runtime internals.

## Acceptance Criteria

- [ ] Mapper converts `CreateResponseBody` → `AgentInvokeRequest`
- [ ] Mapper converts `AgentRuntimeEvent` stream → OpenResponses SSE events
- [ ] Mapper converts `AgentInvokeResult` → `ResponseResource`
- [ ] Input extraction handles both string and array input formats
- [ ] Unit tests cover all mapping directions
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/protocol-mapper.service.ts` (new)
- `src/international-space-bar-server/openresponses/protocol-mapper.service.test.ts` (new)
