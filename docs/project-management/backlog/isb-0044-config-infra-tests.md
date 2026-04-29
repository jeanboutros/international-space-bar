# isb-0044: Unit tests for config infrastructure

| Field | Value |
|-------|-------|
| Epic | isb-epic-009 |
| Status | `backlog` |
| Assignee | Tester |
| Priority | `high` |
| Created | 2026-04-29 |
| Completed | — |
| Dependencies | isb-0039, isb-0040, isb-0041, isb-0042, isb-0043 |

## Description

Write unit tests for all new config infrastructure. Four test files covering the extracted utility, CLI args, Zod schema, and the integrated config service.

## Acceptance Criteria

- [ ] `application-config/resolve-config-secrets.test.ts` — 8 test cases:
  - Resolves top-level `SECRET[xxx]`
  - Resolves nested `SECRET[xxx]` in deep objects
  - Non-secret strings untouched
  - Non-string values (numbers, booleans) pass through
  - Arrays NOT traversed (known limitation verified)
  - Throws when `getSecret()` throws (missing secret)
  - Empty object returns empty object
  - `null` values don't crash
- [ ] `application-config/cli-args.test.ts` — 8 test cases:
  - Parses `--environment dev`
  - Parses `-e prod` (short flag)
  - Parses `--config /path/to/file.yaml`
  - Parses `-c ./relative.yaml`
  - Parses `--secret-store env`
  - All flags combined
  - No flags returns `{}`
  - Unknown flags don't crash (`strict: false`)
- [ ] `application-config/config.schema.test.ts` — 8 test cases:
  - Valid full config passes
  - Minimal config (only `version`) passes
  - Missing required `version` fails
  - Wrong type for `version` fails
  - Unknown top-level keys preserved in `result.data`
  - Unknown nested keys preserved
  - `server.port` as string fails
  - Empty object fails
- [ ] `application-config/application-config.service.test.ts` — 14 test cases:
  - Constructor accepts `ISecretsStore` mock
  - Config path from `--config` CLI arg
  - Config path from `ISB_CONFIG_PATH` env var
  - Default path when no override
  - `--config` overrides `ISB_CONFIG_PATH`
  - Factory: `env` backend returns `SecretsStoreService`
  - Factory: unknown backend throws `ConfigurationException`
  - Factory: default is `env`
  - `getConfig()` returns typed `AppConfig`
  - Config is frozen after load
  - Zod validation failure throws `ConfigurationException`
  - Secrets resolved before Zod validation
  - Missing config file throws `ConfigurationException`
  - Invalid YAML throws `ConfigurationException`
- [ ] All tests follow existing patterns: `reflect-metadata` import, `node:assert/strict`, `void describe`/`void it`
- [ ] `pnpm check` exits 0
- [ ] All tests pass (existing 13 + new)

## Files Affected

- `src/international-space-bar-server/application-config/resolve-config-secrets.test.ts` — new
- `src/international-space-bar-server/application-config/cli-args.test.ts` — new
- `src/international-space-bar-server/application-config/config.schema.test.ts` — new
- `src/international-space-bar-server/application-config/application-config.service.test.ts` — new

## Comments

Test strategy from Test Planner. Depends on all code tickets being complete.
