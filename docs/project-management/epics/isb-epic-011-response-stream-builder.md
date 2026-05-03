# isb-epic-011: Response Stream Builder

| Field      | Value                                                               |
| ---------- | ------------------------------------------------------------------- |
| Priority   | `high`                                                              |
| Status     | `planning`                                                          |
| Created    | 2026-05-03                                                          |
| Design doc | [docs/response-stream-builder.md](../../response-stream-builder.md) |
| Tickets    | isb-0074 – isb-0076 (Phase A), isb-0077 – isb-0089 (Phase B)        |
| Reviews    | See [Reviews](#reviews) section below                               |

## Summary

Replace the hand-built streaming event construction in `PingPongRuntimeService`
with a composable `ResponseStream` class and block-based architecture. Every
production runtime becomes a LangGraph `CompiledStateGraph` consumed by a single
adapter (`langGraphBlocks`), eliminating duplicated `ResponseResource` construction,
hand-counted sequence numbers, and manual output indices.

## Scope

- Add `ResponseStreamConfig` to `AgentInvokeRequest`
- Populate config defaults in `ResponsesService`
- Implement `ResponseStream` class (state, event methods, run, accumulators)
- Implement block factories (`messageBlock`, `reasoningBlock`, `functionCallBlock`)
- Add `wrapAsGraph` helper and `langGraphBlocks` LangGraph adapter
- Refactor gateway to use `ResponsesService` (DRY)
- Refactor `PingPongRuntimeService` to use ResponseStream
- Delete `_old` method entirely
- Widen item shapes for `"incomplete"` status
- Add `responseIncompleteStreamingEventSchema` to `ResponseStreamEvent` union
- Update AGENTS.md import table to reflect `@langchain/*` usage
- Document echo-field defaults

## Pre-requisite tickets (from Phase A flags)

| ID       | Title                                                           | Priority | Blocking |
| -------- | --------------------------------------------------------------- | -------- | -------- |
| isb-0074 | Refactor gateway to delegate through ResponsesService (DRY)     | medium   | no       |
| isb-0075 | Update AGENTS.md import table for @langchain/\* in server layer | low      | no       |
| isb-0076 | Document echo-field defaults for ResponseStreamConfig           | medium   | no       |

## Implementation tickets (Phase B)

| ID       | Title                                                          | Priority | Depends on                             |
| -------- | -------------------------------------------------------------- | -------- | -------------------------------------- |
| isb-0077 | Add `responseIncompleteStreamingEventSchema` to union          | high     | —                                      |
| isb-0078 | Widen `AgentInvokeRequest` with `config: ResponseStreamConfig` | high     | —                                      |
| isb-0079 | Populate `config` defaults in `ResponsesService`               | high     | isb-0078                               |
| isb-0080 | Add `ResponseStream` class                                     | high     | isb-0077, isb-0078                     |
| isb-0081 | Add `messageBlock` factory                                     | high     | isb-0080                               |
| isb-0082 | Add `reasoningBlock` factory                                   | medium   | isb-0080                               |
| isb-0083 | Add `functionCallBlock` factory                                | medium   | isb-0080                               |
| isb-0084 | Add `wrapAsGraph` helper                                       | high     | —                                      |
| isb-0085 | Add `langGraphBlocks` adapter                                  | high     | isb-0081, isb-0082, isb-0083, isb-0084 |
| isb-0086 | Refactor PingPong pong path to use `messageBlock`              | high     | isb-0081                               |
| isb-0087 | Replace `_old` with LangGraph runtime, delete `_old`           | high     | isb-0085                               |
| isb-0088 | Loosen item shapes for `"incomplete"` status                   | medium   | —                                      |
| isb-0089 | Update docs — cross-links, AGENTS.md, standards                | low      | isb-0087                               |

## Reviews

| Phase   | Round | Verdict   | File                                                                          |
| ------- | ----- | --------- | ----------------------------------------------------------------------------- |
| Phase A | 1     | SATISFIED | [isb-epic-011-phase-a-round-1.md](../reviews/isb-epic-011-phase-a-round-1.md) |
| Phase B | 1     | APPROVED  | [isb-epic-011-phase-b-round-1.md](../reviews/isb-epic-011-phase-b-round-1.md) |
