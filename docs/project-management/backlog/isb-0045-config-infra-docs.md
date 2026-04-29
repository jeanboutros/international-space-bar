# isb-0045: Documentation for server operation

| Field | Value |
|-------|-------|
| Epic | isb-epic-009 |
| Status | `backlog` |
| Assignee | Docs Writer |
| Priority | `medium` |
| Created | 2026-04-29 |
| Completed | — |
| Dependencies | isb-0039, isb-0040, isb-0041, isb-0042, isb-0043 |

## Description

Create comprehensive documentation for running the ISB server. Covers entry points, environment selection, config file resolution, secret store selection, config file structure, and known limitations.

## Acceptance Criteria

- [ ] New file `docs/running-the-server.md` with sections:
  - Quick start
  - Entry points (`pnpm dev:server`, `pnpm start:server`)
  - Environment selection (`--environment`/`-e`, `ISB_PROJECT_ENVIRONMENT`)
  - Config file resolution (`--config`/`-c`, `ISB_CONFIG_PATH`, default)
  - Config file structure (annotated example from `config.dev.yaml`)
  - Secrets — `SECRET[xxx]` pattern explanation
  - Secret store selection (`--secret-store`)
  - `.env` file usage
  - Known limitations (array secret resolution, main.ts port disconnect)
- [ ] `.env.example` updated with `ISB_CONFIG_PATH` entry (if not already done by isb-0041)
- [ ] `AGENTS.md` commands table updated with note about CLI args and link to full docs
- [ ] `AGENTS.md` project structure updated to mention `application-config/`
- [ ] All cross-references link correctly
- [ ] `pnpm check` exits 0

## Files Affected

- `docs/running-the-server.md` — new
- `.env.example` — update (if needed)
- `AGENTS.md` — update commands table and project structure

## Comments

Documentation plan from Docs Planner. Depends on all code tickets being complete. Match existing doc style (terse, bullet points, tables).
