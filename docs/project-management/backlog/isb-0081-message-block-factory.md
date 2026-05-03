# isb-0081: Add `messageBlock` factory

| Field      | Value         |
| ---------- | ------------- |
| Type       | `feature`     |
| Priority   | `high`        |
| Status     | `not-started` |
| Epic       | isb-epic-011  |
| Depends on | isb-0080      |

## Description

Implement the `messageBlock` factory (design doc §5.1) in both static and
`fromQueue` variants. The static variant takes a string and emits a complete
message item in one shot. The `fromQueue` variant consumes an `AsyncQueue<Delta>`
for incremental text deltas. Both call `ctx.recordOutputItem` and `ctx.addUsage`.

## Files affected

- `src/international-space-bar-server/openresponses/blocks/messageBlock.ts` — new file: `messageBlock()` static + `messageBlock.fromQueue()` factory

## Acceptance criteria

- [ ] AC-1: `messageBlock("text")` returns a `Block` that emits item-created → content-delta(s) → content-done → item-done
- [ ] AC-2: `messageBlock.fromQueue(queue)` variant consumes `AsyncQueue<Delta>` and emits incremental deltas
- [ ] AC-3: Both variants call `ctx.recordOutputItem` and `ctx.addUsage`
- [ ] AC-4: `pnpm check` exits 0
