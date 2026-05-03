# Phase A Review — isb-epic-011 (Response Stream Builder)

| Field   | Value      |
| ------- | ---------- |
| Date    | 2026-05-03 |
| Verdict | SATISFIED  |
| Loops   | 1 of 3     |

---

## 1. Architect Review

### Verdict: APPROVED WITH CONDITIONS

---

### Findings

#### 1. Layered architecture fit — ResponseStream as a pure class

- **Rule**: AGENTS.md § "Server never imports agent internals directly"; anti-pattern §9.7 "Adding `@nestjs/*` imports to `response-stream.ts`"
- **Status**: pass
- **Details**: The design correctly specifies `ResponseStream` as a pure TypeScript class with no `@nestjs/*` imports. It is instantiated per-request inside the runtime implementation (`new ResponseStream(request)`) — not provided via DI. The flow `controller → service → runtime port → runtime impl → ResponseStream` respects the existing architecture. The class owns protocol concerns (seq, outputIndex, event construction) which correctly belong in the server's `openresponses/` module.
- **Location**: §3.1, §3.2, §9.3.3

#### 2. `AgentInvokeRequest` widening — backward compatibility

- **Rule**: Interface Segregation Principle (SOLID); existing WebSocket gateway strip logic
- **Status**: pass
- **Details**: Adding `config: ResponseStreamConfig` is additive — no existing fields are removed. The gateway already strips HTTP-only fields (`stream`, `stream_options`, `background`) at [responses.gateway.ts](src/international-space-bar-server/openresponses/responses.gateway.ts#L293-L296). The service must mirror this on the HTTP side when populating `config`. The gateway builds `AgentInvokeRequest` directly (line 329–334) and passes `input`, `model`, `instructions`, `requestId`, `abortSignal` — it would need to also build `config` from the validated WebSocket payload. This is not called out in §6.2 but is implicit.
- **Location**: §4 D5, §6.2, gateway lines 289–334

#### 3. Import rules — no circular dependencies

- **Rule**: AGENTS.md § "Allowed imports per layer"; no circular deps
- **Status**: pass
- **Details**:
    - `response-stream.ts` → imports from `generated/zod/` (child of same module) and `responses.types.ts` (sibling) ✓
    - `blocks/*.ts` → imports from `response-stream.ts` (same module parent) and `generated/zod/` ✓
    - `lang-graph-blocks.ts` → imports from `@langchain/*` (external pkg) and `blocks/` (same module) ✓
    - No back-import from `response-stream.ts` into blocks (the `Block` type is exported FROM `response-stream.ts`, consumed BY blocks — unidirectional)
    - No back-import from `lang-graph-blocks.ts` into `response-stream.ts`
- **Location**: §6.1

#### 4. Directory placement

- **Rule**: AGENTS.md § project structure — `openresponses/` is the protocol module within the server layer
- **Status**: pass
- **Details**: All proposed files stay within `src/international-space-bar-server/openresponses/` and the new `blocks/` subdirectory. This is the correct home for protocol-emission concerns. The `blocks/` subdirectory is a clean organizational boundary separating the block factories from the core class.
- **Location**: §6.1

#### 5. DI pattern — per-request instantiation

- **Rule**: Dependency Inversion Principle; avoid shared mutable state
- **Status**: pass
- **Details**: `ResponseStream` holds per-request mutable state (`seq`, `outputIndex`, `output[]`, `usage`, `abortSignal`). Making it a NestJS injectable singleton would cause catastrophic cross-request contamination. The design correctly uses `new ResponseStream(request)` inside each `stream()` call. This is the value-object pattern, not a service.
- **Location**: §3.2, §3.3, §D1

#### 6. `ResponseStreamEvent` type union is incomplete

- **Rule**: Type contract completeness; the union must cover all events that `ResponseStream.run()` can yield
- **Status**: concern
- **Details**: The current `ResponseStreamEvent` union in [responses.types.ts](src/international-space-bar-server/openresponses/responses.types.ts) does **not** include `responseIncompleteStreamingEventSchema`. The design's §D6 terminal-state handling requires yielding `response.incomplete` on abort. The schema exists in `generated/zod/` but is not in the type union. This is a pre-existing gap, not a design flaw, but §6.2 "Modified files" does not call out `responses.types.ts` as needing modification.
- **Location**: [responses.types.ts](src/international-space-bar-server/openresponses/responses.types.ts#L53-L73), §D6

#### 7. `@langchain/*` imports in the server layer — boundary tension

- **Rule**: AGENTS.md § "Allowed imports per layer" — `server/` may import from "`interfaces/` (via port contracts); NestJS framework only"
- **Status**: concern
- **Details**: The design proposes `lang-graph-blocks.ts` and `wrap-as-graph.ts` as permanent production files that import `@langchain/langgraph`, `@langchain/core`, and `@langchain/ollama` within the server layer. Per AGENTS.md's allowed-imports table, the server layer should only import from `interfaces/` and NestJS framework. The current `ping-pong-runtime.service.ts` already violates this but is explicitly marked as temporary (`TODO(isb-0020): Delete this file entirely when LangGraph adapter is wired`). The new design makes these LangChain imports permanent. This is a **known boundary tension**: the runtime implementations live in `openresponses/` because no separate layer exists yet, and the design acknowledges this is the production location. However, it does not reconcile with AGENTS.md's import table.
- **Location**: §3.4, §6.1, §10.1, §10.2, AGENTS.md § "Allowed imports per layer"

#### 8. Gateway must also populate `config`

- **Rule**: DRY; consistent request construction across transport paths
- **Status**: concern
- **Details**: §6.2 lists `responses.service.ts` as the file that populates `config` from `CreateResponseBody`. But the WebSocket gateway builds its `AgentInvokeRequest` directly ([responses.gateway.ts](src/international-space-bar-server/openresponses/responses.gateway.ts#L329-L334)) without going through `ResponsesService.createStream()`. It calls `this.runtime.stream(...)` directly. Either: (a) the gateway must also build `config`, or (b) the gateway should be refactored to delegate through `ResponsesService`. The design does not address this.
- **Location**: §6.2, gateway lines 329–334

---

### Flags for PM

#### Flag: clarification — `responses.types.ts` must include `responseIncompleteStreamingEventSchema`

| Field     | Value                                          |
| --------- | ---------------------------------------------- |
| Type      | `clarification`                                |
| Priority  | medium                                         |
| Raised by | Architect                                      |
| Blocking  | no (can be resolved as a pre-requisite ticket) |
| Reference | Phase A, §D6 terminal-state handling           |

**Description**: The `ResponseStreamEvent` union type in `responses.types.ts` is missing the `responseIncompleteStreamingEventSchema` variant. Without it, the `response.incomplete` event yielded by `ResponseStream.run()` on abort will not satisfy the return type of `AgentRuntimePort.stream()`.

**Evidence**: The union lists 18 event schemas but omits `responseIncompleteStreamingEventSchema` despite the schema existing in `generated/zod/`.

**Suggested action**: Add a pre-requisite task to §9.3.1 (or as ticket 0) that widens the `ResponseStreamEvent` union with `| z.infer<typeof responseIncompleteStreamingEventSchema>`.

---

#### Flag: clarification — Gateway `config` population path

| Field     | Value                        |
| --------- | ---------------------------- |
| Type      | `clarification`              |
| Priority  | medium                       |
| Raised by | Architect                    |
| Blocking  | no                           |
| Reference | Phase A, §6.2 modified files |

**Description**: The WebSocket gateway calls `this.runtime.stream(...)` directly, bypassing `ResponsesService`. When `AgentInvokeRequest` gains `config: ResponseStreamConfig`, the gateway must also build that config from the validated WebSocket payload. The design's §6.2 "Modified files" does not list `responses.gateway.ts`.

**Evidence**: [responses.gateway.ts](src/international-space-bar-server/openresponses/responses.gateway.ts#L329-L334) builds the request inline. `ResponsesService.createStream()` is not called.

**Suggested action**: Either (a) add `responses.gateway.ts` to §6.2 with instructions to populate `config` using the same defaults logic, or (b) refactor the gateway to delegate through `ResponsesService` (DRY). Option (b) is cleaner but a larger change.

---

#### Flag: clarification — Reconcile AGENTS.md import table with permanent `@langchain/*` in server layer

| Field     | Value                               |
| --------- | ----------------------------------- |
| Type      | `clarification`                     |
| Priority  | low                                 |
| Raised by | Architect                           |
| Blocking  | no                                  |
| Reference | Phase A, §3.4 "always a graph" rule |

**Description**: AGENTS.md's allowed-imports table states the server layer may only import from `interfaces/` and NestJS framework. The design makes `@langchain/*` imports permanent in the server layer (via `lang-graph-blocks.ts` and `wrap-as-graph.ts`). The table should be updated to reflect that runtime implementations within `openresponses/` are permitted to import the agent orchestration framework, or the runtime should be extracted to a domain layer with a clear boundary.

**Evidence**: AGENTS.md § "Allowed imports per layer" row for `server/`.

**Suggested action**: Update AGENTS.md to add an exception: "Runtime port implementations in `openresponses/` may additionally import from `@langchain/*` for orchestration framework types." Alternatively, plan eventual extraction of runtime implementations to a separate module.

---

### Summary

The design is architecturally sound. It correctly separates protocol concerns (event construction, sequence numbering, output accumulation) from orchestration concerns (LangGraph graph execution). The per-request instantiation pattern avoids shared-state bugs. Import directions are unidirectional with no circular dependencies. The three concerns raised are non-blocking: (1) a missing type union member that is a trivial fix, (2) an unacknowledged modification to the WebSocket gateway, and (3) a documentation consistency issue in AGENTS.md's import table versus the new permanent `@langchain/*` usage. None of these invalidate the design — they are gaps in the implementation plan that should be addressed as pre-requisite tasks or documentation updates.

---

## 2. Engineer Review

### Verdict: APPROVED WITH CONDITIONS

---

### Point 1: Zod schema availability for proposed event methods — PASS

Every event method proposed in §3.2 has a corresponding generated schema file under [generated/zod/](src/international-space-bar-server/openresponses/generated/zod):

| Design method                  | Generated schema file                                       | Verified |
| ------------------------------ | ----------------------------------------------------------- | -------- |
| `responseCreated()`            | `responseCreatedStreamingEventSchema.ts`                    | yes      |
| `outputItemAdded()`            | `responseOutputItemAddedStreamingEventSchema.ts`            | yes      |
| `contentPartAdded()`           | `responseContentPartAddedStreamingEventSchema.ts`           | yes      |
| `textDelta()`                  | `responseOutputTextDeltaStreamingEventSchema.ts`            | yes      |
| `textDone()`                   | `responseOutputTextDoneStreamingEventSchema.ts`             | yes      |
| `contentPartDone()`            | `responseContentPartDoneStreamingEventSchema.ts`            | yes      |
| `outputItemDone()`             | `responseOutputItemDoneStreamingEventSchema.ts`             | yes      |
| `reasoningSummaryPartAdded()`  | `responseReasoningSummaryPartAddedStreamingEventSchema.ts`  | yes      |
| `reasoningSummaryDelta()`      | `responseReasoningSummaryDeltaStreamingEventSchema.ts`      | yes      |
| `reasoningSummaryDone()`       | `responseReasoningSummaryDoneStreamingEventSchema.ts`       | yes      |
| `reasoningSummaryPartDone()`   | `responseReasoningSummaryPartDoneStreamingEventSchema.ts`   | yes      |
| `functionCallArgumentsDelta()` | `responseFunctionCallArgumentsDeltaStreamingEventSchema.ts` | yes      |
| `functionCallArgumentsDone()`  | `responseFunctionCallArgumentsDoneStreamingEventSchema.ts`  | yes      |

Terminal event schemas also exist: `responseCompletedStreamingEventSchema.ts`, `responseFailedStreamingEventSchema.ts`, `responseIncompleteStreamingEventSchema.ts`.

Supporting schemas: `responseResourceSchema.ts` (for envelope), `itemFieldSchema.ts`, `messageSchema.ts`, `functionCallSchema.ts`, `usageSchema.ts` — all present.

**No missing schemas.**

---

### Point 2: `MessageItemShape` / `FunctionCallItemShape` widenings — PASS (no test breakage)

- **Severity**: low
- **Current code**: [ping-pong-runtime.service.ts](src/international-space-bar-server/openresponses/ping-pong-runtime.service.ts#L42) defines:
    ```ts
    status: z.enum(["in_progress", "completed"]);
    ```
- **Generated schemas already support `"incomplete"`**: Both [messageStatusSchema.ts](src/international-space-bar-server/openresponses/generated/zod/messageStatusSchema.ts) and [functionCallItemStatusSchema.ts](src/international-space-bar-server/openresponses/generated/zod/functionCallItemStatusSchema.ts) define `z.enum(["in_progress", "completed", "incomplete"])`.
- **Existing tests**: Searched all `*.test.*` files. Tests assert on `status: "completed"` or `status: "in_progress"` as _expected values_ — they never assert that the schema _rejects_ `"incomplete"`. Widening the hand-rolled shapes adds a new valid value without invalidating any existing assertion.
- **Conclusion**: The widening is safe. No test breakage expected. The generated `messageStatusSchema` and `functionCallStatusSchema` already include `"incomplete"`, so the hand-rolled shapes are simply out of sync with the spec. Better yet, the implementation should use the generated status schemas directly rather than hand-rolling.

---

### Point 3: `ResponseStreamConfig` proposal — echo field gap analysis — CONCERNS

**`ResponseResource` fields** (from [responseResourceSchema.ts](src/international-space-bar-server/openresponses/generated/zod/responseResourceSchema.ts)) that must be echoed vs what **`CreateResponseBody`** (from [createResponseBodySchema.ts](src/international-space-bar-server/openresponses/generated/zod/createResponseBodySchema.ts)) provides:

| ResponseResource field | Present on CreateResponseBody? | Service must default? | Spec default               |
| ---------------------- | ------------------------------ | --------------------- | -------------------------- |
| `id`                   | no (server-generated)          | server generates      | `resp_<uuid>`              |
| `object`               | no                             | hardcode              | `"response"`               |
| `created_at`           | no                             | server generates      | `Date.now()` epoch seconds |
| `completed_at`         | no                             | server manages        | `null` → set on terminal   |
| `status`               | no                             | server manages        | `"in_progress"` → mutated  |
| `incomplete_details`   | no                             | server manages        | `null`                     |
| `model`                | yes                            | echo                  | —                          |
| `previous_response_id` | yes                            | echo                  | `null`                     |
| `instructions`         | yes                            | echo                  | `null`                     |
| `output`               | no                             | server manages        | `[]`                       |
| `error`                | no                             | server manages        | `null`                     |
| `tools`                | yes                            | echo                  | `[]`                       |
| `tool_choice`          | yes                            | echo                  | needs default              |
| `truncation`           | yes                            | echo                  | needs default              |
| `parallel_tool_calls`  | yes                            | echo                  | needs default              |
| `text`                 | yes                            | echo                  | needs default              |
| `top_p`                | yes                            | echo                  | `1` (spec)                 |
| `presence_penalty`     | yes                            | echo                  | `0` (spec)                 |
| `frequency_penalty`    | yes                            | echo                  | `0` (spec)                 |
| `top_logprobs`         | yes                            | echo                  | `0` (spec)                 |
| `temperature`          | yes                            | echo                  | `1` (spec)                 |
| `reasoning`            | yes                            | echo                  | `null`                     |
| `usage`                | no                             | server manages        | `null`                     |
| `max_output_tokens`    | yes                            | echo                  | `null` (=unlimited)        |
| `max_tool_calls`       | yes                            | echo                  | `null`                     |
| `store`                | yes                            | echo                  | `true` (spec)              |
| `background`           | yes (but HTTP-only)            | **strip, don't echo** | `false`                    |
| `service_tier`         | yes                            | echo                  | `"default"`                |
| `metadata`             | yes                            | echo                  | `{}`                       |
| `safety_identifier`    | yes                            | echo                  | `null`                     |
| `prompt_cache_key`     | yes                            | echo                  | `null`                     |

**Findings:**

- **`tool_choice`**: `CreateResponseBody` has it optional. `ResponseResource` requires it. Default = `"auto"` per OpenAI/OpenResponses spec. The design should document this.
- **`truncation`**: Same pattern. Default = `"disabled"` per spec.
- **`text`**: Same pattern. Default = `{ format: { type: "text" } }` per spec.
- **`parallel_tool_calls`**: Same. Default = `true` per spec.
- **`background`**: Must be stripped from config (HTTP-only transport field). The design acknowledges this in §9.3.2 step 3. Confirmed correct.
- **`stream` / `stream_options`**: Must also be stripped. Design acknowledges. Confirmed.

**Severity**: medium — the design mentions echo-config in §D5 but does not enumerate every field's default value. The implementation ticket §9.3.2 says "if any field is missing from `CreateResponseSchema`, raise a flag". This is the correct approach, but the four defaults above (`tool_choice`, `truncation`, `text`, `parallel_tool_calls`) should be documented in the design to avoid assumption-trap triggers during implementation.

---

### Point 4: `Block` type signature — PASS

```typescript
type Block = (ctx: ResponseStream) => AsyncIterable<ResponseStreamEvent>;
```

- TypeScript's `async function*` returns `AsyncGenerator<T>`, which extends `AsyncIterable<T>`. A block implemented as `async function*(ctx) { yield ctx.textDelta(...); }` satisfies the type.
- `ctx.recordOutputItem()` and `ctx.addUsage()` are synchronous void methods on the class instance. Calling them from within an async generator body is legal — the generator can invoke methods on its argument at any point during iteration.
- `ctx.run()` consumes blocks via `yield*`, which correctly delegates from the outer `run()` generator to the block's generator. The delegating `yield*` passes each event through without buffering.
- The design's `run(blocks: Iterable<Block> | AsyncIterable<Block>)` works because `for await...of` accepts both sync and async iterables (TypeScript and runtime semantics).

**No issues.**

---

### Point 5: `toBaseMessages` existence and signature — PASS

[input-to-messages.ts](src/international-space-bar-server/openresponses/input-to-messages.ts) exports:

```typescript
export function toBaseMessages(input: string | readonly unknown[]): BaseMessage[];
```

- Accepts `string` → wraps in `HumanMessage`.
- Accepts `readonly unknown[]` → filters to message-like items (via `isMessageLike` runtime guard), maps roles (`system`/`developer` → `SystemMessage`, `user` → `HumanMessage`, `assistant` → `AIMessage`).
- Non-message items (reasoning, function_call, etc.) are correctly skipped.
- The signature matches what the design expects: `toBaseMessages(request.input)` where `request.input: string | readonly unknown[]`.

**No issues.**

---

### Point 6: `langGraphBlocks` adapter feasibility — PASS with notes

- **`@langchain/langgraph` in `package.json`**: Confirmed at version `^1.2.9` in [package.json](package.json#L28).
- **`streamEvents` API**: The `CompiledStateGraph` class inherits `streamEvents` from the `Runnable` base class in `@langchain/core`. The design calls `graph.streamEvents(input, { version: "v2", signal })` which is the documented API.
- **Event taxonomy**: The design's mapping table in §10.3 maps `on_chat_model_start`, `on_chat_model_stream`, `on_chat_model_end`, `on_tool_start`, `on_tool_end` to blocks. This matches the [LangGraph streaming event taxonomy](https://docs.langchain.com/oss/javascript/langgraph/streaming).

**Notes for implementation:**

- The `signal` parameter for abort propagation goes into the second argument of `streamEvents`. The implementation should verify the exact parameter name at implementation time via Context7, as LangGraph has changed parameter shapes across versions.
- The `hasReasoning(chunk)` predicate (checking `additional_kwargs.reasoning_content`) is model-specific. The design correctly notes the JS workaround and links [langchainjs #9089](https://github.com/langchain-ai/langchainjs/issues/9089).

---

### Flags

#### Flag: type-gap — `ResponseStreamEvent` union is missing `response.incomplete`

| Field     | Value                                     |
| --------- | ----------------------------------------- |
| Type      | `ticket`                                  |
| Priority  | high                                      |
| Raised by | Engineer                                  |
| Blocking  | yes — for abort/incomplete implementation |
| Reference | §D6 terminal-state handling               |

**Description**: The `ResponseStreamEvent` union type in [responses.types.ts](src/international-space-bar-server/openresponses/responses.types.ts) includes `responseCompletedStreamingEventSchema`, `responseFailedStreamingEventSchema`, and `errorStreamingEventSchema` but does **not** include `responseIncompleteStreamingEventSchema`. The generated schema file [responseIncompleteStreamingEventSchema.ts](src/international-space-bar-server/openresponses/generated/zod/responseIncompleteStreamingEventSchema.ts) exists in `generated/zod/` and is exported from its index, but it is never imported into the union.

**Evidence**: The union in `responses.types.ts` lines 51–69 lists 18 variants. `responseIncompleteStreamingEventSchema` is absent. The design's §D6 relies on `response.incomplete` as a terminal event for aborts.

**Suggested action**: Add `responseIncompleteStreamingEventSchema` to the `ResponseStreamEvent` union in `responses.types.ts` as a prerequisite ticket before the `ResponseStream` class implementation.

---

#### Flag: echo-defaults — Four echo fields lack documented defaults in the design

| Field     | Value           |
| --------- | --------------- |
| Type      | `clarification` |
| Priority  | medium          |
| Raised by | Engineer        |
| Blocking  | no              |
| Reference | §D5, §9.3.2     |

**Description**: The design references §D5 for echo-field defaults but does not enumerate the specific default values for `tool_choice` (`"auto"`), `truncation` (`"disabled"`), `text` (`{ format: { type: "text" } }`), and `parallel_tool_calls` (`true`). The implementation ticket §9.3.2 says to raise a flag if defaults are missing. These should be documented in the design to prevent implementation ambiguity.

**Suggested action**: Add a defaults table to §D5 or §6.2 listing every `ResponseStreamConfig` field with its spec-mandated default value.

---

### Implementation Risks & Mitigations

1. **`wrapAsGraph` generic parameters**: The design uses `CompiledStateGraph<...>` with a placeholder. LangGraph's TypeScript generics for `StateGraph` / `CompiledStateGraph` are complex (state annotations, input/output types). The implementation must resolve these at coding time. **Mitigation**: fetch current `@langchain/langgraph` type signatures via Context7 before implementing.

2. **`AsyncQueue` correctness**: The adapter relies on a file-local `AsyncQueue` with `push` / `close` / `[Symbol.asyncIterator]`. Getting the blocking/unblocking semantics right (push blocks when consumer is slow, consumer blocks when queue is empty) is non-trivial. **Mitigation**: write unit tests for `AsyncQueue` in isolation before integrating with blocks.

3. **Chunk shape variance across models**: The `hasReasoning(chunk)` / `hasContent(chunk)` / `hasToolCalls(chunk)` predicates depend on the `AIMessageChunk` shape, which varies by model provider. Ollama's chunks may differ from OpenAI's. **Mitigation**: the design correctly scopes the initial implementation to `@langchain/ollama`; other providers will need adapter testing.

4. **`response.incomplete` not in union type**: As flagged above, this is a blocking prerequisite. Without it, `ResponseStream.run()` cannot yield incomplete events that satisfy the `ResponseStreamEvent` return type.

### Summary

The design is architecturally sound and well-aligned with the codebase. All 13 proposed event methods map to existing generated Zod schemas. The `Block` type signature is implementable with standard async generators. `toBaseMessages` exists with the correct signature. `@langchain/langgraph` is present and the `streamEvents` API is available. The two conditions for full approval are: (1) add `responseIncompleteStreamingEventSchema` to the `ResponseStreamEvent` union (blocking), and (2) document the four missing echo-field defaults (non-blocking but recommended before implementation begins).

---

## 3. Security Review

### Verdict: CONCERNS

**Overall risk level: LOW** — No critical vulnerabilities. Two medium-severity gaps in input validation that should be addressed before implementation.

---

### Findings

#### 1. Transport field stripping — PASS

- **Category**: input-validation
- **Severity**: low
- **Description**: The design explicitly mandates in §9.3.2 step 3 that `stream`, `stream_options`, and `background` are stripped from `ResponseStreamConfig` before they reach the runtime. The gateway already performs this strip at [responses.gateway.ts](src/international-space-bar-server/openresponses/responses.gateway.ts#L289-L291) (`delete body.stream; delete body.stream_options; delete body.background`). The design calls for the service to do the equivalent on the HTTP side.
- **Assessment**: The design addresses this correctly. The implementation instruction is explicit and cites the gateway's existing pattern as the template. No flag needed — just verify at implementation time that both paths (HTTP and WS) strip identically.

---

#### 2. Metadata echo safety — size exhaustion gap

- **Category**: input-validation
- **Severity**: medium
- **Description**: The OpenAPI spec describes metadata as "Set of **16** key-value pairs" with keys max 64 chars and values max 512 chars. However, the generated `metadataParamSchema` only enforces `.catchall(z.string().max(512))`. It does **not** enforce:
    - Maximum key count (16)
    - Maximum key length (64 chars)

    The schema is `z.object({}).catchall(z.string().max(512))` — this accepts unlimited keys of unlimited length. A client can send thousands of keys with 64+ character names, each with 512-char values. Since `metadata` is echoed back on every `ResponseResource` event (including `response.created` on the first SSE frame), this amplifies the payload across all events in the stream.

- **Location**: [metadataParamSchema.ts](src/international-space-bar-server/openresponses/generated/zod/metadataParamSchema.ts#L14) — missing `z.string().max(64)` key constraint and max-16-key enforcement.
- **Recommendation**: This is a generated schema gap. The OpenAPI spec should add `maxProperties: 16` and a key pattern constraint. Until then, `ResponsesService` should enforce these limits when populating `config.metadata`:
    ```ts
    // In ResponsesService, after Zod validation:
    if (metadata && Object.keys(metadata).length > 16) throw new BadRequestException(...);
    for (const key of Object.keys(metadata)) { if (key.length > 64) throw ...; }
    ```
    Alternatively, fix the OpenAPI spec to include `maxProperties: 16` and regenerate.
- **Cross-request exfiltration**: Not a concern — `metadata` is copied from the request to that request's response. There is no storage layer (`store: false` means no persistence), so metadata from request A cannot appear in request B's response.
- **XSS via metadata values**: Low risk in this architecture. The server echoes JSON over SSE; it does not render HTML. Downstream consumers (e.g. OpenCode TUI) must sanitize if they render metadata values in UI — but that is a client responsibility, not this server's. The spec's 512-char max value constraint (enforced by the Zod schema) limits payload size.

---

#### 3. `previous_response_id` echoing — PASS

- **Category**: data-exposure
- **Severity**: low
- **Description**: `previous_response_id` on `ResponseResource` is `z.union([z.string(), z.null()])` — a simple string echo. The design states it is a client-supplied value echoed back, not a server-side lookup key.
- **Assessment**:
    - When `store: false`, the ID is still echoed (confirmed: it's just a passthrough field from `CreateResponseBody.previous_response_id` to `ResponseResource.previous_response_id`).
    - No server-side data from a previous response is attached — the field is purely informational.
    - Two requests sharing a `previous_response_id` only reveals that the _client chose_ to send the same string. Since the client already knows this, there is no information leakage.
    - The only risk: if a future `store: true` implementation uses this field to load server-side state, the lookup must be scoped by session/user. The design does not address this, but it's explicitly out-of-scope (§7).

---

#### 4. Input validation on `ResponseStreamConfig` fields — numeric bounds gap

- **Category**: input-validation
- **Severity**: medium
- **Description**: The generated `createResponseBodySchema` accepts `temperature` and `top_p` as bare `z.number()` without bounds checks. The spec defines:
    - `temperature`: typically 0–2
    - `top_p`: typically 0–1
    - `presence_penalty` / `frequency_penalty`: typically -2 to 2

    The schema allows any `number` including `Infinity`, `-Infinity`, and `NaN` (which pass `z.number()`). While these values would likely be rejected downstream by the LLM provider, they are echoed back on `ResponseResource` before being sent to the LLM. A malicious client could set `temperature: NaN` or `temperature: 1e308` and the echo would propagate through all SSE events without issue since `JSON.stringify(NaN)` becomes `null` in JSON.

- **Location**: [createResponseBodySchema.ts](src/international-space-bar-server/openresponses/generated/zod/createResponseBodySchema.ts#L42-L44)
- **Recommendation**: Non-blocking for this design, but note:
    - `z.number()` does NOT reject `NaN` in Zod 4 (it passes `typeof x === 'number'`). Add `.finite()` constraints in `ResponsesService` validation or extend the schema.
    - Alternatively, accept the spec's permissive validation and let the LLM provider reject invalid values. Document this as a conscious decision.
    - The `instructions` field is `z.string()` — properly validated. No raw user strings bypass Zod parsing before reaching the runtime.

---

#### 5. Abort signal propagation — PASS

- **Category**: other
- **Severity**: low
- **Description**: The design passes `abortSignal` via `AgentInvokeRequest` into `ResponseStream`, which forward-passes it to `langGraphBlocks` → `graph.streamEvents(input, { signal })`. The controller creates a fresh `AbortController` per request and ties it to the response `close` event.
- **Assessment**:
    - **Resource leaks on abort**: The design mandates `ctx.run()` emits `response.incomplete` on abort (§D6). The `AsyncQueue.close()` mechanism ensures the delta queue is drained. LangGraph's own `streamEvents` abort support cancels the underlying HTTP calls to the LLM provider.
    - **Dangling promises**: The `for await...of` pattern over `ctx.run()` in the controller guarantees the generator is fully consumed or returned (the `break` on abort triggers the generator's `return()` method, which runs the `finally` block if any).
    - **Client-triggered abort cannot cause memory leaks**: The abort signal is propagated synchronously. The worst case is that a partial `AIMessageChunk` is in-flight when abort fires — the queue closes, the block detects EOF, and `ctx.run()` emits the terminal event.
    - **No amplification**: A client can only abort their own request. The `AbortController` is scoped per-request in the controller ([responses.controller.ts](src/international-space-bar-server/openresponses/responses.controller.ts#L66)).

---

#### 6. Block factories and trust boundaries — PASS (with note)

- **Category**: injection
- **Severity**: low
- **Description**: The design mandates in §9.3.3 step 2 that "All event methods route through their corresponding Zod schema's `.parse(...)` so a malformed payload throws at construction, not on the wire." This means every event emitted by a block is validated by a generated Zod schema before being yielded to the controller's SSE write loop.
- **Assessment**:
    - A malicious LLM response (e.g. `AIMessageChunk` with unexpected field types, a `tool_call_chunks` array with non-string elements) would cause `.parse()` to throw a `ZodError`. Per §D6, a thrown error inside a block propagates to `ctx.run()` which emits `response.failed`. The server does not crash.
    - The `fromQueue(queue)` pattern means blocks consume typed chunks from a queue rather than raw HTTP bytes. The LangGraph SDK already deserializes and types `AIMessageChunk` before it reaches the adapter.
    - **Note**: The adapter's `hasReasoning(chunk)` and `extractCallSummary(chunk)` helpers inspect `AIMessageChunk` properties. If a chunk has unexpected structure (e.g. `additional_kwargs` is not an object), these helpers must not throw unhandled. The implementation should use defensive property access (optional chaining) rather than assuming structure. This is not a vulnerability but a robustness concern.

---

### Summary

The design has a sound security posture. The Zod validation boundary at every event emission point is the primary defense — it ensures no malformed data reaches the wire. The two medium-severity findings relate to **input validation gaps in generated schemas** (metadata key count/length, numeric bounds), not to the design itself. These are pre-existing schema generation issues that the design inherits but does not worsen.

The design correctly:

- Strips transport fields before they reach the runtime
- Scopes abort controllers per-request
- Prevents cross-request data leakage (metadata is pure echo, no storage)
- Validates every emitted event through Zod `.parse()`

### Flags for PM

#### Flag: security — Metadata size limits not enforced by Zod schema

| Field     | Value                             |
| --------- | --------------------------------- |
| Type      | `clarification`                   |
| Priority  | `medium`                          |
| Raised by | Security Reviewer                 |
| Blocking  | no                                |
| Reference | Phase A — Response Stream Builder |

**Description**: The generated `metadataParamSchema` does not enforce the spec's stated limits of max 16 keys with max 64-char key names. A client can send unbounded metadata that gets echoed on every SSE event, causing payload amplification. The `.catchall(z.string().max(512))` only limits value length.

**Evidence**: [metadataParamSchema.ts](src/international-space-bar-server/openresponses/generated/zod/metadataParamSchema.ts) — `z.object({}).catchall(z.string().max(512))` with no `maxProperties` or key-length validation.

**Suggested action**: Either fix the OpenAPI spec to include `maxProperties: 16` + key pattern and regenerate, or add a runtime guard in `ResponsesService` when building `ResponseStreamConfig.metadata`. Create a low-priority ticket for the fix.

---

#### Flag: security — Numeric field bounds (temperature, top_p) accept NaN/Infinity

| Field     | Value                             |
| --------- | --------------------------------- |
| Type      | `clarification`                   |
| Priority  | `low`                             |
| Raised by | Security Reviewer                 |
| Blocking  | no                                |
| Reference | Phase A — Response Stream Builder |

**Description**: `z.number()` in Zod 4 passes `NaN` and `Infinity`. These values would be echoed on `ResponseResource` and serialized as `null` (NaN) or error (Infinity) in JSON. Not exploitable but violates the principle of least surprise.

**Evidence**: [createResponseBodySchema.ts](src/international-space-bar-server/openresponses/generated/zod/createResponseBodySchema.ts#L42) — `"temperature": z.optional(z.union([z.number(), z.null()]))`.

**Suggested action**: Document as an accepted risk OR add `.finite()` to numeric fields in a follow-up schema fix. Non-blocking for this design.

---

## 4. Tech Validator

### Verdict: SATISFIED

### Iteration: 1 of 3

---

### Validated findings

#### 1. BLOCKING: `responseIncompleteStreamingEventSchema` missing from `ResponseStreamEvent` union

- **Reviewer claim (Engineer + Architect)**: The schema exists in generated/zod/ but is not included in the `ResponseStreamEvent` type union, preventing `ResponseStream` from type-checking when it emits `response.incomplete`.
- **Verification**: CONFIRMED. The file exists at [responseIncompleteStreamingEventSchema.ts](src/international-space-bar-server/openresponses/generated/zod/responseIncompleteStreamingEventSchema.ts) and is exported from the barrel at [index.ts line 185](src/international-space-bar-server/openresponses/generated/zod/index.ts#L185). However, [responses.types.ts](src/international-space-bar-server/openresponses/responses.types.ts#L2-L23) does NOT import it, and [the union (lines 52–73)](src/international-space-bar-server/openresponses/responses.types.ts#L52-L73) does NOT include it.
- **Status**: confirmed — trivial 2-line fix (add import + add to union)

#### 2. Gateway must also populate `config`

- **Reviewer claim (Architect)**: Design §6.2 Modified Files doesn't list `responses.gateway.ts`, but it builds `AgentInvokeRequest` without a `config` field.
- **Verification**: CONFIRMED. [responses.gateway.ts lines 328-336](src/international-space-bar-server/openresponses/responses.gateway.ts#L328-L336) constructs the request with only `model`, `input`, `instructions`, `requestId`, `abortSignal`. When `AgentInvokeRequest` adds `config`, this file MUST be updated too.
- **Status**: confirmed — non-blocking documentation gap; a type error will naturally surface during implementation

#### 3. LangGraph imports permanent in server layer vs AGENTS.md table

- **Reviewer claim (Architect)**: AGENTS.md says server can only import `interfaces/` + NestJS, but LangGraph imports exist.
- **Verification**: CONFIRMED as pre-existing. [simple-workflow.graph.ts](src/international-space-bar-server/graphs/simple-workflow.graph.ts#L2) already imports `@langchain/langgraph`. The AGENTS.md table is aspirational for this point.
- **Status**: confirmed — pre-existing policy gap, non-blocking for this design

#### 4. `toBaseMessages` exists with correct signature

- **Reviewer claim (Engineer)**: `toBaseMessages` exists in `input-to-messages.ts`.
- **Verification**: CONFIRMED at [input-to-messages.ts line 58](src/international-space-bar-server/openresponses/input-to-messages.ts#L58) with signature `(input: string | readonly unknown[]): BaseMessage[]`.
- **Status**: confirmed

#### 5. `@langchain/langgraph` at ^1.2.9, `streamEvents` available

- **Reviewer claim (Engineer)**: Package exists and API is available.
- **Verification**: CONFIRMED. `package.json` declares `"@langchain/langgraph": "^1.2.9"` and `streamEvents` is present in the installed dist.
- **Status**: confirmed

---

### Security findings validation

#### NaN/Infinity via `z.number()` (Medium-severity)

- **Reviewer claim**: Zod 4 `z.number()` accepts NaN and Infinity.
- **Verification**: **REFUTED**. Zod 4.3.6 (installed version) rejects both NaN and Infinity with explicit validation errors (`"Invalid input: expected number, received NaN"` / `"received Infinity"`). Tested in the project's own runtime.
- **Status**: refuted — no vulnerability exists

#### Metadata max-16-keys, max-64-char-key-names

- **Reviewer claim**: Schema doesn't enforce the spec's constraints.
- **Verification**: CONFIRMED as pre-existing. [metadataParamSchema.ts](src/international-space-bar-server/openresponses/generated/zod/metadataParamSchema.ts) uses `.catchall(z.string().max(512))` but has no max-keys constraint or key-length constraint, despite the description stating "Set of 16 key-value pairs" and "Keys with maximum length of 64 characters".
- **Status**: confirmed — pre-existing schema generation gap, NOT introduced by this design, non-blocking

#### Zod `.parse()` at every emission point

- **Reviewer claim**: Block trust boundary is sound with Zod parse at every emission.
- **Verification**: Consistent with existing pattern in `ping-pong-runtime.service.ts` which uses schema `.parse()` calls. Design preserves this.
- **Status**: confirmed

---

### PoC type-check result

Wrote a minimal `ResponseStream` class + `Block` type factory against the generated schemas. **Zero type errors** in the PoC file (all 29 errors reported were pre-existing in other source files). The proposed pattern — `async *run(blocks): AsyncIterable<ResponseStreamEvent>` with `Block = (ctx: ResponseStream) => AsyncIterable<ResponseStreamEvent>` — compiles cleanly.

---

### New findings (missed by reviewers)

None. The reviewers covered the relevant surface adequately.

---

### Flags for PM

#### Flag: ticket — Add `responseIncompleteStreamingEventSchema` to `ResponseStreamEvent` union

| Field     | Value                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| Type      | `ticket`                                                                                                    |
| Priority  | high                                                                                                        |
| Raised by | Tech Validator                                                                                              |
| Blocking  | yes (prerequisite for implementation, but trivial 2-line fix)                                               |
| Reference | [responses.types.ts lines 2-73](src/international-space-bar-server/openresponses/responses.types.ts#L2-L73) |

**Description**: Add import of `responseIncompleteStreamingEventSchema` and add `z.infer<typeof responseIncompleteStreamingEventSchema>` to the union. Can be done as the first commit in the implementation PR.

#### Flag: clarification — Update AGENTS.md import table for `graphs/` layer

| Field     | Value                                                                                     |
| --------- | ----------------------------------------------------------------------------------------- |
| Type      | `clarification`                                                                           |
| Priority  | low                                                                                       |
| Raised by | Tech Validator                                                                            |
| Blocking  | no                                                                                        |
| Reference | AGENTS.md "Allowed imports per layer" table, `src/international-space-bar-server/graphs/` |

**Description**: The `graphs/` directory already imports `@langchain/langgraph` directly, which contradicts the AGENTS.md rule that the server layer imports only `interfaces/` + NestJS. Clarify whether `graphs/` is conceptually part of the server layer or should be moved/acknowledged as a boundary crossing.

#### Flag: ticket — Add `responses.gateway.ts` to design §6.2 Modified Files

| Field     | Value           |
| --------- | --------------- |
| Type      | `ticket`        |
| Priority  | medium          |
| Raised by | Tech Validator  |
| Blocking  | no              |
| Reference | Design doc §6.2 |

**Description**: The gateway constructs `AgentInvokeRequest` directly and must also populate the new `config` field when it's added. Add it to the "Modified files" list so implementers don't miss it.

---

### Deliverable

```
VERDICT: SATISFIED
REASONING: The design is implementable. The one BLOCKING item (missing schema in union) is a trivial
2-line prerequisite fix that can be the first commit. The PoC type-checks clean — ResponseStream class,
Block type, and async generator patterns all compile against the project's generated Zod schemas.
The Security Reviewer's NaN/Infinity concern was refuted (Zod 4.3.6 rejects both). All architecture
patterns, library APIs, and type signatures verified against reality.
BLOCKING ITEMS: responseIncompleteStreamingEventSchema missing from ResponseStreamEvent union (trivial fix)
NON-BLOCKING FLAGS TO ROUTE TO PM: (1) Update design §6.2 to include responses.gateway.ts,
(2) Clarify AGENTS.md import table for graphs/ layer
```
