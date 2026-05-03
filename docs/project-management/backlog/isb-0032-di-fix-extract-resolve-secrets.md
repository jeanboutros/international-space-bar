# isb-0032: Fix DI abstraction and extract resolveConfigSecrets utility

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-008 |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `high`       |
| Created      | 2026-04-29   |
| Completed    | —            |
| Dependencies | none         |

## Description

Two prerequisite fixes before the feature work items:

**0a — DI fix**: Change `ApplicationConfigService` constructor parameter type from the concrete `SecretsStoreService` to the `ISecretsStore` interface. This enforces the DI abstraction and is a prerequisite for the swappable store (isb-0035).

**0b — Extract resolveConfigSecrets**: The `resolveSecrets()` method on `SecretsStoreService` is config-tree-walking logic that belongs in the config layer, not the secrets backend. Extract it into a standalone `resolveConfigSecrets()` function in a new file. Each secrets backend should only implement `getSecret()`.

## Acceptance Criteria

- [ ] `ApplicationConfigService` constructor parameter is typed to `ISecretsStore`, not `SecretsStoreService`
- [ ] Import in `application-config.service.ts` changed from `SecretsStoreService` to `ISecretsStore`
- [ ] New file `resolve-config-secrets.ts` created with standalone `resolveConfigSecrets(config, store)` function
- [ ] `resolveConfigSecrets` uses `SECRET_PATTERN` regex and recursively traverses nested objects
- [ ] Arrays are intentionally not traversed (documented as known limitation in a code comment)
- [ ] `application-config.service.ts` calls `resolveConfigSecrets(parsed, this.secretsStore)` instead of `this.secretsStore.resolveSecrets(parsed)`
- [ ] `resolveSecrets()` method and `SECRET_PATTERN` constant removed from `secrets-store.service.ts`
- [ ] `SecretsStoreService` only implements `getSecret()` matching `ISecretsStore` interface
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/application-config/resolve-config-secrets.ts` — new file: standalone `resolveConfigSecrets` function
- `src/international-space-bar-server/application-config/application-config.service.ts` — change constructor type to `ISecretsStore`, import and call `resolveConfigSecrets`
- `src/international-space-bar-server/application-config/secrets-store.service.ts` — remove `resolveSecrets()` method and `SECRET_PATTERN`

## PoC Snippets

```typescript
// resolve-config-secrets.ts
import type { ISecretsStore } from "../common/interfaces/index.js";

const SECRET_PATTERN = /^SECRET\[([^\]]+)\]$/;

export function resolveConfigSecrets(
    config: Record<string, unknown>,
    store: ISecretsStore,
): Record<string, unknown> {
    for (const [key, value] of Object.entries(config)) {
        if (typeof value === "string") {
            const match = SECRET_PATTERN.exec(value);
            if (match?.[1]) {
                config[key] = store.getSecret(match[1]);
            }
        } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            resolveConfigSecrets(value as Record<string, unknown>, store);
        }
    }
    return config;
}
```

## Comments

Design doc Work Items 0a and 0b combined into a single ticket because they are both prerequisites with no external dependencies and touch the same service file.
