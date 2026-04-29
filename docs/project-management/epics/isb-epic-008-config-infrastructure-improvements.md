# isb-epic-008: Config Infrastructure Improvements

| Field | Value |
|-------|-------|
| Priority | `high` |
| Status | `not-started` |
| Created | 2026-04-29 |
| Design doc | [docs/config-infrastructure-improvements.md](../../config-infrastructure-improvements.md) |
| Tickets | isb-0032, isb-0033, isb-0034, isb-0035, isb-0036, isb-0037, isb-0038 |

## Summary

Harden the `ApplicationConfigService` and `SecretsStoreService` infrastructure introduced in Phase 1. Fixes DI abstraction issues, extracts config secret resolution into a standalone utility, consolidates CLI arg parsing, adds explicit config file path override, makes the secrets store backend swappable, validates parsed YAML with a Zod schema, and documents server operation.

## Scope

- Fix constructor DI type from concrete class to interface (Work Item 0a)
- Extract `resolveSecrets` into standalone `resolveConfigSecrets` utility (Work Item 0b)
- Centralized CLI args utility replacing inline `parseArgs` calls (Work Item 1a)
- Explicit config file path via `--config` / `ISB_CONFIG_PATH` (Work Item 1b)
- Swappable secrets store backend via `--secret-store` CLI arg (Work Item 2)
- Zod schema validation for parsed YAML config at startup (Work Item 3)
- Documentation: `docs/running-the-server.md`, `.env.example`, `AGENTS.md` updates (Work Item 4)
- Unit tests for all new utilities and integration scenarios

## Design decisions referenced

- DI abstraction: constructor typed to `ISecretsStore` interface, not concrete `SecretsStoreService`
- Secret resolution extracted to config layer — secrets backends only implement `getSecret()`
- CLI args parsed once via centralized `parseCliArgs()` utility with Symbol-based DI token
- Config path precedence: CLI arg > env var > default (`cwd/config.<env>.yaml`)
- Zod validation uses `z.looseObject()` at all nesting levels — unknown keys pass through
- Frozen config is Zod's `result.data`, not the original parsed object
- Array secret resolution intentionally deferred (documented limitation)

## Acceptance criteria (from design doc)

- [ ] `ApplicationConfigService` constructor typed to `ISecretsStore`, not `SecretsStoreService`
- [ ] `resolveSecrets()` extracted from `SecretsStoreService` into standalone utility
- [ ] All CLI args parsed once via centralized `parseCliArgs()` utility
- [ ] Config file path overridable via `--config`/`-c` or `ISB_CONFIG_PATH`
- [ ] `--secret-store` CLI arg selects secrets backend (only `env` implemented)
- [ ] Parsed YAML validated against Zod schema at startup
- [ ] `getConfig()` returns Zod-inferred `AppConfig` type
- [ ] Documentation covers all entry points, environment selection, config structure
- [ ] All existing tests pass, `pnpm check` exits 0
- [ ] New unit tests cover all new utilities and integration scenarios

## Dependencies

None — this epic has no cross-epic dependencies.
