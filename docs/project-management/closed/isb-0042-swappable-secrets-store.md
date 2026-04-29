# isb-0042: Swappable secrets store backend via CLI

| Field | Value |
|-------|-------|
| Epic | isb-epic-009 |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `medium` |
| Created | 2026-04-29 |
| Completed | — |
| Dependencies | isb-0040 |

## Description

Make the secrets store implementation selectable at startup via `--secret-store` CLI arg. The module's `SECRETS_STORE` provider changes from `useClass` to a `useFactory` that reads from the injected `CLI_ARGS` and instantiates the appropriate backend.

Only the `env` backend (current `SecretsStoreService`) is implemented. Requesting any other backend throws a `ConfigurationException`.

## Acceptance Criteria

- [ ] `ApplicationConfigModule` uses a `useFactory` provider for `SECRETS_STORE`
- [ ] Factory injects `CLI_ARGS` and reads `args.secretStore`
- [ ] Default is `"env"` when `--secret-store` is not provided
- [ ] `--secret-store=env` instantiates `SecretsStoreService`
- [ ] Any other value (e.g., `file`, `vault`) throws `ConfigurationException` with message listing available backends
- [ ] Factory is synchronous (no async provider)
- [ ] `pnpm check` exits 0
- [ ] All existing tests pass

## Files Affected

- `src/international-space-bar-server/application-config/application-config.module.ts` — factory provider for `SECRETS_STORE`

## Comments

Design doc Work Item 2. Depends on isb-0040 (CLI args utility provides `args.secretStore`).
