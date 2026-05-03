# Agent Observability Logging — Design Document

## Original Request

> Currently not all agents are logging their outputs. `satisfaction-evaluator.ts` is a good example of logging. All other agents and decisions in the workflow should be logged in a similar manner. The logs should have additional key-value pairs added to the context to indicate that this log message is an agent observability message (not a system log), to make the logs easy to filter. I want the agents to be able to log anything and the logs should go to `agents.log` not `app.log`.

Follow-up clarification:

> Don't replace `getLogger` — add both logger and agent logger. The same function should be able to report app logs and agent observability logs. The agent logs should be able to handle verbose details from langchain messages such as tokens spent and message type AIMessage, ToolMessage etc. Ultimately the log file should be used for reporting, and we should see exactly how the agents have behaved and be able to connect them all together using IDs such as the thread ID or others.

---

## Problem Statement

The system has two categories of log events that are currently indistinguishable:

| Category                         | Examples                                                          | Current destination                |
| -------------------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| **System/infrastructure events** | App startup, config load, HTTP errors                             | `app.log` via `ctx.logger`         |
| **Agent observability events**   | Intent classified, satisfaction score, message chain, tokens used | `app.log` (same, no way to filter) |

Several agents (`intent-classifier`, `council-gate-classifier`) emit **zero** logs. Others (`deep-agent-wrapper`, workflow nodes) log minimal data — no message types, no token counts, no thread traceability.

The goal is a machine-readable `agents.log` file usable as a **behavioural audit trail**: given a `threadId`, you should be able to reconstruct exactly what happened — which agents ran, what they produced, how many tokens were consumed, and which routing decisions were made.

---

## Reasoning and Design Decisions

### Decision 1: Additive, not a replacement — and fundamentally separate

> **Keep both `logger` (system) and `agentLogger` (observability) in every agent/node. They are separate concerns with separate infrastructure.**

System logging and agent observability are fundamentally different concerns:

| Concern                 | Purpose                                                       | Destination                 | Audience               |
| ----------------------- | ------------------------------------------------------------- | --------------------------- | ---------------------- |
| **System logging**      | Infrastructure diagnostics — startup, config, errors, retries | `app.log` + TUI ring buffer | DevOps, developers     |
| **Agent observability** | Behavioural audit trail — intent, tokens, routing, tool calls | `agents.log` only           | Agent tuners, analysts |

Agent messages are **not** system logs. System diagnostics are **not** agent tuning data. Mixing them pollutes both: `app.log` becomes noisy with verbose agent traces, and agent audit trails become cluttered with infrastructure noise.

This separation is a **fundamental architectural principle** (see `AGENTS.md`). Future observability types (API logs, etc.) follow the same pattern — each gets its own file and infrastructure.

```typescript
// In any agent or workflow node that receives AppContext:
ctx.logger.info({ ... }, "System event");         // system → app.log + TUI ring buffer
ctx.agentLogger.info({ ... }, "Agent event");     // agent → agents.log only (NOT app.log, NOT ring buffer)

// In classifiers (factory-injected):
function createIntentClassifier(config: IConfig, agentLogger: ILogger) {
  return async (query: string, threadId: string) => {
    // ... classify ...
    agentLogger.info({ threadId, intent }, "Intent classified");
  };
}
```

### Decision 2: observability binding at the logger level, not the call site

The `observability: "agent"` key must appear on every agent log line. Rather than requiring every `logger.info({ observability: "agent", ... })` call to include it (error-prone, boilerplate), the key is injected as a **permanent binding** when the agent logger is created. All log lines from that logger automatically carry the key.

For pino, this uses `pinoLogger.child({ observability: "agent", module: name })`. For the `StdoutLoggerAdapter`, the existing `bindings` propagation in `child()` already supports this — `{ ...this.bindings, observability: "agent", module: name }`.

The key difference from the system logger's `child(name)` is that the agent logger creates a child with **both** the `observability` marker and the `module` name in a single binding call. The `ILogger.child(name: string)` interface only accepts a module name, so the agent logger factory must create the child directly on the underlying pino logger (bypassing `ILogger.child()`), then wrap it in a `PinoLoggerAdapter`.

### Decision 3: separate pino instances — no filter stream needed

The agent logger uses its own pino instance with its own multistream, completely independent of the system logger. This means:

- `agents.log` receives lines directly via `pino.destination()` — no JSON parsing or filtering needed.
- `app.log` receives only system logger lines — no agent observability pollution.
- Each pino instance manages its own streams. No shared state, no cross-contamination.

A filter stream is unnecessary because all lines from the agent pino instance already carry `observability: "agent"` via permanent child bindings. Writing to `agents.log` is a direct destination, not a filtered tap.

### Decision 4: threadId as the trace key

LangGraph passes a `thread_id` into every graph invocation and subgraph call. Every agent observability log event must include `threadId` (camelCase, matching JavaScript conventions). The mapping from `thread_id` (snake_case, LangGraph convention) happens at the boundary — workflow nodes extract `thread_id` from LangGraph config and pass it as `threadId` to agent logger calls and classifier/evaluator functions.

### Decision 5: rich message chain logging in DeepAgentWrapper

The `DeepAgentWrapper` receives a full LangGraph message array after each invocation. Rather than discarding this, the agent logger should emit a structured entry with:

- Per-message: `type` (ai / human / tool / system), `contentLength`, `toolName` (for tool messages and AI tool calls)
- Aggregate token usage (`inputTokens`, `outputTokens`, `totalTokens`) from `extractTokenUsage`

The existing `normaliseMessage` utility in `services/message-utils.ts` handles both class-instance and serialised-LC message formats. Tool name is extracted from `additional_kwargs.name` (for `ToolMessage`) or `additional_kwargs.tool_calls[0].name` (for `AIMessage` tool calls) — both are available via the normalised message's `additional_kwargs` field.

### Decision 6: AppContext injection, not direct Logging imports

The codebase enforces a strict layered architecture where inner layers (`agent/`, `workflow/`) must never import from outer layers (composition root). `Logging` lives at the composition root (`logging.ts`). Importing `Logging.getAgentLogger()` directly in agent or workflow modules would violate this dependency rule.

Instead, `agentLogger` is injected via `AppContext` — the existing dependency injection mechanism. The `AppContext` interface gains a new `readonly agentLogger: ILogger` field. The composition root (`app.ts`) wires it at startup. Inner layers access it through `ctx.agentLogger`.

This is consistent with how `deep-agent-wrapper.ts` already uses `ctx.logger`. Classifiers, which are created via factory functions and don't receive `AppContext`, accept `agentLogger: ILogger` as a factory parameter instead.

### Decision 7: threadId casing convention

Log entries use `threadId` (camelCase), matching JavaScript conventions. The mapping from LangGraph's `thread_id` (snake_case) happens at the boundary — workflow nodes extract `thread_id` from the runnable config and pass it as `threadId` in all agent logger calls.

### Decision 8: `threadId` scoping — observability only

`threadId` is an **observability concept** — it connects agent messages together within a single user session for audit trail reconstruction. It is NOT required on system log lines. System events (app startup, agent loading, config errors) do not carry `threadId` because they occur outside the context of a user thread.

This means: every `agentLogger` call must include `threadId`. System `logger` calls may include it when contextually available but are not required to.

### Decision 9: agent logger destinations — separate from system logger entirely

The system logger (`ctx.logger`) writes to three destinations: stdout/pretty-print, `app.log` file, and the TUI `LogRingBuffer`.

The agent logger is a **completely separate pino instance** that writes to:

- `agents.log` — via direct `pino.destination()` (the primary audit trail)
- stdout/pretty-print — in development only, for developer visibility during local runs

It does **not** write to `app.log` or the TUI ring buffer. This is a consequence of the fundamental separation principle (Decision 1): agent observability and system diagnostics are independent streams with independent infrastructure.

**Implementation**: In `Logging.initialize()`, two independent pino instances are created with separate `pino.multistream()` calls. They share no streams.

### Decision 10: message chain includes tool names

Tool name extraction is included in the initial implementation — not deferred. For a behavioural audit trail, knowing _which tools_ were called is critical. Without it, the `messageChain` would show `{ type: "tool", contentLength: 312 }` without indicating whether that was `web_fetch` or `write_file`.

The `normaliseMessage()` utility already provides `additional_kwargs`, which contains `name` for `ToolMessage` and `tool_calls` for `AIMessage`. The `summariseMessages` helper extracts these.

---

## Implementation Plan

### 1. Infrastructure changes

#### `config.yaml`

```yaml
logger:
    type: pino
    logFilePath: ./logs/app.log
    agentLogFilePath: ./logs/agents.log # NEW
```

#### `interfaces/config.interface.ts`

Add:

```typescript
/** Path to the agent observability log file. Separate from the app log. */
readonly agentLogFilePath?: string;
```

#### `interfaces/app-context.interface.ts`

Add:

```typescript
/** Agent observability logger. Writes to agents.log only (not app.log, not the TUI ring buffer). */
readonly agentLogger: ILogger;
```

This is the key architectural decision — inner layers receive the agent logger via dependency injection through `AppContext`, never importing `Logging` directly (see Decision 6).

#### `config.ts`

- Add `agentLogFilePath: z.string().optional()` to `ConfigSchema`
- Add `agentLogFilePath: raw.logger?.agentLogFilePath` to `flattenYaml`

#### `logging.ts`

This is the most complex change. The key insight: the agent logger is a **completely separate pino instance** from the system logger (see Decision 1, Decision 3, Decision 9). They share no streams.

**Architecture**:

```typescript
class Logging {
    private logger: ILogger; // system logger (existing) → app.log + ring buffer + stdout
    private agentLogger: ILogger; // agent observability logger (NEW) → agents.log + stdout (dev)
    private pinoAgentLogger: Logger; // raw pino instance for agent logger (NEW)
    // ...
}
```

New additions:

```typescript
// ── Logging class changes ─────────────────────────────────────────────
// In initialize():

// 1. System logger streams (existing — unchanged)
const systemStreams: pino.StreamEntry[] = [];
if (config.nodeEnv === "development") {
    systemStreams.push({ stream: prettyBuild({ colorize: true, sync: true }), level });
} else {
    systemStreams.push({ stream: pino.destination(1), level });
}
if (config.logFilePath) {
    systemStreams.push({ stream: pino.destination({ dest: config.logFilePath, mkdir: true }), level });
}
systemStreams.push({ stream: getLogRingBuffer(), level }); // TUI ring buffer

this.pinoLogger = pino(pinoOptions, pino.multistream(systemStreams));
this.logger = new PinoLoggerAdapter(this.pinoLogger);

// 2. Agent logger streams (NEW — completely separate pino instance)
//    No app.log, no ring buffer. Only agents.log and stdout (dev).
const agentStreams: pino.StreamEntry[] = [];

if (config.nodeEnv === "development") {
    agentStreams.push({ stream: prettyBuild({ colorize: true, sync: true }), level });
}

if (config.agentLogFilePath) {
    // Direct destination — no filter stream needed.
    // All lines from this pino instance already carry observability: "agent".
    agentStreams.push({
        stream: pino.destination({ dest: config.agentLogFilePath, mkdir: true }),
        level,
    });
}

// Create the agent pino instance with observability binding baked in.
this.pinoAgentLogger = pino(pinoOptions, pino.multistream(agentStreams))
    .child({ observability: "agent" });
this.agentLogger = new PinoLoggerAdapter(this.pinoAgentLogger);

// ── Static factory ─────────────────────────────────────────────────────
public static getAgentLogger(name?: string): ILogger {
    return new AgentLazyLogger(name);
}

static resolveAgentLogger(name?: string): ILogger {
    if (Logging.resolvedInstance) {
        return Logging.resolvedInstance.getAgentLogger(name);
    }
    // Pre-init fallback: use the pre-init logger with an observability binding.
    if (!Logging._preInitAgentLogger) {
        Logging._preInitAgentLogger = new StdoutLoggerAdapter(
            { observability: "agent" },
            "debug",
        );
    }
    return name ? Logging._preInitAgentLogger.child(name) : Logging._preInitAgentLogger;
}

public getAgentLogger(name?: string): ILogger {
    const moduleName = name ? `agent.${name}` : "agent";
    // Create a pino child with the module binding — the observability binding
    // is already on the parent pinoAgentLogger.
    return new PinoLoggerAdapter(this.pinoAgentLogger.child({ module: moduleName }));
}
```

`AgentLazyLogger` mirrors `LazyLogger` but delegates to `Logging.resolveAgentLogger(name)`. It follows the same proxy pattern — safe to store at module scope, automatically upgrades to the real backend after init.

**`StdoutLoggerAdapter` changes**: The `child()` method already propagates `bindings` via `{ ...this.bindings, module: name }`. When the pre-init fallback creates `new StdoutLoggerAdapter({ observability: "agent" }, "debug")`, any `child()` call will include `observability: "agent"` in the merged bindings. No code change needed — the existing mechanism works.

**`PinoLoggerAdapter` changes**: No changes to `PinoLoggerAdapter` itself. The agent logger creates pino children directly on the stored `pinoAgentLogger` instance, then wraps them.

#### `app.ts`

Wire `agentLogger` into AppContext creation:

```typescript
agentLogger: Logging.getAgentLogger("app"),
```

Only the composition root imports `Logging` directly — this preserves the layered architecture (see Decision 6).

---

### 2. Agent modules (additive — no replacements)

Agent logger is accessed via **AppContext injection** or **factory parameters** — never by importing `Logging` directly (see Decision 6).

#### `agent/intent-classifier.ts`

The factory function signature changes to accept `agentLogger`. The returned function also gains a `threadId` parameter.

```typescript
import type { ILogger } from "../interfaces/logger.interface.js";

export function createIntentClassifier(config: IConfig, agentLogger: ILogger) {
    const model = config.defaultModel;
    const llm = createOllamaLLMFromConfig(config, model);
    const structured = llm.withStructuredOutput(IntentSchema);

    return async (query: string, threadId: string): Promise<Intent> => {
        const result = await structured.invoke([
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: query },
        ]);
        agentLogger.info(
            { threadId, intent: result.intent, queryLength: query.length },
            "Intent classified",
        );
        return result;
    };
}
```

#### `agent/council-gate-classifier.ts`

Same pattern — `agentLogger` as factory parameter, `threadId` as call parameter.

```typescript
import type { ILogger } from "../interfaces/logger.interface.js";

export function createCouncilGateClassifier(config: IConfig, agentLogger: ILogger) {
    const llm = createOllamaLLMFromConfig(config, config.defaultModel);
    const structured = llm.withStructuredOutput(CouncilGateSchema);

    return async (query: string, outcome: string, threadId: string): Promise<CouncilGateResult> => {
        const userMessage = `## Original Query\n${query}\n\n## Outcome to Evaluate\n${outcome}`;
        const result = await structured.invoke([
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
        ]);
        agentLogger.info(
            {
                threadId,
                shouldTrigger: result.shouldTrigger,
                queryLength: query.length,
                outcomeLength: outcome.length,
            },
            "Council gate evaluated",
        );
        return result;
    };
}
```

#### `agent/satisfaction-evaluator.ts`

The evaluator currently receives `config: IConfig` and uses `Logging.getLogger()` directly (a pre-existing architecture violation). The observability logging adds an `agentLogger` factory parameter. The returned function gains a `threadId` parameter.

```typescript
import type { ILogger } from "../interfaces/logger.interface.js";

export function createSatisfactionEvaluator(
    config: IConfig,
    agentLogger: ILogger,
    modelOverride?: string,
) {
    const model = modelOverride ?? config.defaultModel;
    const llm = createOllamaLLMFromConfig(config, model);
    const structured = llm.withStructuredOutput(SatisfactionSchema);
    const logger = Logging.getLogger("agent.satisfaction-evaluator"); // pre-existing system logger — kept

    return async (
        query: string,
        outcome: string,
        iteration: number,
        previousFeedback: string,
        threadId: string,
    ): Promise<SatisfactionResult> => {
        logger.info(
            { iteration, queryLength: query.length, outcomeLength: outcome.length },
            "Evaluating satisfaction",
        );

        // ... existing evaluation logic ...

        try {
            const result = await structured.invoke([
                /* ... */
            ]);
            agentLogger.info(
                {
                    threadId,
                    score: result.score,
                    iteration,
                    feedback: result.feedback.slice(0, 200),
                },
                "Satisfaction evaluated",
            );
            return result;
        } catch (error) {
            logger.error(
                { err: error, iteration },
                "Satisfaction evaluation failed, defaulting to satisfied",
            );
            agentLogger.info(
                { threadId, score: 1.0, iteration, fallback: true },
                "Satisfaction evaluation failed — accepting result",
            );
            return { score: 1.0, feedback: "Evaluation failed — accepting result" };
        }
    };
}
```

#### `agent/deep-agent-wrapper.ts`

Already receives `AppContext` — use `ctx.agentLogger`. `threadId` is already available in `invoke()` and `resume()`.

```typescript
// In invoke() — after extractResult:
ctx.agentLogger.info(
    {
        threadId,
        agentId: this.id,
        messageCount: result.messages.length,
        tokenUsage: result.tokenUsage,
        messageChain: summariseMessages(result.messages),
    },
    "Agent invocation complete",
);

// New local helper (includes tool name extraction — see Decision 10):
function summariseMessages(messages: unknown[]): Array<{
    type: string;
    contentLength: number;
    toolName?: string;
}> {
    return messages.map((msg) => {
        const normalised = normaliseMessage(msg);
        const len =
            typeof normalised.content === "string"
                ? normalised.content.length
                : JSON.stringify(normalised.content).length;

        let toolName: string | undefined;
        if (normalised.messageType === "tool" && normalised.additional_kwargs) {
            toolName = (normalised.additional_kwargs as Record<string, unknown>).name as
                | string
                | undefined;
        } else if (normalised.messageType === "ai" && normalised.additional_kwargs) {
            const toolCalls = (normalised.additional_kwargs as Record<string, unknown>).tool_calls;
            if (Array.isArray(toolCalls) && toolCalls.length > 0) {
                toolName = (toolCalls[0] as Record<string, unknown>)?.name as string | undefined;
            }
        }

        return {
            type: normalised.messageType ?? "unknown",
            contentLength: len,
            ...(toolName ? { toolName } : {}),
        };
    });
}
```

---

### 3. Workflow modules (additive — use `ctx.agentLogger`)

Workflow nodes access the agent logger via `ctx.agentLogger` from `getContext(runnableConfig)` — no direct `Logging` imports (see Decision 6).

#### `workflow/director.workflow.ts`

**Key change**: `createNodes(config)` must also receive `agentLogger` because classifiers are factory-created inside it. The `buildDirectorWorkflow(config)` signature changes to `buildDirectorWorkflow(config, agentLogger)`.

```typescript
import type { ILogger } from "../interfaces/logger.interface.js";

// Change the call site in main.ts:
// Before: const graph = buildDirectorWorkflow(ctx.config);
// After:  const graph = buildDirectorWorkflow(ctx.config, ctx.agentLogger);

export function buildDirectorWorkflow(config: IConfig, agentLogger: ILogger) {
    const { classifyIntent, orchestrator, reasoning, councilGate, council, evaluate, present } =
        createNodes(config, agentLogger);
    // ... existing graph wiring ...
}

function createNodes(config: IConfig, agentLogger: ILogger) {
    // Pass agentLogger to classifier factories:
    const classify = createIntentClassifier(config, agentLogger.child("intent-classifier"));
    const classifyCouncilGate = createCouncilGateClassifier(
        config,
        agentLogger.child("council-gate"),
    );
    const evaluateSatisfaction = createSatisfactionEvaluator(
        config,
        agentLogger.child("satisfaction"),
        config.defaultModel,
    );

    const classifyIntent: DirectorNode = async (state, runnableConfig) => {
        const { ctx, thread_id } = getContext(runnableConfig);
        logger.info({ query: state.query }, "Classifying user intent");
        const { intent } = await classify(state.query, thread_id);
        ctx.agentLogger.info(
            { threadId: thread_id, intent, query: state.query.slice(0, 100) },
            "Intent classified",
        );
        return { intent };
    };

    // In orchestrator node:
    const orchestrator: DirectorNode = async (state, runnableConfig) => {
        const { ctx, thread_id } = getContext(runnableConfig);
        // ... existing logic ...
        ctx.agentLogger.info(
            { threadId: thread_id, agentId: "orchestrator", iteration: state.iteration },
            "Orchestrator invoked",
        );
        const result = await getAgent("orchestrator").invoke(enhancedQuery, ctx, thread_id);
        ctx.agentLogger.info(
            { threadId: thread_id, agentId: "orchestrator", length: result.lastContent.length },
            "Orchestrator completed",
        );
        return { outcome: result.lastContent, messages: result.messages };
    };

    // In reasoning node — same pattern.

    // In councilGate node:
    const councilGate: DirectorNode = async (state, runnableConfig) => {
        const { ctx, thread_id } = getContext(runnableConfig);
        // ... existing logic ...
        const { shouldTrigger } = await classifyCouncilGate(state.query, outcome, thread_id);
        ctx.agentLogger.info(
            { threadId: thread_id, shouldTrigger, query: state.query.slice(0, 100) },
            "Council gate decision",
        );
        return { councilTriggered: shouldTrigger };
    };

    // In evaluate node — include the routing decision log (previously listed in routeAfterEvaluate):
    const evaluate: DirectorNode = async (state, runnableConfig) => {
        const { ctx, thread_id } = getContext(runnableConfig);
        // ... existing evaluation logic ...
        const routing =
            score >= SATISFACTION_THRESHOLD
                ? "present"
                : state.iteration >= state.maxIterations
                  ? "present (max)"
                  : state.intent === "council"
                    ? "council"
                    : state.intent === "reasoning"
                      ? "reasoning"
                      : "orchestrator";
        ctx.agentLogger.info(
            {
                threadId: thread_id,
                score,
                iteration: state.iteration + 1,
                routing,
                feedback: feedback.slice(0, 200),
            },
            "Satisfaction evaluated",
        );
        return { satisfactionScore: score, feedback, iteration: state.iteration + 1 };
    };
}
```

**Note**: `routeAfterEvaluate` is a **conditional edge router function**, not a LangGraph node. It receives `(state)` only — no `runnableConfig`, so no `ctx`. Logging must happen inside the `evaluate` node instead (see above), where `ctx` is available.

#### `workflow/council.workflow.ts`

```typescript
// In each node:
const { ctx, thread_id } = getContext(runnableConfig);

// After frameQuestion:
ctx.agentLogger.info(
    { threadId: thread_id, questionLength: result.lastContent.length },
    "Question framed",
);

// After chairman:
ctx.agentLogger.info(
    { threadId: thread_id, verdictLength: result.lastContent.length },
    "Chairman verdict produced",
);

// In generateReport — after writes:
ctx.agentLogger.info(
    { threadId: thread_id, verdictPath, transcriptPath },
    "Council reports written",
);
```

**Note**: This file currently imports `Logging` directly (pre-existing violation). The observability logging uses `ctx.agentLogger`. A follow-up task should migrate the system-level `logger` calls to `ctx.logger`.

---

### 4. Director workflow node signatures — CRITICAL

**Three director workflow nodes currently take `(state)` only and MUST be updated to `(state, runnableConfig)`:**

- `classifyIntent`
- `councilGate`
- `evaluate`

Without `runnableConfig`, these nodes cannot access `ctx` (via `getContext(runnableConfig)`) and therefore cannot use `ctx.agentLogger` or extract `thread_id`. This is a **breaking change** in the node function signatures that must happen before agent observability logging can work in the director workflow.

The `orchestrator`, `reasoning`, `council`, and `present` nodes already accept `(state, runnableConfig)` — only the three above need updating.

---

## Expected agents.log structure (per line)

```json
{
    "observability": "agent",
    "module": "workflow.director",
    "level": "info",
    "time": "2026-04-28T10:00:00.000Z",
    "threadId": "thread-abc123",
    "intent": "reasoning",
    "query": "analyse the trade-offs...",
    "msg": "Intent classified"
}
```

```json
{
    "observability": "agent",
    "module": "agent.deep-agent-wrapper/orchestrator",
    "level": "info",
    "time": "2026-04-28T10:00:01.123Z",
    "threadId": "thread-abc123",
    "agentId": "orchestrator",
    "messageCount": 4,
    "tokenUsage": { "inputTokens": 512, "outputTokens": 128, "totalTokens": 640 },
    "messageChain": [
        { "type": "human", "contentLength": 43 },
        { "type": "ai", "contentLength": 0, "toolName": "web_fetch" },
        { "type": "tool", "contentLength": 312, "toolName": "web_fetch" },
        { "type": "ai", "contentLength": 187 }
    ],
    "msg": "Agent invocation complete"
}
```

---

## Acceptance Criteria

| #   | Criterion                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `./logs/agents.log` is created and contains ONLY agent observability lines                                                                         |
| 2   | `./logs/app.log` receives system/infrastructure logs only — no agent observability lines                                                           |
| 3   | Every agent observability log line carries `threadId` (camelCase)                                                                                  |
| 4   | `intent-classifier` and `council-gate-classifier` emit at least one observability log per invocation                                               |
| 5   | `deep-agent-wrapper` emits a message chain summary with token counts and tool names after every invocation                                         |
| 6   | `pnpm check` exits 0                                                                                                                               |
| 7   | No existing log call is removed — only additions                                                                                                   |
| 8   | No new direct `Logging` imports in `agent/` or `workflow/` layers — agent logger accessed via `AppContext` or factory parameter                    |
| 9   | `classifyIntent`, `councilGate`, `evaluate` nodes accept `(state, runnableConfig)`                                                                 |
| 10  | Agent observability logs do NOT appear in `app.log` or the TUI ring buffer                                                                         |
| 11  | `buildDirectorWorkflow` accepts `agentLogger: ILogger` as a second parameter and passes it through to classifier factories                         |
| 12  | `satisfaction-evaluator` receives `agentLogger` as a factory parameter (not via `AppContext`) — its returned function gains a `threadId` parameter |
| 13  | `routeAfterEvaluate` does NOT log directly — the routing decision is logged inside the `evaluate` node where `ctx` is available                    |

---

## Further Considerations

### 1. Classifier DI pattern

Classifiers are created via factory functions (`createIntentClassifier(config)`). To pass `agentLogger` cleanly, two options exist:

- **(a) Factory parameter** — `createIntentClassifier(config, agentLogger)`. Cleaner since the logger doesn't change per call. **Recommended and adopted.**
- **(b) Per-call parameter** — `classify(query, threadId, agentLogger)`. More flexible but adds unnecessary boilerplate.

### 2. Pre-existing architecture violations

Three files already import `Logging` directly from the composition root:

- `satisfaction-evaluator.ts`
- `director.workflow.ts`
- `council.workflow.ts`

Fixing these pre-existing violations is **out of scope** for this task. A follow-up task should migrate them to use `ctx.logger` / `ctx.agentLogger` consistently. This change must **not** introduce any new direct `Logging` imports in inner layers.

Note: `satisfaction-evaluator.ts` currently receives only `IConfig`, not `AppContext`. Adding `agentLogger` as a factory parameter (not `ctx`) is consistent with the classifier pattern. A future task should also migrate its system-level `Logging.getLogger()` call to receive `logger` from `AppContext` once the evaluator is refactored to accept `AppContext`.

### 3. Smoke test

Consider adding an automated test that writes log lines through both pino instances and verifies: (a) `agents.log` contains only agent observability lines, (b) `app.log` contains only system lines, and (c) neither file has cross-contamination. Not in acceptance criteria but valuable for regression prevention.

### 4. Log rotation

`agents.log` is currently an unbounded file. During heavy agent use it will grow indefinitely. Production deployments should configure log rotation (e.g. via `logrotate` or a pino transport with built-in rotation). This is out of scope for the initial implementation but should be addressed before production use.

### 5. `StdoutLoggerAdapter` compatibility

When `loggerType` is set to `"default"` (not pino), the system logger is a `StdoutLoggerAdapter`. The agent logger must also work in this mode. Since `StdoutLoggerAdapter.child()` already propagates bindings via `{ ...this.bindings, module: name }`, creating a child with `{ observability: "agent", module: "agent.classifier" }` will correctly include the marker on every line. In default mode, agent logs go to stdout with the `observability` binding in the JSON output — there is no file separation. This is acceptable for development/testing scenarios.
