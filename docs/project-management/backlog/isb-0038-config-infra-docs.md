# isb-0038: Documentation for server operation and config infrastructure

| Field | Value |
|-------|-------|
| Epic | isb-epic-008 |
| Status | `backlog` |
| Assignee | Docs Writer |
| Priority | `medium` |
| Created | 2026-04-29 |
| Completed | — |
| Dependencies | isb-0032, isb-0033, isb-0034, isb-0035, isb-0036 |

## Description

Create comprehensive documentation for running the server and update existing files to reflect the new config infrastructure. Covers entry points, environment selection, config file path override, secret store selection, config file structure, `SECRET[xxx]` patterns, and known limitations.

Corresponds to design doc Work Item 4.

## Acceptance Criteria

- [ ] New file `docs/running-the-server.md` created covering:
  - Application entry points (`main.ts`, `pnpm dev:server`, `pnpm start:server`)
  - Environment selection: `--environment dev` / `-e dev` / `ISB_PROJECT_ENVIRONMENT=dev`
  - Config file location: default `<cwd>/config.<env>.yaml`, overridable via `--config` / `ISB_CONFIG_PATH`
  - Config path precedence: CLI arg > env var > default
  - Secret store selection: defaults to `env`, overridable via `--secret-store`
  - Config file structure with annotated example
  - `SECRET[xxx]` pattern explanation
  - `.env` file usage (via `--env-file` in dev/start scripts)
  - Known limitation: `resolveConfigSecrets` does not traverse arrays
  - Note: `main.ts` port resolution from `process.env.PORT` is a pre-existing disconnect (out of scope)
- [ ] `.env.example` updated with `ISB_CONFIG_PATH` and any new env vars
- [ ] `AGENTS.md` commands table reviewed and updated if new run options warrant changes
- [ ] Array limitation in secret resolution is documented
- [ ] `pnpm check` exits 0

## Files Affected

- `docs/running-the-server.md` — new file: comprehensive server operation documentation
- `.env.example` — update: add `ISB_CONFIG_PATH` and document new env vars
- `AGENTS.md` — review and update commands table if needed

## PoC Snippets

N/A — documentation ticket.

## Comments

Depends on all five code tickets so documentation reflects the final implemented behaviour.
