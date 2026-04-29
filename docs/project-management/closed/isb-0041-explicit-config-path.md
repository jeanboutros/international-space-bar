# isb-0041: Explicit config file path override

| Field | Value |
|-------|-------|
| Epic | isb-epic-009 |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `high` |
| Created | 2026-04-29 |
| Completed | — |
| Dependencies | isb-0040 |

## Description

Allow the config file path to be overridden via CLI arg (`--config`/`-c`) or environment variable (`ISB_CONFIG_PATH`), instead of always resolving from `process.cwd()`.

Precedence (highest to lowest):
1. `--config` / `-c` CLI arg (from injected `CliArgs`)
2. `ISB_CONFIG_PATH` env var
3. Default: `join(process.cwd(), \`config.\${env}.yaml\`)`

## Acceptance Criteria

- [ ] `loadConfig()` checks `cliArgs.config` first, then `process.env.ISB_CONFIG_PATH`, then default
- [ ] When `--config` is provided, uses that exact path (no env suffix appended)
- [ ] When `ISB_CONFIG_PATH` is provided, uses that exact path
- [ ] When neither is provided, falls back to `join(process.cwd(), \`config.\${env}.yaml\`)`
- [ ] `ConfigurationException` message on file-not-found mentions `--config` / `ISB_CONFIG_PATH` as alternatives
- [ ] Old TODO in `loadConfig()` replaced with note that search strategy is deferred
- [ ] `.env.example` updated with `ISB_CONFIG_PATH` entry
- [ ] `pnpm check` exits 0
- [ ] All existing tests pass

## Files Affected

- `src/international-space-bar-server/application-config/application-config.service.ts` — update `loadConfig()` path resolution
- `.env.example` — add `ISB_CONFIG_PATH`

## Comments

Design doc Work Item 1b. Depends on isb-0040 (CLI args utility provides `cliArgs.config`).
