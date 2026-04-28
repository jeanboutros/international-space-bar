# international-space-bar

Agent orchestration platform for a software development agency. Runs a multi-agent system with roles such as agency director, HR, engineers, testers, QA, project managers, and documentation writers.

> **AI agents performing technical tasks:** Read [`docs/technical-stack.md`](docs/technical-stack.md) for the full technical reference — runtime, LLM infrastructure, agent framework, layered architecture rules, and mandatory conventions. Read [`docs/workflow.md`](docs/workflow.md) for Mermaid diagrams of the AI workflow and planned evolution features.

## Stack

- **Runtime**: Node.js 22 (Active LTS)
- **Language**: TypeScript 5 (strict mode, ESM)
- **Agent framework**: `@langchain/langgraph` with `StateSchema` + `MessagesValue`
- **Backend framework**: NestJS (outer adapter only)
- **Validation**: Zod 4
- **Package manager**: pnpm

## Project structure

```
src/international-space-bar/
  interfaces/    # Pure types, contracts, shared type utilities (innermost)
  services/      # Shared application logic — cross-cutting utilities
  agent/         # Agent implementations, loaders, classifiers
  workflow/      # LangGraph workflows (director, council)
  llm/           # LLM provider adapters
  tool/          # Tool implementations
  *.ts           # Composition root: app, config, logging, main
src/international-space-bar-server/
  common/        # Guards, pipes — shared NestJS infrastructure
  health/        # Health-check controller
  openresponses/ # OpenResponses protocol — controller, service, schemas
  *.ts           # NestJS entry point, root module, smoke test
archive/
  legacy-ink-tui/  # Preserved Ink/React TUI (see archive/legacy-ink-tui/README.md)
dist/            # Compiled output (tsup)
```

## Architecture — layered boundaries

The codebase follows a layered architecture with a strict **dependency rule**:
dependencies point inward. Outer layers may import from inner layers; inner
layers must never import from outer layers.

```
┌───────────────────────────────────────────────┐
│  international-space-bar-server/              │  NestJS outer adapter (HTTP, guards, pipes)
├───────────────────────────────────────────────┤
│              Composition Root                  │  main.ts, app.ts, config.ts, logging.ts
│  (can import from every layer to wire them)   │
├───────────────────────────────────────────────┤
│              workflow/                         │  Orchestration — LangGraph state-graphs
├───────────────────────────────────────────────┤
│       agent/    llm/    tool/                  │  Domain services — agents, LLM adapters, tools
├───────────────────────────────────────────────┤
│              services/                         │  Shared utilities — cross-cutting logic
├───────────────────────────────────────────────┤
│             interfaces/                        │  Contracts — pure types, no implementations
└───────────────────────────────────────────────┘
```

`international-space-bar-server/` is the outermost layer — a NestJS HTTP
adapter. It depends on the agent core only through port interfaces
(`agent-runtime.port.ts`), never by importing agent internals directly.

### Allowed imports per layer

| Layer | May import from |
|-------|----------------|
| `interfaces/` | Nothing (pure types only) |
| `services/` | `interfaces/` |
| `agent/` | `interfaces/`, `services/`, `llm/`, `tool/`, `agent/` (siblings) |
| `llm/` | `interfaces/`, `services/` |
| `tool/` | `interfaces/`, `services/` |
| `workflow/` | `interfaces/`, `services/`, `agent/` |
| `server/` (`international-space-bar-server/`) | `interfaces/` (via port contracts); NestJS framework only |
| Composition root | Everything (wires layers together) |

### Rules

- **Server never imports agent internals directly.** The server layer
  communicates with the agent runtime through port interfaces
  (`agent-runtime.port.ts`). The composition root wires concrete
  implementations at startup.
- **Infrastructure utilities** (log ring buffer, shared stream helpers) live at
  the composition root level or in `services/`.
- **`services/`** contains cross-cutting logic needed by multiple layers
  (e.g. message parsing, token extraction). It depends only on `interfaces/`.
- **`interfaces/`** is the innermost layer — pure type definitions and
  contracts. It must have zero runtime dependencies on other project layers.
- When a function is needed by two layers, move it to the lowest common
  ancestor layer (usually `services/`). Never create a dependency from an
  inner layer to an outer layer to share code.

### Logging vs Observability — separation of concerns

System logging (`app.log`) and agent observability logging (`agents.log`) are
fundamentally separate concerns with separate infrastructure. They must never
share pino instances or stream configurations.

| Concern | Destination | Purpose | Examples |
|---------|-------------|---------|----------|
| System logging | `app.log` + TUI ring buffer | Infrastructure diagnostics | Startup, config load, HTTP errors, retries |
| Agent observability | `agents.log` only | Behavioural audit trail | Intent classified, token usage, routing decisions |
| Future: API observability | `api.log` | API request tracing | Request/response pairs, latency |

**Agent messages are not system logs. System diagnostics are not agent tuning data.**

Each observability domain gets its own pino instance and log file. They do not
share streams. The composition root wires each logger via `AppContext`:
- `ctx.logger` → system events → `app.log` + TUI ring buffer + stdout
- `ctx.agentLogger` → agent observability → `agents.log` + stdout (dev only)

See [`docs/agent-observability-logging.md`](docs/agent-observability-logging.md)
for the full design document.

## Commands

| Task | Command |
|------|---------|
| Run (dev) | `pnpm dev:server` |
| Build | `pnpm build:server` |
| Run (built) | `pnpm start:server` |
| Test | `pnpm test` |
| Lint | `pnpm lint` |
| Lint + auto-fix | `pnpm lint:fix` |
| Format | `pnpm format` |
| Lint + format + fix (all) | `pnpm check` |

## Code quality — mandatory after every change

After **every** code change, run the following and ensure both exit with code 0 before considering the task complete:

```bash
pnpm check
```

`pnpm check` runs Biome (formatting + non-type-aware linting, auto-fix) followed by ESLint (type-aware rules, auto-fix). If either reports errors that cannot be auto-fixed, resolve them manually before proceeding.

- Biome owns: formatting, import organisation, and all non-type-aware lint rules.
- ESLint owns: type-aware rules only (`no-floating-promises`, `no-misused-promises`, `await-thenable`, `no-unsafe-*`).
- Never suppress a lint rule without a comment explaining why.

## LangGraph reference

When clarification about LangGraph APIs, patterns, or behaviour is needed, use Context7 to fetch up-to-date documentation:

```
resolve-library-id: "langgraph"  → use /websites/langchain-ai_github_io_langgraphjs
get-library-docs: context7CompatibleLibraryID="/websites/langchain-ai_github_io_langgraphjs", topic="<your topic>"
```

## General principles

- Always suggest modern, ergonomic tooling over legacy alternatives (e.g. `tsup` over `tsc` + `tsc-alias`, `tsx` over `ts-node`)
- Prefer fewer tools with broader capabilities over composing many single-purpose tools
- Favour ESM-native packages and patterns
- When multiple approaches exist, recommend the one with the better developer experience and lower maintenance burden
- Always verify suggestions against up-to-date documentation (use Context7 when available)

## Conventions

- State schemas use `StateSchema` from `@langchain/langgraph`, not `Annotation.Root`
- Message fields use `MessagesValue` (prebuilt reducer), not plain Zod arrays
- Context schemas use a Zod `z.object(...)` passed to `StateGraph({ context: ... })`
- `GraphNode` is typed using the type bag pattern: `GraphNode<{ InputSchema, OutputSchema, ContextSchema, Nodes }>`
- `ContextSchema` in the type bag takes the Zod schema (`typeof MySchema`), not the inferred type (`z.infer<typeof MySchema>`)
- Source lives in `src/`, never in `node_modules/`
- `"type": "module"` is set — use ESM imports throughout
