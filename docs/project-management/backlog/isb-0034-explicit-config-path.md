# isb-0034: Explicit config file path override

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-008 |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `high`       |
| Created      | 2026-04-29   |
| Completed    | —            |
| Dependencies | isb-0033     |

## Description

Allow the config file path to be specified explicitly via `--config`/`-c` CLI arg or `ISB_CONFIG_PATH` env var, with a defined precedence order. Update `loadConfig()` in `ApplicationConfigService` to check CLI arg first, then env var, then fall back to the default `<cwd>/config.<env>.yaml` path. Remove the old TODO comment and add a note that upward search strategy is deferred.

Corresponds to design doc Work Item 1b.

## Acceptance Criteria

- [ ] Config file path resolved with precedence: `--config`/`-c` CLI arg > `ISB_CONFIG_PATH` env var > default `join(cwd, config.<env>.yaml)`
- [ ] `loadConfig()` uses `cliArgs.config` from the injected `CLI_ARGS` token
- [ ] Old TODO comment about config path fragility is removed
- [ ] New comment notes that upward search strategy is deferred
- [ ] `.env.example` updated with `ISB_CONFIG_PATH` documentation
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/application-config/application-config.service.ts` — update `loadConfig()` path resolution logic, remove old TODO
- `.env.example` — add `ISB_CONFIG_PATH` entry with documentation comment

## PoC Snippets

```typescript
// Inside loadConfig() path resolution
const configPath =
    this.cliArgs.config ?? process.env.ISB_CONFIG_PATH ?? join(process.cwd(), `config.${env}.yaml`);
```

## Comments

Depends on isb-0033 for the `CLI_ARGS` injection that provides `cliArgs.config`.
