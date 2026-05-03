<!-- Context: project-intelligence/decisions | Priority: high | Version: 2.0 | Updated: 2026-05-01 -->

# Decisions Log

**Purpose**: Record major decisions with full context so future developers understand _why_.
**Last Updated**: 2026-05-01 | **Format**: Each decision as a separate entry

---

## D1: Layered Architecture with Strict Dependency Rule

**Date**: Project inception
**Status**: Decided
**Owner**: Architecture

### Context

The system has two fundamentally different concerns: a protocol-facing HTTP/WebSocket server (NestJS) and a multi-agent AI workflow (LangGraph). Without a clear separation, server code would import agent internals and vice versa, creating tight coupling.

### Decision

Strict layered architecture where dependencies point inward only. Seven layers with explicit import rules. Server communicates with agent runtime through port interfaces only.

### Alternatives Considered

| Alternative            | Pros                         | Cons                                  | Why Rejected                                   |
| ---------------------- | ---------------------------- | ------------------------------------- | ---------------------------------------------- |
| Flat module structure  | Simpler initial setup        | Cannot prevent cross-boundary imports | Unmaintainable at scale                        |
| Hexagonal architecture | Similar port/adapter pattern | More abstract than needed             | Layers provide same benefit with clearer names |

### Impact

- **Positive**: Clean testability, swappable implementations, clear ownership boundaries
- **Negative**: More files, more indirection for cross-layer communication
- **Risk**: Port contracts (`*.port.ts`) could proliferate — keep them minimal

---

## D2: LangGraph over Custom State Machine

**Date**: Project inception
**Status**: Decided
**Owner**: Architecture

### Context

The multi-agent workflow needs state management, conditional routing, parallel fan-out, and satisfaction loops. Building this from scratch would be months of work.

### Decision

Use `@langchain/langgraph` for workflow orchestration. Use `StateSchema` (not `Annotation.Root`), `MessagesValue` for message fields, and `Send` for parallel fan-out.

### Alternatives Considered

| Alternative          | Pros                      | Cons                             | Why Rejected                    |
| -------------------- | ------------------------- | -------------------------------- | ------------------------------- |
| Custom state machine | Full control              | High build cost, no ecosystem    | LangGraph already solves this   |
| XState               | Mature, TypeScript-native | Not designed for LLM multi-agent | Missing LLM-specific primitives |

### Impact

- **Positive**: Built-in message deduplication, parallel execution, checkpoint support
- **Negative**: LangGraph API can change — need Context7 for up-to-date docs
- **Risk**: Lock-in to LangChain ecosystem for workflow layer

---

## D3: Separate Logging Domains

**Date**: isb-0055
**Status**: Decided
**Owner**: Architecture

### Context

System logging (startup, config, errors) and agent observability (intent, tokens, routing) serve different audiences and have different retention, redaction, and tuning needs.

### Decision

Three separate pino instances, three separate log files (`app.log`, `agents.log`, `server.log`). No shared streams.

### Impact

- **Positive**: Independent log levels, no cross-contamination, separate storage backends
- **Negative**: Three logger configurations to maintain
- **Risk**: Developers might use wrong logger — enforce via linter rule (planned)

---

## D4: pino-http Blocked Until Header Redaction

**Date**: isb-0055
**Status**: Decided (blocking)
**Owner**: Security

### Context

`pino-http` logs request/response objects including headers. HTTP headers routinely contain credentials (`Authorization`, `Cookie`, `X-Api-Key`).

### Decision

No `pino-http` implementation is permitted until mandatory `Authorization` header redaction is implemented and verified.

### Impact

- **Positive**: No credential leaks in logs
- **Negative**: No automatic request tracing (deferred to future ticket)
- **Risk**: Without structured request logging, debugging server issues is harder — mitigated by NestJS's own log output via `PinoLoggerService`

---

## D5: Zod 4 + Kubb for Protocol Schemas

**Date**: Project inception
**Status**: Decided
**Owner**: Architecture

### Context

The OpenResponses spec defines 80+ types. Hand-writing Zod schemas is error-prone and drifts from the spec.

### Decision

Generate Zod schemas from the OpenAPI spec (`docs/openapi/openresponses.json`) using Kubb. A preprocessing step strips `x-openresponses-disallowed` sentinel fields before generation.

### Impact

- **Positive**: Schemas always match the spec; regeneration is a single command
- **Negative**: Generated code cannot be manually edited; Kubb version must stay compatible
- **Risk**: OpenAPI spec changes require regeneration (`pnpm generate:schemas`)

---

## D6: Ink TUI Archived

**Date**: Earlier phase
**Status**: Decided (completed)
**Owner**: Architecture

### Context

An Ink/React terminal UI existed for direct user interaction. The project's direction shifted to a server-first model with OpenResponses protocol as the interface.

### Decision

Archive the Ink TUI to `archive/legacy-ink-tui/`. It is preserved but not in the active runtime. The server + agent workflow is the primary interface.

### Impact

- **Positive**: Clear direction; server is the only interface
- **Negative**: No interactive terminal UI (OpenCode or API clients serve this role)
- **Risk**: Minimal — archived code is recoverable if needed

---

## D7: Director Pattern — Dispatch-Only Orchestrator

**Date**: Project inception
**Status**: Decided
**Owner**: Agent design

### Context

A common failure mode in agent systems is the top-level agent "doing work itself" instead of delegating, leading to quality collapse.

### Decision

The Agency Director is dispatch-only. It classifies intent, routes to subagents, and presents results. It never analyses, solves, or creates. If a subagent fails, the Director reports failure — it never fills in.

### Impact

- **Positive**: Clear separation of concerns; no quality collapse from orchestrator overreach
- **Negative**: More subagent invocations (higher latency for simple queries)
- **Risk**: Mitigated by the satisfaction loop — if quality is low, the system iterates

---

## D8: `pnpm check` as Hard Gate

**Date**: Project inception
**Status**: Decided
**Owner**: Engineering

### Context

Type-aware lint errors (`no-floating-promises`, `no-misused-promises`) are real bugs, not style issues. They must never reach main.

### Decision

`pnpm check` (Prettier + Biome + ESLint with type-aware rules) must exit 0 after every change. Never suppress a lint rule without a comment explaining why.

### Impact

- **Positive**: Catches real async bugs at PR time; consistent formatting
- **Negative**: Sometimes requires explicit `void` for fire-and-forget promises
- **Risk**: Low — the rules are well-understood and auto-fixable

---

## 📂 Codebase References

**Architecture docs**: `docs/technical-stack.md`, `AGENTS.md` — authoritative reference
**Port contracts**: `src/international-space-bar-server/common/interfaces/*.port.ts`
**Workflow design**: `docs/workflow.md`, `docs/agent-validation-pipeline.md`
**Logging design**: `docs/logging.md`, `docs/agent-observability-logging.md`
**Schema generation**: `docs/schema-generation.md`, `scripts/kubb-preprocessing.ts`

## Related Files

- `technical-domain.md` — Technical implementation details
- `business-tech-bridge.md` — How decisions connect business and tech
- `living-notes.md` — Current open questions
