# International Space Bar — Technical Stack & Core Principles

This document is the authoritative reference for the technical stack, architecture principles, and conventions used in this project. It is intended to be read by both humans and AI agents performing technical tasks on this codebase.

> **AI agents:** Read this document before writing, editing, or reviewing any code. The conventions and layering rules here are mandatory, not advisory.

---

## Table of Contents

- [Runtime & Language](#runtime--language)
- [Package Management & Tooling](#package-management--tooling)
- [Agent Framework](#agent-framework)
- [LLM Infrastructure](#llm-infrastructure)
- [Architecture — Layered Boundaries](#architecture--layered-boundaries)
- [Project Structure](#project-structure)
- [Skill & Agent Configuration System](#skill--agent-configuration-system)
- [Code Quality Pipeline](#code-quality-pipeline)
- [Core Conventions](#core-conventions)
- [Dependency Rule (Critical)](#dependency-rule-critical)

---

## Runtime & Language

| Concern | Choice | Rationale |
|---------|--------|-----------|
| **Runtime** | Node.js 22 (Active LTS) | Long-term support, native ESM, good TypeScript ecosystem |
| **Language** | TypeScript 5 — strict mode | Full type safety; strict catches real bugs |
| **Module system** | ESM (`"type": "module"`) | Native ESM throughout; no CommonJS interop |
| **Validation** | Zod 4 | Runtime + compile-time type safety; used for state schemas, config, and structured LLM output |

---

## Package Management & Tooling

| Tool | Version / Notes |
|------|-----------------|
| **pnpm** | Workspace-aware, fast, strict isolation |
| **tsup** | Bundles `src/` → `dist/` (preferred over raw `tsc + tsc-alias`) |
| **tsx** | Dev runner — preferred over `ts-node` |
| **Biome** | Formatting + non-type-aware linting (owns import organisation) |
| **ESLint** | Type-aware rules only: `no-floating-promises`, `no-misused-promises`, `await-thenable`, `no-unsafe-*` |
| **Kubb** (`@kubb/plugin-zod`) | Zod schema generation from the OpenAPI spec (`docs/openapi/openresponses.json`) |

### Key commands

| Task | Command |
|------|---------|
| Run (dev) | `pnpm dev` |
| Build | `pnpm build` |
| Run (built) | `pnpm start` |
| Lint | `pnpm lint` |
| Lint + auto-fix | `pnpm lint:fix` |
| Format | `pnpm format` |
| **All checks (mandatory)** | `pnpm check` |
| Regenerate Zod schemas | `pnpm generate:schemas` |

> **`pnpm check` must exit with code 0 after every code change.** It runs Biome (format + lint, auto-fix) followed by ESLint (type-aware, auto-fix). If either reports unfixable errors, resolve them manually before proceeding.

---

## Agent Framework

The workflow is built on **[LangGraph JS](https://langchain-ai.github.io/langgraphjs/)** — a graph-based state-machine framework from LangChain.

### Key primitives

| Primitive | Usage |
|-----------|-------|
| `StateGraph` | Defines the graph topology (nodes + edges). Always constructed as `new StateGraph(StateSchema, { context: ContextSchema })`. |
| `StateSchema` | Defines the data flowing through a graph. Import from `@langchain/langgraph`. **Do NOT use `Annotation.Root`**. |
| `MessagesValue` | Prebuilt reducer for the `messages` field. Handles LangGraph's message deduplication logic. Do NOT use plain Zod arrays for message fields. |
| `Send` | Fan-out to parallel worker nodes. Used in the council workflow to spawn 5 advisors and 5 reviewers in parallel. |
| `START` / `END` | Entry and exit sentinels for the graph. |
| `ConditionalEdgeRouter` | Typed function for conditional routing between nodes. |
| `GraphNode` | Node implementation type. Use the **type bag pattern** (see [Core Conventions](#core-conventions)). |

### When to fetch docs

When clarification about LangGraph APIs is needed, use Context7:

```
resolve-library-id: "langgraph"  → /websites/langchain-ai_github_io_langgraphjs
get-library-docs: context7CompatibleLibraryID="/websites/langchain-ai_github_io_langgraphjs", topic="<topic>"
```

---

## LLM Infrastructure

Models are resolved through **Ollama Cloud** (`https://ollama.com`) with aliased model names.

### Model aliases (from `config.yaml`)

| Alias | Resolved model | Typical use |
|-------|---------------|-------------|
| `opus` | `glm-5.1:cloud` | Chairman, conductors, reviewers — highest quality |
| `sonnet` | `deepseek-v4-pro:cloud` | Advisors, mid-tier tasks |
| `haiku` | `ollama:gemma4:31b-cloud` | Fast/cheap, classifiers |
| `default` | `glm-5.1:cloud` | Fallback for unspecified models |

### Authentication

Ollama Cloud requires an API key. Set `OLLAMA_API_KEY` in the environment. The key is referenced in `config.yaml` as `SECRET[OLLAMA_API_KEY]` and resolved at runtime via the secrets store.

### Structured output

For deterministic, schema-constrained LLM responses, use:

```typescript
const llm = createOllamaLLMFromConfig(config, model);
const structured = llm.withStructuredOutput(MyZodSchema);
const result = await structured.invoke(messages);
```

This pattern is used for intent classification, satisfaction evaluation, and council gate classification.

---

## Architecture — Layered Boundaries

The codebase follows a strict layered architecture. **Dependencies point inward only** — outer layers may import inner layers; inner layers must never import outer layers.

```
┌───────────────────────────────────────────────┐
│              Composition Root                  │  main.ts, app.ts, config.ts, logging.ts
│  (can import from every layer to wire them)   │
├───────────────────────────────────────────────┤
│                    tui/                        │  Presentation — React/Ink components
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

### Allowed imports per layer

| Layer | May import from |
|-------|----------------|
| `interfaces/` | Nothing (pure types only) |
| `services/` | `interfaces/` |
| `agent/` | `interfaces/`, `services/`, `llm/`, `tool/`, `agent/` (siblings) |
| `llm/` | `interfaces/`, `services/` |
| `tool/` | `interfaces/`, `services/` |
| `workflow/` | `interfaces/`, `services/`, `agent/` |
| `tui/` | `interfaces/`, `services/`, `tui/` (internal only) |
| Composition root | Everything (wires layers together) |

### Critical rules

- **TUI never imports from `agent/`, `workflow/`, `llm/`, or `tool/`.**  
  The composition root injects dependencies (compiled workflows, agents) into TUI components via props or callbacks.
- **`services/`** contains cross-cutting logic needed by multiple layers (e.g. message parsing, token extraction). It depends only on `interfaces/`.
- **`interfaces/`** is the innermost layer — pure type definitions and contracts with zero runtime dependencies on other project layers.
- When a function is needed by two layers, move it to the lowest common ancestor layer (usually `services/`). Never create a dependency from an inner layer to an outer layer.

### Cross-layer re-exports — port contracts

The `interfaces/` layer may be re-exported into the server layer through
explicitly declared **port contracts** in
`src/international-space-bar-server/common/interfaces/`.

Each permitted cross-layer import must have its own `*.port.ts` file. Direct
imports from `international-space-bar-server/` into `international-space-bar/`
are forbidden — only `*.port.ts` shims are allowed at this boundary.

The first such shim is `logger.port.ts`, which re-exports `ILogger` so that
`PinoLoggerService` can implement the inner interface without the server layer
importing from the core domain directly. See [`docs/logging.md`](logging.md)
for the full rationale.

---

## Project Structure

```
src/international-space-bar/
  interfaces/    # Pure types, contracts, shared type utilities (innermost)
  services/      # Shared application logic — cross-cutting utilities
  agent/         # Agent implementations, loaders, classifiers
  workflow/      # LangGraph workflows (director, council)
  llm/           # LLM provider adapters
  tool/          # Tool implementations
  tui/           # Terminal UI — React/Ink components (outermost)
  *.ts           # Composition root: app, config, logging, main
src/international-space-bar-server/
  common/        # Guards, pipes — shared NestJS infrastructure
  health/        # Health-check controller
  openresponses/ # OpenResponses protocol — controller, service, schemas
    generated/   # Auto-generated by Kubb — do not edit manually
  *.ts           # NestJS entry point, root module, smoke test

.agents/
  agents/        # YAML agent definitions (model, prompt, tools, subagents, skills)
  skills/        # Markdown skill files loaded into agent context at runtime

docs/
  workflow.md    # AI workflow diagrams (Mermaid) and planned evolution
  technical-stack.md  # This file

dist/            # Compiled output (tsup)
logs/
  council-reports/   # Council verdict + transcript Markdown files (auto-generated)
```

---

## Skill & Agent Configuration System

Agents are defined in YAML files under `.agents/agents/`. Skills (reusable instructions) live under `.agents/skills/`.

### Agent YAML schema

```yaml
version: 1
display_name: "Human-readable name"
short_description: "One-liner used by the orchestrator for routing decisions"
model: "alias-or-model-id"      # e.g. "opus", "sonnet", "ollama:gemma4:31b-cloud"
tools:                           # Tool IDs available to this agent
  - "web_fetch"
skills:                          # Skill directories or files loaded into context
  - ".agents/skills/reasoning/"
subagents:                       # Agent IDs this agent may dispatch to
  - "orchestrator"
interrupt_on:                    # Tool calls that require human confirmation before proceeding
  write_file: true
  read_file: false
default_prompt: |
  # System prompt ...
```

### Key agents

| File | Display Name | Role |
|------|-------------|------|
| `agency-director.yaml` | Agency Director | Top-level orchestrator (dispatch-only) |
| `orchestrator.yaml` | Orchestrator | Query executor with tools |
| `reasoner.yaml` | Reasoner | Chain-of-thought analyst |
| `council.conductor.yaml` | Council Conductor | Frames questions for the council |
| `council.sub.advisor.yaml` | Council Advisor | Independent perspective analysis (×5) |
| `council.sub.reviewer.yaml` | Council Reviewer | Peer review of anonymised responses (×5) |
| `council.sub.chairman.yaml` | Council Chairman | Synthesises all input into a verdict |

---

## Code Quality Pipeline

Two tools share responsibility. **Never suppress a lint rule without a comment explaining why.**

| Tool | Owns | Trigger |
|------|------|---------|
| **Biome** | Formatting, import organisation, non-type-aware lint | `pnpm format`, `pnpm lint`, `pnpm check` |
| **ESLint** | Type-aware rules only | `pnpm lint`, `pnpm check` |

The mandatory command after **every** code change:

```bash
pnpm check
```

---

## Core Conventions

### State schemas

```typescript
// ✅ Correct
import { MessagesValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

export const MyState = new StateSchema({
  messages: MessagesValue,
  query: z.string(),
  result: z.string().default(""),
});

// ❌ Wrong — do not use Annotation.Root
import { Annotation } from "@langchain/langgraph";
export const MyState = Annotation.Root({ ... });
```

### Context schemas

```typescript
// Context is a plain Zod object passed to StateGraph constructor
export const MyContextSchema = z.object({
  config: z.custom<IConfig>(),
  thread_id: z.string(),
});
export type MyContext = z.infer<typeof MyContextSchema>;

// Pass it to StateGraph
new StateGraph(MyState, { context: MyContextSchema })
```

### GraphNode type bag

```typescript
// ContextSchema takes the Zod schema type (typeof), NOT z.infer<...>
type MyNode = GraphNode<{
  InputSchema: typeof MyState;
  OutputSchema: typeof MyState;
  ContextSchema: typeof MyContextSchema;   // ← typeof, not z.infer<>
  Nodes: "nodeA" | "nodeB";
}>;
```

### Retry policy (LLM nodes)

```typescript
const LLM_RETRY_POLICY = {
  maxAttempts: 3,
  initialInterval: 500,
  backoffFactor: 2,
  maxInterval: 10_000,
};

graph.addNode("myNode", myNodeFn, { retryPolicy: LLM_RETRY_POLICY })
```

### Module imports

- Use `.js` extensions in all ESM imports (TypeScript resolves them to `.ts` at compile time).
- Never use `require()` — ESM only.
- Organise imports: external packages first, then internal layers (innermost to outermost).

### Comments

Only comment code that genuinely needs clarification. Do not add comments for self-evident logic.
