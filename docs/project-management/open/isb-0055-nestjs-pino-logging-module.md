# isb-0055: Add NestJS pino logging module to international-space-bar-server

| Field | Value |
|-------|-------|
| Epic | — |
| Type | `feature` |
| Status | `open` |
| Assignee | Engineer |
| Priority | `high` |
| Created | 2026-04-29 |
| Completed | — |
| Dependencies | none |

## Description

Wire pino into the NestJS server layer via a dedicated `LoggingModule`. Today `NestFactory.create` receives a bare `logger: [...]` array and there is no structured logger available to inject into services. This ticket introduces:

- A `@Global()` `LoggingModule` that exposes a `PinoLoggerService`
- `PinoLoggerService` implements both NestJS `LoggerService` and the inner `ILogger` interface, bridging the two layers
- A `logger.port.ts` re-export shim in `common/interfaces/` — the first deliberate cross-layer re-export, documented in the design doc and in `AGENTS.md`
- Atomic swap: `app.useLogger(app.get(PinoLoggerService))` replaces the `logger: [...]` array in `main.ts`
- `config.logger.level` tightened to an enum (with fallback to `"info"`)
- `docs/logging.md` — full design document covering the bridge pattern, startup sequence, config reference, separation-of-concerns table, and future HTTP logging work

The spike is intentionally limited: `pino-http` middleware is **out of scope** and explicitly deferred to future work (see AC-9).

## Acceptance Criteria

- [ ] **AC-1** `config.logger.level` schema changed to `z.enum(["fatal","error","warn","info","debug","trace"]).optional()` — invalid string values are rejected at startup
- [ ] **AC-2** `PinoLoggerService` falls back to `"info"` with a logged warning when `config.logger.level` is `undefined`
- [ ] **AC-3** `logFilePath` is resolved with `path.resolve(process.cwd(), logFilePath)` before being passed to pino — no relative-path drift at runtime
- [ ] **AC-4** Removal of `logger: [...]` from `NestFactory.create` is atomic with `app.useLogger(app.get(PinoLoggerService))` — both happen in the same commit, never independently
- [ ] **AC-5** `LoggingModule` is decorated `@Global()` so consuming modules do not need to re-import it
- [ ] **AC-6** `logger.port.ts` re-exports `ILogger` from the inner `interfaces/` layer; `common/interfaces/index.ts` barrel includes it; `AGENTS.md` and `docs/logging.md` document this as the first intentional cross-layer re-export
- [ ] **AC-7** `docs/logging.md` covers all 9 planned sections: overview, why separate, bridge pattern, module architecture, startup sequence, config reference, concerns-separation table, future HTTP logging (with mandatory `Authorization` header redaction note), usage examples
- [ ] **AC-8** `AGENTS.md` updated with server logging rules (NestJS logger wiring conventions)
- [ ] **AC-9** `docs/logging.md` explicitly marks `pino-http` as **future work** and notes that `Authorization` header redaction is **mandatory** before that feature is implemented
- [ ] **AC-10** `pnpm check` exits 0 after all changes; no lint suppressions without explanatory comments

### Test criteria (handed off to Tester)

- [ ] **TC-1** `pino-logger.service.test.ts` — unit tests, no NestJS bootstrap; covers level fallback, pino instance creation, `ILogger` contract
- [ ] **TC-2** `logging.module.test.ts` — NestJS `Test.createTestingModule` integration; verifies `PinoLoggerService` is injectable globally
- [ ] **TC-3** `config.schema.test.ts` — 3 new enum validation cases: valid level accepted, invalid string rejected, undefined falls through to optional

## Files Affected

### New files
- `src/international-space-bar-server/logging/logging.module.ts` — `@Global()` NestJS module that provides and exports `PinoLoggerService`
- `src/international-space-bar-server/logging/pino-logger.service.ts` — implements `LoggerService` (NestJS) + `ILogger` (inner interfaces layer); resolves `logFilePath`; falls back level to `"info"`
- `src/international-space-bar-server/common/interfaces/logger.port.ts` — re-exports `ILogger` from `../../interfaces/` (bridge shim)
- `docs/logging.md` — full design document (9 sections)

### Modified files
- `src/international-space-bar-server/common/interfaces/index.ts` — add `export * from "./logger.port.js"` to barrel
- `src/international-space-bar-server/app.module.ts` — import and register `LoggingModule`
- `src/international-space-bar-server/main.ts` — replace `logger: [...]` with `app.useLogger(app.get(PinoLoggerService))` (atomic)
- `src/international-space-bar-server/application-config/config.schema.ts` — `level` field → `z.enum(["fatal","error","warn","info","debug","trace"]).optional()`
- `AGENTS.md` — add server logging rules section
- `docs/technical-stack.md` — minor architecture note on the bridge pattern

### Test files (separate Tester ticket scope)
- `src/international-space-bar-server/logging/pino-logger.service.test.ts`
- `src/international-space-bar-server/logging/logging.module.test.ts`
- `src/international-space-bar-server/application-config/config.schema.test.ts` (update)

## PoC Snippets

```typescript
// pino-logger.service.ts — level fallback
const resolvedLevel = config.logger?.level ?? (() => {
  this.warn("config.logger.level is undefined — falling back to 'info'");
  return "info" as const;
})();
```

```typescript
// pino-logger.service.ts — path resolution
const destination = pino.destination(
  path.resolve(process.cwd(), config.logger.logFilePath)
);
```

```typescript
// config.schema.ts — enum tightening
level: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).optional(),
```

```typescript
// main.ts — atomic swap
const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(PinoLoggerService));
```

## Comments

- Phase A Tech Validator: all 5 mandatory conditions confirmed as ACs (AC-1 through AC-5).
- Security Reviewer: `pino-http` deferred; `Authorization` redaction is a mandatory pre-condition for that future ticket (captured in AC-9).
- Test Planner: 3 test files identified (TC-1, TC-2, TC-3); `smoke.test.ts` validates compilation implicitly, no change needed.
- Docs Planner: 9-section `docs/logging.md`, `AGENTS.md` server logging rules, `docs/technical-stack.md` minor note.
- PM (2026-04-29): ticket created from Phase B synthesis; no open clarifications; no blocked areas.
