# isb-0096: Update design doc status and response-stream-builder snippets

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

After implementation, design and architecture docs must reflect the implemented state.

## Description

Update design doc status from "Draft" to "Implemented" and update caller snippets in `docs/response-stream-builder.md` to show the new async generator pattern.

## Acceptance Criteria

- [ ] AC-1: Design doc status updated to `Implemented — 2026-05-xx`
- [ ] AC-2: Design doc includes implementing ticket references (isb-0092, isb-0093)
- [ ] AC-3: Any `await langGraphBlocks(...)` snippet in `docs/response-stream-builder.md` updated
- [ ] AC-4: No stale code samples remain
- [ ] AC-5: All internal cross-references valid
- [ ] AC-6: `pnpm check` exits 0

## Files Affected

- `docs/designs/isb-langgraph-streaming-refactor.md`
- `docs/response-stream-builder.md`

## Definition of Done

- Design doc reads "Implemented" with date
- No stale `await langGraphBlocks()` snippets in docs
