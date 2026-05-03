# isb-0062: Document server bootstrap startup sequence changes

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-010 |
| Type         | `feature`    |
| Status       | `backlog`    |
| Assignee     | Docs Writer  |
| Priority     | `low`        |
| Created      | 2026-04-30   |
| Completed    | —            |
| Dependencies | none         |

## Description

Update `docs/logging.md` to reflect the WebSocket adapter registration step
that was added to `main.ts` during the server bootstrap hardening work. Update
`AGENTS.md` to note that `DEFAULT_HOST = "127.0.0.1"` is intentional
(loopback-only — external access requires explicit configuration).

## Background

`main.ts` received three undocumented bootstrap changes during the server
bootstrap hardening implementation:

1. **WebSocket adapter registration** (`app.useWebSocketAdapter(new OpenResponsesWsAdapter(app))`)
   — required for the WebSocket gateway to function, but the `docs/logging.md`
   startup sequence section does not mention this step. An engineer following
   the startup sequence to debug WebSocket issues would miss it.

2. **Flexible host/port resolution** — port and host are now resolved from
   config first, then env vars, then hardcoded defaults. `DEFAULT_HOST` is
   hardcoded to `127.0.0.1` (loopback). This is intentional: the server binds
   to loopback by default to avoid accidental external exposure. External access
   requires setting `HOST` env var or `config.server.host`.

3. **Debug diagnostics** — several `logger.debug()` calls log whether config
   keys and env vars are set at startup. This behaviour is not documented anywhere,
   which can cause confusion when someone sees unexpected `debug` level output.

Without documentation, engineers:

- Will not know the correct startup order (WS adapter must be registered before `app.listen()`)
- May wonder why the server is not accessible externally and not know to set `HOST`
- May be confused by the debug-level config dump at startup

## Technical Context

**`docs/logging.md` startup sequence** currently documents the NestJS bootstrap
flow as established in isb-0055. The actual startup sequence in `main.ts` is:

```
1. NestFactory.create(AppModule, { bufferLogs: true })
2. app.get(PinoLoggerService) → app.useLogger(logger)
3. app.useWebSocketAdapter(new OpenResponsesWsAdapter(app))   ← NEW, undocumented
4. config.get("server.enableCors") → app.enableCors(...)      ← (post isb-0059)
5. logger.log(...) — startup message
6. config resolution: port, host
7. logger.debug(...) × 5 — config dump
8. app.enableShutdownHooks()
9. app.listen(port, host)
```

Step 3 (`useWebSocketAdapter`) must come before `app.listen()`. If it is
called after `listen()`, the WS adapter may not be registered in time for the
first connection.

**`DEFAULT_HOST`** is defined in `main.ts` as:

```typescript
const DEFAULT_HOST = "127.0.0.1";
```

The TODO comment in the file explains it should be overrideable, but the
rationale for loopback-only (rather than `0.0.0.0`) is not stated anywhere.

**`AGENTS.md`** currently references the server host/port config but does not
mention the `DEFAULT_HOST` rationale.

## Acceptance Criteria

- **AC-1**: `docs/logging.md` startup sequence section accurately reflects the current `main.ts` bootstrap order, including the `app.useWebSocketAdapter()` step with a note about ordering requirements (must precede `app.listen()`).
- **AC-2**: `docs/logging.md` documents the debug-level config dump behaviour (what is logged and at what level) so engineers know what to expect at `debug` log level.
- **AC-3**: `AGENTS.md` has a note that `DEFAULT_HOST = "127.0.0.1"` is intentional (loopback-only by default; set `server.host` in config or `HOST` env var for external access).
- **AC-4**: All documentation is consistent with the actual `main.ts` implementation.
- **AC-5**: `pnpm check` exits 0.

## Files Affected

- `docs/logging.md` — update startup sequence to include `app.useWebSocketAdapter()` step; add note about debug-level config dump; ensure step ordering is accurate.
- `AGENTS.md` — add note about `DEFAULT_HOST = "127.0.0.1"` being intentional loopback-only default under the server configuration section.

## Test Expectations

No code tests for this ticket. Quality gate: Challenger reviews documentation
accuracy against the current `main.ts` implementation (lines 17–68).

## Definition of Done

- `docs/logging.md` startup sequence matches the actual `main.ts` bootstrap order.
- `AGENTS.md` documents the `DEFAULT_HOST` rationale.
- `pnpm check` exits 0.
- Challenger confirms documentation is consistent with the actual code.
