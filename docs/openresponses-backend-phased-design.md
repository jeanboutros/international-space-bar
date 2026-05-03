# Backend-First OpenResponses Phased Design

## Purpose

This document is the entrypoint design specification for
[docs/agent-validation-pipeline.md](agent-validation-pipeline.md). It converts
the earlier TUI-oriented analysis in
[docs/tui-architecture-analysis.md](tui-architecture-analysis.md) into a
backend-first delivery plan.

The immediate product direction is:

1. Scaffold a NestJS backend service.
2. Expose an OpenResponses-compatible protocol surface.
3. Prove a `ping` -> `pong` connection from OpenCode to the backend.
4. Archive the current in-repo Ink UI so phase-zero work is not distracted by
   the old monolithic TUI path.

OpenCode is the interaction client for now. The way OpenCode's own UI talks to
OpenCode's own backend is useful future research only; it is not part of the
phase-zero implementation.

## Relationship To Existing Documents

[docs/tui-architecture-analysis.md](tui-architecture-analysis.md) remains the
background analysis. Its core lesson still stands: the UI should be separated
from the agent runtime. This document changes the MVP from "TUI plus backend"
to "backend plus OpenCode connectivity".

[docs/technical-stack.md](technical-stack.md) and
[docs/agent-observability-logging.md](agent-observability-logging.md) must be
updated after the backend service, protocol adapter, and observability boundary
are implemented. Until then, they describe the current in-process app and are
not yet the final backend-service architecture.

## Decision Summary

| Decision           | Outcome                                                           |
| ------------------ | ----------------------------------------------------------------- |
| MVP focus          | Backend service first, not a rebuilt TUI                          |
| Backend framework  | NestJS on Node.js 22, TypeScript strict mode, ESM                 |
| External protocol  | OpenResponses through `/v1/responses`                             |
| Current client     | OpenCode configured as a custom provider                          |
| First proof        | OpenCode sends a request to the local backend and receives `pong` |
| Existing UI        | Archive the Ink TUI out of active `src/` and default scripts      |
| OpenCode internals | Future recommendation only, not phase-zero implementation         |

## Scope

### Phase-Zero Goals

- Add a NestJS service entrypoint that starts independently from the old TUI.
- Add a minimal OpenResponses request/response adapter for `POST /v1/responses`.
- Support non-streaming `ping` -> `pong` responses through the OpenResponses
  shape.
- Provide an OpenCode custom provider config that points at the local backend.
- Prove the connection using OpenCode, preferably with `opencode run "ping"`
  for repeatability and with the TUI as a manual secondary check.
- Archive the existing Ink TUI and remove it from the default runtime path.

### Non-Goals For Phase Zero

- Do not rebuild International Space Bar's own TUI.
- Do not study or reimplement OpenCode's server/TUI architecture beyond the
  custom-provider integration needed for ping-pong.
- Do not integrate LangGraph or DeepAgents into `/v1/responses` yet.
- Do not implement tool calls, interrupts, approvals, durable sessions, or
  full compliance in phase zero.
- Do not add production authentication. Use a local development API key only.
- Do not delete the legacy UI source without an archive trail.

## Architecture Overview

The backend service is an outer adapter around the existing core agent system.
Protocol controllers translate external OpenResponses requests into internal
service calls. The core agent/runtime layers must not import NestJS.

```text
OpenCode
  |
  | OpenResponses-compatible HTTP
  v
NestJS service entrypoint
  |
  +-- OpenResponses controller and DTOs
  +-- Response runtime service
  +-- SSE serializer
  +-- Health controller
  |
  v
Future internal runtime boundary
  |
  +-- sessions
  +-- LangGraph / DeepAgents adapters
  +-- tool and approval adapters
```

Recommended source layout:

```text
src/international-space-bar-server/
  main.ts
  app.module.ts
  health/
    health.controller.ts
  protocol/
    openresponses/
      openresponses.module.ts
      responses.controller.ts
      responses.service.ts
      responses.schemas.ts
      responses.types.ts
      sse-writer.ts
  runtime/
    ping-pong-runtime.service.ts
    agent-runtime.port.ts

src/international-space-bar/
  interfaces/
  services/
  agent/
  workflow/
  llm/
  tool/
  *.ts

archive/legacy-ink-tui/
  README.md
  src/tui/...
```

The existing `src/international-space-bar` package remains the home of the
agent domain and shared services. NestJS code lives in
`src/international-space-bar-server` so it is clearly an outer service boundary.

## OpenResponses Contract

The backend must treat OpenResponses as the external wire contract. The current
OpenResponses repository exposes the full OpenAPI document at
`public/openapi/openapi.json` and compliance tests through
`bin/compliance-test.ts`. When served under `/v1`, the primary endpoints are:

| Endpoint                                 | Phase    | Purpose                               |
| ---------------------------------------- | -------- | ------------------------------------- |
| `POST /v1/responses`                     | Phase 0  | Non-streaming ping-pong               |
| `POST /v1/responses` with `stream: true` | Phase 1  | Streaming ping-pong                   |
| `POST /v1/responses/compact`             | Phase 2+ | Add when required by compliance scope |

The initial DTO should accept the OpenResponses fields needed by OpenCode and
the compliance baseline, while preserving unknown future fields so the adapter
does not reject harmless client metadata.

```typescript
import { z } from "zod";

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

Phase-zero behavior is intentionally simple:

- If `model` is the configured ping model, return `pong` for any request.
- Capture a request ID, response ID, model, stream flag, and user-visible input
  summary in logs.
- Return an OpenResponses-style `ResponseResource` with `object: "response"`,
  `status: "completed"`, and an assistant message containing output text
  `pong`.
- Do not call an LLM.
- Do not call LangGraph or DeepAgents.

The implementation should validate exact required fields against the current
OpenResponses OpenAPI during Phase A. The target response shape is:

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

## OpenCode Integration Contract

OpenCode supports project or custom-path config files, custom providers,
`options.baseURL`, `options.apiKey`, and provider packages. Its provider docs
state that OpenAI-compatible chat-completions providers use
`@ai-sdk/openai-compatible`, while providers using `/v1/responses` should use
`@ai-sdk/openai`.

Add a checked-in example config for local validation, not a default project
config that silently changes the user's normal OpenCode behavior.

Recommended file:

```text
docs/examples/opencode-isb-ping.jsonc
```

Recommended content:

```jsonc
{
    "$schema": "https://opencode.ai/config.json",
    "model": "international-space-bar/isb-ping",
    "small_model": "international-space-bar/isb-ping",
    "share": "disabled",
    "autoupdate": false,
    "tools": {
        "bash": false,
        "edit": false,
        "write": false,
    },
    "provider": {
        "international-space-bar": {
            "npm": "@ai-sdk/openai",
            "name": "International Space Bar",
            "options": {
                "baseURL": "http://127.0.0.1:3000/v1",
                "apiKey": "{env:ISB_OPENRESPONSES_API_KEY}",
            },
            "models": {
                "isb-ping": {
                    "name": "ISB Ping",
                    "limit": {
                        "context": 8000,
                        "output": 1024,
                    },
                },
            },
        },
    },
}
```

Phase-zero proof command:

```bash
ISB_OPENRESPONSES_API_KEY=local-dev-key \
OPENCODE_CONFIG=docs/examples/opencode-isb-ping.jsonc \
opencode run "ping"
```

The deliverable is complete only when OpenCode receives a backend response and
prints `pong` or an equivalent assistant message containing `pong`.

## NestJS Service Specification

### Dependencies

Phase zero should add the smallest NestJS set that can run the HTTP service:

- `@nestjs/common`
- `@nestjs/core`
- `@nestjs/platform-express`
- `reflect-metadata`
- `rxjs`

Use the existing Zod dependency for request validation. Do not add
`class-validator` or `class-transformer` unless Phase A finds a NestJS feature
that justifies them.

### Scripts

By the end of phase zero, scripts should make the backend the default local
runtime:

```json
{
    "scripts": {
        "dev": "pnpm dev:server",
        "dev:server": "tsx --env-file=.env src/international-space-bar-server/main.ts",
        "build": "pnpm build:server",
        "build:server": "tsup src/international-space-bar-server/main.ts --format esm --outDir dist",
        "start": "pnpm start:server",
        "start:server": "node --env-file=.env dist/international-space-bar-server/main.js",
        "check": "biome check --write src/ && eslint --fix"
    }
}
```

If the legacy CLI entrypoint is kept for reference, it must not be the default
`dev`, `build`, or `start` target.

### Bootstrap

```typescript
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const DEFAULT_PORT = 3000;

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    const port = Number(process.env.PORT ?? DEFAULT_PORT);

    app.enableShutdownHooks();
    await app.listen(port, "127.0.0.1");
}

await bootstrap();
```

### Validation Pipe

```typescript
import { BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";
import type { z } from "zod";

@Injectable()
export class ZodValidationPipe<TSchema extends z.ZodTypeAny> implements PipeTransform {
    public constructor(private readonly schema: TSchema) {}

    public transform(value: unknown): z.infer<TSchema> {
        const result = this.schema.safeParse(value);
        if (!result.success) {
            throw new BadRequestException({
                error: {
                    type: "invalid_request_error",
                    message: result.error.message,
                },
            });
        }
        return result.data;
    }
}
```

### Controller Shape

NestJS `@Sse()` is useful for native `GET` event streams, but OpenResponses
streaming is a `POST /v1/responses` behavior. The OpenResponses controller
should therefore use a normal `@Post()` route and manually write SSE frames
when `body.stream === true`.

```typescript
import { Body, Controller, Post, Res } from "@nestjs/common";
import type { Response as ExpressResponse } from "express";
import { CreateResponseBodySchema, type CreateResponseBody } from "./responses.schemas.js";
import { ResponsesService } from "./responses.service.js";
import { ZodValidationPipe } from "../../validation/zod-validation.pipe.js";

@Controller("v1/responses")
export class ResponsesController {
    public constructor(private readonly responses: ResponsesService) {}

    @Post()
    public async create(
        @Body(new ZodValidationPipe(CreateResponseBodySchema)) body: CreateResponseBody,
        @Res({ passthrough: false }) response: ExpressResponse,
    ) {
        if (body.stream) {
            response.status(200);
            response.setHeader("Content-Type", "text/event-stream");
            response.setHeader("Cache-Control", "no-cache");
            response.setHeader("Connection", "keep-alive");

            for await (const event of this.responses.createStream(body)) {
                response.write(`event: ${event.type}\n`);
                response.write(`data: ${JSON.stringify(event)}\n\n`);
            }

            response.end();
            return;
        }

        response.json(await this.responses.create(body));
    }
}
```

The exact import path for the validation pipe can be adjusted during
implementation. The key requirement is that protocol validation lives at the
outer adapter layer and does not leak NestJS into the core agent modules.

## Phased Delivery Plan

### Phase 0: Scaffold Backend And Prove OpenCode Ping-Pong

Objective: make the repository backend-first and prove OpenCode can talk to the
local service through OpenResponses.

Implementation work:

- Add the NestJS service scaffold under `src/international-space-bar-server/`.
- Add `HealthController` with `GET /health` returning service name, version,
  and status.
- Add OpenResponses schemas, controller, service, and ping runtime.
- Add local bearer-token handling using `ISB_OPENRESPONSES_API_KEY`.
- Add `docs/examples/opencode-isb-ping.jsonc`.
- Change default package scripts to start/build the server, not the old TUI.
- Archive `src/international-space-bar/tui/**` under
  `archive/legacy-ink-tui/` with a README explaining where it came from and
  why it is inactive.
- Remove active imports of `./tui/render.js` and `renderTui` from the default
  entrypoint path.

Acceptance criteria:

- `pnpm dev:server` starts a NestJS service on `127.0.0.1:3000`.
- `GET /health` returns `200`.
- `POST /v1/responses` with a valid local bearer token returns a completed
  OpenResponses-style object containing `pong`.
- The OpenCode proof command using `OPENCODE_CONFIG=docs/examples/opencode-isb-ping.jsonc`
  returns `pong`.
- No file under active `src/` imports `src/international-space-bar/tui`.
- The archived UI is preserved, but it is not part of the default build or
  runtime path.
- `pnpm check` exits 0.
- `pnpm build` exits 0.

Validation commands:

```bash
pnpm dev:server
curl -s http://127.0.0.1:3000/health
curl -s \
  -H "Authorization: Bearer local-dev-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"isb-ping","input":"ping"}' \
  http://127.0.0.1:3000/v1/responses
ISB_OPENRESPONSES_API_KEY=local-dev-key \
OPENCODE_CONFIG=docs/examples/opencode-isb-ping.jsonc \
opencode run "ping"
pnpm check
pnpm build
```

### Phase 1: Add Streaming Ping-Pong

Objective: prove OpenResponses streaming over the same `POST /v1/responses`
route.

Implementation work:

- Add SSE frame writer for OpenResponses events.
- Implement `stream: true` on `POST /v1/responses`.
- Emit at least `response.created`, `response.output_text.delta`, and
  `response.completed` events.
- Split `pong` into one or more deltas so clients exercise incremental output.
- Add cancellation handling for closed HTTP connections.

Acceptance criteria:

- `curl -N` against `POST /v1/responses` with `stream: true` shows semantic
  OpenResponses events.
- Event order is deterministic: `response.created` before any output delta,
  output deltas before `response.completed`.
- OpenCode can consume the streaming route without hanging.
- `pnpm check` and `pnpm build` exit 0.

Streaming target:

```text
event: response.created
data: {"type":"response.created","response":{"id":"resp_<uuid>","status":"in_progress"}}

event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":"po","output_index":0,"content_index":0}

event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":"ng","output_index":0,"content_index":0}

event: response.completed
data: {"type":"response.completed","response":{"id":"resp_<uuid>","status":"completed"}}
```

### Phase 2: Establish OpenResponses Compliance Baseline

Objective: make the backend compatible enough with the OpenResponses compliance
suite to protect future work.

Implementation work:

- Pin the OpenResponses OpenAPI version or commit used for validation.
- Decide whether to generate TypeScript types from the OpenAPI spec or maintain
  hand-authored Zod schemas for the supported subset.
- Run the OpenResponses compliance tests for `basic-response` and
  `streaming-response`.
- Add `/v1/responses/compact` if the chosen compliance scope requires it.
- Add automated smoke tests for non-streaming and streaming responses.

Acceptance criteria:

- The compliance runner passes for the agreed phase-two filters.
- The supported OpenResponses subset is documented in the repo.
- Unsupported fields are either safely ignored, preserved as metadata, or
  rejected with an OpenResponses-style error.
- `pnpm check` and `pnpm build` exit 0.

Reference compliance command:

```bash
bun run test:compliance \
  --base-url http://127.0.0.1:3000/v1 \
  --api-key local-dev-key \
  --filter basic-response,streaming-response
```

If the project does not adopt Bun, the Tech Validator should define a
repeatable way to run the upstream compliance command without making Bun part
of the runtime stack.

### Phase 3: Add Backend Runtime Boundary

Objective: replace ping-pong internals with an internal agent runtime service
without changing the OpenResponses route contract.

Implementation work:

- Define a framework-free runtime port, for example `AgentRuntimePort`.
- Move request-to-agent mapping into a protocol mapper service.
- Integrate the existing LangGraph director workflow behind the runtime port.
- Map OpenResponses `input`, `instructions`, and `previous_response_id` to an
  internal thread/session concept.
- Normalize LangGraph output into internal response events before converting
  those events to OpenResponses response objects or SSE events.
- Keep NestJS imports out of `src/international-space-bar/agent`,
  `src/international-space-bar/workflow`, `src/international-space-bar/llm`, and
  `src/international-space-bar/tool`.

Acceptance criteria:

- `/v1/responses` can return a real agent final response in non-streaming mode.
- `stream: true` can stream normalized agent text deltas.
- The ping runtime remains available as an explicit test model, not hidden as a
  production fallback.
- Layered dependency rules are preserved.
- Context7 has been used to revalidate current LangGraph, LangChain, and
  DeepAgents APIs for streaming, messages, tool messages, async agents, and
  interrupts.
- `pnpm check` and `pnpm build` exit 0.

Suggested runtime port:

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

### Phase 4: Add Tools, Tool Messages, And Approvals

Objective: support simple approve/reject approvals after the core backend route
and streaming behavior are stable.

Implementation work:

- Map LangChain `AIMessage` tool calls and `ToolMessage` results into stable
  internal event envelopes.
- Decide how backend-owned interrupts map to OpenResponses and OpenCode.
- Add an approvals module only after the mapping is validated.
- Support approve once, reject, and reject-with-feedback at minimum.
- Preserve the existing DeepAgents resume shape using `Command({ resume })`
  behind the runtime port.

Acceptance criteria:

- A backend-created approval request can pause a run.
- A client decision can resume or reject the run.
- Tool call IDs and interrupt IDs are visible in logs and stream events.
- OpenResponses output remains valid for clients that do not understand the
  native approval extension.
- `pnpm check` and `pnpm build` exit 0.

This phase may require a clarification or ADR. OpenCode already has its own
tool permission model, and OpenResponses has its own function/tool call shapes.
The validation pipeline must decide whether approvals are represented as
OpenResponses tool calls, a native side-channel endpoint, or both.

### Phase 5: Durability, Observability, And Documentation Updates

Objective: make the backend service operationally understandable and update
the architecture docs that become obsolete after the service split.

Implementation work:

- Add durable session/run identifiers.
- Add request IDs, response IDs, thread IDs, run IDs, tool call IDs, and
  interrupt IDs to logs.
- Preserve separation between system logs and agent observability logs.
- Add API-level observability only as a separate concern from `app.log` and
  `agents.log`.
- Update [docs/technical-stack.md](technical-stack.md) to document NestJS,
  OpenResponses, scripts, and the new source layout.
- Update [docs/agent-observability-logging.md](agent-observability-logging.md)
  to describe backend-service logging and protocol request IDs.
- Update [docs/workflow.md](workflow.md) if workflow diagrams no longer match
  the backend architecture.

Acceptance criteria:

- A single OpenCode request can be traced across protocol logs, system logs,
  and agent observability logs using stable IDs.
- Documentation no longer describes the old in-process TUI as the primary
  runtime.
- `pnpm check` and `pnpm build` exit 0.

### Phase 6: Future Client Strategy

Objective: revisit UI strategy only after backend protocol and runtime behavior
are proven.

Possible work:

- Reassess whether OpenCode remains the primary client.
- Revisit the OpenCode TUI/server architecture for ideas about session sync,
  permission prompts, and rich tool rendering.
- Decide whether to build a new International Space Bar TUI, a web UI, or only
  protocol adapters.
- If a custom TUI is needed, evaluate Ink, OpenTUI, and web-based clients based
  on backend requirements already proven in phases 0-5.

This phase is intentionally out of the MVP. It should not block the backend
scaffold, OpenResponses support, or OpenCode ping-pong.

## UI Archive Specification

Archiving the existing UI means making it inactive, not pretending it never
existed.

Required archive behavior:

- Move active Ink UI files out of `src/` so they are not part of the default
  service build, lint surface, or runtime path.
- Preserve the source under `archive/legacy-ink-tui/` with a README that states:
    - archive date,
    - original source path,
    - reason for archive,
    - how to inspect it,
    - that it is not expected to build unless restored intentionally.
- Remove default imports and script paths that launch `renderTui`.
- Remove active UI dependencies only after no active source file imports them.

This archive is a noise-reduction step. It is not a TUI migration and should
not become a large refactor.

## Pipeline Handoff Guidance

The validation pipeline should create one epic per phase or merge adjacent
phases only when dependencies are trivial. It must use
`node docs/project-management/next-id.mjs ...` for all IDs.

Recommended epic grouping:

| Epic    | Scope                                                                        | Priority |
| ------- | ---------------------------------------------------------------------------- | -------- |
| Phase 0 | NestJS scaffold, OpenResponses non-streaming, OpenCode ping-pong, UI archive | critical |
| Phase 1 | Streaming OpenResponses ping-pong                                            | high     |
| Phase 2 | Compliance baseline and tests                                                | high     |
| Phase 3 | LangGraph/DeepAgents runtime integration                                     | high     |
| Phase 4 | Tools, tool messages, approvals                                              | medium   |
| Phase 5 | Durability, observability, docs                                              | medium   |
| Phase 6 | Future client/UI strategy                                                    | low      |

Phase A validators must check:

- NestJS controller and streaming snippets against current NestJS docs.
- OpenResponses endpoint, response, and event schemas against the current
  OpenAPI spec.
- OpenCode custom-provider config against current OpenCode docs/source.
- LangGraph, LangChain, and DeepAgents APIs through Context7 before any runtime
  integration tickets are created.
- Layered architecture boundaries from [AGENTS.md](../AGENTS.md) and
  [docs/technical-stack.md](technical-stack.md).

## Risks And Clarification Candidates

| Topic                      | Risk                                                                                | Likely resolution path                                                                |
| -------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| OpenCode provider behavior | OpenCode may call `/v1/responses` with details not covered by the phase-zero subset | Tech Validator must run a real OpenCode ping before phase-zero completion             |
| OpenResponses schema drift | Required fields or event names may change                                           | Pin the spec commit used by compliance tests                                          |
| NestJS POST streaming      | `@Sse()` is GET-oriented and does not directly match OpenResponses POST streaming   | Use manual SSE writing on the `@Post()` route                                         |
| Tool approvals             | Backend-owned interrupts may not map cleanly to OpenCode's permission model         | Create an ADR in phase 4 before implementation                                        |
| Archive depth              | Moving only `tui/` may leave old TUI assumptions in `main.ts` or dependencies       | Phase-zero archive ticket must remove default TUI launch path too                     |
| Test runner                | The repo currently has no test script                                               | Test Planner should choose minimal tests that fit Node.js 22 and the existing tooling |

## Definition Of MVP Done

The MVP described by this document is done when:

1. `pnpm dev` starts the NestJS backend service.
2. `POST /v1/responses` returns a valid `pong` response.
3. OpenCode can be configured through the checked-in example config and can
   receive `pong` from the backend.
4. Streaming ping-pong works through OpenResponses SSE events.
5. The OpenResponses basic and streaming compliance baseline passes or has a
   documented, validated exception.
6. The old Ink UI is archived and no longer part of the default runtime path.
7. `pnpm check` and `pnpm build` pass.

## Related documents

- [Response Stream Builder](response-stream-builder.md) — block-based streaming
  architecture that replaces the hand-built event sequences from Phase 1.
