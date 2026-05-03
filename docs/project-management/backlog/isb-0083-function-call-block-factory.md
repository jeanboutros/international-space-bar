# isb-0083: Add `functionCallBlock` factory

| Field      | Value         |
| ---------- | ------------- |
| Type       | `feature`     |
| Priority   | `medium`      |
| Status     | `not-started` |
| Epic       | isb-epic-011  |
| Depends on | isb-0080      |

## Description

Implement the `functionCallBlock` factory (design doc §5.3) with a `fromQueue`
variant. Tracks `call_id`, emits function-call argument deltas, and records the
completed function-call output item.

## Files affected

- `src/international-space-bar-server/openresponses/blocks/functionCallBlock.ts` — new file: `functionCallBlock.fromQueue()` factory

## Acceptance criteria

- [ ] AC-1: `functionCallBlock.fromQueue(queue, { name, callId })` emits argument deltas and function-call-done
- [ ] AC-2: `call_id` is tracked and included in the completed item
- [ ] AC-3: `ctx.recordOutputItem` called with the completed function-call shape
- [ ] AC-4: `pnpm check` exits 0
