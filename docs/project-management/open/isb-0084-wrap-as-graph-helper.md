# isb-0084: Add `wrapAsGraph` helper

| Field      | Value         |
| ---------- | ------------- |
| Type       | `feature`     |
| Priority   | `high`        |
| Status     | `not-started` |
| Epic       | isb-epic-011  |
| Depends on | —             |

## Description

Implement the `wrapAsGraph` helper (design doc §7) that takes any
`(input, config?) => AsyncGenerator<StreamEvent>` callable and wraps it in a
trivial `start → llm → end` `CompiledStateGraph`. This lets non-LangGraph
runtimes (like PingPong) participate in the `langGraphBlocks` adapter without
building a real graph.

## Files affected

- `src/international-space-bar-server/openresponses/wrap-as-graph.ts` — new file: `wrapAsGraph()` function returning `CompiledStateGraph`

## Acceptance criteria

- [ ] AC-1: `wrapAsGraph(fn)` returns a `CompiledStateGraph` with `streamEvents()` support
- [ ] AC-2: The graph has a trivial `start → llm → end` topology
- [ ] AC-3: Events from the wrapped callable appear as LangGraph `on_llm_stream` events
- [ ] AC-4: `pnpm check` exits 0
