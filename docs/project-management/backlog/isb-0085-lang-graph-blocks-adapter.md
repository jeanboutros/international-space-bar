# isb-0085: Add `langGraphBlocks` adapter

| Field      | Value                                  |
| ---------- | -------------------------------------- |
| Type       | `feature`                              |
| Priority   | `high`                                 |
| Status     | `not-started`                          |
| Epic       | isb-epic-011                           |
| Depends on | isb-0081, isb-0082, isb-0083, isb-0084 |

## Description

Implement the `langGraphBlocks` adapter (design doc §6) that subscribes to a
`CompiledStateGraph.streamEvents()` iterator, classifies each `StreamEvent`
into the correct block type, and yields `Block[]` for `ResponseStream.run()`.
Includes `AsyncQueue` for back-pressure and a `hasReasoning` predicate for
model-capability detection.

## Files affected

- `src/international-space-bar-server/openresponses/lang-graph-blocks.ts` — new file: `langGraphBlocks()` function, `AsyncQueue`, `hasReasoning` predicate

## Acceptance criteria

- [ ] AC-1: `langGraphBlocks(graph, input, config)` returns `Block[]` consumable by `ResponseStream.run()`
- [ ] AC-2: `on_llm_stream` events with text content produce `messageBlock.fromQueue` blocks
- [ ] AC-3: Reasoning events produce `reasoningBlock.fromQueue` blocks when `hasReasoning` is true
- [ ] AC-4: Tool-call events produce `functionCallBlock.fromQueue` blocks
- [ ] AC-5: `AsyncQueue` provides back-pressure between LangGraph events and block consumers
- [ ] AC-6: `pnpm check` exits 0
