# isb-0023: Map LangChain tool calls to internal event envelopes

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-005 |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `high`       |
| Created      | 2026-04-28   |
| Dependencies | isb-0022     |

## Description

Map LangChain `AIMessage` tool calls (function name, arguments, call ID) into stable internal event envelopes. These internal events are then mapped to OpenResponses `function_call` output items by the protocol mapper.

## Acceptance Criteria

- [ ] LangChain tool_calls array → internal ToolCallEvent envelopes
- [ ] Each event carries call_id, function name, arguments
- [ ] Streaming tool call argument deltas supported
- [ ] Internal events are framework-free (no LangChain or NestJS types)
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/response-normalizer.ts`
- `src/international-space-bar-server/openresponses/protocol-mapper.service.ts`
