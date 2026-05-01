# isb-0071: Fix README inaccuracies and add migration note

| Field | Value |
|-------|-------|
| Epic | — (standalone documentation ticket) |
| Type | `feature` |
| Status | `backlog` |
| Assignee | Docs Writer |
| Priority | `high` |
| Created | 2026-05-01 |
| Completed | — |
| Dependencies | none |

## Background

A Phase A review of `README.md` identified several factual inaccuracies that accumulated as the codebase evolved. The README is the project's front door — incorrect model strings, wrong event type names, and stale descriptions erode trust and waste time for anyone onboarding or integrating with the server. These findings were validated by the Tech Validator across Architect and Engineer reviews.

## Description

Fix all validated inaccuracies in `README.md` discovered during the Phase A documentation review. The README currently contains an incorrect OpenCode model string, event type names missing their `response.` prefix, an overstated auth guard description, a misleading logging table entry, a config example missing `version: 1`, an unannotated CORS flag, and an incomplete composition root file list. Additionally, a migration note is needed to explain the progressive absorption of the core runtime into the server layer.

## Technical Context

- **Current file**: `README.md` (root of repository)
- **Current behaviour**: Several sections contain information that no longer matches the implementation:
  - Quick start section shows `opencode --model isb/pong` but the correct model string in the provider config is `international-space-bar/isb-ping`
  - "What it does" section lists event types without the `response.` prefix (e.g. `output_item.added` instead of `response.output_item.added`)
  - Auth guard section claims both `401` and `403` but the guard only returns `401 Unauthorized`
  - Logging table lists `PinoLoggerService` as a destination for "HTTP server logging" — `PinoLoggerService` is the bridge, not the destination; actual output goes to `stdout + app.log`
  - Config YAML example is missing `version: 1` as the first key
  - `enableCors: true` has no annotation that it is dev-only
  - Composition root file list shows `main.ts / app.ts / config.ts` but omits `logging.ts`
- **Expected behaviour**: All sections match the actual implementation; a migration note explains the `src/international-space-bar/` → server absorption plan

## Acceptance Criteria

- [ ] **AC-1**: OpenCode model string fixed — `opencode --model isb/pong` changed to `opencode --model international-space-bar/isb-ping` in the Quick start section
- [ ] **AC-2**: Event type names in the "What it does" section carry the `response.` prefix: `response.output_item.added`, `response.output_text.delta`, `response.output_text.done`, `response.content_part.done`, `response.output_item.done`
- [ ] **AC-3**: Auth guard description says `401 Unauthorized` only — the `403` claim is removed
- [ ] **AC-4**: Logging table: "HTTP server logging" destination changed from `PinoLoggerService` to the actual destination (`stdout + app.log`), with `PinoLoggerService` described as the bridge/purpose rather than the destination
- [ ] **AC-5**: Config YAML example includes `version: 1` as its first key
- [ ] **AC-6**: `enableCors: true` has a `# dev only` annotation (inline YAML comment)
- [ ] **AC-7**: Composition root file list includes `logging.ts` — reads `main.ts / app.ts / config.ts / logging.ts`
- [ ] **AC-8**: A migration note is added after the "Project structure" section explaining that `src/international-space-bar/` is being progressively absorbed into the server layer as integration tickets land
- [ ] **AC-9**: `pnpm check` exits 0

## Files Affected

- `README.md` — fix model string (Quick start), add `response.` prefix to event names (What it does), remove `403` from auth guard description (Key features), fix logging table destination (Key features), add `version: 1` to config example (Configuration), annotate `enableCors` as dev-only (Configuration), add `logging.ts` to composition root list (Project structure), add migration note after Project structure section

## Definition of Done

- `pnpm check` exits 0
- All 8 factual corrections are present in `README.md`
- Migration note exists between "Project structure" and "Documentation" sections
- No other files modified

## Comments

Findings validated by Tech Validator in Phase A (2026-05-01). All items are non-controversial factual corrections — no design decisions required.
