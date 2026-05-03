# isb-0086: Refactor PingPongRuntimeService pong path to use `messageBlock`

| Field      | Value         |
| ---------- | ------------- |
| Type       | `refactor`    |
| Priority   | `high`        |
| Status     | `not-started` |
| Epic       | isb-epic-011  |
| Depends on | isb-0081      |

## Description

Replace the hand-built `streamSimplePong` method in `PingPongRuntimeService`
with `ctx.run([messageBlock("pong")])`. This is the first concrete migration to
the block-based architecture. Wire-format output must remain identical so
existing compliance tests continue to pass.

## Files affected

- `src/international-space-bar-server/openresponses/ping-pong-runtime.service.ts` — replace `streamSimplePong` internals with `messageBlock("pong")`

## Acceptance criteria

- [ ] AC-1: `streamSimplePong` body replaced by `ctx.run([messageBlock("pong")])`
- [ ] AC-2: SSE wire format is identical to current output (compliance tests pass)
- [ ] AC-3: `_old` method is NOT yet deleted (that is isb-0087)
- [ ] AC-4: `pnpm check` exits 0
- [ ] AC-5: `pnpm test` exits 0
