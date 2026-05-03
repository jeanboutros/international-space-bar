# isb-0099 — Add type-safe event parser for streamEvents

| Field      | Value                                   |
| ---------- | --------------------------------------- |
| ID         | isb-0099                                |
| Status     | backlog                                 |
| Priority   | medium                                  |
| Epic       | —                                       |
| Source     | Challenger review isb-epic-013 (obs. 3) |
| Depends on | —                                       |

## Context

`langGraphBlocks` has ~40 pre-existing `@typescript-eslint/no-unsafe-*` lint
errors because `graph.streamEvents()` returns `data: any`. All member accesses
on event data (`data.chunk.content`, `data.chunk.tool_call_chunks`, etc.) are
untyped.

## Acceptance criteria

1. Create a typed event discriminator (e.g. `parseStreamEvent(raw)`) that
   narrows `data` based on the `event` field using Zod or manual type guards
2. Replace all raw `data.*` accesses in `langGraphBlocks` with the typed result
3. All 40 `no-unsafe-*` errors in `lang-graph-blocks.ts` are resolved
4. All existing tests continue to pass
5. `pnpm check` passes on the modified file

## Notes

- LangGraph's `streamEvents` v2 schema is documented; use Context7 to fetch
  the exact event shapes
- Consider a `StreamEvent` discriminated union type with variants for
  `on_chat_model_stream`, `on_chat_model_end`, `on_tool_start`, etc.
- This eliminates the single largest source of lint errors in the codebase
