# isb-0037: Unit tests for config infrastructure improvements

| Field        | Value                                            |
| ------------ | ------------------------------------------------ |
| Epic         | isb-epic-008                                     |
| Status       | `backlog`                                        |
| Assignee     | Tester                                           |
| Priority     | `high`                                           |
| Created      | 2026-04-29                                       |
| Completed    | —                                                |
| Dependencies | isb-0032, isb-0033, isb-0034, isb-0035, isb-0036 |

## Description

Create unit tests for all new and modified config infrastructure. Four test files covering the standalone utilities and the integrated service behaviour.

## Acceptance Criteria

- [ ] `resolve-config-secrets.test.ts` created with 8 test cases:
    - Resolves top-level `SECRET[xxx]` values
    - Resolves nested `SECRET[xxx]` values
    - Leaves non-secret strings unchanged
    - Handles missing secrets (calls `getSecret` which may throw or return undefined)
    - Skips arrays (does not traverse array elements)
    - Handles empty config object
    - Handles `null` values in config
    - Handles mixed nested objects with some secrets and some plain values
- [ ] `cli-args.test.ts` created with 8 test cases:
    - Parses `--environment dev`
    - Parses `-e dev` (short form)
    - Parses `--config /path/to/config.yaml`
    - Parses `-c /path/to/config.yaml` (short form)
    - Parses `--secret-store env`
    - Parses multiple args together
    - Returns `{}` on parse error
    - Returns `{}` when no args provided
- [ ] `config.schema.test.ts` created with 8 test cases:
    - Valid config passes validation
    - Missing required `version` field fails
    - Missing required `app` field fails
    - Unknown top-level keys pass through
    - Unknown nested keys pass through
    - Optional sections can be omitted
    - Wrong type for `version` (string instead of number) fails
    - Validates nested structure (`server.port` must be number)
- [ ] `application-config.service.test.ts` created with 14 test cases covering integrated behaviour:
    - Service loads config from default path
    - Service loads config from `--config` CLI arg
    - Service loads config from `ISB_CONFIG_PATH` env var
    - CLI arg takes precedence over env var
    - Env var takes precedence over default
    - Resolves secrets before validation
    - Validates config against Zod schema
    - Throws on invalid config
    - `getConfig()` returns frozen object
    - `getConfig()` returns Zod `result.data`, not original parsed object
    - Environment from CLI arg
    - Environment from env var
    - CLI environment takes precedence over env var
    - Constructor uses `ISecretsStore` interface (DI integration)
- [ ] All 38 test cases pass
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/application-config/resolve-config-secrets.test.ts` — new file: 8 test cases
- `src/international-space-bar-server/application-config/cli-args.test.ts` — new file: 8 test cases
- `src/international-space-bar-server/application-config/config.schema.test.ts` — new file: 8 test cases
- `src/international-space-bar-server/application-config/application-config.service.test.ts` — new file: 14 test cases

## PoC Snippets

```typescript
// Example test structure for resolve-config-secrets.test.ts
import { describe, it, expect } from "vitest";
import { resolveConfigSecrets } from "./resolve-config-secrets.js";

describe("resolveConfigSecrets", () => {
    it("resolves top-level SECRET[xxx] values", () => {
        const store = { getSecret: (key: string) => `resolved-${key}` };
        const config = { apiKey: "SECRET[MY_KEY]" };
        const result = resolveConfigSecrets(config, store);
        expect(result.apiKey).toBe("resolved-MY_KEY");
    });
});
```

## Comments

Depends on all five code tickets (isb-0032 through isb-0036) since tests exercise all new utilities and service changes.
