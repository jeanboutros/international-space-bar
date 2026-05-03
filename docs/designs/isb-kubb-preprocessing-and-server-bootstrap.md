# Design: Kubb Spec Preprocessing + Server Bootstrap Hardening

**Status**: Implemented — pipeline validation required  
**Date**: 2026-04-30  
**Author**: Agent Zero (retrospective design document)  
**Scope**: `kubb.config.ts`, `main.ts`, logging DI pattern in `responses.gateway.ts`

---

## 1. Overview

Three independently-motivated but closely-timed changes landed outside the ticket lifecycle and require retrospective validation, documentation, and tests:

1. **Kubb spec preprocessing** (`kubb.config.ts`) — strips `x-openresponses-disallowed` sentinel fields from the OpenAPI spec before Kubb generates schemas, preventing a Zod 4 regex-compilation crash.
2. **Server bootstrap hardening** (`main.ts`) — stabilises the NestJS startup sequence with WebSocket adapter registration, flexible host/port resolution, and debug diagnostics.
3. **Logging DI pattern inconsistency** (`responses.gateway.ts`) — the gateway uses `new Logger(ResponsesGateway.name)` (NestJS built-in) rather than injecting `ILogger` via the `LOGGER` token. This bypasses the interface contract established in isb-0055 and needs to be corrected.

---

## 2. Change 1 — Kubb spec preprocessing

### Problem

`docs/openapi/openresponses.json` uses a convention to mark fields that are
forbidden in certain protocol contexts (e.g. `stream` in WebSocket
`response.create` messages):

```json
"stream": {
  "type": "string",
  "minLength": 1,
  "maxLength": 0,
  "x-openresponses-disallowed": true
}
```

The `minLength: 1, maxLength: 0` constraint is intentionally impossible — it signals "this field MUST NOT appear." Zod 4 evaluates string constraints eagerly at schema-construction time by building a regex, and `/^[\s\S]{1,0}$/` is invalid. The result: importing `webSocketResponseCreateEventSchema` throws a `SyntaxError` at module load time, crashing `pnpm dev:server`.

### Solution

Preprocess the parsed OpenAPI spec in `kubb.config.ts` before passing it to Kubb. Recursively walk the spec object tree; delete any property whose value matches all three conditions simultaneously:

- `minLength === 1`
- `maxLength === 0`
- `x-openresponses-disallowed === true`

Write the cleaned spec to a temp file (OS tmpdir) and point Kubb's `input.path` at the temp file. The source file `docs/openapi/openresponses.json` is never modified.

### Implementation (already in `kubb.config.ts`)

```typescript
function removeDisallowedFields(node: unknown): void {
    if (Array.isArray(node)) {
        node.forEach(removeDisallowedFields);
    } else if (node !== null && typeof node === "object") {
        const obj = node as Record<string, unknown>;
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (
                val !== null &&
                typeof val === "object" &&
                (val as Record<string, unknown>).minLength === 1 &&
                (val as Record<string, unknown>).maxLength === 0 &&
                (val as Record<string, unknown>)["x-openresponses-disallowed"] === true
            ) {
                delete obj[key];
            } else {
                removeDisallowedFields(val);
            }
        }
    }
}

const rawSpec = JSON.parse(readFileSync("./docs/openapi/openresponses.json", "utf-8")) as unknown;
removeDisallowedFields(rawSpec);
const cleanedSpecPath = join(tmpdir(), "openresponses-cleaned.json");
writeFileSync(cleanedSpecPath, JSON.stringify(rawSpec));
```

### What still needs to happen

- **Tests**: A unit test for `removeDisallowedFields` (or an equivalent test by extracting it to a testable helper) verifying:
    - Properties matching all three conditions are removed
    - Properties matching only one or two conditions are retained
    - Nested objects are recursed into
    - Arrays are recursed into
    - The source spec is never modified (output is written to tmp; read the tmp file to verify)
- **Documentation**: `docs/technical-stack.md` should document the `x-openresponses-disallowed` convention and the preprocessing step. A short note in `AGENTS.md` under the schema generation section is also warranted.

---

## 3. Change 2 — Server bootstrap hardening

### Changes in `main.ts`

The following changes were made to `src/international-space-bar-server/main.ts`:

1. **WebSocket adapter registration**: `app.useWebSocketAdapter(new OpenResponsesWsAdapter(app))` — wires the custom WS adapter for the `/v1/responses` endpoint. Required for the WebSocket gateway to function.

2. **Flexible host/port resolution**: Port and host are now resolved from the config service first, then env vars, then hardcoded defaults:

    ```typescript
    const port = Number(config.get("server.port") ?? process.env.PORT ?? DEFAULT_PORT);
    const host = String(config.get("server.host") ?? process.env.HOST ?? DEFAULT_HOST);
    ```

3. **Debug diagnostics**: Several `logger.debug()` calls log whether config keys and env vars are set at startup — useful for diagnosing misconfiguration.

4. **SIGINT/SIGTERM handlers**: Added (but currently commented out). `app.enableShutdownHooks()` is active. The intent is to add explicit signal handlers when needed; currently commented to avoid double-handling with NestJS's built-in shutdown hooks.

5. **Bootstrap error handling**: Uses `process.stderr.write()` instead of `console.error()` for the top-level catch block.

### What still needs to happen

- **Tests**: The bootstrap sequence is not directly unit-testable, but the `server.port` / `server.host` config resolution should be covered by integration tests or a smoke-level test that verifies the server starts on the configured port.
- **CORS hardening (medium priority)**: `app.enableCors()` is called with no arguments whenever `config.get("server.enableCors")` resolves truthy. `config.dev.yaml` has `server.enableCors: true`, so CORS is already enabled in dev with a wildcard `Access-Control-Allow-Origin: *`. The `BearerAuthGuard` and `timingSafeEqual` auth in the WebSocket gateway provide runtime protection, but wildcard CORS is still a risk if browser credentials are involved. `app.enableCors()` should be updated to accept an explicit origin list: `app.enableCors({ origin: config.get<string[]>("server.corsOrigins") ?? [] })`. A `server.corsOrigins` array field should be added to `ConfigSchema` and the YAML files. Additionally, `server.enableCors` is not declared in `ConfigSchema`'s `server` block — it currently passes through `z.looseObject()` without validation; adding it explicitly would catch typos.
- **Documentation**: `docs/logging.md` startup sequence section should reflect the WebSocket adapter registration step. `AGENTS.md` should note that `DEFAULT_HOST = "127.0.0.1"` is intentional (loopback only — external access requires explicit `HOST` env var or `config.server.host`).

---

## 4. Change 3 — Logging DI pattern inconsistency (architecture concern)

### Current state

`src/international-space-bar-server/openresponses/responses.gateway.ts` line 104:

```typescript
private readonly logger = new Logger(ResponsesGateway.name);
```

This uses NestJS's built-in `Logger` class instantiated inline (`new Logger()`), bypassing the `ILogger` interface contract and the `LOGGER` injection token established in isb-0055.

### Why this is a concern

The `LoggingModule` (isb-0055) established the pattern: services that need logging should inject `@Inject(LOGGER) private readonly logger: ILogger`. This:

- Allows the logger implementation to be swapped in tests without module bootstrap
- Keeps all structured log output routed through `PinoLoggerService`
- Enforces the Dependency Inversion Principle — services depend on the `ILogger` abstraction, not on the NestJS `Logger` class

Using `new Logger(ResponsesGateway.name)` works at runtime because NestJS's internal `Logger` delegates to the registered logger service (`PinoLoggerService` via `useLogger()`). But it:

- Bypasses the interface contract in tests
- Creates a hidden coupling to NestJS's internal wiring
- Is inconsistent with the pattern used in `PingPongRuntimeService`

### What needs to happen

`ResponsesGateway` should be updated to inject via the interface token:

```typescript
constructor(
    @Inject(AGENT_RUNTIME_PORT) private readonly runtime: AgentRuntimePort,
    @Inject(LOGGER) private readonly logger: ILogger,
) {}
```

The inline `private readonly logger = new Logger(...)` field must be removed.

**Call-site migration required (TypeScript compile error if omitted)**: `ILogger` has no `log()` method. The three existing `this.logger.log()` calls must each be renamed to `this.logger.info()`:

| Line             | Current                                                 | Required change                                          |
| ---------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| handleConnection | `this.logger.log("WebSocket client connected")`         | `this.logger.info("WebSocket client connected")`         |
| handleDisconnect | `this.logger.log("WebSocket client disconnected")`      | `this.logger.info("WebSocket client disconnected")`      |
| cache eviction   | `this.logger.log(\`Evicted previous_response_id=...\`)` | `this.logger.info(\`Evicted previous_response_id=...\`)` |

**Import cleanup required**: The `Logger` symbol in `import { Inject, Injectable, Logger } from "@nestjs/common"` must be removed once `new Logger(...)` is gone. Additionally, `LOGGER` and `ILogger` must be imported:

```typescript
import { LOGGER } from "../common/interfaces/logger.port.js";
import type { ILogger } from "../common/interfaces/index.js";
```

---

## 5. Non-goals / Out of scope

- `pino-http` middleware (explicitly deferred, see isb-0055 AC-9)
- Enabling SIGINT/SIGTERM handlers (currently commented out; `app.enableShutdownHooks()` is sufficient)
- Migrating NestJS `Logger` calls in other locations (only `responses.gateway.ts` is in scope)

---

## 6. Architectural compliance checklist

| Concern                                                        | Status                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| Layered boundary compliance                                    | ✅ `kubb.config.ts` is the composition root — may import anything    |
| DI via interface token                                         | ⚠️ `responses.gateway.ts` uses `new Logger()` — violates the pattern |
| Source spec immutability                                       | ✅ temp file pattern preserves `docs/openapi/openresponses.json`     |
| No generated file edits                                        | ✅ changes are upstream (config), not in `generated/`                |
| `pnpm check` exits 0                                           | ✅ verified                                                          |
| `pnpm generate:schemas` produces no `z.string().min(1).max(0)` | ✅ verified                                                          |
