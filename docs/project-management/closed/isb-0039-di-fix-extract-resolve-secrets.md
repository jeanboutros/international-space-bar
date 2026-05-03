# isb-0039: Fix DI abstraction + extract resolveConfigSecrets

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-009 |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `high`       |
| Created      | 2026-04-29   |
| Completed    | —            |
| Dependencies | none         |

## Description

Fix two structural issues in the config infrastructure that are prerequisites for the remaining tickets:

1. **Constructor type fix**: Change `ApplicationConfigService` constructor parameter type from concrete `SecretsStoreService` to the `ISecretsStore` interface. This enforces the DI abstraction.

2. **Extract `resolveConfigSecrets`**: Move the config-tree-walking `resolveSecrets()` method from `SecretsStoreService` into a standalone utility function `resolveConfigSecrets(config, store)`. This keeps `ISecretsStore` focused on single-secret resolution (`getSecret()`) while the config-walking logic lives in the config layer.

## Acceptance Criteria

- [ ] `ApplicationConfigService` constructor is typed `@Inject(SECRETS_STORE) secretsStore: ISecretsStore`
- [ ] Import changed from `SecretsStoreService` to `ISecretsStore`
- [ ] New file `application-config/resolve-config-secrets.ts` with standalone `resolveConfigSecrets(config, store)` function
- [ ] `SECRET_PATTERN` regex moved to the new utility file
- [ ] `SecretsStoreService.resolveSecrets()` method removed — service only implements `getSecret()`
- [ ] `ApplicationConfigService.loadConfig()` calls `resolveConfigSecrets(parsed, this.secretsStore)`
- [ ] Array limitation documented in the utility file (arrays are not traversed)
- [ ] TODO block in `secrets-store.service.ts` removed
- [ ] `pnpm check` exits 0
- [ ] All existing tests (13) pass

## Files Affected

- `src/international-space-bar-server/application-config/application-config.service.ts` — change import + constructor type, update `loadConfig()` call
- `src/international-space-bar-server/application-config/resolve-config-secrets.ts` — new file
- `src/international-space-bar-server/application-config/secrets-store.service.ts` — remove `resolveSecrets()`, `SECRET_PATTERN`, and TODO block

## Comments

Design doc Work Items 0a and 0b. This is the foundation ticket — all other code tickets depend on it.
