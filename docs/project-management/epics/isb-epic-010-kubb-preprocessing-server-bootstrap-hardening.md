# isb-epic-010: Kubb Preprocessing + Server Bootstrap Hardening

| Field | Value |
|-------|-------|
| Priority | `high` |
| Status | `not-started` |
| Created | 2026-04-30 |
| Design doc | [docs/designs/isb-kubb-preprocessing-and-server-bootstrap.md](../../designs/isb-kubb-preprocessing-and-server-bootstrap.md) |
| Tickets | isb-0057, isb-0058, isb-0059, isb-0060, isb-0061, isb-0062, isb-0063 |

## Summary

Three independently-motivated but closely-timed changes landed outside the ticket
lifecycle and require retrospective validation, tests, documentation, and small
remediation work. This epic groups them into a logical delivery unit:

1. **Kubb spec preprocessing** — `removeDisallowedFields` was inlined in
   `kubb.config.ts` without tests. The function must be extracted and tested.
2. **Server bootstrap hardening** — `main.ts` stabilises startup with WebSocket
   adapter registration, flexible host/port resolution, and CORS hardening.
3. **Logging DI compliance** — `responses.gateway.ts` bypasses the `ILogger`
   interface contract by using `new Logger(...)`. This must be corrected.

Two supporting documentation tickets and one pre-existing debt ticket round out
the epic.

## Scope

- Fix `ResponsesGateway` to inject `ILogger` via the `LOGGER` token (isb-0057)
- Extract `removeDisallowedFields` to a testable module and write unit tests (isb-0058)
- Harden `app.enableCors()` with explicit origin constraints and schema validation (isb-0059)
- Remove `PinoLoggerService` from `LoggingModule` exports (isb-0060)
- Document kubb preprocessing convention and sentinel in technical stack docs (isb-0061)
- Document server bootstrap startup sequence changes (isb-0062)
- Improve `ApplicationConfigService.get()` to typed key paths (isb-0063, debt)

## Design decisions referenced

- Dependency Inversion via `LOGGER` token (isb-0055, AGENTS.md)
- Source spec immutability — temp file pattern for Kubb input
- `DEFAULT_HOST = "127.0.0.1"` — loopback-only by default
- `x-openresponses-disallowed` sentinel convention

## Acceptance criteria (from design doc)

- `responses.gateway.ts` injects `ILogger` — no inline `new Logger()`
- `removeDisallowedFields` is tested: all three conditions, partial matches, recursion, array recursion, null/primitive guards, source immutability
- `app.enableCors()` called with explicit origin list; `server.corsOrigins` declared in `ConfigSchema`
- `PinoLoggerService` not in `LoggingModule.exports`
- `docs/technical-stack.md` and `docs/schema-generation.md` document the sentinel and preprocessing step
- `docs/logging.md` startup sequence reflects WebSocket adapter step
- `pnpm check` exits 0 after all tickets

## Dependencies

isb-epic-009 (config infrastructure) — partially; isb-0059 and isb-0063 build on the config schema work done there.
