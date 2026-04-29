---
name: backend-engineering
description: "General backend engineering principles for NestJS services. Use when: implementing controllers, services, modules, or DTOs; writing Zod validation pipes; implementing SSE streaming from POST routes; enforcing layered architecture with framework-free domain boundaries; reviewing backend code for clean architecture compliance. Reusable across projects."
---

# Backend Engineering — General Principles

## Purpose

Reusable backend engineering principles for NestJS HTTP services with Zod validation, layered architecture, and SSE streaming. This skill is **project-agnostic** — it captures patterns and best practices that apply to any NestJS backend.

For project-specific details (protocol contracts, source layout, delivery phases), load the companion project skill that extends this one.

---

## Tech Stack Baseline

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Runtime | Node.js LTS | Stability, native ESM, TypeScript ecosystem |
| Language | TypeScript — strict mode, ESM | Full type safety, native modules |
| Backend framework | NestJS | Modular, decorator-driven, DI out of the box |
| Validation | Zod | Runtime + compile-time safety; replaces `class-validator` |
| Package manager | pnpm | Workspace-aware, strict isolation |
| Dev runner | tsx | Preferred over `ts-node` for ESM |
| Bundler | tsup | Preferred over raw `tsc + tsc-alias` |
| Formatting + lint | Biome + ESLint | Biome: format, imports, non-type-aware. ESLint: type-aware only |

---

## Layered Architecture

### Dependency Direction

Dependencies point **inward only**. The HTTP service is the outermost layer. Domain logic is the innermost. Outer layers may import inner layers; inner layers must never import outer layers.

```
HTTP service (outermost)
  → orchestration / workflows
    → domain services / adapters
      → shared utilities
        → interfaces / contracts (innermost)
```

### Framework Stays at the Boundary

- NestJS decorators, modules, pipes, and guards live **only** in the service boundary layer.
- Domain modules must have **zero** NestJS imports.
- Protocol validation lives at the controller layer, not in domain services.
- When a function is needed by two layers, move it to the lowest common ancestor (usually shared utilities). Never create a dependency from inner to outer.

### Framework-Free Runtime Port

Access domain runtimes through plain TypeScript interfaces, not NestJS-specific abstractions. This keeps the runtime testable and framework-independent.

```typescript
// Good — framework-free port
export interface RuntimePort<TRequest, TResult, TEvent> {
    invoke(request: TRequest): Promise<TResult>;
    stream(request: TRequest): AsyncIterable<TEvent>;
}
```

The NestJS service injects a concrete implementation at the composition root. Domain code depends only on the interface.

---

## Zod Validation — Not class-validator

### ZodValidationPipe

Use a generic `ZodValidationPipe` for NestJS request validation. Do not use `class-validator` or `class-transformer`.

```typescript
import { BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";
import type { z } from "zod";

@Injectable()
export class ZodValidationPipe<TSchema extends z.ZodTypeAny> implements PipeTransform {
    constructor(private readonly schema: TSchema) {}
    transform(value: unknown): z.infer<TSchema> {
        const result = this.schema.safeParse(value);
        if (!result.success) {
            throw new BadRequestException({
                error: { type: "invalid_request_error", message: result.error.message },
            });
        }
        return result.data;
    }
}
```

### DTO Schema Conventions

- Define DTOs as Zod schemas, infer TypeScript types with `z.infer<>`.
- Use `.passthrough()` on external-facing schemas to preserve unknown future fields for forward compatibility.
- Use `.strict()` on internal schemas where unknown fields indicate a bug.
- Validate at the controller boundary — services receive already-validated types.

---

## SSE Streaming From POST Routes

NestJS `@Sse()` is GET-only. For SSE responses to POST requests, use `@Post()` with raw `@Res()`:

```typescript
@Post()
async create(
    @Body(new ZodValidationPipe(RequestSchema)) body: RequestBody,
    @Res({ passthrough: false }) response: ExpressResponse,
) {
    if (body.stream) {
        response.status(200);
        response.setHeader("Content-Type", "text/event-stream");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("Connection", "keep-alive");
        for await (const event of this.service.createStream(body)) {
            response.write(`event: ${event.type}\n`);
            response.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        response.end();
        return;
    }
    response.json(await this.service.create(body));
}
```

### SSE Best Practices

- Always set `Cache-Control: no-cache` and `Connection: keep-alive`.
- Use semantic event types (`event: <type>\n`) so clients can filter.
- Flush after each event pair (`event:` + `data:` + `\n\n`).
- Handle client disconnection — check `response.destroyed` or listen for `close`.
- Domain services return `AsyncIterable<Event>` — the controller owns serialisation.

---

## Separation of Concerns — Logging

Separate logging by concern. Each domain gets its own logger instance and destination. Never share pino instances or stream configurations across concerns.

| Concern | Purpose | Examples |
|---------|---------|---------|
| System logging | Infrastructure diagnostics | Startup, config, HTTP errors, retries |
| Domain observability | Behavioural audit trail | Intent classification, routing decisions, token usage |
| API observability | Request/response tracing | Latency, status codes, request IDs |

**Domain messages are not system logs. System diagnostics are not domain tuning data.**

---

## NestJS Module Patterns

### Module Organisation

- One module per bounded context or feature area.
- Controllers handle HTTP concerns only — delegate to services immediately.
- Services contain business logic — no HTTP types (`Request`, `Response`).
- Keep modules cohesive: controller + service + schemas + types in one folder.

### Dependency Injection

- Prefer constructor injection.
- Use custom providers for framework-free interfaces: `{ provide: 'RUNTIME_PORT', useClass: ConcreteRuntime }`.
- Domain interfaces defined outside NestJS; NestJS binds them at the module level.

### Bootstrap

```typescript
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    app.enableShutdownHooks();
    await app.listen(port, "127.0.0.1");
}

await bootstrap();
```

---

## Error Handling

- **Never throw generic `Error`. Always use or create a specialized exception** that extends the project's base exception class (e.g., `ApplicationException`). Each exception must have a machine-readable `code` (e.g., `"SECRET_NOT_FOUND"`, `"CONFIGURATION_ERROR"`) for programmatic handling. If no suitable exception exists, create one in `common/exceptions/`.
- Use NestJS exception filters for HTTP error responses.
- Map domain errors to HTTP errors at the controller/filter boundary, not inside services.
- Return structured error objects, not plain strings: `{ error: { type, message } }`.
- Validation errors from Zod should produce 400 with the Zod error message.

---

## Security Baseline

- Validate all input at the boundary (Zod pipes).
- Never log API keys, tokens, or secrets.
- Zod `.passthrough()` preserves unknown fields but does not trust them — downstream code must not blindly spread passthrough data into sensitive contexts.
- Use guards for authentication; do not inline auth checks in controllers.
- Bind to `127.0.0.1` for local-only development servers.

---

## Quality Gates

After **every** code change:

```bash
pnpm check    # Must exit 0
pnpm build    # Must exit 0
```

- Biome owns: formatting, import organisation, non-type-aware lint rules.
- ESLint owns: type-aware rules (`no-floating-promises`, `no-misused-promises`, `await-thenable`, `no-unsafe-*`).
- Never suppress a lint rule without a comment explaining why.
