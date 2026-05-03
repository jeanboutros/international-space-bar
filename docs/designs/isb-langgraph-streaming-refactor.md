# Design: langGraphBlocks Real-Time Streaming Refactor

> **Advisory:** isb-adv-0003  
> **Status:** Implemented — 2026-05-03  
> **Author:** Agent Zero  
> **Date:** 2026-05-03  
> **Implementing tickets:** isb-0092, isb-0093

---

## 1. Problem Statement

`langGraphBlocks` is currently an `async function` returning `Promise<Block[]>`. It eagerly buffers the entire LLM stream — iterating through all `graph.streamEvents()` events, populating and `.end()`ing all `AsyncQueue` instances — before returning the completed array to the caller.

The caller in `ping-pong-runtime.service.ts` does:

```typescript
const blocks = await langGraphBlocks(graph, input);
yield * rs.run(blocks);
```

This means `ResponseStream.run()` only receives blocks **after** LLM generation is fully complete. SSE events arrive as a burst rather than streaming in real-time. This defeats the purpose of the entire streaming architecture.

## 2. Current Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌────────────────┐
│  graph.streamEvents │ ──▶ │  langGraphBlocks()   │ ──▶ │ ResponseStream │
│  (async iterable)   │     │  (await entire stream│     │   .run(blocks) │
│                     │     │   then return Block[])│     │                │
└─────────────────────┘     └──────────────────────┘     └────────────────┘
         real-time ──────▶         ❌ buffered ──────▶        burst output
```

### Why this is a problem

- **Latency**: First SSE byte arrives only after the LLM finishes generating the entire response
- **Memory**: The full response text is buffered in `AsyncQueue` buffers before any consumer reads it
- **UX**: Users see no output during generation — then everything appears at once
- **Architecture violation**: `ResponseStream.run()` already accepts `AsyncIterable<Block>`, proving the permanent design intends real-time streaming

## 3. Proposed Solution

Convert `langGraphBlocks` from `async function → Promise<Block[]>` to `async function*` → `AsyncGenerator<Block>` using a **concurrent producer** pattern.

### Target architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌────────────────┐
│  graph.streamEvents │ ──▶ │  langGraphBlocks()   │ ──▶ │ ResponseStream │
│  (async iterable)   │     │  (async generator,   │     │   .run(blocks) │
│                     │     │   yields blocks as   │     │                │
│                     │     │   boundaries open)   │     │                │
└─────────────────────┘     └──────────────────────┘     └────────────────┘
         real-time ──────▶         real-time ──────▶        real-time
```

## 4. Concurrency Design

### The deadlock problem

A naive conversion (just replacing `blocks.push(...)` with `yield`) creates a deadlock:

1. `langGraphBlocks` yields a Block
2. `ResponseStream.run()` calls `yield* block(ctx)` — which reads from the block's `AsyncQueue`
3. But `langGraphBlocks` is paused at the `yield` — it can't push more deltas to the queue
4. **Deadlock**: consumer waits for deltas, producer waits for consumer to pull the next block

### The solution: concurrent producer via block channel

```typescript
export async function* langGraphBlocks(
    graph: StreamableGraph,
    input: readonly BaseMessage[],
    options?: LangGraphBlocksOptions,
): AsyncGenerator<Block> {
    const blockChannel = new AsyncQueue<Block>();

    // Concurrent producer — runs independently of the consumer
    const producer = (async () => {
        let currentMessageQueue: AsyncQueue<Delta> | null = null;
        let currentReasoningQueue: AsyncQueue<Delta> | null = null;
        const toolQueues = new Map<string, AsyncQueue<Delta>>();

        try {
            // ... existing event loop logic, but:
            // - Instead of blocks.push(block), do blockChannel.push(block)
            // - AsyncQueues for deltas are still fed inline
            // - Check abortSignal on each iteration
        } finally {
            // End ALL open queues — prevents consumer deadlock if producer errors
            currentMessageQueue?.end();
            currentReasoningQueue?.end();
            for (const q of toolQueues.values()) {
                q.end();
            }
            blockChannel.end();
        }
    })();

    // Yield blocks as they arrive from the producer
    try {
        for await (const block of blockChannel) {
            yield block;
        }
    } finally {
        // Swallow producer errors here — consumer error takes priority.
        // Producer errors are logged inside the producer itself.
        await producer.catch(() => {});
    }
}
```

### Why this works

- The **producer** (IIFE) runs as a detached microtask — it drives `graph.streamEvents()` and pushes both blocks to the channel AND deltas to per-block queues concurrently
- The **generator** yields blocks one at a time as they appear in `blockChannel`
- `ResponseStream.run()` processes each block sequentially (`yield* block(ctx)`), reading from the block's delta queue
- The producer continues pushing deltas to the current block's queue while the consumer reads them — no deadlock because they run concurrently (not sequentially gated by yield/pull)

### Data flow timeline

```
t=0   Producer starts, subscribes to streamEvents
t=1   First on_chat_model_stream chunk → creates messageQueue, pushes messageBlock to blockChannel
t=2   Generator yields messageBlock to ResponseStream.run()
t=3   ResponseStream calls yield* messageBlock(ctx) → starts reading from messageQueue
t=4   Producer pushes delta to messageQueue → ResponseStream yields SSE text delta event
t=5   ... (real-time streaming) ...
t=N   on_chat_model_end → producer calls messageQueue.end()
t=N+1 messageBlock generator finishes → ResponseStream advances to next block
t=N+2 If more blocks exist → repeat; else blockChannel.end() → generator finishes
```

## 5. Error Handling

| Scenario                                   | Behaviour                                                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `streamEvents` throws                      | Producer catches, ends all open queues, ends blockChannel. Error propagates via `await producer` in `finally`                |
| AbortSignal fires                          | Producer checks signal in loop, ends queues early. `ResponseStream.run()` checks signal between blocks                       |
| Consumer abandons iteration (break/return) | Generator's `finally` block calls `await producer` — producer may still be running but will finish naturally or be collected |

## 6. Files Affected

| File                                                                            | Change                                             |
| ------------------------------------------------------------------------------- | -------------------------------------------------- |
| `src/international-space-bar-server/openresponses/lang-graph-blocks.ts`         | Refactor signature + body                          |
| `src/international-space-bar-server/openresponses/ping-pong-runtime.service.ts` | Remove `await`, pass generator directly            |
| `src/international-space-bar-server/openresponses/lang-graph-blocks.test.ts`    | **New file** — unit tests for refactored generator |

## 7. Interface Changes

### Before

```typescript
export async function langGraphBlocks(
    graph: StreamableGraph,
    input: readonly BaseMessage[],
    options?: LangGraphBlocksOptions,
): Promise<Block[]>;
```

### After

```typescript
export async function* langGraphBlocks(
    graph: StreamableGraph,
    input: readonly BaseMessage[],
    options?: LangGraphBlocksOptions,
): AsyncGenerator<Block>
```

### Caller change

```diff
- const blocks = await langGraphBlocks(graph, input);
- yield* rs.run(blocks);
+ yield* rs.run(langGraphBlocks(graph, input));
```

## 8. AsyncQueue Reuse

The existing `AsyncQueue` class is reused for two purposes:

1. **Delta queues** (existing) — feed text chunks to block factories
2. **Block channel** (new) — feed Block instances to the generator

No changes to `AsyncQueue` are required. Its push/pull/end semantics already provide the concurrent channel behaviour needed.

## 9. Acceptance Criteria

1. `langGraphBlocks` returns `AsyncGenerator<Block>` (not `Promise<Block[]>`)
2. First SSE event is emitted before LLM generation completes (provable with a slow model or mock)
3. `ResponseStream.run()` caller passes the generator directly (no `await`)
4. Error in `streamEvents` propagates to `ResponseStream.run()` and emits `response.failed`
5. AbortSignal terminates streaming gracefully (emits `response.incomplete`)
6. All existing tests pass (or are updated for new return type)
7. `pnpm check` passes
8. All new/modified public symbols have JSDoc with `@param`, `@returns`, `@example`

## 10. Out of Scope

- `ResponseStream` changes (already supports `AsyncIterable<Block>`)
- Block factory changes (already work with `AsyncQueue`)
- SSE frame writer changes
- AbortSignal propagation to `graph.streamEvents()` options (separate ticket isb-0011)

## 11. Risk Assessment

| Risk                                            | Likelihood | Impact                | Mitigation                                                          |
| ----------------------------------------------- | ---------- | --------------------- | ------------------------------------------------------------------- |
| Unhandled promise rejection from producer IIFE  | Medium     | HIGH — silent failure | `await producer` in finally + error forwarding                      |
| Memory leak if consumer abandons early          | Low        | Medium                | Producer finishes naturally when streamEvents ends; queues are GC'd |
| Race condition on queue.end() vs queue.push()   | Low        | Medium                | AsyncQueue's internal state machine is synchronous — no race        |
| Test flakiness from timing-dependent assertions | Medium     | Low                   | Use deterministic mock graphs with controlled chunk timing          |
