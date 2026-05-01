# isb-0072: Update technical-stack.md to remove stale tui/ references

| Field | Value |
|-------|-------|
| Epic | — (standalone documentation ticket) |
| Type | `feature` |
| Status | `backlog` |
| Assignee | Docs Writer |
| Priority | `medium` |
| Created | 2026-05-01 |
| Completed | — |
| Dependencies | none |

## Background

The TUI layer (`tui/`) was archived to `archive/legacy-ink-tui/` but `docs/technical-stack.md` — the authoritative architecture reference — still references it as an active layer. This causes confusion for anyone reading the architecture docs, as it implies the TUI is part of the active runtime. Additionally, the `international-space-bar-server/` NestJS layer (the actual outermost layer) is absent from the layered diagram. Flagged by Architect in Phase A.

## Description

Remove all `tui/` references from `docs/technical-stack.md` and add the `international-space-bar-server/` layer to the architecture diagram, imports table, and project structure tree so the document accurately reflects the current codebase.

## Technical Context

- **Current file**: `docs/technical-stack.md`
- **Current behaviour**:
  - The layered ASCII diagram (around line 161) includes `tui/` as the presentation layer
  - The "Allowed imports per layer" table (around line 183) has a `tui/` row
  - The project structure tree (around line 221) lists `tui/` as an active directory
  - The `international-space-bar-server/` NestJS layer is not shown in the layered diagram or imports table
- **Expected behaviour**:
  - `tui/` removed from all three locations
  - `international-space-bar-server/` added to the layered diagram as the outermost layer (above composition root)
  - `international-space-bar-server/` added to the imports table with its allowed imports (`interfaces/` via port contracts; NestJS framework only)
  - Project structure tree updated to show the server layer instead of `tui/`

## Acceptance Criteria

- [ ] **AC-1**: `tui/` removed from the layered architecture ASCII diagram
- [ ] **AC-2**: `tui/` row removed from the "Allowed imports per layer" table
- [ ] **AC-3**: `tui/` removed from the project structure tree
- [ ] **AC-4**: `international-space-bar-server/` added to the layered diagram as the outermost layer
- [ ] **AC-5**: `international-space-bar-server/` added to the imports table with allowed imports: `interfaces/` (via port contracts), NestJS framework only — consistent with `AGENTS.md`
- [ ] **AC-6**: `pnpm check` exits 0

## Files Affected

- `docs/technical-stack.md` — remove `tui/` from layered ASCII diagram (≈line 161), imports table (≈line 183), and project structure tree (≈line 221); add `international-space-bar-server/` to the layered diagram and imports table to match the architecture described in `AGENTS.md`

## Definition of Done

- `pnpm check` exits 0
- `tui/` does not appear anywhere in `docs/technical-stack.md` as an active layer
- `international-space-bar-server/` appears in the layered diagram and imports table
- No other files modified

## Comments

Non-blocking flag from Architect (Phase A, 2026-05-01). The `AGENTS.md` file already has the correct architecture — `docs/technical-stack.md` needs to be brought into alignment.
