# International Space Bar

A production-grade scaffold for a fully functional [OpenResponses](https://github.com/openresponses/openresponses)-compatible server. Clients such as [OpenCode](https://opencode.ai) and GitHub Copilot can point at it and use it as a remote model provider — sending requests over HTTP/SSE or WebSocket and receiving structured streaming responses.

The project's emphasis is the scaffold itself: layered clean architecture, structured logging, bearer-token authentication, OpenAPI-driven schema generation, and full protocol compliance for HTTP and WebSocket transports. An opinionated multi-agent AI workflow is designed and documented — its integration behind the runtime port is planned work on the roadmap.

---

## Table of Contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Key features](#key-features)
- [Commands](#commands)
- [Project structure](#project-structure)
- [Documentation](#documentation)
- [Agent workflow (planned)](#agent-workflow-planned)
- [How this project is built](#how-this-project-is-built)

---

## What it does

International Space Bar exposes `POST /v1/responses` — the OpenResponses protocol surface — over both HTTP/SSE and WebSocket transports. Any OpenResponses-compatible client can connect to it and treat it as a custom remote model.

The server currently streams a fully spec-compliant `ping → pong` response with all required event types (`response.created`, `response.output_item.added`, `response.output_text.delta`, `response.output_text.done`, `response.content_part.done`, `response.output_item.done`, `response.completed`). The runtime port is the seam where the LangGraph / DeepAgents agent workflow will plug in once integration tickets are complete.

---

## Quick start

**Prerequisites:** Node.js 22, pnpm

```bash
# Install dependencies
pnpm install

# Set the required API key (any string in dev)
export ISB_OPENRESPONSES_API_KEY=dev-key

# Start the dev server (default: http://127.0.0.1:3000)
pnpm dev:server
```

The server binds to `127.0.0.1:3000` by default — loopback only, no accidental external exposure. To accept outside connections set `server.host` in your config file.

### Connect with OpenCode

```bash
opencode --model international-space-bar/isb-ping
```

An example provider config is in [docs/examples/opencode-isb-ping.jsonc](docs/examples/opencode-isb-ping.jsonc).

### Health check

```
GET http://127.0.0.1:3000/health
```

---

## Configuration

Configuration is loaded from a YAML file chosen by the environment:

| Environment     | File               |
| --------------- | ------------------ |
| `dev` (default) | `config.dev.yaml`  |
| `test`          | `config.test.yaml` |
| `prod`          | `config.prod.yaml` |

Set the environment with `--environment <env>` (CLI flag) or `ISB_PROJECT_ENVIRONMENT` (env var).

Values prefixed with `SECRET[VAR_NAME]` are resolved from environment variables at startup via `SecretsStoreService`. Example:

```yaml
# config.dev.yaml
version: 1

server:
    port: 3000
    host: "127.0.0.1"
    enableCors: true # dev only — disable in production

logger:
    type: pino
    logFilePath: ./logs/app.log
    level: debug

ollama:
    apiKey: SECRET[OLLAMA_API_KEY]
```

See [docs/config-infrastructure-improvements.md](docs/config-infrastructure-improvements.md) for the full design — Zod-validated config schema, swappable secrets store, and typed config key paths.

---

## Architecture

The project follows **Clean Architecture** principles, which map naturally onto NestJS's DI-first model. Dependencies always point inward.

```
┌───────────────────────────────────────────────┐
│  international-space-bar-server/              │  NestJS outer adapter (HTTP, guards, pipes)
├───────────────────────────────────────────────┤
│              Composition Root                  │  main.ts, app.ts, config.ts, logging.ts
├───────────────────────────────────────────────┤
│              workflow/                         │  LangGraph state-graphs
├───────────────────────────────────────────────┤
│       agent/    llm/    tool/                  │  Domain services — agents, LLM adapters, tools
├───────────────────────────────────────────────┤
│              services/                         │  Shared cross-cutting utilities
├───────────────────────────────────────────────┤
│             interfaces/                        │  Pure contracts — no implementations
└───────────────────────────────────────────────┘
```

The server layer communicates with the agent runtime exclusively through port interfaces (`agent-runtime.port.ts`). It never imports agent internals. The composition root wires concrete implementations at startup.

For the full layering rules and allowed imports per layer, see [docs/technical-stack.md](docs/technical-stack.md).

---

## Key features

### OpenResponses protocol — HTTP/SSE and WebSocket

Both transports share the same response object model and streaming event format.

- **HTTP/SSE** — `POST /v1/responses` with `Content-Type: text/event-stream`
- **WebSocket** — persistent connection at the same `/v1/responses` path; clients send `response.create` messages; server streams the same event sequence

WebSocket-specific behaviour: connection-local state for `store: false` responses, per-connection sequential processing queue, cache eviction on continuation failure, and spec-compliant error envelopes.

See [docs/websocket-transport.md](docs/websocket-transport.md) for the full specification requirement mapping.

### Bearer-token authentication

All routes are protected by a `BearerAuthGuard`. The expected token is set via the `ISB_OPENRESPONSES_API_KEY` environment variable. The guard extracts the `Authorization: Bearer <token>` header and rejects invalid requests with `401 Unauthorized`.

### Structured logging — three separate concerns

| Concern             | Destination                                  | Purpose                                              |
| ------------------- | -------------------------------------------- | ---------------------------------------------------- |
| System logging      | `app.log` + stdout                           | Infrastructure diagnostics: startup, config, errors  |
| HTTP server logging | `app.log` + stdout (via `PinoLoggerService`) | NestJS internals, request lifecycle                  |
| Agent observability | `agents.log`                                 | Behavioural audit: intent, tokens, routing decisions |

Each concern gets its own pino instance and log file — they never share streams.

See [docs/logging.md](docs/logging.md) and [docs/agent-observability-logging.md](docs/agent-observability-logging.md).

### OpenAPI-driven schema generation

Zod schemas for the protocol surface are generated from [docs/openapi/openresponses.json](docs/openapi/openresponses.json) using Kubb (`@kubb/plugin-zod`). A preprocessing step strips `x-openresponses-disallowed` sentinel fields before generation.

```bash
pnpm generate:schemas
```

Never edit files under `src/**/openresponses/generated/` directly — change the spec and regenerate.

See [docs/schema-generation.md](docs/schema-generation.md).

### Compliance testing

A scripted compliance test suite validates the server against the OpenResponses specification:

```bash
pnpm test:compliance
```

See [docs/compliance-test.md](docs/compliance-test.md).

---

## Commands

| Task                                          | Command                 |
| --------------------------------------------- | ----------------------- |
| Start (dev)                                   | `pnpm dev:server`       |
| Build                                         | `pnpm build:server`     |
| Start (built)                                 | `pnpm start:server`     |
| Run all tests                                 | `pnpm test`             |
| Lint                                          | `pnpm lint`             |
| Lint + auto-fix                               | `pnpm lint:fix`         |
| Format                                        | `pnpm format`           |
| **All checks (mandatory after every change)** | `pnpm check`            |
| Regenerate Zod schemas                        | `pnpm generate:schemas` |
| Compliance tests                              | `pnpm test:compliance`  |

`pnpm check` runs Prettier (formatting, auto-fix) then ESLint (type-aware rules, auto-fix). Both must exit 0 before any commit.

---

## Project structure

```
src/international-space-bar/         # Core agent runtime (framework-free)
  interfaces/                        # Pure contracts and types (innermost layer)
  services/                          # Cross-cutting shared utilities
  agent/                             # Agent implementations, loaders, classifiers
  workflow/                          # LangGraph state-graphs (director, council)
  llm/                               # LLM provider adapters
  tool/                              # Tool implementations
  main.ts / app.ts / config.ts / logging.ts  # Composition root

src/international-space-bar-server/  # NestJS outer adapter (outermost layer)
  main.ts                            # NestJS bootstrap
  app.module.ts                      # Root module
  application-config/                # Zod-validated config + secrets resolution
  common/                            # Guards, pipes, shared server infrastructure
  graphs/                            # Server-wired LangGraph workflows (simple-workflow)
  health/                            # Health-check controller
  logging/                           # PinoLoggerService (bridges NestJS + ILogger)
  openresponses/                     # OpenResponses protocol controller, service, schemas
    generated/                       # Auto-generated by Kubb — do not edit

docs/                                # Design documents and specifications
docs/project-management/             # Epics, tickets, ADRs, sprint backlog
archive/legacy-ink-tui/              # Preserved Ink/React TUI (not in active runtime)
scripts/                             # Compliance tests, schema tooling
```

> **Migration in progress:** `src/international-space-bar/` is certain to be decommissioned. The exact target structure is still evolving, so these migration notes should be reviewed before implementation work. Server-related files will move into `src/international-space-bar-server/`. Workflow code is expected to move into a dedicated workflows directory. Common/shared types and utilities are expected to move into a dedicated common directory. OpenResponses protocol code is expected to move into its own OpenResponses-focused directory.

---

## Documentation

| Document                                                                                   | Description                                                                     |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [docs/technical-stack.md](docs/technical-stack.md)                                         | Authoritative reference: runtime, tooling, layered architecture, conventions    |
| [docs/openresponses-backend-phased-design.md](docs/openresponses-backend-phased-design.md) | Phased delivery plan — from ping/pong scaffold to full LangGraph integration    |
| [docs/websocket-transport.md](docs/websocket-transport.md)                                 | WebSocket transport: spec requirements, implementation notes, compliance status |
| [docs/logging.md](docs/logging.md)                                                         | NestJS server logging: PinoLoggerService, bridge pattern, startup sequence      |
| [docs/agent-observability-logging.md](docs/agent-observability-logging.md)                 | Agent observability: separate pino instance, agents.log, audit trail design     |
| [docs/schema-generation.md](docs/schema-generation.md)                                     | Kubb + OpenAPI schema generation, preprocessing, sentinel convention            |
| [docs/config-infrastructure-improvements.md](docs/config-infrastructure-improvements.md)   | Config service, secrets store, Zod validation, swappable backends               |
| [docs/workflow.md](docs/workflow.md)                                                       | AI agent workflow: director graph, council sub-graph, satisfaction loop         |
| [docs/compliance-test.md](docs/compliance-test.md)                                         | Compliance test suite: what is covered, how to run, current status              |
| [docs/agent-validation-pipeline.md](docs/agent-validation-pipeline.md)                     | Multi-agent build pipeline: phases, gates, flag protocol, ticket lifecycle      |

---

## Agent workflow (planned)

The agent runtime behind the OpenResponses port is designed as a multi-agent LangGraph workflow. It is documented but not yet wired to the HTTP layer.

The director workflow routes every incoming request through intent classification, dispatches to the correct execution path (orchestrator, reasoning, or council), and iterates until a satisfaction threshold is met:

```
classify intent → orchestrator / reasoning / council
                          ↓
                  council gate (escalate?)
                          ↓
                  satisfaction evaluator (iterate or present)
```

Specialist agents handle engineering tasks, test writing, documentation, security review, and project management. The full design is in [docs/workflow.md](docs/workflow.md).

Integration tickets tracking the LangGraph connection: `isb-0020` (LangGraph integration), `isb-0018` (expand runtime port), `isb-0019` (protocol mapper) — see [docs/project-management/backlog/](docs/project-management/backlog/).

---

## How this project is built

The project is as deliberate about _how_ it is built as it is about what it builds. Every feature goes through a structured **Agent Validation Pipeline** before it reaches `main`.

### The pipeline

```
Phase A — Validation
  ↓ architect + engineer + security-reviewer review the design in parallel
  ↓ tech-validator synthesises and either approves or requests revisions (max 3 loops)
  ↓ [approval gate]

Phase B — Planning
  ↓ test-planner + docs-planner produce plans in parallel
  ↓ PM decomposes work into dependency-ordered tickets with real IDs
  ↓ [approval gate]

Phase C — Execution (per ticket)
  ↓ engineer implements incrementally — pnpm check after each unit
  ↓ tester + docs-writer + security-reviewer run in parallel
  ↓ challenger validates against acceptance criteria (max 3 loops)
  ↓ commit → ticket closed
```

All tickets, epics, ADRs, and clarifications live in [docs/project-management/](docs/project-management/). IDs are generated by `docs/project-management/next-id.mjs` — never invented.

Read the full pipeline specification in [docs/agent-validation-pipeline.md](docs/agent-validation-pipeline.md).
