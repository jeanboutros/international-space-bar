# isb-0092: Refactor langGraphBlocks to async generator with concurrent producer

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-013 |
| Type         | `feature`    |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `high`       |
| Created      | 2026-05-03   |
| Completed    | —            |
| Dependencies | none         |

## Background

`langGraphBlocks` is currently an `async function` returning `Promise<Block[]>`. It eagerly buffers the entire LLM stream before returning, causing all SSE events to arrive as a burst. Advisory isb-adv-0003. Design: `docs/designs/isb-langgraph-streaming-refactor.md`.

## Description

Convert `langGraphBlocks` to `async function*` returning `AsyncGenerator<Block>` using a concurrent producer IIFE + `AsyncQueue<Block>` as the block channel.

### Implementation steps

1. Change the function signature from `async function` to `async function*`
2. Replace the `blocks: Block[]` accumulator with `const blockChannel = new AsyncQueue<Block>()`
3. Move the `for await (const event of stream)` loop into an async IIFE assigned to `const producer`
4. In the IIFE, replace every `blocks.push(block)` with `blockChannel.push(block)`
5. In the IIFE's `finally`, end all open queues (message, reasoning, tool) AND `blockChannel.end()`
6. After the IIFE definition, `for await (const block of blockChannel) { yield block; }`
7. In the generator's `finally`, `await producer.catch(() => {})`
8. Remove the trailing `return blocks;`

## Acceptance Criteria

- [ ] AC-1: `langGraphBlocks` signature is `async function*` returning `AsyncGenerator<Block>`
- [ ] AC-2: Function uses a concurrent producer IIFE that pushes blocks to an `AsyncQueue<Block>` channel
- [ ] AC-3: Producer's `finally` block ends ALL open queues: `currentMessageQueue`, `currentReasoningQueue`, all entries in `toolQueues`, and `blockChannel`
- [ ] AC-4: Generator's `finally` block calls `await producer.catch(() => {})`
- [ ] AC-5: All existing event-handling logic is preserved — only the push target changes
- [ ] AC-6: The `return blocks;` statement is removed
- [ ] AC-7: `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/lang-graph-blocks.ts`

## Definition of Done

- `pnpm check` exits 0
- `langGraphBlocks` compiles as `AsyncGenerator<Block>`
- No `Promise<Block[]>` return type remains
- `AsyncQueue` class is unchanged
- Block factories and `ResponseStream` are unchanged
