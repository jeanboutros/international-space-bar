# isb-0080: Add `ResponseStream` class

| Field      | Value              |
| ---------- | ------------------ |
| Type       | `feature`          |
| Priority   | `high`             |
| Status     | `not-started`      |
| Epic       | isb-epic-011       |
| Depends on | isb-0077, isb-0078 |

## Description

Implement the core `ResponseStream` class as described in design doc §3. This
is a pure TypeScript class (no `@nestjs` imports) that owns: response ID
generation, sequence numbering, output-item indexing, usage accumulation,
`.parse()`-validated event emission via `ctx` methods, and the `run(blocks)`
orchestrator with abort-signal and error-boundary handling.

## Files affected

- `src/international-space-bar-server/openresponses/response-stream.ts` — new file: `ResponseStream` class with `StreamContext`, event helpers, `run()` method

## Acceptance criteria

- [ ] AC-1: `ResponseStream` is exported, takes `ResponseStreamConfig` + `AbortSignal`
- [ ] AC-2: `ctx` exposes: `emit`, `emitDelta`, `recordOutputItem`, `addUsage`, `seq` (auto-incrementing)
- [ ] AC-3: `run(blocks)` iterates blocks, catches errors, emits `response.completed` or `response.incomplete`/`response.failed`
- [ ] AC-4: Every emitted event is `.parse()`-validated against its Zod schema
- [ ] AC-5: No `@nestjs/*` imports in the file
- [ ] AC-6: `pnpm check` exits 0
