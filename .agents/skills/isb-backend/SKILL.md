---
name: isb-backend
description: "International Space Bar backend specifics — OpenResponses protocol, source layout, phased delivery, agent runtime integration. Use when: implementing ISB backend code, working on the OpenResponses controller, writing Zod schemas for the protocol surface, integrating LangGraph/DeepAgents behind the runtime port, or referencing the phased delivery plan. Extends backend-engineering."
---

# ISB Backend — Project-Specific Skill

## Prerequisites

**Load `.agents/skills/backend-engineering/SKILL.md` first.** This skill extends the general backend principles with International Space Bar specifics. If you have not loaded the general skill, do so before proceeding.

---

## Solution Overview

The International Space Bar backend is a NestJS HTTP service that exposes an **OpenResponses-compatible protocol surface** (`POST /v1/responses`). OpenCode is the current interaction client, configured as a custom provider pointing at the local backend. The backend translates external OpenResponses requests into internal service calls against the core agent runtime (LangGraph/DeepAgents).

```
OpenCode ──→ OpenResponses HTTP ──→ NestJS service ──→ Agent runtime
```

The backend is an **outer adapter** around the existing core agent system. Protocol controllers and DTOs live at the service boundary. The core agent, workflow, LLM, and tool layers must never import NestJS.

---

## ISB Tech Stack (Project-Specific Additions)

These extend the general backend stack with ISB-specific choices:

| Concern             | Choice                                                      |
| ------------------- | ----------------------------------------------------------- |
| Runtime             | Node.js 22 (Active LTS)                                     |
| Language            | TypeScript 5 — strict mode, ESM (`"type": "module"`)        |
| Validation          | Zod 4                                                       |
| Agent framework     | `@langchain/langgraph` with `StateSchema` + `MessagesValue` |
| Agent orchestration | `deepagents`                                                |
| External protocol   | OpenResponses via `POST /v1/responses`                      |
| Current client      | OpenCode (custom provider with `@ai-sdk/openai`)            |

### NestJS Dependencies

```
@nestjs/common, @nestjs/core, @nestjs/platform-express
reflect-metadata, rxjs
zod (existing)
```

### Scripts

```
pnpm dev         → pnpm dev:server (tsx)
pnpm build       → pnpm build:server (tsup)
pnpm start       → pnpm start:server (node)
pnpm check       → biome check --write src/ && eslint --fix
```

---

## Source Layout

```
src/international-space-bar-server/     # NestJS outer service boundary
  main.ts                               # Bootstrap, listen on 127.0.0.1:3000
  app.module.ts                         # Root NestJS module
  health/
    health.controller.ts                # GET /health
  protocol/
    openresponses/
      openresponses.module.ts
      responses.controller.ts           # POST /v1/responses
      responses.service.ts              # Response orchestration
      responses.schemas.ts              # Zod schemas for OpenResponses DTOs
      responses.types.ts                # Inferred TypeScript types
      sse-writer.ts                     # SSE frame serializer
  runtime/
    ping-pong-runtime.service.ts        # Phase 0 stub runtime
    agent-runtime.port.ts               # Framework-free runtime interface

src/international-space-bar/            # Core agent domain (unchanged)
  interfaces/                           # Pure types (innermost)
  services/                             # Cross-cutting utilities
  agent/                                # Agent implementations
  workflow/                             # LangGraph workflows
  llm/                                  # LLM provider adapters
  tool/                                 # Tool implementations
```

### Layered Dependency Direction (ISB-Specific)

```
src/international-space-bar-server/ (outermost — NestJS)
  → src/international-space-bar/workflow/
    → src/international-space-bar/agent/ / llm/ / tool/
      → src/international-space-bar/services/
        → src/international-space-bar/interfaces/ (innermost)
```

- NestJS decorators, modules, pipes, and guards live **only** in `src/international-space-bar-server/`.
- The core agent domain (`src/international-space-bar/`) must have **zero** NestJS imports.

---

## OpenResponses Wire Contract

The backend treats OpenResponses as the **external API contract**. The OpenResponses repository exposes the full OpenAPI document at `public/openapi/openapi.json` and compliance tests through `bin/compliance-test.ts`.

### Endpoints

| Endpoint                                 | Phase    | Purpose                               |
| ---------------------------------------- | -------- | ------------------------------------- |
| `POST /v1/responses`                     | Phase 0  | Non-streaming ping-pong               |
| `POST /v1/responses` with `stream: true` | Phase 1  | Streaming ping-pong                   |
| `POST /v1/responses/compact`             | Phase 2+ | Add when required by compliance scope |

### Request Schema

```typescript
export const CreateResponseBodySchema = z
    .object({
        model: z.string().min(1),
        input: z.union([z.string(), z.array(z.unknown())]),
        stream: z.boolean().optional().default(false),
        stream_options: z.unknown().optional(),
        previous_response_id: z.string().optional(),
        instructions: z.string().optional(),
        tools: z.array(z.unknown()).optional(),
        tool_choice: z.unknown().optional(),
        background: z.boolean().optional(),
        store: z.boolean().optional(),
    })
    .passthrough();

export type CreateResponseBody = z.infer<typeof CreateResponseBodySchema>;
```

### Response Shape

```json
{
    "id": "resp_<uuid>",
    "object": "response",
    "created_at": 1730000000,
    "model": "isb-ping",
    "status": "completed",
    "output": [
        {
            "id": "msg_<uuid>",
            "type": "message",
            "status": "completed",
            "role": "assistant",
            "content": [
                {
                    "type": "output_text",
                    "text": "pong",
                    "annotations": []
                }
            ]
        }
    ],
    "usage": {
        "input_tokens": 0,
        "output_tokens": 1,
        "total_tokens": 1
    }
}
```

### SSE Event Sequence

Required order: `response.created` → `response.output_text.delta` (1+) → `response.completed`.

```
event: response.created
data: {"type":"response.created","response":{"id":"resp_<uuid>","status":"in_progress"}}

event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":"po","output_index":0,"content_index":0}

event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":"ng","output_index":0,"content_index":0}

event: response.completed
data: {"type":"response.completed","response":{"id":"resp_<uuid>","status":"completed"}}
```

### Error Shape

```json
{ "error": { "type": "invalid_request_error", "message": "..." } }
```

---

## Agent Runtime Port

The agent runtime is accessed through a framework-free interface. NestJS injects a concrete implementation.

```typescript
export interface AgentRuntimePort {
    invoke(request: AgentInvokeRequest): Promise<AgentInvokeResult>;
    stream(request: AgentInvokeRequest): AsyncIterable<AgentRuntimeEvent>;
}

export interface AgentInvokeRequest {
    readonly model: string;
    readonly input: string;
    readonly instructions?: string;
    readonly threadId?: string;
    readonly requestId: string;
}
```

Phase 0 uses `PingPongRuntimeService` (returns `pong` for any request). Phase 3+ replaces it with a LangGraph/DeepAgents adapter behind the same port.

---

## OpenCode Integration Contract

OpenCode connects as a **custom provider** using `@ai-sdk/openai` (not `@ai-sdk/openai-compatible`) because it targets `/v1/responses`.

Checked-in example config: `docs/examples/opencode-isb-ping.jsonc`

```jsonc
{
    "$schema": "https://opencode.ai/config.json",
    "model": "international-space-bar/isb-ping",
    "provider": {
        "international-space-bar": {
            "npm": "@ai-sdk/openai",
            "name": "International Space Bar",
            "options": {
                "baseURL": "http://127.0.0.1:3000/v1",
                "apiKey": "{env:ISB_OPENRESPONSES_API_KEY}",
            },
            "models": {
                "isb-ping": { "name": "ISB Ping" },
            },
        },
    },
}
```

Proof command:

```bash
ISB_OPENRESPONSES_API_KEY=local-dev-key \
OPENCODE_CONFIG=docs/examples/opencode-isb-ping.jsonc \
opencode run "ping"
```

---

## LangGraph / DeepAgents Conventions

These are ISB-specific conventions for the agent framework:

- State schemas use `StateSchema` from `@langchain/langgraph`, not `Annotation.Root`.
- Message fields use `MessagesValue` (prebuilt reducer), not plain Zod arrays.
- Context schemas use `z.object(...)` passed to `StateGraph({ context: ... })`.
- `GraphNode` uses the type bag pattern: `GraphNode<{ InputSchema, OutputSchema, ContextSchema, Nodes }>`.
- `ContextSchema` in the type bag takes the Zod schema type (`typeof MySchema`), not `z.infer<>`.
- Always verify LangGraph APIs against up-to-date docs using Context7:

```
resolve-library-id: "langgraph"  → /websites/langchain-ai_github_io_langgraphjs
get-library-docs: context7CompatibleLibraryID="/websites/langchain-ai_github_io_langgraphjs", topic="<topic>"
```

---

## Separation of Concerns — Logging (ISB-Specific)

| Concern                   | Destination             | Purpose                    |
| ------------------------- | ----------------------- | -------------------------- |
| System logging            | `app.log` + ring buffer | Infrastructure diagnostics |
| Agent observability       | `agents.log`            | Behavioural audit trail    |
| Future: API observability | `api.log`               | Request/response tracing   |

Each concern gets its own pino instance. Wired via `AppContext`:

- `ctx.logger` → system events → `app.log` + stdout
- `ctx.agentLogger` → agent observability → `agents.log` + stdout (dev only)

---

## Phased Delivery Plan

| Phase | Scope                                                                | Priority |
| ----- | -------------------------------------------------------------------- | -------- |
| 0     | NestJS scaffold, non-streaming ping-pong, OpenCode proof, UI archive | critical |
| 1     | Streaming SSE ping-pong                                              | high     |
| 2     | OpenResponses compliance baseline                                    | high     |
| 3     | LangGraph/DeepAgents runtime integration behind `AgentRuntimePort`   | high     |
| 4     | Tools, tool messages, approvals                                      | medium   |
| 5     | Durability, observability, doc updates                               | medium   |
| 6     | Future client/UI strategy                                            | low      |

See [docs/openresponses-backend-phased-design.md](../../docs/openresponses-backend-phased-design.md) for full acceptance criteria per phase.

---

## Security Boundaries (ISB-Specific)

- Phase 0 uses a local development API key (`ISB_OPENRESPONSES_API_KEY`). No production auth.
- Bearer token validation at the NestJS guard level.
- Bind to `127.0.0.1` for local development — no external network exposure.
