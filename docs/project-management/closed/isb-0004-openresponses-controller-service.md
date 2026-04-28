# isb-0004: OpenResponses controller + service + module wiring

| Field | Value |
|-------|-------|
| Epic | isb-epic-001 |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `critical` |
| Created | 2026-04-28 |
| Completed | — |
| Dependencies | isb-0001, isb-0002, isb-0003 |

## Description

Create the OpenResponses controller with a `POST /v1/responses` route, a service layer bridging the controller to the `AgentRuntimePort`, and an `OpenResponsesModule` that wires everything together. Apply the bearer auth guard to the responses route. Register the module in `AppModule`.

## Acceptance Criteria

- [ ] `src/international-space-bar-server/openresponses/responses.controller.ts` handles `POST /v1/responses`
- [ ] Controller uses `ZodValidationPipe` with `CreateResponseSchema` for body validation
- [ ] Controller delegates to `ResponsesService` (not directly to runtime)
- [ ] `src/international-space-bar-server/openresponses/responses.service.ts` injects `AgentRuntimePort` via `@Inject(AGENT_RUNTIME_PORT)` and forwards to runtime
- [ ] `src/international-space-bar-server/openresponses/openresponses.module.ts` provides `PingPongRuntimeService` bound to `AGENT_RUNTIME_PORT` token
- [ ] Bearer auth guard is applied to the `POST /v1/responses` route
- [ ] Module is imported in `AppModule`
- [ ] `POST /v1/responses` with valid auth and `{ input: "ping", model: "ping-pong" }` returns the pong response
- [ ] `POST /v1/responses` without auth returns 401
- [ ] `POST /v1/responses` with invalid body returns 400
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/responses.controller.ts` — POST handler with validation + auth
- `src/international-space-bar-server/openresponses/responses.service.ts` — service bridging controller to runtime port
- `src/international-space-bar-server/openresponses/openresponses.module.ts` — module definition and providers
- `src/international-space-bar-server/app.module.ts` — import `OpenResponsesModule`

## PoC Snippets

```typescript
// responses.controller.ts
import { Controller, Post, Body, UsePipes, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CreateResponseSchema } from './responses.schemas.js';
import { ResponsesService } from './responses.service.js';
import { BearerAuthGuard } from '../common/bearer-auth.guard.js';

@Controller('v1/responses')
export class ResponsesController {
  constructor(private readonly responsesService: ResponsesService) {}

  @Post()
  @UseGuards(BearerAuthGuard)
  @UsePipes(new ZodValidationPipe(CreateResponseSchema))
  async create(@Body() body: CreateResponseInput) {
    return this.responsesService.create(body);
  }
}
```

```typescript
// responses.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { AGENT_RUNTIME_PORT, type AgentRuntimePort } from './agent-runtime.port.js';

@Injectable()
export class ResponsesService {
  constructor(
    @Inject(AGENT_RUNTIME_PORT) private readonly runtime: AgentRuntimePort,
  ) {}

  async create(input: CreateResponseInput) {
    return this.runtime.run(input);
  }
}
```

## Comments

This is the integration ticket — it ties together the auth guard (isb-0002), schemas + runtime (isb-0003), and the scaffold (isb-0001) into a working endpoint.
