<!-- Context: project-intelligence/technical | Priority: critical | Version: 2.0 | Updated: 2026-05-01 -->

# Technical Domain

**Purpose**: Tech stack, architecture, and dev patterns for this project.
**Last Updated**: 2026-05-01 | **Update Triggers**: Stack changes, new patterns, architecture decisions

## Primary Stack

| Layer           | Technology                | Rationale                                                   |
| --------------- | ------------------------- | ----------------------------------------------------------- |
| Runtime         | Node.js 22 (Active LTS)   | Native ESM, long-term support                               |
| Language        | TypeScript 5 (strict)     | Full type safety                                            |
| Framework       | NestJS 11 (outer adapter) | HTTP/WS server — adapter only, not domain                   |
| Agent Framework | @langchain/langgraph 1.2+ | Graph-based state-machine for multi-agent workflows         |
| Validation      | Zod 4 + Kubb              | Runtime + compile-time; auto-generated schemas from OpenAPI |
| Package Mgr     | pnpm 10.33+               | Workspace-aware, strict isolation                           |
| Bundler         | tsup 8+                   | Preferred over tsc + tsc-alias                              |
| Logging         | Pino 10+                  | Structured JSON, separate concerns per domain               |
| Dev Runner      | tsx 4+                    | Preferred over ts-node                                      |

## Architecture — Layered Boundaries

**Rule**: Dependencies point inward only. Inner layers never import outer layers.

```
┌───────────────────────────────────────────────┐
│  international-space-bar-server/  NestJS adapter │
├───────────────────────────────────────────────┤
│              Composition Root  (main.ts, app.ts, config.ts, logging.ts) │
├───────────────────────────────────────────────┤
│       workflow/    │  Orchestration — LangGraph state-graphs           │
├───────────────────────────────────────────────┤
│  agent/   llm/   tool/  │  Domain services                         │
├───────────────────────────────────────────────┤
│            services/          │  Shared utilities                        │
├───────────────────────────────────────────────┤
│           interfaces/          │  Contracts — pure types, no impl          │
└───────────────────────────────────────────────┘
```

| Layer            | May import from                                                  |
| ---------------- | ---------------------------------------------------------------- |
| `interfaces/`    | Nothing (pure types)                                             |
| `services/`      | `interfaces/`                                                    |
| `agent/`         | `interfaces/`, `services/`, `llm/`, `tool/`, `agent/` (siblings) |
| `llm/`           | `interfaces/`, `services/`                                       |
| `tool/`          | `interfaces/`, `services/`                                       |
| `workflow/`      | `interfaces/`, `services/`, `agent/`                             |
| `server/`        | `interfaces/` via `*.port.ts` only; NestJS                       |
| Composition root | Everything                                                       |

## Project Structure

```
src/international-space-bar/
  interfaces/  # Pure types (innermost)    agent/       # Agent impls, loaders
  services/    # Shared cross-cutting       workflow/   # LangGraph workflows
  llm/         # LLM adapters (Ollama)      tool/       # Tools (web-fetch, weather)
  *.ts         # Composition root           banner.ts   # Startup banner
src/international-space-bar-server/
  common/      # Guards, pipes              logging/    # PinoLoggerService
  application-config/  # Config, secrets    openresponses/ # Protocol (controller, service, WS)
.agents/agents/  # YAML agent defs       .agents/skills/  # Markdown skill files
docs/  # technical-stack.md, workflow.md, logging.md
```

## Code Patterns

### LangGraph State Schema

```typescript
import { MessagesValue, StateSchema } from "@langchain/langgraph";
// ✅ Use StateSchema + MessagesValue
export const DirectorState = new StateSchema({
    messages: MessagesValue, // ← NEVER plain Zod array for messages
    query: z.string(),
    intent: z.enum(["query", "reasoning", "council"]).default("query"),
});
// ❌ NEVER use Annotation.Root
```

### GraphNode Type Bag & Context

```typescript
// ContextSchema: Zod object → StateGraph({ context: MyContextSchema })
export const MyContextSchema = z.object({ config: z.custom<IConfig>(), thread_id: z.string() });
// GraphNode type bag uses typeof (not z.infer<>)
type MyNode = GraphNode<{
    InputSchema: typeof MyState;
    OutputSchema: typeof MyState;
    ContextSchema: typeof MyContextSchema;
    Nodes: "nodeA" | "nodeB";
}>;
```

### NestJS Controller + Zod Validation

```typescript
@Controller(RESPONSES_ROUTE)
@UseGuards(BearerAuthGuard)
export class ResponsesController {
  constructor(@Inject(ResponsesService) private responses: ResponsesService,
              @Inject(LOGGER) private logger: ILogger) {}  // ← port contract
  @Post() @HttpCode(200)
  @UsePipes(new ZodValidationPipe(CreateResponseSchema))
  async create(@Body() body: CreateResponseBody, ...) { ... }
}
```

### Config (YAML + Zod + Secrets)

```typescript
const ConfigSchema = z.readonly(
    z.object({
        nodeEnv: z.enum(["development", "production", "test"]).default("development"),
        ollamaBaseUrl: z
            .url()
            .transform((s) => new URL(s))
            .default(() => new URL("https://ollama.com")),
        modelAliases: z.record(z.string(), z.string()).default({}),
    }),
);
// Secrets: SECRET[OLLAMA_API_KEY] syntax → resolved from env vars at runtime
```

## Naming Conventions

| Type               | Convention             | Example                                 |
| ------------------ | ---------------------- | --------------------------------------- |
| Files              | kebab-case             | `council-gate-classifier.ts`            |
| Directories        | kebab-case             | `international-space-bar-server/`       |
| Classes/Interfaces | PascalCase; `I` prefix | `App`, `IConfig`, `ILogger`             |
| Functions          | camelCase              | `createOllamaLLM()`, `resolveSecrets()` |
| Constants          | UPPER_SNAKE            | `DEFAULT_MAX_ITERATIONS`                |
| Zod schemas        | PascalCase const       | `DirectorState`, `ConfigSchema`         |
| Agent YAML         | kebab-case + dots      | `council.sub.advisor.yaml`              |

## Code Standards

- **TypeScript strict** — no `any`, no implicit falls through
- **ESM only** — `"type": "module"`, `.js` extensions in imports
- **Validate with Zod** — all config, state, structured LLM output
- **Layered arch** — deps point inward only; port contracts (`*.port.ts`) for cross-layer types
- **Server never imports agent internals** — communicates via port interfaces only
- **`pnpm check` must pass after every change** — Biome (format + lint) then ESLint (type-aware)
- **Never suppress lint without comment explaining why**
- **Biome owns**: formatting, import organisation, non-type-aware lint
- **ESLint owns**: `no-floating-promises`, `no-misused-promises`, `await-thenable`, `no-unsafe-*`
- **Kubb-generated files** — never edit `generated/`; update OpenAPI spec + `pnpm generate:schemas`
- **Sentinel convention** — never "fix" `minLength:1, maxLength:0, x-openresponses-disallowed:true`
- **Always re-read files before editing** — never edit from stale cache
- **All commits signed** — never bypass with `--no-verify`

## Security Requirements

- **Zod validation on all inputs** — request bodies, config, LLM output
- **Bearer auth guard** — `@UseGuards(BearerAuthGuard)` on all OpenResponses endpoints
- **Secrets via `SECRET[xxx]`** — resolved from env vars, never hardcoded
- **Loopback-only default** — `"127.0.0.1"` prevents accidental exposure
- **Separate logging domains** — `app.log`, `agents.log`, `server.log` never share pino instances
- **`pino-http` blocked** until `Authorization` header redaction implemented

## LLM Models

| Alias                                                      | Model                                                 | Use                             |
| ---------------------------------------------------------- | ----------------------------------------------------- | ------------------------------- |
| `opus`                                                     | `glm-5.1:cloud`                                       | Chairman, conductors, reviewers |
| `sonnet`                                                   | `deepseek-v4-pro:cloud`                               | Advisors, mid-tier              |
| `haiku`                                                    | `ollama:gemma4:31b-cloud`                             | Classifiers, fast tasks         |
| Structured output: `llm.withStructuredOutput(MyZodSchema)` | Retry: 3 attempts, 500ms initial, 2× backoff, 10s max |

## 📂 Codebase References

**Composition Root**: `src/international-space-bar/app.ts`, `config.ts`, `logging.ts`, `main.ts`
**Agent Domain**: `src/international-space-bar/agent/` — loader, classifier, satisfaction evaluator
**Workflows**: `src/international-space-bar/workflow/` — director.state.ts, council.state.ts
**LLM**: `src/international-space-bar/llm/ollama.ts`
**Server**: `src/international-space-bar-server/` — OpenResponses, config, logging
**Agent Configs**: `.agents/agents/*.yaml` | **Skills**: `.agents/skills/`

## Related Files

- `business-domain.md` — Why this tech foundation exists
- `business-tech-bridge.md` — Business → tech mapping
- `decisions-log.md` — Decision history with context
- `docs/technical-stack.md` — Authoritative reference (source of truth)
- `docs/workflow.md` — Agent workflow Mermaid diagrams
