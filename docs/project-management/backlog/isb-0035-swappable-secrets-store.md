# isb-0035: Swappable secrets store backend via CLI

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-008 |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `medium`     |
| Created      | 2026-04-29   |
| Completed    | —            |
| Dependencies | isb-0033     |

## Description

Make the secrets store implementation swappable at startup via `--secret-store` CLI arg. Replace the `useClass` provider for `SECRETS_STORE` in `ApplicationConfigModule` with a `useFactory` that reads `secretStore` from the injected `CLI_ARGS` token and selects the implementation. Only `env` is implemented; requesting `file` or `vault` throws a `ConfigurationException`. Remove the large TODO block from `secrets-store.service.ts`.

Corresponds to design doc Work Item 2.

## Acceptance Criteria

- [ ] `SECRETS_STORE` provider in module uses `useFactory` injecting `CLI_ARGS`
- [ ] Factory defaults to `env` backend when `--secret-store` is not specified
- [ ] `--secret-store=env` returns a `SecretsStoreService` instance
- [ ] Requesting an unimplemented backend (e.g. `file`, `vault`) throws `ConfigurationException` with a clear message
- [ ] Large TODO block removed from `secrets-store.service.ts`
- [ ] JSDoc on `SecretsStoreService` cleaned up
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/application-config/application-config.module.ts` — replace `useClass` with `useFactory` for `SECRETS_STORE`, inject `CLI_ARGS`
- `src/international-space-bar-server/application-config/secrets-store.service.ts` — remove TODO block, clean up JSDoc

## PoC Snippets

```typescript
// application-config.module.ts — SECRETS_STORE factory
{
    provide: SECRETS_STORE,
    useFactory: (args: CliArgs) => {
        const backend = args.secretStore ?? "env";
        if (backend === "env") return new SecretsStoreService();
        throw new ConfigurationException(
            `Secret store backend "${backend}" is not implemented. Available: env`,
        );
    },
    inject: [CLI_ARGS],
}
```

## Comments

Depends on isb-0033 for the `CLI_ARGS` DI token. Parallel with isb-0034 (both depend on isb-0033 but are independent of each other).
