# isb-0024: Map ToolMessage results to OpenResponses function_call_output

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-005 |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `high`       |
| Created      | 2026-04-28   |
| Dependencies | isb-0023     |

## Description

Map LangChain `ToolMessage` results back into internal event envelopes and then to OpenResponses `function_call_output` items. Handle both string and structured tool outputs.

## Acceptance Criteria

- [ ] ToolMessage → internal ToolResultEvent → OpenResponses `function_call_output`
- [ ] String and structured outputs both handled
- [ ] call_id links tool result to original tool call
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/response-normalizer.ts`
- `src/international-space-bar-server/openresponses/protocol-mapper.service.ts`
