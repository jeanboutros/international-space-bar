# isb-epic-009: Config Infrastructure Improvements

| Field | Value |
|-------|-------|
| Priority | `high` |
| Status | `not-started` |
| Created | 2026-04-29 |
| Design doc | [docs/config-infrastructure-improvements.md](../../config-infrastructure-improvements.md) |
| Tickets | isb-0039, isb-0040, isb-0041, isb-0042, isb-0043, isb-0044, isb-0045 |

## Summary

Addresses all TODO items in `ApplicationConfigService` and `SecretsStoreService`, adds Zod config validation, and creates server operation documentation. Fixes DI abstraction gaps, consolidates CLI arg parsing, adds config file path override, makes the secrets store backend swappable, validates YAML config at startup, and documents how to run the server.

## Scope

- Fix DI abstraction: constructor type → `ISecretsStore`, extract `resolveConfigSecrets` utility
- Centralize CLI arg parsing into a single `parseCliArgs()` utility with `CLI_ARGS` DI token
- Add `--config`/`-c` and `ISB_CONFIG_PATH` config file path override
- Add `--secret-store` CLI arg for swappable secrets backend (only `env` implemented)
- Add Zod schema validation for parsed YAML config with `z.looseObject()`
- Create `docs/running-the-server.md` and update `.env.example` and `AGENTS.md`
- Unit tests for all new functionality

## Design decisions referenced

- Extract `resolveConfigSecrets` as standalone utility (not on interface) — keeps `ISecretsStore` minimal
- Validation pipeline: parse YAML → resolve secrets → Zod validate → freeze `result.data`
- All object schema levels use `z.looseObject()` for unknown key passthrough

## Acceptance criteria (from design doc)

See [config-infrastructure-improvements.md](../../config-infrastructure-improvements.md) § Acceptance criteria.

## Dependencies

None — standalone epic on the `feat/phase-1-streaming-ping-pong` branch.
