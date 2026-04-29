# isb-0043: Zod validation for parsed YAML config

| Field | Value |
|-------|-------|
| Epic | isb-epic-009 |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `high` |
| Created | 2026-04-29 |
| Completed | — |
| Dependencies | isb-0039 |

## Description

Define a Zod schema for the known config structure and validate parsed YAML at startup. Unknown keys pass through at all nesting levels via `z.looseObject()` (Zod 4).

### Config loading pipeline (order matters)

```
parse YAML → resolveConfigSecrets (mutate in-place) → Zod safeParse (new object) → Object.freeze(result.data)
```

Validation happens **after** secret resolution so the schema validates actual runtime values, not `SECRET[xxx]` patterns.

## Acceptance Criteria

- [ ] New file `application-config/config.schema.ts` with `ConfigSchema` and exported `AppConfig` type
- [ ] Top-level schema uses `z.looseObject()` — unknown keys pass through
- [ ] All nested objects use `z.looseObject()` — unknown keys pass through at every level
- [ ] Known sections: `version` (required), `app`, `server`, `logger`, `ollama`, `tavily`, `models`, `paths` (all optional except `version`)
- [ ] `loadConfig()` calls `ConfigSchema.safeParse()` after `resolveConfigSecrets()`
- [ ] On validation failure, throws `ConfigurationException` with Zod error details
- [ ] The frozen config is `result.data` (Zod output), NOT the original parsed object
- [ ] `getConfig()` return type is `AppConfig` (Zod-inferred type)
- [ ] `config` class property type is `AppConfig`
- [ ] `pnpm check` exits 0
- [ ] All existing tests pass

## Files Affected

- `src/international-space-bar-server/application-config/config.schema.ts` — new file
- `src/international-space-bar-server/application-config/application-config.service.ts` — import schema, add validation step, update return types

## PoC Snippets

```typescript
import { z } from "zod";

export const ConfigSchema = z.looseObject({
    version: z.number(),
    app: z.looseObject({
        appVersion: z.string().optional(),
    }),
    server: z.looseObject({
        port: z.number(),
        host: z.string(),
    }).optional(),
    logger: z.looseObject({
        type: z.string(),
        logFilePath: z.string(),
        level: z.string(),
    }).optional(),
    ollama: z.looseObject({
        baseUrl: z.string(),
        apiKey: z.string(),
    }).optional(),
    tavily: z.looseObject({
        apiKey: z.string(),
    }).optional(),
    models: z.looseObject({
        default: z.string(),
        aliases: z.record(z.string(), z.string()),
    }).optional(),
    paths: z.looseObject({
        skillsRoot: z.string(),
        agentsConfigDir: z.string(),
    }).optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;
```

## Comments

Design doc Work Item 3. Depends on isb-0039 (`resolveConfigSecrets` must be extracted first).
