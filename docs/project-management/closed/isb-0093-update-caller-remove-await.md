# isb-0093: Update PingPongRuntimeService caller to pass generator directly

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-013 |
| Type         | `feature`    |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `high`       |
| Created      | 2026-05-03   |
| Completed    | —            |
| Dependencies | isb-0092     |

## Background

After isb-0092 converts `langGraphBlocks` to an async generator, the caller must be updated: remove `await` and pass the generator directly to `rs.run()`.

## Description

Replace:

```typescript
const blocks = await langGraphBlocks(graph, input);
yield * rs.run(blocks);
```

With:

```typescript
yield * rs.run(langGraphBlocks(graph, input));
```

## Acceptance Criteria

- [ ] AC-1: `const blocks = await langGraphBlocks(...)` replaced with direct pass
- [ ] AC-2: Separate `yield* rs.run(blocks)` line removed (merged into single line)
- [ ] AC-3: Ollama-unreachable fallback path (`rs.run([messageBlock("pong")])`) unchanged
- [ ] AC-4: `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/ping-pong-runtime.service.ts`

## Definition of Done

- `pnpm check` exits 0
- No `await langGraphBlocks` call remains in the file
