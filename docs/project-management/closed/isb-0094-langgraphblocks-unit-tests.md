# isb-0094: Unit tests for refactored langGraphBlocks async generator

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-013 |
| Type         | `feature`    |
| Status       | `backlog`    |
| Assignee     | Tester       |
| Priority     | `medium`     |
| Created      | 2026-05-03   |
| Completed    | —            |
| Dependencies | isb-0092     |

## Background

The refactored `langGraphBlocks` (isb-0092) introduces a concurrent producer pattern. These concurrency semantics require thorough testing. Flagged by Engineer + Tech Validator in Phase A.

## Description

Create `lang-graph-blocks.test.ts` with 16 test cases covering return type, block production, streaming timing, error propagation, abort signal handling, and queue cleanup.

## Acceptance Criteria

- [ ] AC-1: New test file at `src/international-space-bar-server/openresponses/lang-graph-blocks.test.ts`
- [ ] AC-2: Tests verify return type is `AsyncGenerator` (not Promise)
- [ ] AC-3: Tests verify text events produce `messageBlock`
- [ ] AC-4: Tests verify reasoning events produce `reasoningBlock` (with `hasReasoning: true`)
- [ ] AC-5: Tests verify tool call chunks produce `functionCallBlock`
- [ ] AC-6: Tests verify multi-block sequences in correct order
- [ ] AC-7: Tests verify first block is yielded before stream completes (timing test)
- [ ] AC-8: Tests verify error in `streamEvents` propagates to consumer
- [ ] AC-9: Tests verify all open queues ended on producer error
- [ ] AC-10: Tests verify abort signal causes early termination
- [ ] AC-11: Tests verify `on_chat_model_end` closes open queues
- [ ] AC-12: Tests verify empty stream produces no blocks
- [ ] AC-13: Mock helpers defined locally (not exported)
- [ ] AC-14: `pnpm test` passes
- [ ] AC-15: 100% branch coverage on `langGraphBlocks`

## Files Affected

- `src/international-space-bar-server/openresponses/lang-graph-blocks.test.ts` (new file)

## Definition of Done

- `pnpm check` exits 0
- `pnpm test` passes
- All 16 test scenarios have passing test cases
