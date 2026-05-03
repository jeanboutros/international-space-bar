# isb-0021: Map OpenResponses input/instructions/previous_response_id to thread/session

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-004 |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `high`       |
| Created      | 2026-04-28   |
| Dependencies | isb-0020     |

## Description

Map OpenResponses request fields (`input`, `instructions`, `previous_response_id`) to an internal thread/session concept that LangGraph can consume. `previous_response_id` should chain conversations on the same thread.

## Acceptance Criteria

- [ ] `previous_response_id` maps to a consistent thread ID for LangGraph
- [ ] `instructions` are passed as system-level context
- [ ] `input` (string or array) is normalized to LangGraph message format
- [ ] Thread state persists across chained requests
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/protocol-mapper.service.ts`
- `src/international-space-bar-server/openresponses/director-runtime.service.ts`
