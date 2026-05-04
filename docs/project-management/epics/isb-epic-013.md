# isb-epic-013: langGraphBlocks Real-Time Streaming Refactor

| Field      | Value                                              |
| ---------- | -------------------------------------------------- |
| Priority   | `high`                                             |
| Status     | `closed`                                           |
| Created    | 2026-05-03                                         |
| Design doc | `docs/designs/isb-langgraph-streaming-refactor.md` |
| Advisory   | isb-adv-0003                                       |
| Tickets    | isb-0092, isb-0093, isb-0094, isb-0095, isb-0096   |

## Summary

Convert `langGraphBlocks` from an eager-buffering `async function → Promise<Block[]>` to a real-time `async function* → AsyncGenerator<Block>` using a concurrent producer pattern. This eliminates the latency bottleneck where all SSE events arrive as a burst after LLM generation completes, instead streaming them in real-time as LangGraph produces chunks.

## Scope

- Refactor `langGraphBlocks` signature and body to use a concurrent producer + block channel
- Update `PingPongRuntimeService.stream()` caller to pass the generator directly (no `await`)
- Comprehensive unit tests for the refactored generator (16 test cases)
- JSDoc documentation on all public symbols in affected files
- Update design doc status and caller snippets in `docs/response-stream-builder.md`

## Acceptance criteria (from design doc §9)

1. `langGraphBlocks` returns `AsyncGenerator<Block>` (not `Promise<Block[]>`)
2. First SSE event is emitted before LLM generation completes (provable with a slow model or mock)
3. `ResponseStream.run()` caller passes the generator directly (no `await`)
4. Error in `streamEvents` propagates to `ResponseStream.run()` and emits `response.failed`
5. AbortSignal terminates streaming gracefully (emits `response.incomplete`)
6. All existing tests pass (or are updated for new return type)
7. `pnpm check` passes
8. All new/modified public symbols have JSDoc with `@param`, `@returns`, `@example`

## Dependency order

```
isb-0092 (core refactor)
  ├── isb-0093 (caller update) ── depends on isb-0092
  ├── isb-0094 (unit tests) ── depends on isb-0092
  ├── isb-0095 (JSDoc) ── depends on isb-0092, isb-0093
  └── isb-0096 (design doc update) ── depends on isb-0092, isb-0093
```

## Reviews

- [Phase A Round 1](../reviews/isb-epic-013-phase-a-round-1.md) — SATISFIED (2026-05-03)
