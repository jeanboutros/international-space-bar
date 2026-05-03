# isb-0040: Centralized CLI args utility

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-009 |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `high`       |
| Created      | 2026-04-29   |
| Completed    | —            |
| Dependencies | isb-0039     |

## Description

Consolidate all CLI arg parsing into a single `parseCliArgs()` utility with a `CLI_ARGS` DI token. Currently `parseCliEnvironment()` in `ApplicationConfigService` parses only `--environment`. This ticket creates a centralized utility that parses `--environment`, `--config`, and `--secret-store` in one `parseArgs` call, and registers the result as a NestJS provider.

## Acceptance Criteria

- [ ] New file `application-config/cli-args.ts` with `parseCliArgs()` function, `CliArgs` interface, and `CLI_ARGS` Symbol token
- [ ] `parseCliArgs()` parses `--environment`/`-e`, `--config`/`-c`, `--secret-store` with `strict: false`
- [ ] Returns `CliArgs` object with `environment?`, `config?`, `secretStore?` fields
- [ ] Catches parse errors and returns `{}` (matches existing pattern)
- [ ] `ApplicationConfigModule` registers `{ provide: CLI_ARGS, useFactory: () => parseCliArgs() }`
- [ ] `ApplicationConfigService` injects `@Inject(CLI_ARGS) cliArgs: CliArgs` instead of calling `parseCliEnvironment()` internally
- [ ] `parseCliEnvironment()` private method removed from `ApplicationConfigService`
- [ ] `resolveEnvironment()` reads from `cliArgs.environment` instead of calling `parseCliEnvironment()`
- [ ] `pnpm check` exits 0
- [ ] All existing tests pass

## Files Affected

- `src/international-space-bar-server/application-config/cli-args.ts` — new file
- `src/international-space-bar-server/application-config/application-config.service.ts` — inject `CLI_ARGS`, remove `parseCliEnvironment()`, update `resolveEnvironment()`
- `src/international-space-bar-server/application-config/application-config.module.ts` — register `CLI_ARGS` provider

## Comments

Design doc Work Item 1a. Prerequisite for isb-0041 (config path) and isb-0042 (swappable store).
