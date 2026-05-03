# isb-0095: JSDoc documentation for streaming public symbols

| Field        | Value              |
| ------------ | ------------------ |
| Epic         | isb-epic-013       |
| Type         | `feature`          |
| Status       | `backlog`          |
| Assignee     | Docs Writer        |
| Priority     | `low`              |
| Created      | 2026-05-03         |
| Completed    | —                  |
| Dependencies | isb-0092, isb-0093 |

## Background

Design doc AC §9.8 requires all public symbols to have JSDoc. Previous pipeline run (isb-epic-011) shipped zero JSDoc — this must not repeat.

## Description

Add comprehensive JSDoc to all public symbols in: `lang-graph-blocks.ts`, `response-stream.ts`, and all block factory files.

## Acceptance Criteria

- [ ] AC-1: `langGraphBlocks()` has JSDoc with `@param`, `@returns`, `@example`
- [ ] AC-2: `AsyncQueue<T>` class has JSDoc with `@example`
- [ ] AC-3: `LangGraphBlocksOptions` interface has JSDoc
- [ ] AC-4: `StreamableGraph` interface has JSDoc
- [ ] AC-5: `Block` type alias has JSDoc with `@example`
- [ ] AC-6: `ResponseStream` class has class-level JSDoc
- [ ] AC-7: `ResponseStream.run()` has `@param`, `@returns`, `@example`
- [ ] AC-8: `messageBlock()`, `reasoningBlock()`, `functionCallBlock()` each have JSDoc
- [ ] AC-9: `Delta` type and `AsyncQueue` interface in `blocks/` have JSDoc
- [ ] AC-10: No code logic changed — only JSDoc comments
- [ ] AC-11: `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/lang-graph-blocks.ts`
- `src/international-space-bar-server/openresponses/response-stream.ts`
- `src/international-space-bar-server/openresponses/blocks/message-block.ts`
- `src/international-space-bar-server/openresponses/blocks/reasoning-block.ts`
- `src/international-space-bar-server/openresponses/blocks/function-call-block.ts`
- `src/international-space-bar-server/openresponses/blocks/index.ts`

## Definition of Done

- `pnpm check` exits 0
- Every public symbol has complete JSDoc
