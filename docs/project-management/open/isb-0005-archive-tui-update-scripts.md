# isb-0005: Archive TUI + update scripts

| Field | Value |
|-------|-------|
| Epic | isb-epic-001 |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `high` |
| Created | 2026-04-28 |
| Completed | — |
| Dependencies | isb-0001 |

## Description

Archive the legacy Ink TUI by moving it out of the source tree into `archive/legacy-ink-tui/`. Remove TUI-related dependencies from `package.json`. Update npm scripts to reflect the new NestJS server as the primary runtime. Add the test runner script.

## Acceptance Criteria

- [ ] `src/international-space-bar/tui/` moved to `archive/legacy-ink-tui/`
- [ ] `renderTui` import removed from `src/international-space-bar/main.ts` (or main.ts updated to not reference TUI)
- [ ] TUI dependencies removed from `package.json`: `ink`, `ink-text-input`, `react`, `zustand`, `@types/react` (and any other TUI-only deps)
- [ ] `package.json` scripts updated:
  - `dev` → `dev:server` (starts NestJS in dev mode)
  - `build` → `build:server` (builds the server)
  - `start` → `start:server` (runs the built server)
  - `test` script added: `node --import tsx --test 'src/**/*.test.ts'`
- [ ] Archived TUI files are not imported by any source under `src/`
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar/tui/` → `archive/legacy-ink-tui/` — move entire directory
- `src/international-space-bar/main.ts` — remove TUI import/usage
- `package.json` — remove TUI deps, rename scripts, add test script
- `pnpm-lock.yaml` — updated by pnpm after dependency removal

## PoC Snippets

```jsonc
// package.json scripts (after)
{
  "scripts": {
    "dev:server": "tsx watch src/international-space-bar-server/main.ts",
    "build:server": "tsup src/international-space-bar-server/main.ts --format esm --dts",
    "start:server": "node dist/main.js",
    "test": "node --import tsx --test 'src/**/*.test.ts'",
    "lint": "biome check --write . && eslint --fix .",
    "format": "biome format --write .",
    "check": "biome check --write . && eslint --fix ."
  }
}
```

## Comments

This ticket can run in parallel with isb-0002 and isb-0003 since they share only the isb-0001 dependency. The archive step should use `git mv` to preserve history.
