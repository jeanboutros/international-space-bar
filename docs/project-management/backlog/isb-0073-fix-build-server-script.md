# isb-0073: Fix build:server script in package.json

| Field | Value |
|-------|-------|
| Epic | — (standalone bug fix) |
| Type | `bug` |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `medium` |
| Created | 2026-05-01 |
| Completed | — |
| Dependencies | none |

## Background

The `build:server` script in `package.json` is a broken hybrid — it runs `tsx watch` (a dev-time file watcher / runtime) but passes `--format esm --outDir dist` which are `tsup` flags, not `tsx` flags. Running `pnpm build:server` does not produce a production build. The README commands table lists `pnpm build:server` as the "Build" command, so any user or CI pipeline trying to build for production gets a broken result. Flagged by Engineer in Phase A.

## Description

Fix the `build:server` script so that it produces a valid production build of the NestJS server. The project already uses `tsup` as a dev dependency (referenced in `AGENTS.md` and used elsewhere). The fix should replace the broken `tsx watch` invocation with a proper `tsup` build command that outputs ESM to `dist/`.

## Technical Context

- **Current script** (line 13 of `package.json`):
  ```json
  "build:server": "tsx watch src/international-space-bar-server/main.ts --format esm --outDir dist"
  ```
- **Problem**: `tsx watch` is a dev-time TypeScript runner with file-watching; it does not accept `--format` or `--outDir` flags. Those are `tsup` CLI flags. The command either ignores the flags silently or errors, and never produces compiled output in `dist/`.
- **Expected fix**: Replace with a `tsup` invocation that compiles the server entry point to ESM in `dist/`. Example:
  ```json
  "build:server": "tsup src/international-space-bar-server/main.ts --format esm --out-dir dist"
  ```
  The existing `tsup` configuration in `kubb.config.ts` or a new minimal `tsup.config.ts` may be referenced, but the simplest fix is an inline CLI invocation.
- **Related scripts**:
  - `"dev:server"` uses `tsx watch` correctly (for dev)
  - `"start:server"` uses `node dist/main.js` — expects `dist/` to contain the build output
  - `"build"` aliases to `pnpm build:server` — so the top-level `build` command is also broken

## Acceptance Criteria

- [ ] **AC-1**: `build:server` script in `package.json` produces a valid production build — compiled JS output appears in `dist/`
- [ ] **AC-2**: `pnpm build:server` exits 0
- [ ] **AC-3**: The built output can be started with `pnpm start:server` (or `node dist/main.js`) without error — basic smoke: the process starts and binds to a port
- [ ] **AC-4**: If the README commands table description for `build:server` needs updating, it is updated
- [ ] **AC-5**: `pnpm check` exits 0

## Files Affected

- `package.json` — replace the broken `build:server` script with a working `tsup` build command that outputs ESM to `dist/`
- `README.md` (conditional) — update commands table if the script name or description changes

## Test Expectations

- **Smoke test**: Run `pnpm build:server` and verify `dist/` contains at least one `.js` file
- **Start test**: Run `node dist/main.js` with required env vars and verify the process starts (binds to port, prints startup log) before being killed
- No unit tests needed — this is a build script fix

## Definition of Done

- `pnpm build:server` exits 0
- `dist/` contains compiled `.js` output for the server entry point
- `pnpm start:server` successfully starts the built server (manual verification)
- `pnpm check` exits 0
- No unrelated files modified

## Comments

Non-blocking flag from Engineer (Phase A, 2026-05-01). The `tsx watch` + tsup flags mashup suggests a copy-paste error when the dev script was adapted for the build script.
