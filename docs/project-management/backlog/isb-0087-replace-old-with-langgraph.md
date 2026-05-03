# isb-0087: Replace `_old` with LangGraph runtime, delete `_old`

| Field      | Value         |
| ---------- | ------------- |
| Type       | `refactor`    |
| Priority   | `high`        |
| Status     | `not-started` |
| Epic       | isb-epic-011  |
| Depends on | isb-0085      |

## Description

Delete the `_old` streaming method from `PingPongRuntimeService` entirely.
Replace it with a new implementation that uses `wrapAsGraph` to wrap the pong
callable and `langGraphBlocks` to produce blocks consumed by `ResponseStream`.
This completes the migration from hand-built streaming to the block-based
LangGraph architecture.

## Files affected

- `src/international-space-bar-server/openresponses/ping-pong-runtime.service.ts` — delete `_old`, implement LangGraph-based streaming path

## Acceptance criteria

- [ ] AC-1: `_old` method is completely removed from the file
- [ ] AC-2: New streaming path uses `wrapAsGraph` + `langGraphBlocks` + `ResponseStream.run()`
- [ ] AC-3: SSE wire format is identical to previous output (compliance tests pass)
- [ ] AC-4: No dead code remains (unused imports, unreachable branches)
- [ ] AC-5: `pnpm check` exits 0
- [ ] AC-6: `pnpm test` exits 0
