# Config Infrastructure Improvements — Design Document

## Context

The `ApplicationConfigService` and `SecretsStoreService` were introduced as part of Phase 1 infrastructure on the `feat/phase-1-streaming-ping-pong` branch. They work but have several TODO items and missing documentation. This design document addresses those improvements.

### Current state

- `ApplicationConfigService` resolves environment from CLI (`-e`/`--environment`) or `ISB_PROJECT_ENVIRONMENT` env var, loads `config.<env>.yaml` from `process.cwd()`, and resolves `SECRET[xxx]` patterns via the injected `SecretsStoreService`.
- `SecretsStoreService` reads secrets exclusively from environment variables.
- Config YAML is parsed but **not validated** — any structure is accepted as `Record<string, unknown>`.
- The config file path is hardcoded to `process.cwd()` with no override mechanism.
- Constructor in `ApplicationConfigService` is typed to the concrete `SecretsStoreService` instead of the `ISecretsStore` interface.
- `resolveSecrets()` (config-tree-walking logic) lives on the concrete `SecretsStoreService` but is **not** part of the `ISecretsStore` interface contract — any alternative implementation would fail at runtime.
- CLI arg parsing is done inline in the service — adding more args will scatter `parseArgs` calls.
- No documentation exists for how to run the server, choose an environment, or locate config files.

### Source files

- `src/international-space-bar-server/application-config/application-config.service.ts`
- `src/international-space-bar-server/application-config/secrets-store.service.ts`
- `src/international-space-bar-server/application-config/application-config.module.ts`
- `src/international-space-bar-server/common/interfaces/secrets-store.interface.ts`
- `src/international-space-bar-server/common/interfaces/environment.interface.ts`
- `src/international-space-bar-server/common/exceptions/configuration.exception.ts`
- `config.dev.yaml`, `config.test.yaml`, `config.prod.yaml`
- `src/international-space-bar-server/main.ts`

---

## Work Items

### 0. Prerequisite — fix DI abstraction and extract config secret resolution

Before implementing the feature work items, two structural issues must be fixed:

#### 0a. Change constructor type from concrete to interface

The `ApplicationConfigService` constructor is typed to the concrete `SecretsStoreService`:

```typescript
constructor(@Inject(SECRETS_STORE) private readonly secretsStore: SecretsStoreService)
```

This must change to:

```typescript
constructor(@Inject(SECRETS_STORE) private readonly secretsStore: ISecretsStore)
```

This enforces the DI abstraction and is a prerequisite for Work Item 2 (swappable stores).

**Changes**:

- `application-config.service.ts`: Change the import and constructor parameter type from `SecretsStoreService` to `ISecretsStore`.

#### 0b. Extract `resolveSecrets` into a standalone utility

The `resolveSecrets()` method on `SecretsStoreService` is config-tree-walking logic — it recursively traverses a config object and calls `getSecret()` for each `SECRET[xxx]` pattern. This logic belongs in the config layer, not the secrets backend. Each secrets backend should only implement `getSecret()`.

Extract `resolveSecrets` into a standalone function:

```typescript
// application-config/resolve-config-secrets.ts
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

**Known limitation**: Arrays are not traversed — `SECRET[xxx]` inside array elements will not be resolved. Current config files do not use arrays with secrets. This is documented as a known limitation; array support can be added when needed.

**Changes**:

- New file: `application-config/resolve-config-secrets.ts`
- `application-config.service.ts`: Import `resolveConfigSecrets` and call `resolveConfigSecrets(parsed, this.secretsStore)` instead of `this.secretsStore.resolveSecrets(parsed)`.
- `secrets-store.service.ts`: Remove `resolveSecrets()` method and `SECRET_PATTERN` constant. The service now only implements `getSecret()`.

### 1. Consolidate CLI arg parsing + explicit config file path

**TODO reference**: `application-config.service.ts` line ~107–108

> "This is fragile — consider supporting strategies like searching upwards for the config file or allowing an explicit path via CLI/env var or both"

**Scope**: Consolidate all CLI arg parsing into a single utility, and add support for an explicit config file path.

#### 1a. Centralized CLI args utility

Currently `parseCliEnvironment()` is a private method in `ApplicationConfigService` that calls `parseArgs` for just `--environment`. Work Items 1b and 2 add `--config` and `--secret-store`. Rather than scatter three `parseArgs` calls, create a single utility:

```typescript
// application-config/cli-args.ts
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

The `CLI_ARGS` Symbol is registered as a DI token in the module. Both the `SECRETS_STORE` factory and `ApplicationConfigService` inject it.

**Changes**:

- New file: `application-config/cli-args.ts`
- `application-config.module.ts`: Register `{ provide: CLI_ARGS, useFactory: () => parseCliArgs() }`.
- `application-config.service.ts`: Inject `CLI_ARGS` instead of parsing CLI args internally. Remove `parseCliEnvironment()`.

#### 1b. Explicit config file path

Allow the config file path to be specified explicitly via:

- CLI arg: `--config <path>` or `-c <path>` (from the `CliArgs` utility above)
- Env var: `ISB_CONFIG_PATH`

**Precedence order** (highest to lowest):

1. `--config` / `-c` CLI arg
2. `ISB_CONFIG_PATH` env var
3. Default: `join(process.cwd(), \`config.\${env}.yaml\`)`

**NOT in scope**: Searching upward for config files. The existing TODO is updated to reflect that explicit path override is implemented and search strategy is deferred.

**Changes**:

- `application-config.service.ts`: Update `loadConfig()` to check `cliArgs.config` → `ISB_CONFIG_PATH` → default. Remove the old TODO and add a note that search strategy is deferred.
- Update `.env.example` with `ISB_CONFIG_PATH` documentation.

### 2. Swappable secrets store backend via CLI

**TODO reference**: `secrets-store.service.ts` lines ~20–28

> "The SecretStore should be an interface injected into this class... add a CLI arg for secret store type like --secret-store=env|file|vault"

**Scope**: Make the secrets store implementation swappable at startup via:

- CLI arg: `--secret-store=env` (only `env` is implemented now; `file` and `vault` are future)

**Approach**:

- `ApplicationConfigModule` uses a factory provider for `SECRETS_STORE` that reads `secretStore` from the injected `CLI_ARGS` token and selects the implementation.
- The factory is synchronous — no async provider needed.
- Only `env` (current `SecretsStoreService`) is implemented. Requesting `file` or `vault` throws a `ConfigurationException` with a clear message that the backend is not yet implemented.
- Remove the large TODO comment block from `secrets-store.service.ts`.

**Module wiring**:

```typescript
// application-config.module.ts
@Global()
@Module({
    providers: [
        { provide: CLI_ARGS, useFactory: () => parseCliArgs() },
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
        },
        ApplicationConfigService,
    ],
    exports: [SECRETS_STORE, ApplicationConfigService],
})
```

**Changes**:

- `application-config.module.ts`: Replace `useClass` with `useFactory` as shown above.
- `secrets-store.service.ts`: Remove TODO block, clean up JSDoc. Service now only implements `getSecret()`.

### 3. Zod validation for parsed YAML config

**Current problem**: The parsed YAML is cast to `Record<string, unknown>` with no structural validation. Typos in config keys, missing required sections, or wrong types silently pass through and cause runtime errors later.

**Scope**: Define a Zod schema for the **known** config sections and validate the parsed YAML against it at startup. Unknown keys at every nesting level pass through without error.

**Approach**:

- Create a `config.schema.ts` file in `application-config/` that defines a Zod schema.
- All object levels use `z.looseObject()` (Zod 4) — not `z.object()` — so unknown keys pass through at every nesting level.
- Known sections based on `config.dev.yaml`:

    ```typescript
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

#### Config loading pipeline

The order of operations in `loadConfig()` is:

```
parse YAML (raw string → object)
  → resolve secrets (mutate in-place via resolveConfigSecrets)
  → Zod safeParse (produces a NEW validated object — result.data)
  → Object.freeze(result.data) — freeze the Zod output, not the original
```

**Critical**: The frozen config is `result.data` from Zod's `safeParse`, not the original `parsed` object. Zod's `safeParse` returns a new object reference even with `z.looseObject()`.

**Validation happens after secret resolution** so the schema validates actual runtime values (e.g., resolved API keys as strings) rather than `SECRET[xxx]` placeholder patterns.

- On validation failure, throw `ConfigurationException` with the Zod error details.
- `getConfig()` return type changes from `Record<string, unknown>` to `AppConfig` (the Zod-inferred type). No current consumers exist outside the service, so this is not a breaking change.

**Changes**:

- New file: `application-config/config.schema.ts`
- `application-config.service.ts`: Import schema, validate in `loadConfig()`, use `result.data` as the frozen config.
- `getConfig()` return type → `AppConfig`.

### 4. Documentation — running the server

**Current problem**: No documentation exists for how to:

- Start the server in different environments
- Choose which environment to use (CLI vs env var)
- Where config files are located
- What the config file structure looks like
- What `SECRET[xxx]` patterns do

**Scope**: Create/update documentation that clearly explains:

1. Application entry points (`main.ts`, `pnpm dev:server`, `pnpm start:server`)
2. Environment selection: `--environment dev` or `-e dev` or `ISB_PROJECT_ENVIRONMENT=dev`
3. Config file location: defaults to `<cwd>/config.<env>.yaml`, overridable via `--config` / `ISB_CONFIG_PATH`
4. Secret store: defaults to `env`, overridable via `--secret-store`
5. Config file structure with annotated example
6. `SECRET[xxx]` pattern explanation
7. `.env` file usage (via `--env-file` in dev/start scripts)
8. Known limitation: `resolveSecrets` does not traverse arrays

**Target file**: `docs/running-the-server.md` (new)

Also update:

- `AGENTS.md` commands table if needed
- `.env.example` with all new env vars

**Note on `main.ts` port resolution**: Currently `main.ts` reads port from `process.env.PORT`, not from the validated `server.port` in config. This is a pre-existing disconnect and is NOT in scope for this design. It should be addressed in a future ticket when `main.ts` is wired to use the config service.

---

## Architecture considerations

### Layered boundaries

All changes stay within the `international-space-bar-server/` layer:

- `common/interfaces/` — pure types (innermost)
- `common/exceptions/` — exception classes
- `application-config/` — config service, secrets service, module, schema, CLI args, secret resolution utility
- `main.ts` — composition root

No changes to the agent core (`international-space-bar/`) are required.

### Dependency rule compliance

- `config.schema.ts` depends only on `zod` (external) — no project layer imports needed.
- `cli-args.ts` depends only on `node:util` — no project layer imports needed.
- `resolve-config-secrets.ts` depends only on `common/interfaces/` (inward).
- `application-config.service.ts` depends on `common/interfaces/` and `common/exceptions/` (inward), plus sibling utilities.
- `application-config.module.ts` depends on its sibling services and `common/interfaces/` (inward).
- No outward dependencies are introduced.

### DI pattern

The existing `@Inject(SECRETS_STORE)` pattern with explicit Symbol tokens is preserved. A new `CLI_ARGS` Symbol token is introduced for the centralized CLI args. The factory provider in the module selects which concrete secrets store class to bind.

---

## Acceptance criteria

### Functional

- [ ] Config file path can be overridden via `--config`/`-c` CLI arg or `ISB_CONFIG_PATH` env var
- [ ] CLI arg takes precedence over env var, which takes precedence over default path
- [ ] The TODO in `loadConfig()` is updated to reflect the implemented override and deferred search
- [ ] `--secret-store` CLI arg selects the secrets backend (only `env` implemented)
- [ ] Requesting an unimplemented secret store throws `ConfigurationException`
- [ ] The TODO block in `secrets-store.service.ts` is removed
- [ ] `resolveSecrets()` is extracted from `SecretsStoreService` into a standalone utility
- [ ] `SecretsStoreService` only implements `getSecret()` (matching `ISecretsStore`)
- [ ] `ApplicationConfigService` constructor is typed to `ISecretsStore`, not `SecretsStoreService`
- [ ] All CLI args are parsed once via a centralized `parseCliArgs()` utility
- [ ] Parsed YAML config is validated against a Zod schema at startup (after secret resolution)
- [ ] Known config sections are type-checked; unknown keys pass through at all nesting levels (`z.looseObject()`)
- [ ] Validation errors produce a clear `ConfigurationException` with Zod error details
- [ ] `getConfig()` returns the Zod-inferred `AppConfig` type
- [ ] The frozen config object is Zod's `result.data`, not the original parsed object

### Documentation

- [ ] `docs/running-the-server.md` documents all entry points, environment selection, config path, secret store, and config structure
- [ ] `.env.example` includes `ISB_CONFIG_PATH` and any new env vars
- [ ] `AGENTS.md` commands table is updated if new run options are added
- [ ] Array limitation in secret resolution is documented

### Quality

- [ ] All existing tests (13) continue to pass
- [ ] `pnpm check` exits 0
- [ ] New unit tests cover:
    - CLI arg parsing (environment, config, secret-store) with various argv scenarios
    - Secret store factory selection (valid `env`, invalid values)
    - Zod schema validation (valid config, missing required fields, unknown keys preserved)
    - `resolveConfigSecrets` standalone utility (nested secrets, missing secrets, no arrays)
    - Config file path precedence (CLI > env var > default)
