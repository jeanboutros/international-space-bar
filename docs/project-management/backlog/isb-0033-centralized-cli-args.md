# isb-0033: Centralized CLI args utility

| Field | Value |
|-------|-------|
| Epic | isb-epic-008 |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `high` |
| Created | 2026-04-29 |
| Completed | — |
| Dependencies | isb-0032 |

## Description

Create a centralized `parseCliArgs()` utility that parses all CLI arguments (`--environment`, `--config`, `--secret-store`) in a single `parseArgs` call. Register the result as a DI token (`CLI_ARGS`) in the module so both `ApplicationConfigService` and the `SECRETS_STORE` factory can inject it. Remove the inline `parseCliEnvironment()` method from `ApplicationConfigService`.

Corresponds to design doc Work Item 1a.

## Acceptance Criteria

- [ ] New file `cli-args.ts` created with `CliArgs` interface, `CLI_ARGS` Symbol token, and `parseCliArgs()` function
- [ ] `parseCliArgs()` parses `--environment` (`-e`), `--config` (`-c`), and `--secret-store` in a single `parseArgs` call
- [ ] `parseCliArgs()` returns `{}` on parse errors (wrapped in try/catch)
- [ ] `CLI_ARGS` registered as a provider in `ApplicationConfigModule` via `useFactory: () => parseCliArgs()`
- [ ] `ApplicationConfigService` injects `CLI_ARGS` and reads `environment` from it
- [ ] `parseCliEnvironment()` private method removed from `ApplicationConfigService`
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/application-config/cli-args.ts` — new file: `CliArgs` interface, `CLI_ARGS` token, `parseCliArgs()` function
- `src/international-space-bar-server/application-config/application-config.module.ts` — register `CLI_ARGS` provider
- `src/international-space-bar-server/application-config/application-config.service.ts` — inject `CLI_ARGS`, remove `parseCliEnvironment()`

## PoC Snippets

```typescript
// cli-args.ts
import { parseArgs } from "node:util";

export interface CliArgs {
    environment?: string;
    config?: string;
    secretStore?: string;
}

export const CLI_ARGS = Symbol("CliArgs");

export function parseCliArgs(): CliArgs {
    try {
        const { values } = parseArgs({
            options: {
                environment: { type: "string", short: "e" },
                config: { type: "string", short: "c" },
                "secret-store": { type: "string" },
            },
            strict: false,
        });
        return {
            environment: values.environment as string | undefined,
            config: values.config as string | undefined,
            secretStore: values["secret-store"] as string | undefined,
        };
    } catch {
        return {};
    }
}
```

## Comments

This ticket enables isb-0034 (config path) and isb-0035 (swappable store) which both consume CLI args from the injected token.
