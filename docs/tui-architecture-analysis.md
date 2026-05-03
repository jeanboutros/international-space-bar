# TUI Architecture Analysis and Backend Separation Plan

## Purpose

This document analyzes OpenCode's terminal TUI architecture and compares it with
the current International Space Bar TUI. The primary recommendation is not to
start by rebuilding the UI. The first phase should separate the agent backend
from the terminal client, expose a stable service API, and make that API usable
by OpenResponse/OpenCode-style clients so that existing or future TUIs can plug
in without duplicating the entire presentation layer.

The MVP target is therefore:

1. A NestJS backend service that runs the LangGraph/DeepAgents workflow.
2. A protocol surface for message exchange, streaming events, and approvals.
3. A minimal client path that proves the backend can run with a TUI, including
   approve/reject interrupts.
4. A delayed decision on whether International Space Bar should keep Ink,
   migrate to another terminal renderer, or delegate the UI entirely to a
   compatible external TUI such as OpenCode.

## Executive Recommendation

OpenCode's most important architectural lesson is not its renderer. It is the
client/server split. The TUI is a thin client. The server owns sessions, agent
execution, tools, approvals, and event streaming. The client renders state and
sends user decisions.

International Space Bar currently runs the TUI and workflow in one process. The
next step should invert the priority order:

1. Build a NestJS backend service around the existing LangGraph/DeepAgents
   runtime.
2. Define a compatibility API that can support OpenResponse/OpenCode-style
   clients.
3. Keep the current Ink TUI as a minimal reference client and smoke test.
4. Delay visual TUI rebuilding until the backend protocol is proven.

This avoids spending effort on terminal widgets before the system has the
service boundary that would let multiple clients exist at all.

## 1. OpenCode Terminal TUI Analysis

OpenCode's terminal UI is not a typical Ink-style React terminal app. It uses
`@opentui/core`, a native terminal renderer with SolidJS bindings through
`@opentui/solid`. The renderer supplies terminal-native primitives such as
scroll boxes, text areas, markdown, diffs, code blocks, and line numbers. That
lets OpenCode render rich tool output without manually composing every terminal
layout from plain boxes and text.

The deeper design, however, is the service boundary:

- The terminal client talks to an OpenCode server through an SDK.
- Commands are sent over HTTP.
- Runtime updates arrive through server-sent events.
- The TUI batches event handling on a short frame cadence, around 16ms, so a
  busy agent run does not force a render per event.
- The TUI treats the server as the source of truth for sessions, messages,
  tool state, permissions, and question prompts.

### Root Application Shape

OpenCode's root TUI component composes many provider layers: SDK access, sync,
theme, local state, keybindings, dialogs, commands, session routing, and plugin
slots. That produces a TUI that behaves more like a desktop shell than a simple
command prompt.

The practical pattern worth copying is provider separation, not the exact
provider count. International Space Bar should separate concerns in the client:

- API client and event stream provider.
- Session provider.
- Input and command provider.
- Approval/question provider.
- Display model provider.

Those providers should read from the backend API rather than from in-process
workflow objects.

### Message to Part Model

OpenCode renders sessions as messages with typed parts. A message is not just a
string; it can contain text, reasoning, tool calls, tool results, questions, and
permission prompts. The session view maps part types to render components:

- Text parts render ordinary assistant content.
- Reasoning parts render model reasoning summaries or hidden/expandable
  reasoning state.
- Tool parts dispatch to tool-specific renderers.

Tool rendering then follows two broad shapes:

- Inline tools for compact one-line updates, such as a file read or glob.
- Block tools for multi-line content, such as bash output, diffs, edits, or
  fetched web content.

International Space Bar currently maps workflow messages into a simpler chat
model in [src/international-space-bar/tui/TuiApp.tsx](../src/international-space-bar/tui/TuiApp.tsx)
and [src/international-space-bar/interfaces/agent.interface.ts](../src/international-space-bar/interfaces/agent.interface.ts).
That is adequate for the MVP, but the backend protocol should already reserve a
typed `parts` model so richer clients do not need to parse text later.

### Permissions and Human Review

OpenCode has a rich permission UI with three important behaviors:

- A first decision stage for allow once, allow always, or reject.
- A follow-up path for confirming persistent approval.
- A reject-with-feedback path that sends natural-language guidance back to the
  agent.

The prompt is also tool aware. Bash displays a command. File edits display a
diff. Read, glob, grep, task, and web tools expose the relevant fields rather
than dumping raw JSON.

International Space Bar already has the core runtime concept: `InterruptInfo`
contains `id`, `toolName`, `args`, `description`, and `allowedDecisions`. The
next architecture should keep that object as the transport boundary, then add
optional render hints for richer clients:

```ts
interface InterruptInfo {
    id: string;
    toolName: string;
    args: unknown;
    description: string;
    allowedDecisions: string[];
    render?: {
        kind: "command" | "diff" | "file" | "search" | "task" | "generic";
        title?: string;
        summary?: string;
    };
}
```

### Structured Questions

OpenCode's question prompt handles multiple questions, tab navigation, numbered
choices, multi-select answers, typed answers, and a review step. This is more
than an approval prompt. It is a structured data collection surface.

International Space Bar should not implement this in the first MVP. It should
reserve an event type now:

```ts
type AgentStreamEvent =
    | { type: "interrupt"; interrupt: InterruptInfo }
    | { type: "question"; prompt: QuestionPrompt }
    | { type: "message"; message: MessageEnvelope }
    | { type: "complete"; result: WorkflowResult };
```

The MVP can support only `interrupt` and `message`; later clients can implement
`question` without changing the server transport.

## 2. Protocol-First Direction: Delay Rebuilding the TUI

The newest architectural requirement is to consider delaying custom TUI work and
enabling OpenResponse/OpenCode-style clients to use the backend. This should be
treated as a first-class design branch.

### Why Delay the TUI

Rebuilding the UI first has three risks:

- It solves presentation before proving the backend service boundary.
- It duplicates capabilities that existing TUIs may already provide.
- It couples International Space Bar to one renderer before the protocol is
  stable.

The backend split creates more leverage. Once the service speaks a stable
message, stream, and approval protocol, several clients become possible:

- The current Ink TUI as a minimal reference client.
- An OpenCode-like TUI if it can point at a compatible backend or adapter.
- A future web UI.
- CLI scripts and test harnesses.
- A remote automation client.

### Compatibility Target

`openresponse` does not currently appear in the repository, so this document
treats it as a compatibility goal rather than a confirmed local package. The
backend should expose an adapter layer that can support one or more of these
targets:

- OpenResponse-style request/response envelopes if that protocol is the chosen
  integration point.
- OpenAI Responses-style message and streaming shapes where useful for client
  interoperability.
- OpenCode-compatible session, event, and approval endpoints if OpenCode can be
  configured to talk to a custom server.
- A native International Space Bar API for features that do not map cleanly to
  external protocols.

The design should keep the core backend independent from any one external
protocol. Protocol adapters should translate between external schemas and the
internal `AgentRunService` contract.

```text
TUI / external client
        |
        v
Protocol adapter controller
        |
        v
Internal agent run service
        |
        v
LangGraph / DeepAgents runtime
```

### Recommended Phase Adjustment

The original plan made backend separation Priority 1 and MVP TUI/backend
message exchange Priority 2. Keep that order, but narrow the MVP client scope:

- Priority 1: Build the NestJS backend and protocol adapter layer.
- Priority 2: Prove the protocol with a tiny client path, not a redesigned UI.
- Priority 3: Evaluate whether to reuse OpenCode or another TUI before building
  International Space Bar-specific rich UI features.

## 3. SSE vs WebSocket

OpenCode's choice of server-sent events is a strong fit for agent streaming.
Most agent runtime traffic is server-to-client: tokens, state updates, tool
calls, tool results, approvals, errors, and completion events. User input and
approval decisions can be ordinary HTTP POST requests.

| Criterion            | Server-sent events                              | WebSocket                                                                   |
| -------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- |
| Direction            | Server to client                                | Bidirectional                                                               |
| Client commands      | Separate HTTP requests                          | Same socket                                                                 |
| Transport            | Standard HTTP response with `text/event-stream` | HTTP upgrade to WebSocket                                                   |
| Reconnection         | Native EventSource retry semantics              | Application-managed                                                         |
| Proxy support        | Generally straightforward HTTP streaming        | Requires upgrade support                                                    |
| Multi-client support | Natural: each client opens a stream             | Requires explicit socket/session routing                                    |
| Complexity           | Low                                             | Medium                                                                      |
| Best fit             | Agent output streams and run events             | Collaborative editing, realtime games, high-frequency bidirectional control |

Recommendation: use SSE for the primary run/event stream and REST for commands
such as invoke, resume, cancel, approve, reject, and session management. Add
WebSocket later only if a real bidirectional requirement appears.

## 4. Context and Message Management

OpenCode keeps conversation state on the server. The client sends a new user
message or command; the server attaches it to the existing session and runs the
agent with the correct context.

International Space Bar is already close to that model internally. The current
`IAgent.invoke(query, ctx, threadId)` method receives only the new query and a
thread ID. [src/international-space-bar/agent/deep-agent-wrapper.ts](../src/international-space-bar/agent/deep-agent-wrapper.ts)
turns that into a LangGraph input:

```ts
{
    messages: [{ role: "user", content: query }];
}
```

and passes:

```ts
{
    configurable: {
        thread_id: threadId;
    }
}
```

That means the future network API should not require the client to resend the
whole conversation. The client should send only:

```ts
interface InvokeRequest {
    threadId: string;
    message: {
        role: "user";
        content: string;
    };
}
```

The backend should attach session context, checkpointer state, agent config,
tool registry, and observability IDs.

## 5. Terminal Framework Alternatives

### Ink

Ink is the current choice. It fits Node.js, React, TypeScript, and the existing
composition root. It is a good reference-client framework and can continue to
host the MVP because it already works in this repo.

### @opentui/core and @opentui/solid

OpenCode's renderer is more capable for rich terminal UI. It offers native
widgets for markdown, code, diffs, text areas, scroll boxes, and high-frequency
rendering. The tradeoff is runtime and ecosystem alignment: OpenCode's stack is
oriented around Bun and SolidJS, while this project currently targets Node.js
22, React, and Ink.

### Blessed / neo-blessed

Blessed-style libraries are lower-level and older. They can build complex TUIs,
but they require more manual widget and focus management. They are not the best
first move for this project.

### Recommendation

Do not pick a new terminal renderer in Phase 1. Keep Ink only as a thin client
for smoke testing the new backend. Reassess after the backend can be consumed by
external or protocol-compatible clients.

## 6. NestJS Backend Design

The backend should be a service boundary around the existing workflow runtime,
not a rewrite of the agent system. The NestJS app should host agent execution,
sessions, event streaming, protocol adapters, health checks, and observability.

### Proposed Module Layout

```text
src/international-space-bar-server/
  main.ts
  app.module.ts
  agent/
    agent.module.ts
    agent.controller.ts
    agent-run.service.ts
    agent-runtime.service.ts
    dto.ts
  events/
    events.module.ts
    event-stream.controller.ts
    event-bus.service.ts
    sse-serializer.service.ts
  protocol/
    protocol.module.ts
    native.controller.ts
    openresponse.controller.ts
    opencode-compat.controller.ts
    protocol-mapper.service.ts
  sessions/
    sessions.module.ts
    sessions.controller.ts
    sessions.service.ts
  approvals/
    approvals.module.ts
    approvals.controller.ts
    approvals.service.ts
  observability/
    observability.module.ts
    agent-observability.service.ts
  health/
    health.controller.ts
```

The exact folder name can be adjusted during implementation, but the modules
should stay separate. Protocol controllers should not directly know how to run a
LangGraph graph. They should call internal services.

### AgentModule

`AgentModule` owns the runtime boundary.

Responsibilities:

- Load agent configs.
- Build tools and tool instructions.
- Create DeepAgents wrappers.
- Create or retrieve compiled workflows.
- Invoke and resume runs by `threadId`.
- Convert LangGraph/DeepAgents output into internal event envelopes.

Core service contract:

```ts
interface AgentRunService {
    invoke(request: InvokeRequest): Promise<RunAccepted>;
    resume(request: ResumeRequest): Promise<RunAccepted>;
    getState(threadId: string): Promise<RunState>;
    cancel(threadId: string, runId: string): Promise<void>;
}
```

`RunAccepted` should not contain the full answer. It should identify the run and
tell the client which stream to subscribe to.

```ts
interface RunAccepted {
    threadId: string;
    runId: string;
    streamUrl: string;
}
```

### SessionsModule

`SessionsModule` owns durable conversation identity.

Responsibilities:

- Create sessions and thread IDs.
- Store metadata: title, current agent, model, created time, updated time.
- List recent sessions for clients.
- Map client session IDs to LangGraph `thread_id` values.
- Later: fork, export, archive, and delete sessions.

MVP endpoints:

```text
POST /sessions
GET /sessions
GET /sessions/:threadId
DELETE /sessions/:threadId
```

### EventsModule

`EventsModule` owns server-to-client delivery.

Responsibilities:

- Maintain a run event bus keyed by `threadId` and `runId`.
- Serialize internal events as SSE frames.
- Replay recent events when a client reconnects if event persistence is added.
- Close streams cleanly on completion, error, or cancellation.

MVP endpoint:

```text
GET /sessions/:threadId/runs/:runId/events
```

### ProtocolModule

`ProtocolModule` is the key addition from the new requirement. It should expose
compatibility surfaces without polluting the agent runtime.

Potential controllers:

- `NativeController`: International Space Bar's own stable API.
- `OpenResponseController`: adapter for the chosen OpenResponse-style schema.
- `OpenCodeCompatController`: adapter if OpenCode-compatible clients can call a
  custom backend.

Mapping rule:

```text
external request schema -> ProtocolMapper -> InvokeRequest/ResumeRequest
internal AgentEvent -> ProtocolMapper -> external stream/event schema
```

This makes protocol support additive. If OpenCode compatibility proves
impractical, the native API and OpenResponse-style adapter can remain.

### ApprovalsModule

Approvals deserve their own module because they are a cross-protocol concern.
An approval can arrive from the Ink client, an OpenResponse-compatible client,
an OpenCode-compatible adapter, or eventually a web UI.

MVP endpoint:

```text
POST /sessions/:threadId/runs/:runId/approvals/:interruptId
```

Request shape:

```ts
interface ApprovalDecisionRequest {
    type: "approve" | "reject";
    message?: string;
    scope?: "once" | "always";
    editedArgs?: unknown;
}
```

The module should convert this into the DeepAgents resume shape currently used
in [src/international-space-bar/agent/deep-agent-wrapper.ts](../src/international-space-bar/agent/deep-agent-wrapper.ts):

```ts
new Command({ resume: { decisions: [decision] } });
```

### ObservabilityModule

The service boundary changes observability. Agent observability can no longer
assume a single in-process `AppContext`. The backend should assign or preserve:

- `threadId`
- `runId`
- `agentId`
- `nodeName`
- `messageId`
- `toolCallId`
- `interruptId`
- `clientId`

Those IDs should be included in logs and stream events.

## 7. LangGraph Streaming over SSE

Context7 lookups for LangGraph.js confirm the relevant APIs:

- `graph.stream(input, { streamMode })` streams graph execution.
- Stream modes include `values`, `updates`, `messages`, `custom`, `debug`,
  `checkpoints`, and `tasks` in current references.
- `streamEvents` supports an `encoding: "text/event-stream"` overload that
  returns bytes suitable for SSE transport.
- LangGraph SDK examples stream runs with `client.runs.stream(threadId,
assistantId, { input, streamMode })`.
- DeepAgents JS supports `agent.stream(..., { streamMode, subgraphs: true })`,
  allowing main-agent and subagent events to be distinguished by namespace.

The MVP should not expose raw LangGraph chunks directly. It should normalize
them into International Space Bar events, then protocol adapters can re-shape
them.

Internal event union:

```ts
type AgentEvent =
    | { type: "run.started"; threadId: string; runId: string }
    | { type: "node.started"; threadId: string; runId: string; node: string }
    | { type: "message.delta"; threadId: string; runId: string; delta: string }
    | { type: "message.completed"; threadId: string; runId: string; message: MessageEnvelope }
    | { type: "tool.started"; threadId: string; runId: string; toolCall: ToolCallEnvelope }
    | { type: "tool.completed"; threadId: string; runId: string; toolResult: ToolResultEnvelope }
    | { type: "interrupt.created"; threadId: string; runId: string; interrupt: InterruptInfo }
    | { type: "run.completed"; threadId: string; runId: string; result: WorkflowResult }
    | { type: "run.failed"; threadId: string; runId: string; error: AgentErrorEnvelope };
```

SSE serialization:

```text
event: message.delta
id: <runId>:<sequence>
data: {"threadId":"...","runId":"...","delta":"..."}

event: interrupt.created
id: <runId>:<sequence>
data: {"threadId":"...","runId":"...","interrupt":{...}}
```

The existing `WorkflowEvent` union in [src/international-space-bar/interfaces/agent.interface.ts](../src/international-space-bar/interfaces/agent.interface.ts)
can seed this design, but the network event union should be more granular. It
needs message deltas, tool events, interrupts, errors, and run IDs.

## 8. Tool Messages and Message Parts

Context7 lookups for LangChain JS and DeepAgents JS confirm the current message
building blocks:

- `AIMessage` can contain `tool_calls`.
- `ToolMessage` represents a tool execution result tied to a `tool_call_id`.
- Streaming in `messages` mode can surface `AIMessageChunk` tool call chunks,
  including incremental tool call arguments.
- With DeepAgents, `subgraphs: true` adds namespaces so clients can distinguish
  main-agent output from subagent output.

The backend should convert raw LangChain messages into stable envelopes before
they leave the service:

```ts
interface MessageEnvelope {
    id: string;
    role: "user" | "assistant" | "system" | "tool";
    createdAt: string;
    agentId?: string;
    runId: string;
    threadId: string;
    parts: MessagePart[];
}

type MessagePart =
    | { type: "text"; text: string }
    | { type: "reasoning"; text: string; visibility: "hidden" | "summary" | "expanded" }
    | { type: "tool_call"; toolCall: ToolCallEnvelope }
    | { type: "tool_result"; toolResult: ToolResultEnvelope }
    | { type: "interrupt"; interrupt: InterruptInfo };
```

This part model keeps the backend useful to multiple clients. A minimal Ink TUI
can render most parts as text. An OpenCode-style client can render tool calls,
diffs, and approvals richly.

## 9. LangGraph Interrupt Handling over the Wire

Context7 lookups confirm the current LangGraph interrupt model:

- `interrupt(value)` pauses execution and surfaces JSON-serializable data to the
  caller.
- A checkpointer is required for interrupts to work correctly.
- Resume is performed with `new Command({ resume: value })`.
- Resume restarts execution from the beginning of the interrupted node.
- `Command` can also include `update` when state must be changed while
  resuming.

International Space Bar currently uses DeepAgents interrupt configuration via
`interruptOn` and extracts `result[INTERRUPT]` in [src/international-space-bar/agent/deep-agent-wrapper.ts](../src/international-space-bar/agent/deep-agent-wrapper.ts).

Current in-process flow:

```text
TUI submit
  -> workflow.stream(query) or workflow.invoke(query)
  -> DeepAgentWrapper.invoke(query, ctx, threadId)
  -> result[INTERRUPT]
  -> setCurrentInterrupt(...)
  -> user decision
  -> DeepAgentWrapper.resume(decision, ctx, threadId)
  -> new Command({ resume: { decisions: [decision] } })
```

Network flow:

```text
Client POST /sessions/:threadId/runs
  -> backend starts run
  -> client subscribes to /sessions/:threadId/runs/:runId/events
  -> backend emits event: interrupt.created
  -> backend marks run waiting_for_approval
  -> client POST /sessions/:threadId/runs/:runId/approvals/:interruptId
  -> backend calls Command({ resume: { decisions: [decision] } })
  -> backend resumes stream
  -> backend emits run.completed or another interrupt.created
```

Run state machine:

```text
idle
  -> queued
  -> streaming
  -> waiting_for_approval
  -> resuming
  -> streaming
  -> completed

streaming -> failed
streaming -> cancelled
waiting_for_approval -> cancelled
```

The backend must persist enough state to resume after the approval request. At
minimum, Phase 1 can use LangGraph's memory checkpointer for local development.
Production should use a durable checkpointer before remote clients or multiple
server instances are supported.

## 10. Priority 1: Backend and Protocol Separation

The first phase should create a service boundary while preserving existing agent
runtime behavior.

### Step 1: Create the NestJS Service Skeleton

Add NestJS dependencies and create a server entry point. The server should start
without launching the Ink TUI.

Initial scripts:

```json
{
    "dev:server": "tsx --env-file=.env src/international-space-bar-server/main.ts",
    "dev:tui": "tsx --env-file=.env src/international-space-bar/main.ts"
}
```

The existing `pnpm dev` can remain temporarily as the monolith until migration
is complete.

### Step 2: Extract Shared Types

Create a shared type location for transport contracts. This can start as a
folder in the repo and become a workspace package later.

```text
src/international-space-bar-shared/
  agent-events.ts
  approvals.ts
  messages.ts
  sessions.ts
```

Shared types should not import from TUI, NestJS, LangGraph, DeepAgents, or Ink.
They should be pure TypeScript contracts, like the current `interfaces/` layer.

### Step 3: Wrap Existing Agent Runtime in Services

Move wiring logic from the current composition root into injectable services.
The implementation should reuse existing files where possible:

- Agent config loading.
- Tool registry.
- DeepAgentWrapper.
- Workflow graph construction.
- Message and token extraction utilities.

The service should expose `invoke`, `resume`, and `streamRun` methods rather
than exposing LangGraph directly to controllers.

### Step 4: Add Native REST and SSE Endpoints

Native endpoints should be the internal source of truth:

```text
POST /sessions
POST /sessions/:threadId/runs
GET /sessions/:threadId/runs/:runId/events
POST /sessions/:threadId/runs/:runId/approvals/:interruptId
GET /sessions/:threadId/state
```

### Step 5: Add Protocol Adapters

Add protocol controllers after the native API works. The adapter should map
external schemas into the same internal service calls. This is the point where
OpenResponse/OpenCode-style compatibility belongs.

Do not make OpenResponse or OpenCode compatibility the core internal model. Make
it an edge adapter.

### Step 6: Convert the TUI to a Thin Client

Only after the server runs should [src/international-space-bar/tui/TuiApp.tsx](../src/international-space-bar/tui/TuiApp.tsx)
stop receiving `IAgent` and `IWorkflowRunner` directly. It should receive an API
client that can:

- Create or resume a session.
- Submit a message.
- Subscribe to SSE events.
- Send approval decisions.

The UI should not import agent, workflow, llm, or tool modules.

## 11. Priority 2: MVP

The MVP should prove backend/client separation, not visual completeness.

Required behaviors:

1. Run the NestJS backend as a service.
2. Run a TUI or small CLI client as a separate process.
3. Create a session.
4. Submit one user message.
5. Stream assistant output and workflow progress back to the client.
6. Surface a simple approval interrupt.
7. Send approve or reject back to the backend.
8. Resume the graph after the decision.
9. Complete the run and display the final answer.

Minimal approval UI:

```text
Tool request: <toolName>
Description: <description>

[a] approve once    [r] reject
```

This is intentionally smaller than OpenCode's UI. It proves the backend
contract. Rich diff displays, command palettes, session browsers, and question
flows can wait.

## 12. Priority 3: Reuse or Replace the TUI

After the backend protocol exists, evaluate UI strategy with evidence.

### Option A: Reuse OpenCode or an OpenCode-Like TUI

This is attractive if a compatibility adapter can satisfy the client contract.
The backend would provide sessions, messages, streams, and approval endpoints in
the shape the client expects.

Benefits:

- Avoids rebuilding a mature terminal interface.
- Gets rich tool and permission rendering sooner.
- Forces a cleaner backend contract.

Risks:

- OpenCode may not support arbitrary backend replacement without significant
  changes.
- Its server model and data contracts may be too specific to its own runtime.
- Keeping up with upstream UI changes may become its own maintenance burden.

### Option B: Keep Ink and Incrementally Improve

This is simplest if International Space Bar needs a custom workflow UX.

Benefits:

- Fits the current Node.js/React stack.
- Lower migration risk.
- Full control over workflow-specific panels.

Risks:

- More custom UI work.
- Rich diff/code/markdown/tool rendering must be built or integrated.

### Option C: Migrate to @opentui Later

This gives OpenCode-like rendering power, but it should be delayed until the
backend boundary is complete.

Benefits:

- Better terminal rendering primitives.
- Better fit for rich code, diff, and markdown output.

Risks:

- Runtime and ecosystem mismatch.
- Potential Bun/SolidJS migration cost.
- It may duplicate work if external TUI reuse succeeds.

Recommendation: do Option B only as the MVP reference client, evaluate Option A
as soon as protocol adapters exist, and defer Option C until there is a proven
need to own a richer terminal client.

## 13. Future Phases

After the MVP proves the service boundary, the roadmap can expand in this order:

1. Durable sessions and checkpointer storage.
2. Protocol compatibility validation against the chosen OpenResponse/OpenCode
   target.
3. Message parts and tool event envelopes.
4. Rich approval prompts with per-tool rendering.
5. Reject-with-feedback and allow-always approval scopes.
6. Structured question prompts.
7. Multi-client support for the same session.
8. Web UI or external TUI integration.
9. Optional richer native TUI work.
10. Observability dashboards over `agents.log` data.

## 14. Existing Document Obsolescence Notes

After this architecture is implemented, two existing documents need major
updates.

### Agent Observability Logging

[docs/agent-observability-logging.md](agent-observability-logging.md) assumes
agent observability is wired inside a single process through `AppContext` and
separate pino loggers. The separation plan changes that assumption.

Required updates after implementation:

- Define logging ownership in the NestJS backend.
- Add `runId`, `clientId`, and protocol adapter IDs to log context.
- Separate server system logs from agent observability logs at the service
  boundary.
- Decide whether selected observability events should also be exposed over SSE.
- Document how client logs correlate with backend agent logs.

The existing separation between system logging and agent observability remains
correct, but the wiring model becomes obsolete.

### Technical Stack

[docs/technical-stack.md](technical-stack.md) describes a monolithic layered
architecture where the composition root wires TUI, workflow, agents, LLMs, and
tools in one process. Backend separation changes that architecture.

Required updates after implementation:

- Add NestJS as a backend runtime framework.
- Split the architecture into backend, shared contracts, and clients.
- Replace the current import table with separate backend and client dependency
  rules.
- State that TUI clients must not import agent, workflow, LLM, or tool modules.
- Add the protocol adapter layer as an outer backend boundary.
- Update commands for `dev:server`, `dev:tui`, and any protocol compatibility
  test clients.

The current layered dependency rule remains valuable, but its process boundary
and allowed-import table become incomplete once the backend is a service.

## 15. Context7 Findings to Carry into Implementation

The architecture above relies on these current library facts gathered through
Context7 during planning:

- LangGraph.js supports streamed graph execution through `graph.stream(...)`.
- LangGraph.js stream modes include state values, state updates, message chunks,
  custom events, debug events, checkpoints, and tasks.
- `streamEvents` supports `encoding: "text/event-stream"` for SSE-compatible
  output.
- LangGraph human-in-the-loop flows use `interrupt(...)` and resume with
  `new Command({ resume })`.
- Interrupts require a checkpointer so the graph can resume later, including
  from another process.
- DeepAgents JS exposes `createDeepAgent(...)`, `interruptOn`, tools, subagents,
  filesystem backends, and streaming with `subgraphs: true`.
- LangChain JS represents tool calls with `AIMessage.tool_calls` and tool
  results with `ToolMessage` linked by `tool_call_id`.

Implementation should verify these APIs again at the time of coding, especially
the exact TypeScript signatures for the installed package versions in
[package.json](../package.json).

## 16. Acceptance Criteria for the Architecture

The design is ready to decompose into tickets when the following are true:

- The backend can be implemented without importing TUI modules.
- The TUI can become a client without importing agent, workflow, LLM, or tool
  modules.
- Run streaming has a clear SSE event contract.
- Approve/reject interrupts have a network state machine.
- Protocol compatibility is isolated behind adapters.
- OpenResponse/OpenCode-style compatibility can be explored without committing
  the internal runtime to an external schema.
- Rich UI rebuilding is explicitly delayed until after service separation.
