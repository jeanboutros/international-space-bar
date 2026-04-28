# isb-0003: OpenResponses schemas + ping-pong runtime

| Field | Value |
|-------|-------|
| Epic | isb-epic-001 |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `critical` |
| Created | 2026-04-28 |
| Completed | — |
| Dependencies | isb-0001 |

## Description

Define the OpenResponses Zod schemas using `z.looseObject()` for forward-compatibility, create TypeScript types from them, define the `AgentRuntimePort` interface, and implement the `PingPongRuntimeService` that returns a hardcoded "pong" response.

## Acceptance Criteria

- [ ] `src/international-space-bar-server/openresponses/responses.schemas.ts` defines `CreateResponseSchema` using `z.looseObject()` with at minimum `input` and `model` fields
- [ ] `src/international-space-bar-server/openresponses/responses.types.ts` exports inferred types from schemas
- [ ] `src/international-space-bar-server/openresponses/agent-runtime.port.ts` defines the `AgentRuntimePort` interface with a `run(input)` method
- [ ] `src/international-space-bar-server/openresponses/ping-pong-runtime.service.ts` implements `AgentRuntimePort`
- [ ] `PingPongRuntimeService.run()` returns a response object with `output: [{ type: "message", content: [{ type: "output_text", text: "pong" }] }]`
- [ ] Schemas use `z.looseObject()` (not `.passthrough()`) per Tech Validator decision
- [ ] Uses explicit `@Inject()` token pattern
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/responses.schemas.ts` — Zod schemas with `z.looseObject()`
- `src/international-space-bar-server/openresponses/responses.types.ts` — inferred TypeScript types
- `src/international-space-bar-server/openresponses/agent-runtime.port.ts` — runtime port interface
- `src/international-space-bar-server/openresponses/ping-pong-runtime.service.ts` — ping-pong implementation

## PoC Snippets

```typescript
// responses.schemas.ts
import { z } from 'zod';

export const CreateResponseSchema = z.looseObject({
  input: z.union([z.string(), z.array(z.unknown())]),
  model: z.string(),
});
```

```typescript
// agent-runtime.port.ts
export interface AgentRuntimePort {
  run(input: CreateResponseInput): Promise<ResponseOutput>;
}

export const AGENT_RUNTIME_PORT = Symbol('AgentRuntimePort');
```

```typescript
// ping-pong-runtime.service.ts
import { Injectable } from '@nestjs/common';
import type { AgentRuntimePort } from './agent-runtime.port.js';

@Injectable()
export class PingPongRuntimeService implements AgentRuntimePort {
  async run(_input: CreateResponseInput): Promise<ResponseOutput> {
    return {
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'pong' }],
        },
      ],
    };
  }
}
```

## Comments

The `z.looseObject()` approach allows unknown fields to pass through without stripping them, ensuring forward-compatibility with new OpenAI fields.
