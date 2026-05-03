# NestJS Server Logging — Design Document

> **Scope:** `international-space-bar-server` (NestJS HTTP adapter).  
> This document covers the server-layer logging infrastructure introduced by `isb-0055`.  
> For agent observability logging (the separate `agents.log` pipeline), see
> [`docs/agent-observability-logging.md`](agent-observability-logging.md).

---

## Table of Contents

1. [Overview](#1-overview)
2. [Why Logging and Observability Must Stay Separate](#2-why-logging-and-observability-must-stay-separate)
3. [Bridge Pattern — Dual Interface Design](#3-bridge-pattern--dual-interface-design)
4. [Module Architecture](#4-module-architecture)
5. [Startup Sequence](#5-startup-sequence)
6. [Configuration Reference](#6-configuration-reference)
7. [Concerns Separation Table](#7-concerns-separation-table)
8. [Future HTTP Logging (pino-http)](#8-future-http-logging-pino-http)
9. [Usage Examples](#9-usage-examples)

---

## 1. Overview

The NestJS server layer uses a single `PinoLoggerService` for all structured
logging. This service:

- Replaces NestJS's default console logger with pino.
- Implements **both** the NestJS `LoggerService` interface and the inner
  `ILogger` interface, bridging the two layers without coupling either to the
  other's types.
- Reads its configuration from `ApplicationConfigService` at construction time.
- Is provided globally through `LoggingModule` (`@Global()`), making it
  injectable into any module without re-importing the module.

### What this is NOT

- Not the core agent logger (`logging.ts` / TUI ring buffer). That is a
  separate pino instance that writes to `app.log` and the TUI. The two must
  never share instances or streams.
- Not an agent observability logger. Agent audit trails flow through
  `agentLogger` (a separate pino instance) to `agents.log`.

---

## 2. Why Logging and Observability Must Stay Separate

The project enforces a hard separation between three logging concerns:

| Concern                       | Infrastructure                               | Purpose                                                        |
| ----------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| **System logging** (core app) | `Logging` class, `app.log` + TUI ring buffer | Infrastructure diagnostics: startup, config load, retries      |
| **Agent observability**       | `agentLogger`, `agents.log`                  | Behavioural audit: intent classification, token usage, routing |
| **HTTP server logging**       | `PinoLoggerService`, `server.log`            | NestJS internals, request lifecycle, DI events                 |

Mixing these into a single pino instance makes it impossible to:

1. Tune log levels independently (agent tuning vs infrastructure debugging).
2. Route concerns to separate storage backends (agents.log → ML pipelines,
   server.log → SRE alerting).
3. Redact sensitive fields selectively per domain.

**Rule:** Each domain gets its own pino instance, its own log file, and its own
configuration. They do not share streams.

---

## 3. Bridge Pattern — Dual Interface Design

`PinoLoggerService` must simultaneously satisfy two contracts:

```
NestJS app.useLogger(service)
    └── NestJS calls: service.log(msg, ctx), service.error(msg), etc.
                              │
                    PinoLoggerService
                              │
    ┌─────────────────────────┴──────────────────────────┐
    │ implements LoggerService   │   implements ILogger   │
    │ (NestJS @nestjs/common)    │   (inner interfaces/)  │
    └────────────────────────────┴───────────────────────┘
                              │
                         pino.Logger
```

### Why a single class instead of two separate adapters?

- Reduces boilerplate: one `@Injectable()` class, one DI token.
- Guarantees both interfaces always delegate to the same underlying pino
  instance, so there is never a split in log output.

### The cross-layer import

`PinoLoggerService` needs `ILogger` from the inner `interfaces/` layer. Direct
imports from the server layer into the core domain are permitted by
`AGENTS.md` because `interfaces/` is the **innermost layer** and is explicitly
allowed to be imported by any outer layer via declared port contracts.

The import is funnelled through a single shim:

```typescript
// src/international-space-bar-server/common/interfaces/logger.port.ts
export type { ILogger } from "../../international-space-bar/interfaces/logger.interface.js";
```

**This is the first and only intentional cross-layer re-export from the core
domain into the server layer.** Any future cross-layer types must go through a
new `*.port.ts` file in `common/interfaces/`, never as a direct import.

---

## 4. Module Architecture

```
src/international-space-bar-server/
  logging/
    logging.module.ts        ← @Global() @Module — provides + exports PinoLoggerService
    pino-logger.service.ts   ← @Injectable() — implements LoggerService + ILogger
  common/
    interfaces/
      logger.port.ts         ← re-export shim for ILogger (cross-layer boundary point)
      index.ts               ← barrel — includes logger.port
  app.module.ts              ← imports LoggingModule
  main.ts                    ← app.useLogger(app.get(PinoLoggerService))
```

### `LoggingModule`

```typescript
@Global()
@Module({
    imports: [ApplicationConfigModule],
    providers: [PinoLoggerService],
    exports: [PinoLoggerService],
})
export class LoggingModule {}
```

`@Global()` means:

- Any module can inject `PinoLoggerService` without importing `LoggingModule`.
- `ApplicationConfigModule` is imported explicitly so `LoggingModule` is
  self-contained and can be tested in isolation — an `overrideProvider` on
  `ApplicationConfigService` is visible within `LoggingModule`'s own DI context
  only when the import is declared here.

### `PinoLoggerService` construction

NestJS injects `ApplicationConfigService` into `PinoLoggerService`'s primary
constructor. The constructor:

1. Reads `config.logger.level` — falls back to `"info"` if absent (see §6).
2. Builds stream entries for stdout and (if configured) a log file.
3. Creates the pino logger via `pino.multistream(streams)`.
4. Emits a warning if the level was absent.

Child loggers are created via an internal static factory (`fromPinoLogger`) that
uses `Object.create` + `Reflect.set` to bypass DI — child instances share the
same streams but carry additional bound fields (e.g. `{ module: "my.service" }`).

---

## 5. Startup Sequence

```
NestFactory.create(AppModule, { bufferLogs: true })
  │
  ├─ NestJS bootstraps DI graph
  │    ├─ ApplicationConfigModule (global) → loads config.yaml
  │    └─ LoggingModule (global) → constructs PinoLoggerService
  │         └─ PinoLoggerService constructor
  │              ├─ reads config.logger.level
  │              ├─ builds pino streams
  │              └─ creates pino logger
  │
  ├─ app.useLogger(app.get(PinoLoggerService))
  │    └─ NestJS flushes buffered internal log messages through PinoLoggerService
  │
  ├─ app.useWebSocketAdapter(new OpenResponsesWsAdapter(app))
  │    └─ registers native ws adapter for /v1/responses WebSocket gateway
  │         ⚠ must be called before app.listen() — see §5.1 below
  │
  ├─ app.enableCors(...)        ← only when config.server.enableCors is true
  │
  ├─ logger.log(...)            ← "Starting international-space-bar-server in <env> mode ..."
  │
  ├─ port/host resolution       ← config.server.port (schema default: 3000)
  │                                config.server.host (schema default: "127.0.0.1")
  │
  ├─ logger.debug(...)  ×6      ← config dump (see §5.2 below)
  │
  ├─ logger.info(...)           ← "Listening on <host>:<port>"
  │
  ├─ app.enableShutdownHooks()
  │
  └─ app.listen(port, host)
```

**Why `bufferLogs: true`?**

NestJS emits internal log messages (module initialisation, DI graph resolution)
before `app.useLogger` is called. `bufferLogs: true` holds these messages in
memory until `useLogger` is called, at which point they are flushed through the
configured logger. Without this, NestJS's default console logger would emit
these early messages and `PinoLoggerService` would never see them.

### 5.1 WebSocket adapter ordering

`app.useWebSocketAdapter()` must be called **before** `app.listen()`. If called
after, the WS adapter may not be registered in time for the first incoming
connection and the `/v1/responses` WebSocket gateway will not be reachable.

### 5.2 Debug-level config dump

At every startup, `bootstrap()` emits six `debug`-level log lines via
`PinoLoggerService` to aid config troubleshooting:

```
[debug] Logging application debug information:
[debug] Is CORS enabled? <true|false|undefined>
[debug] Is server.port set? <value|undefined>
[debug] Is server.host set? <value|undefined>
[debug] Is environment variable HOST set? <value|"undefined">
[debug] Is environment variable PORT set? <value|"undefined">
```

These lines are emitted only when the configured log level is `debug` or lower
(`trace`). At `info` or higher they are silently suppressed by pino. Set
`config.logger.level: debug` in `config.dev.yaml` (or `config.test.yaml`) to
see them.

---

## 6. Configuration Reference

Configuration is read from `config.<env>.yaml` under the `logger` key.

```yaml
logger:
    type: pino # reserved for future multi-backend support
    logFilePath: ./logs/server.log # optional; relative to process.cwd()
    level: debug # optional; enum: fatal|error|warn|info|debug|trace
```

### Fields

| Field         | Type                                                 | Required | Default  | Notes                                                       |
| ------------- | ---------------------------------------------------- | -------- | -------- | ----------------------------------------------------------- |
| `type`        | `string`                                             | no       | —        | Reserved; unused by `PinoLoggerService`                     |
| `logFilePath` | `string`                                             | no       | —        | Resolved with `path.resolve(process.cwd(), ...)` before use |
| `level`       | `"fatal"\|"error"\|"warn"\|"info"\|"debug"\|"trace"` | no       | `"info"` | Falls back with a pino warning when absent                  |

### Level fallback behaviour

When `config.logger.level` is absent (the field is missing or the whole
`logger` block is absent), `PinoLoggerService` falls back to `"info"` and
immediately emits:

```
{"level":"warn","time":"…","msg":"config.logger.level is undefined — falling back to 'info'"}
```

This warning is intentionally emitted on the pino logger itself — not on a
pre-pino console — so it lands in all configured destinations (stdout and
logFilePath if set).

### Stream strategy

| Environment   | Stdout                       | File                              |
| ------------- | ---------------------------- | --------------------------------- |
| `dev`, `test` | pino-pretty (coloured, sync) | JSON lines (if `logFilePath` set) |
| `prod`        | JSON (fd 1, SonicBoom)       | JSON lines (if `logFilePath` set) |

---

## 7. Concerns Separation Table

| Concern               | Logger instance      | Config key                        | Destination                 | Notes                            |
| --------------------- | -------------------- | --------------------------------- | --------------------------- | -------------------------------- |
| HTTP server internals | `PinoLoggerService`  | `config.logger`                   | stdout + `logFilePath`      | This document                    |
| Core app / infra      | `Logging` class      | `config.logFilePath` in `IConfig` | `app.log` + TUI ring buffer | `logging.ts`                     |
| Agent observability   | `agentLogger` (pino) | `config.agentLogFilePath`         | `agents.log`                | `agent-observability-logging.md` |
| Future: API tracing   | TBD (`pino-http`)    | TBD                               | `api.log`                   | See §8                           |

**Rule:** No two rows in this table may share a pino instance or a stream.

---

## 8. Future HTTP Logging (pino-http)

`pino-http` middleware would capture per-request structured logs (method, URL,
status, latency, request ID). This is **explicitly out of scope** for
`isb-0055` and deferred to a future ticket.

### Why deferred?

`pino-http` exposes request and response objects including headers. HTTP
headers routinely contain credentials:

- `Authorization: Bearer <token>`
- `Cookie: session=…`
- `X-Api-Key: …`

### Mandatory pre-condition

**`Authorization` header redaction is a mandatory security requirement before
`pino-http` can be implemented.** Logging raw headers without redaction
constitutes a credentials leak in structured logs.

The future ticket must:

1. Configure `pino-http`'s `redact` option to suppress `Authorization`,
   `Cookie`, and any custom API-key headers.
2. Include a security review step that verifies no credential values appear
   in logged output.
3. Reference this section as the documented pre-condition.

No implementation of `pino-http` middleware is permitted until the above
requirements are met.

---

## 9. Usage Examples

### Injecting `PinoLoggerService` as `ILogger`

```typescript
import { Injectable } from "@nestjs/common";
import type { ILogger } from "../common/interfaces/index.js";
import { PinoLoggerService } from "../logging/pino-logger.service.js";

@Injectable()
export class MyService {
    private readonly log: ILogger;

    constructor(pinoLogger: PinoLoggerService) {
        this.log = pinoLogger.child("my.service");
    }

    doWork(): void {
        this.log.info({ jobId: 42 }, "Starting job");
        this.log.debug("Detailed step");
        this.log.error({ err: new Error("oops") }, "Job failed");
    }
}
```

### Using `child()` for module-scoped loggers

Each `child(name)` call binds a `module` field to every log line:

```json
{ "level": "info", "time": "…", "module": "my.service", "jobId": 42, "msg": "Starting job" }
```

### NestJS internal log output (dev)

When NestJS's DI system logs a module initialisation:

```
[PinoLoggerService] [Nest] LOG — NestFactory is initializing...
```

This call reaches `PinoLoggerService.log("NestFactory is initializing...", "NestFactory")`,
which emits:

```json
{
    "level": "info",
    "time": "…",
    "nestContext": "NestFactory",
    "msg": "NestFactory is initializing..."
}
```
