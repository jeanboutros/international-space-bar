# Agent Observability Logging — Design Document

## Original Request

> Currently not all agents are logging their outputs. `satisfaction-evaluator.ts` is a good example of logging. All other agents and decisions in the workflow should be logged in a similar manner. The logs should have additional key-value pairs added to the context to indicate that this log message is an agent observability message (not a system log), to make the logs easy to filter. I want the agents to be able to log anything and the logs should go to `agents.log` not `app.log`.

Follow-up clarification:

> Don't replace `getLogger` — add both logger and agent logger. The same function should be able to report app logs and agent observability logs. The agent logs should be able to handle verbose details from langchain messages such as tokens spent and message type AIMessage, ToolMessage etc. Ultimately the log file should be used for reporting, and we should see exactly how the agents have behaved and be able to connect them all together using IDs such as the thread ID or others.

---

## Problem Statement

The system has two categories of log events that are currently indistinguishable:

| Category | Examples | Current destination |
|----------|----------|---------------------|
| **System/infrastructure events** | App startup, config load, HTTP errors | `app.log` via `ctx.logger` |
| **Agent observability events** | Intent classified, satisfaction score, message chain, tokens used | `app.log` (same, no way to filter) |

Several agents (`intent-classifier`, `council-gate-classifier`) emit **zero** logs. Others (`deep-agent-wrapper`, workflow nodes) log minimal data — no message types, no token counts, no thread traceability.

The goal is a machine-readable `agents.log` file usable as a **behavioural audit trail**: given a `thread_id`, you should be able to reconstruct exactly what happened — which agents ran, what they produced, how many tokens were consumed, and which routing decisions were made.

---

## Reasoning and Design Decisions

### Decision 1: Additive, not a replacement

> **Keep both `logger` (system) and `agentLogger` (observability) in every agent/node.**

Replacing the system logger with the agent logger would lose infrastructure-level signal (agent startup, config issues, retry events) from `app.log`. Instead, each module acquires **two loggers** — one for system events, one for agent events. They coexist without coupling.

```typescript
// In any agent or workflow node that receives AppContext:
ctx.logger.info({ ... }, "System event");         // system → app.log
ctx.agentLogger.info({ ... }, "Agent event");     // agent → app.log + agents.log

// In classifiers (factory-injected):
function createIntentClassifier(config: IConfig, agentLogger: ILogger) {
  return async (query: string, threadId: string) => {
    // ... classify ...
    agentLogger.info({ threadId, intent }, "Intent classified");
  };
}
```

### Decision 2: observability binding at the logger level, not the call site

The `observability: "agent"` key must appear on every agent log line. Rather than requiring every `logger.info({ observability: "agent", ... })` call to include it (error-prone, boilerplate), the key is injected as a **permanent pino child binding** when `getAgentLogger()` is called. All log lines from that logger automatically carry the key.

This is idiomatic pino: child loggers inherit and extend the parent's bindings.

### Decision 3: filter stream for agents.log

`app.log` receives every log line (full picture). `agents.log` receives **only** lines with `"observability":"agent"`. A lightweight writable stream wrapper (`createAgentFilterStream`) parses each JSON line and conditionally forwards it.

This keeps the pino multistream approach unchanged — no second root pino instance, no separate transport process.

### Decision 4: thread_id as the trace key

LangGraph passes a `thread_id` into every graph invocation and subgraph call. Every agent observability log event must include `thread_id`. This allows `agents.log` to be filtered on a single thread ID to reconstruct the full execution trace for one user turn across all nodes and agents.

### Decision 5: rich message chain logging in DeepAgentWrapper

The `DeepAgentWrapper` receives a full LangGraph message array after each invocation. Rather than discarding this, the agent logger should emit a structured entry with:
- Per-message: `type` (ai / human / tool / system), content length, tool name (for tool messages)
- Aggregate token usage (`inputTokens`, `outputTokens`, `totalTokens`) from `extractTokenUsage`

The existing `normaliseMessage` utility in `services/message-utils.ts` handles both class-instance and serialised-LC message formats — use it directly.

### Decision 6: AppContext injection, not direct Logging imports

The codebase enforces a strict layered architecture where inner layers (`agent/`, `workflow/`) must never import from outer layers (composition root). `Logging` lives at the composition root (`logging.ts`). Importing `Logging.getAgentLogger()` directly in agent or workflow modules would violate this dependency rule.

Instead, `agentLogger` is injected via `AppContext` — the existing dependency injection mechanism. The `AppContext` interface gains a new `readonly agentLogger: ILogger` field. The composition root (`app.ts`) wires it at startup. Inner layers access it through `ctx.agentLogger`.

This is consistent with how `deep-agent-wrapper.ts` already uses `ctx.logger`. Classifiers, which are created via factory functions and don't receive `AppContext`, accept `agentLogger: ILogger` as a factory parameter instead.

### Decision 7: `threadId` casing convention

LangGraph uses `thread_id` (snake_case) in its config objects. Log entries use `threadId` (camelCase), matching JavaScript conventions. The mapping happens at the boundary — workflow nodes extract `thread_id` from LangGraph config and pass it as `threadId` to agent logger calls and classifier/evaluator functions.

### Decision 8: filter stream resilience

`createAgentFilterStream` must wrap `JSON.parse` in a try-catch. Although pino guarantees atomic newline-delimited JSON writes, a crash mid-write or an unexpected non-JSON line (e.g. a pino warning) should not bring down the filter pipeline. Malformed lines are silently skipped — they still appear in `app.log` via the unfiltered stream.

---

## Implementation Plan

### 1. Infrastructure changes (6 files)

#### `config.yaml`
```yaml
logger:
  type: pino
  logFilePath: ./logs/app.log
  agentLogFilePath: ./logs/agents.log  # NEW
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
/** Agent observability logger. Writes to both app.log and agents.log. */
readonly agentLogger: ILogger;
```

This is the key architectural decision — inner layers receive the agent logger via dependency injection through `AppContext`, never importing `Logging` directly (see Decision 6).

#### `config.ts`
- Add `agentLogFilePath: z.string().optional()` to `ConfigSchema`
- Add `agentLogFilePath: raw.logger?.agentLogFilePath` to `flattenYaml`

#### `logging.ts`
New additions:

```typescript
// Filter stream — only forwards pino JSON lines that contain "observability":"agent".
// Must wrap JSON.parse in try-catch to avoid crashing on malformed lines (see Decision 8).
function createAgentFilterStream(dest: NodeJS.WritableStream): NodeJS.WritableStream

// On Logging class:
private agentLogger: ILogger;                          // instance-level, pre-bound

public getAgentLogger(name?: string): ILogger          // instance method
public static getAgentLogger(name?: string): ILogger   // static factory → AgentLazyLogger
static resolveAgentLogger(name?: string): ILogger      // internal resolver
```

`AgentLazyLogger` mirrors `LazyLogger` but delegates to `Logging.resolveAgentLogger(name)`.

In `initialize()`: if `agentLogFilePath` is set, add `createAgentFilterStream(pino.destination(...))` to the pino multistream alongside the existing streams.

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
```typescript
// Accept agentLogger as a factory parameter (injected by composition root)
export function createIntentClassifier(config: IConfig, agentLogger: ILogger) {
  return async (query: string, threadId: string): Promise<Intent> => {
    // ... existing classify logic ...
    agentLogger.info({ threadId, intent: result.intent, queryLength: query.length }, "Intent classified");
    return result;
  };
}
```

*No system logger needed here — pure structured-output, no infrastructure events.*

#### `agent/council-gate-classifier.ts`
```typescript
// Same pattern — agentLogger as factory parameter, threadId as call parameter
export function createCouncilGateClassifier(config: IConfig, agentLogger: ILogger) {
  return async (query: string, outcome: string, threadId: string): Promise<CouncilGateResult> => {
    // ... existing classify logic ...
    agentLogger.info({ threadId, shouldTrigger: result.shouldTrigger, queryLength: query.length }, "Council gate evaluated");
    return result;
  };
}
```

#### `agent/satisfaction-evaluator.ts`
```typescript
// Keep existing ctx.logger calls, ADD ctx.agentLogger for observability events.
// The evaluator already receives AppContext — use ctx.agentLogger directly.
// Add threadId to the evaluator function signature.

// After evaluation result:
ctx.agentLogger.info({ threadId, score, iteration, feedback: feedback.slice(0, 200) }, "Satisfaction evaluated");
```

#### `agent/deep-agent-wrapper.ts`
```typescript
// Already receives AppContext — use ctx.agentLogger.
// threadId is already available in invoke() signature.

// In invoke() — after extractResult:
ctx.agentLogger.info({
  threadId,
  agentId: this.id,
  messageCount: result.messages.length,
  tokenUsage: result.tokenUsage,
  messageChain: summariseMessages(result.messages),  // see below
}, "Agent invocation complete");

// New local helper:
function summariseMessages(messages: unknown[]): Array<{ type: string; contentLength: number }> {
  return messages.map((msg) => {
    const { messageType, content } = normaliseMessage(msg);
    const len = typeof content === "string" ? content.length : JSON.stringify(content).length;
    return { type: messageType ?? "unknown", contentLength: len };
  });
}
```

*Tool name extraction is deferred — can be added later if audit trails need it.*

---

### 3. Workflow modules (additive — use `ctx.agentLogger`)

Workflow nodes access the agent logger via `ctx.agentLogger` from `getContext(runnableConfig)` — no direct `Logging` imports (see Decision 6).

#### `workflow/director.workflow.ts`
```typescript
// In each node — extract from context (already available):
const { ctx, thread_id } = getContext(runnableConfig);

// In classifyIntent node — after classify():
// Update call site to pass threadId:
const { intent } = await classify(state.query, thread_id);
ctx.agentLogger.info({ threadId: thread_id, intent, query: state.query.slice(0, 100) }, "Intent classified");

// In councilGate node:
const { shouldTrigger } = await classifyCouncilGate(state.query, outcome, thread_id);
ctx.agentLogger.info({ threadId: thread_id, shouldTrigger, query: state.query.slice(0, 100) }, "Council gate decision");

// In evaluate node:
ctx.agentLogger.info({ threadId: thread_id, score, iteration, feedback: feedback.slice(0, 200) }, "Satisfaction evaluated");

// In routeAfterEvaluate:
ctx.agentLogger.info({ threadId: thread_id, score, intent, iteration }, "Routing after evaluate");
```

#### `workflow/council.workflow.ts`
```typescript
// In each node:
const { ctx, thread_id } = getContext(runnableConfig);

// After frameQuestion:
ctx.agentLogger.info({ threadId: thread_id, questionLength: result.lastContent.length }, "Question framed");

// After chairman:
ctx.agentLogger.info({ threadId: thread_id, verdictLength: result.lastContent.length }, "Chairman verdict produced");

// In generateReport — after writes:
ctx.agentLogger.info({ threadId: thread_id, verdictPath, transcriptPath }, "Council reports written");
```

---

### 4. Agent loader observability (additive)

#### `agent/agent-loader.ts`
```typescript
// Accept agentLogger via parameter (passed from composition root during wiring)

// After each agent is successfully loaded:
agentLogger.info({ agentId, toolCount: tools.length, subagentCount: subagents.length }, "Agent loaded");

// On load failure:
agentLogger.error({ agentId, error: err.message }, "Agent load failed");
```

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
    { "type": "ai", "contentLength": 0 },
    { "type": "tool", "contentLength": 312 },
    { "type": "ai", "contentLength": 187 }
  ],
  "msg": "Agent invocation complete"
}
```

---

## Acceptance Criteria

| # | Criterion |
|---|-----------|
| 1 | `./logs/agents.log` is created and contains ONLY lines with `"observability":"agent"` |
| 2 | `./logs/app.log` continues to receive all logs (system + agent) unchanged |
| 3 | Every agent log line carries `thread_id` (or `threadId`) |
| 4 | `intent-classifier` and `council-gate-classifier` emit at least one observability log per invocation |
| 5 | `deep-agent-wrapper` emits a message chain summary with token counts after every invocation |
| 6 | `pnpm check` exits 0 |
| 7 | No existing log call is removed — only additions |
| 8 | No new direct `Logging` imports in `agent/` or `workflow/` layers — agent logger accessed via `AppContext` or factory parameter |
| 9 | `agent-loader` emits at least one observability log per agent loaded |

---

## Further Considerations

### 1. Classifier DI pattern

Classifiers are created via factory functions (`createIntentClassifier(config)`). To pass `agentLogger` cleanly, two options exist:
- **(a) Factory parameter** — `createIntentClassifier(config, agentLogger)`. Cleaner since the logger doesn't change per call. **Recommended.**
- **(b) Per-call parameter** — `classify(query, threadId, agentLogger)`. More flexible but adds unnecessary boilerplate.

### 2. Pre-existing architecture violations

Three files already import `Logging` directly from the composition root:
- `satisfaction-evaluator.ts`
- `director.workflow.ts`
- `council.workflow.ts`

Fixing these pre-existing violations is **out of scope** for this task. A follow-up task should migrate them to use `ctx.logger` / `ctx.agentLogger` consistently. This change must **not** introduce any new direct `Logging` imports in inner layers.

### 3. Smoke test

Consider adding an automated test that writes mixed log lines (with and without `"observability":"agent"`) through the filter stream and verifies `agents.log` contains only agent lines with no truncation or duplication. Not in acceptance criteria but valuable for regression prevention.
