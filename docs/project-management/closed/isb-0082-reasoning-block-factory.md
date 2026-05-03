# isb-0082: Add `reasoningBlock` factory

| Field      | Value         |
| ---------- | ------------- |
| Type       | `feature`     |
| Priority   | `medium`      |
| Status     | `not-started` |
| Epic       | isb-epic-011  |
| Depends on | isb-0080      |

## Description

Implement the `reasoningBlock` factory (design doc §5.2) with static and
`fromQueue` variants. Emits reasoning content-part events with summary text
deltas.

## Files affected

- `src/international-space-bar-server/openresponses/blocks/reasoningBlock.ts` — new file: `reasoningBlock()` factory

## Acceptance criteria

- [ ] AC-1: `reasoningBlock("summary")` emits reasoning content events with correct part structure
- [ ] AC-2: `reasoningBlock.fromQueue(queue)` consumes `AsyncQueue<Delta>` for incremental reasoning deltas
- [ ] AC-3: `pnpm check` exits 0
