# isb-0036: Zod validation for parsed YAML config

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-008 |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `high`       |
| Created      | 2026-04-29   |
| Completed    | —            |
| Dependencies | isb-0032     |

## Description

Define a Zod schema for the known config sections and validate the parsed YAML against it at startup, after secret resolution. Uses `z.looseObject()` (Zod 4) at all nesting levels so unknown keys pass through. The frozen config is Zod's `result.data`, not the original parsed object. `getConfig()` return type changes to the Zod-inferred `AppConfig` type.

Corresponds to design doc Work Item 3.

## Acceptance Criteria

- [ ] New file `config.schema.ts` created with `ConfigSchema` using `z.looseObject()` at all nesting levels
- [ ] Schema covers known sections: `version`, `app`, `server`, `logger`, `ollama`, `tavily`, `models`, `paths`
- [ ] Unknown keys pass through without error at every nesting level
- [ ] `loadConfig()` validates parsed YAML via `safeParse` after secret resolution
- [ ] Validation failure throws `ConfigurationException` with Zod error details
- [ ] Frozen config is `result.data` from Zod, not the original parsed object
- [ ] `getConfig()` return type is `AppConfig` (Zod-inferred type)
- [ ] `AppConfig` type is exported from `config.schema.ts`
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/application-config/config.schema.ts` — new file: `ConfigSchema` Zod schema, `AppConfig` type export
- `src/international-space-bar-server/application-config/application-config.service.ts` — import schema, validate in `loadConfig()`, change `getConfig()` return type

## PoC Snippets

```typescript
// config.schema.ts
import { z } from "zod/v4";

export const ConfigSchema = z.looseObject({
    version: z.number(),
    app: z.looseObject({
        appVersion: z.string().optional(),
    }),
    server: z
        .looseObject({
            port: z.number(),
            host: z.string(),
        })
        .optional(),
    logger: z
        .looseObject({
            type: z.string(),
            logFilePath: z.string(),
            level: z.string(),
        })
        .optional(),
    ollama: z
        .looseObject({
            baseUrl: z.string(),
            apiKey: z.string(),
        })
        .optional(),
    tavily: z
        .looseObject({
            apiKey: z.string(),
        })
        .optional(),
    models: z
        .looseObject({
            default: z.string(),
            aliases: z.record(z.string(), z.string()),
        })
        .optional(),
    paths: z
        .looseObject({
            skillsRoot: z.string(),
            agentsConfigDir: z.string(),
        })
        .optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;
```

```typescript
// Inside loadConfig() — validation step
const result = ConfigSchema.safeParse(resolved);
if (!result.success) {
    throw new ConfigurationException(`Config validation failed: ${result.error.message}`);
}
this.config = Object.freeze(result.data);
```

## Comments

Depends on isb-0032 because `resolveConfigSecrets` must be extracted before the validation pipeline can be finalized (resolve → validate → freeze).
