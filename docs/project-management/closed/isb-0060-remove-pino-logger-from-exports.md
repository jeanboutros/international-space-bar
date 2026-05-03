# isb-0060: Remove PinoLoggerService from LoggingModule exports

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-010 |
| Type         | `bug`        |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `medium`     |
| Created      | 2026-04-30   |
| Completed    | —            |
| Dependencies | none         |

## Description

Remove `PinoLoggerService` from `LoggingModule`'s `exports` array. It should
remain in `providers` (so NestJS wires it as the concrete implementation behind
the `LOGGER` token) but not be exported as an injectable token in its own right.

## Background

During Phase A architectural review of the server bootstrap design, the
Architect identified that `LoggingModule` exports both the `LOGGER` token and
the concrete `PinoLoggerService` class:

```typescript
exports: [LOGGER, PinoLoggerService],
```

Exporting the concrete class allows any module or service in the application to
bypass the `ILogger` abstraction by declaring a constructor dependency directly
on `PinoLoggerService` instead of `ILogger`. This defeats the purpose of the
`LOGGER` injection token and the interface contract that isb-0055 was designed
to enforce.

The only legitimate use of `PinoLoggerService` outside the module is in
`main.ts`, where `app.get(PinoLoggerService)` retrieves the instance to call
`app.useLogger(logger)` (the NestJS bridge pattern for replacing the default
logger). This call does **not** require the class to be in `exports` — `app.get()`
accesses the provider registry directly, bypassing the module export boundary.

The fix: remove `PinoLoggerService` from `exports`. `LOGGER` remains exported
(it is the canonical injection token for `ILogger`). `PinoLoggerService` remains
in `providers` so NestJS knows how to instantiate it.

## Technical Context

**File:** `src/international-space-bar-server/logging/logging.module.ts`

**Current state:**

```typescript
@Global()
@Module({
    imports: [ApplicationConfigModule],
    providers: [{ provide: LOGGER, useClass: PinoLoggerService }, PinoLoggerService],
    exports: [LOGGER, PinoLoggerService],
})
export class LoggingModule {}
```

**Expected state:**

```typescript
@Global()
@Module({
    imports: [ApplicationConfigModule],
    providers: [{ provide: LOGGER, useClass: PinoLoggerService }, PinoLoggerService],
    exports: [LOGGER],
})
export class LoggingModule {}
```

**Why `PinoLoggerService` stays in `providers`:** NestJS requires the concrete
provider to be declared in `providers` to resolve the `useClass` binding for
`LOGGER`. If it were removed from `providers`, the `{ provide: LOGGER, useClass: PinoLoggerService }`
binding would fail to resolve.

**`app.get(PinoLoggerService)` in `main.ts`:** This call works because `app.get()`
uses the application-level provider registry (bypassing module export boundaries).
Removing `PinoLoggerService` from `exports` does not affect this call.

**Verification:** After the change, confirm `main.ts` still compiles and the
server starts successfully (`pnpm dev:server` or the integration smoke test).

## Acceptance Criteria

- **AC-1**: `LoggingModule.exports` contains only `LOGGER` — `PinoLoggerService` is not present in the exports array.
- **AC-2**: `LoggingModule.providers` still contains both `{ provide: LOGGER, useClass: PinoLoggerService }` and the bare `PinoLoggerService` entry.
- **AC-3**: `main.ts` is unchanged — `app.get(PinoLoggerService)` is still valid and the server boots correctly.
- **AC-4**: Existing `logging.module.test.ts` tests still pass.
- **AC-5**: `pnpm check` exits 0.

## Files Affected

- `src/international-space-bar-server/logging/logging.module.ts` — remove `PinoLoggerService` from the `exports` array; leave all other declarations unchanged.

## Test Expectations

No new tests are required for this ticket. The change is a one-line deletion;
correctness is verified by:

- Existing `logging.module.test.ts` passing (verifies DI wiring is still functional)
- `main.ts` smoke-level boot (verifies `app.get(PinoLoggerService)` still resolves)

If `logging.module.test.ts` does not currently verify that the `LOGGER` token
resolves to a `PinoLoggerService` instance, the Tester should add that assertion
as part of this ticket.

## Definition of Done

- `exports: [LOGGER, PinoLoggerService]` is replaced with `exports: [LOGGER]` in `logging.module.ts`.
- Existing logging module tests pass.
- `pnpm check` exits 0.
- No other file in `src/` directly imports `PinoLoggerService` as a constructor parameter type (a `grep` check: `grep -r "PinoLoggerService" src/ --include="*.ts"` should return only: `logging.module.ts`, `pino-logger.service.ts`, and `main.ts`).
