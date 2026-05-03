# isb-0057: Fix ResponsesGateway to inject ILogger via LOGGER token

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-010 |
| Type         | `bug`        |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `critical`   |
| Created      | 2026-04-30   |
| Completed    | —            |
| Dependencies | none         |

## Description

Replace the inline `new Logger(ResponsesGateway.name)` field in
`responses.gateway.ts` with constructor injection of `ILogger` via the
`LOGGER` symbol token. This restores compliance with the Dependency Inversion
rule established in isb-0055 and enforced by `AGENTS.md`.

## Background

During Phase A validation of the kubb-preprocessing / server-bootstrap design
document, the Architect identified that `responses.gateway.ts` deviates from
the DI contract established in isb-0055.

`LoggingModule` (isb-0055) defined the canonical pattern for all services that
need logging: inject `@Inject(LOGGER) private readonly logger: ILogger`. This
ensures:

- Logger implementations are swappable in tests without NestJS bootstrap
- All structured output routes through `PinoLoggerService`
- Services depend on the `ILogger` abstraction, not on a concrete NestJS class

`ResponsesGateway` was written using `private readonly logger = new Logger(ResponsesGateway.name)`.
While this works at runtime — NestJS internally delegates `Logger` to the
registered logger service — it:

- Bypasses the interface contract in unit tests
- Creates a hidden coupling to NestJS's internal wiring
- Is inconsistent with `PingPongRuntimeService` and every other service in the module
- Would fail any future test suite that constructs `ResponsesGateway` without
  full NestJS bootstrap

This was caught during retrospective validation and is classified as a `bug`
(deviation from documented architectural rule) with `critical` priority because
it actively undermines the DI pattern that isb-0055 hardened.

## Technical Context

**File:** `src/international-space-bar-server/openresponses/responses.gateway.ts`

**Current state (line 104):**

```typescript
import { Inject, Injectable, Logger } from "@nestjs/common";
// ...
export class ResponsesGateway
    implements OnGatewayConnection<WsClient>, OnGatewayDisconnect<WsClient>
{
    private readonly logger = new Logger(ResponsesGateway.name);
    private readonly connections = new WeakMap<WsClient, ConnectionState>();

    constructor(@Inject(AGENT_RUNTIME_PORT) private readonly runtime: AgentRuntimePort) {}
```

**Expected state after fix:**

```typescript
import { Inject, Injectable } from "@nestjs/common";
import { LOGGER } from "../common/interfaces/logger.port.js";
import type { ILogger } from "../common/interfaces/index.js";
// ...
export class ResponsesGateway
    implements OnGatewayConnection<WsClient>, OnGatewayDisconnect<WsClient>
{
    private readonly connections = new WeakMap<WsClient, ConnectionState>();

    constructor(
        @Inject(AGENT_RUNTIME_PORT) private readonly runtime: AgentRuntimePort,
        @Inject(LOGGER) private readonly logger: ILogger,
    ) {}
```

**Call-site migration (TypeScript compile error if omitted):** `ILogger` has no
`log()` method. Three existing `this.logger.log(...)` calls must each be renamed
to `this.logger.info(...)`:

| Location                       | Current                                                 | Required                                                 |
| ------------------------------ | ------------------------------------------------------- | -------------------------------------------------------- |
| `handleConnection` (~line 132) | `this.logger.log("WebSocket client connected")`         | `this.logger.info("WebSocket client connected")`         |
| `handleDisconnect` (~line 142) | `this.logger.log("WebSocket client disconnected")`      | `this.logger.info("WebSocket client disconnected")`      |
| error handler (~line 267)      | `this.logger.log(\`Evicted previous_response_id=...\`)` | `this.logger.info(\`Evicted previous_response_id=...\`)` |

**`ILogger` interface** is re-exported from:

- `src/international-space-bar-server/common/interfaces/index.ts` → re-exports from `common/interfaces/logger.port.ts`
- `src/international-space-bar-server/common/interfaces/logger.port.ts` → re-exports `ILogger` from `src/international-space-bar/interfaces/logger.interface.ts`

**`LOGGER` symbol** is defined in:

- `src/international-space-bar-server/common/interfaces/logger.port.ts` (line 11: `export const LOGGER = Symbol("LOGGER")`)

**`PingPongRuntimeService`** uses the correct pattern and serves as the
canonical reference for how other services in this module should inject the logger.

## Acceptance Criteria

- **AC-1**: `responses.gateway.ts` no longer contains `private readonly logger = new Logger(...)` — the field is removed entirely.
- **AC-2**: `ResponsesGateway` constructor accepts `@Inject(LOGGER) private readonly logger: ILogger` as its second parameter.
- **AC-3**: `Logger` is removed from the `@nestjs/common` import (it is unused after this change).
- **AC-4**: `LOGGER` is imported from `"../common/interfaces/logger.port.js"`.
- **AC-5**: `ILogger` is imported as a type from `"../common/interfaces/index.js"`.
- **AC-6**: All three `this.logger.log(...)` calls are replaced with `this.logger.info(...)`.
- **AC-7**: `pnpm check` exits 0 after the change.
- **AC-8**: The existing gateway unit tests (if any) still pass; new tests verify logger injection (see Test Expectations).

## Files Affected

- `src/international-space-bar-server/openresponses/responses.gateway.ts` — remove inline logger field, add constructor parameter for `ILogger`, rename `log()` → `info()` at three call sites, update imports.

## Test Expectations

The Tester must cover the following scenarios (unit tests — no NestJS bootstrap required):

- **T-10**: `ResponsesGateway` is constructable when provided `AGENT_RUNTIME_PORT` and `LOGGER` mocks — no `NestFactory` needed.
- **T-11**: `handleConnection` calls `logger.info("WebSocket client connected")` when auth passes.
- **T-12**: `handleDisconnect` calls `logger.info("WebSocket client disconnected")`.
- **T-13**: `handleConnection` does NOT call `logger.info` when auth fails (unauthorized path — client is closed without a log message leaking info).

Test type: unit tests using Node.js built-in `node:test` runner (consistent with the rest of the test suite). No NestJS `Test.createTestingModule()` — gateway must be constructable directly with mocked constructor arguments.

## Definition of Done

- `src/international-space-bar-server/openresponses/responses.gateway.ts` contains no `new Logger(...)` occurrence.
- `pnpm check` exits 0.
- `ISB_PROJECT_ENVIRONMENT=test pnpm test` includes the new gateway tests and exits 0.
- TypeScript compiler reports no errors (`pnpm check` covers this via ESLint type-aware rules).
