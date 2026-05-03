# isb-epic-011 — Phase B Review (Round 1)

| Field   | Value        |
| ------- | ------------ |
| Date    | 2026-05-03   |
| Verdict | APPROVED     |
| Round   | 1            |
| Phase   | B (Planning) |

---

## 1. Test Planner — Full Output

### Test Strategy — isb-epic-011: Response Stream Builder

#### Test targets

##### A. `ResponseStream` unit tests

| #   | File path                                                                  | Test name (`it("…")`)                                                             | What to verify                                                                                                                                                                                                            | AC reference       |
| --- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1   | `src/international-space-bar-server/openresponses/response-stream.test.ts` | `seq starts at 0 and increments by 1 per yielded event`                           | Collect all events from `ctx.run([singleBlock])`. Assert `sequence_number` values are `0, 1, 2, …` with no gaps.                                                                                                          | §9.2 bullet 1      |
| 2   | same                                                                       | `outputIndex starts at 0 for the first block and increments by 1 per block`       | Run two blocks. Assert `output_index` on each block's `output_item.added` is `0` then `1`.                                                                                                                                | §9.2 bullet 2      |
| 3   | same                                                                       | `response.created is emitted before any block event`                              | First event type is `"response.created"` with `status: "in_progress"`.                                                                                                                                                    | §9.2 bullet 3      |
| 4   | same                                                                       | `response.completed is emitted after all block events`                            | Last event type is `"response.completed"` with `status: "completed"`.                                                                                                                                                     | §9.2 bullet 3      |
| 5   | same                                                                       | `abort mid-stream emits response.incomplete with reason cancelled`                | Provide a block that yields one item, then abort the signal. Assert terminal event is `response.incomplete` with `incomplete_details.reason === "cancelled"`. Assert `output` contains only items completed before abort. | §9.2 bullet 4, §D6 |
| 6   | same                                                                       | `block that throws emits response.failed with error code and message`             | Provide a block whose generator throws `new Error("boom")`. Assert terminal event is `response.failed` with `error.code` and `error.message` populated.                                                                   | §9.2 bullet 5, §D6 |
| 7   | same                                                                       | `recordOutputItem feeds accumulated output to terminal event`                     | Two blocks each call `ctx.recordOutputItem(item)`. Assert `response.completed.response.output` has both items in order.                                                                                                   | §9.2 bullet 6      |
| 8   | same                                                                       | `addUsage accumulates input and output tokens to terminal event`                  | Two blocks each call `ctx.addUsage({ input_tokens: 5, output_tokens: 10 })`. Assert `response.completed.response.usage.input_tokens === 10`, `output_tokens === 20`, `total_tokens === 30`.                               | §9.2 bullet 6      |
| 9   | same                                                                       | `request-echo fields from config appear unchanged on response.created`            | Construct request with `config: { temperature: 0.7, top_p: 0.9, model: "x", … }`. Assert those fields appear verbatim on `response.created.response`.                                                                     | §9.2 bullet 7, §D5 |
| 10  | same                                                                       | `request-echo fields from config appear unchanged on terminal response.completed` | Same config. Assert terminal event's `response` carries the same echo fields.                                                                                                                                             | §9.2 bullet 7, §D5 |
| 11  | same                                                                       | `empty block list emits response.created then response.completed with output []`  | `ctx.run([])`. Assert exactly two events: `response.created` and `response.completed` with `output: []`.                                                                                                                  | §9.2 bullet 8      |

##### B. Block factory unit tests — `messageBlock`

| #   | File path                                                                      | Test name (`it("…")`)                                                                                                                                                | What to verify                                                                                                        | AC reference            |
| --- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 12  | `src/international-space-bar-server/openresponses/blocks/messageBlock.test.ts` | `static variant emits events in correct order: output_item.added → content_part.added → output_text.delta → output_text.done → content_part.done → output_item.done` | Collect event types from `messageBlock("hello")(ctx)`. Assert ordering.                                               | §9.2 block bullet 1     |
| 13  | same                                                                           | `static variant final output_item.done carries an item that parses through messageSchema`                                                                            | Parse the `item` field of the terminal `output_item.done` through the generated `messageSchema`. Assert no Zod error. | §9.2 block bullet 2     |
| 14  | same                                                                           | `static variant item status transitions through in_progress → completed`                                                                                             | Assert `output_item.added.item.status === "in_progress"` and `output_item.done.item.status === "completed"`.          | §9.2 block bullet 3     |
| 15  | same                                                                           | `fromQueue variant emits deltas for each chunk pushed`                                                                                                               | Push 3 chunks into queue, close. Assert 3 `output_text.delta` events with matching content.                           | §9.2 block bullet 1     |
| 16  | same                                                                           | `fromQueue variant emits incomplete status on abort`                                                                                                                 | Push 1 chunk, abort signal, close queue. Assert `output_item.done.item.status === "incomplete"`.                      | §9.2 block bullet 3     |
| 17  | same                                                                           | `calls ctx.recordOutputItem before yielding output_item.done`                                                                                                        | Spy on `ctx.recordOutputItem`. Assert called once with the finalized message item.                                    | §9.7 anti-pattern check |

##### C. Block factory unit tests — `reasoningBlock`

| #   | File path                                                                        | Test name (`it("…")`)                                                                                                                                                                                          | What to verify                                             | AC reference            |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------- |
| 18  | `src/international-space-bar-server/openresponses/blocks/reasoningBlock.test.ts` | `static variant emits events in correct order: output_item.added → reasoning_summary_part.added → reasoning_summary_text.delta → reasoning_summary_text.done → reasoning_summary_part.done → output_item.done` | Collect event types and verify ordering.                   | §9.2 block bullet 1     |
| 19  | same                                                                             | `static variant final output_item.done item parses through the generated reasoning item shape`                                                                                                                 | Parse `output_item.done.item` through generated Zod shape. | §9.2 block bullet 2     |
| 20  | same                                                                             | `static variant item status transitions in_progress → completed`                                                                                                                                               | Assert status values.                                      | §9.2 block bullet 3     |
| 21  | same                                                                             | `fromQueue variant emits reasoning_summary_text.delta per chunk`                                                                                                                                               | Push N chunks, close. Assert N delta events.               | §9.2 block bullet 1     |
| 22  | same                                                                             | `fromQueue variant emits incomplete status on abort`                                                                                                                                                           | Abort mid-stream. Assert `status === "incomplete"`.        | §9.2 block bullet 3     |
| 23  | same                                                                             | `calls ctx.recordOutputItem and ctx.addUsage`                                                                                                                                                                  | Spy on both methods. Assert called.                        | §9.7 anti-pattern check |

##### D. Block factory unit tests — `functionCallBlock`

| #   | File path                                                                           | Test name (`it("…")`)                                                                                                                                  | What to verify                                                                                   | AC reference        |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------- |
| 24  | `src/international-space-bar-server/openresponses/blocks/functionCallBlock.test.ts` | `fromQueue variant emits events in correct order: output_item.added → function_call_arguments.delta → function_call_arguments.done → output_item.done` | Collect and verify event type ordering.                                                          | §9.2 block bullet 1 |
| 25  | same                                                                                | `final output_item.done item parses through generated functionCallSchema`                                                                              | Parse item through Zod schema.                                                                   | §9.2 block bullet 2 |
| 26  | same                                                                                | `item status transitions in_progress → completed`                                                                                                      | Assert status values.                                                                            | §9.2 block bullet 3 |
| 27  | same                                                                                | `arguments are accumulated across multiple delta chunks`                                                                                               | Push 3 argument fragments. Assert `function_call_arguments.done.arguments` is the concatenation. | §9.2 block bullet 1 |
| 28  | same                                                                                | `incomplete status on abort`                                                                                                                           | Abort mid-stream. Assert `status === "incomplete"`.                                              | §9.2 block bullet 3 |

##### E. Integration tests

| #   | File path                                                                              | Test name (`it("…")`)                                                                                          | What to verify                                                                                                                      | AC reference              |
| --- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 29  | `src/international-space-bar-server/openresponses/response-stream.integration.test.ts` | `ctx.run([messageBlock("pong")]) produces byte-equivalent event stream to existing streamSimplePong recording` | Capture full event sequence from new API. Compare to recorded/snapshot event sequence from current `streamSimplePong`.              | §9.2 integration bullet 1 |
| 30  | same                                                                                   | `messageBlock reuse across separate ResponseStream instances produces consistent output`                       | Use `messageBlock("hello")` in two separate `ResponseStream` runs. Assert both produce identical event sequences (no leaked state). | §9.5 Challenger item 7    |
| 31  | `src/international-space-bar-server/openresponses/lang-graph-blocks.test.ts`           | `langGraphBlocks translates a single-node LLM graph into one message block`                                    | Build a fixture graph with `wrapAsGraph(mockLLM)`, drive with test input. Assert one `messageBlock` is yielded.                     | §10.2, §10.3              |
| 32  | same                                                                                   | `langGraphBlocks translates a graph with tool calls into message + function_call blocks`                       | Build a ReAct-style fixture graph. Assert block sequence includes `functionCallBlock`.                                              | §10.2, §10.3              |
| 33  | same                                                                                   | `langGraphBlocks propagates abort signal to graph.streamEvents`                                                | Abort mid-stream. Assert the adapter terminates and does not yield further blocks.                                                  | §10.4 abort               |

##### F. Compliance tests (existing — must still pass)

| #   | File path                     | Test name      | What to verify                                                          | AC reference           |
| --- | ----------------------------- | -------------- | ----------------------------------------------------------------------- | ---------------------- |
| 34  | `scripts/compliance-test.mjs` | (all existing) | Run `pnpm test:compliance` — asserts protocol wire format is unchanged. | §9.2 compliance bullet |

---

#### Edge cases

- **Abort between blocks (not during)** — affects test #5: signal fires _after_ block 1 completes but _before_ block 2 starts. `output` must include block 1's item but not block 2's.
- **Block yields zero events** — a block that returns immediately without yielding. `outputIndex` still increments. `output_item.added` / `output_item.done` are still expected (or clarify that empty blocks are rejected).
- **Extremely large `seq` values** — after 10,000+ events, `seq` must still be monotonically incrementing (no integer overflow in practice, but asserts correct counter behaviour).
- **Concurrent abort + block throw** — if `abortSignal` fires _and_ the active block throws simultaneously, the terminal event should be `response.incomplete` (abort takes priority per §D6 table ordering).
- **`addUsage` with partial fields** — calling `addUsage({ output_tokens: 5 })` without `input_tokens` should not zero-out previously accumulated `input_tokens`.
- **`config` with `null` optional fields** — echoed fields that are `null` must stay `null`, not be omitted from the response.

---

#### Security test cases (from Phase A Security Reviewer findings)

| #   | Target                                 | Type     | What to verify                                                                                                                                      | Security finding ref |
| --- | -------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| S1  | `ResponsesService` config population   | security | `stream`, `stream_options`, `background` are never present on `config` — even when client sends them.                                               | Phase A §3 finding 1 |
| S2  | `ResponsesService` metadata validation | security | Requests with >16 metadata keys are rejected (400). Keys longer than 64 chars are rejected.                                                         | Phase A §3 finding 2 |
| S3  | `ResponseStream` echo fields           | security | `config` does not include any field not in `ResponseStreamConfig` interface (no extra properties leak through).                                     | Phase A §3 finding 1 |
| S4  | `ResponseStream`                       | security | `previous_response_id` is echoed as-is with no server-side state lookup. Sending another session's response ID does not return that session's data. | Phase A §3 finding 3 |

---

#### Test dependencies

| Test(s)                          | Depends on ticket                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| #1–11 (ResponseStream unit)      | `ResponseStream` class implementation (§9.3.3) + `ResponseStreamConfig` widening (§9.3.1) + config defaults population (§9.3.2) |
| #12–17 (messageBlock)            | `messageBlock` factory (§9.3.4) + `ResponseStream` class                                                                        |
| #18–23 (reasoningBlock)          | `reasoningBlock` factory (§9.3.4) + `ResponseStream` class                                                                      |
| #24–28 (functionCallBlock)       | `functionCallBlock` factory (§9.3.4) + `ResponseStream` class                                                                   |
| #29–30 (integration — pong path) | Pong-path refactor (§9.3.5)                                                                                                     |
| #31–33 (langGraphBlocks)         | `langGraphBlocks` adapter + `wrapAsGraph` (§9.3.6)                                                                              |
| #34 (compliance)                 | All implementation tickets (run at end as regression gate)                                                                      |
| S1–S3 (security)                 | Config population (§9.3.2)                                                                                                      |
| S4 (security)                    | `ResponseStream` class (§9.3.3)                                                                                                 |

**Pre-requisite (blocking)**: The `ResponseStreamEvent` union must include `responseIncompleteStreamingEventSchema` before tests #5, #16, #22, #28 can compile. (Flagged by both Architect and Engineer in Phase A.)

---

#### Notes for the Tester

1. **Test runner**: Vitest is NOT used — this project uses Node.js native `node:test` with `node:assert/strict`. Follow the existing pattern in `responses.controller.stream.test.ts` and `ping-pong-runtime.service.test.ts`.

2. **No NestJS test bed for ResponseStream tests.** `ResponseStream` is a pure class — instantiate directly with a mock `AgentInvokeRequest`. No DI needed.

3. **Block tests need a minimal `ResponseStream` context.** Create a helper that builds a `ResponseStream` with a dummy request. Blocks only need `ctx.outputIndex`, `ctx.abortSignal`, `ctx.recordOutputItem()`, and `ctx.addUsage()`.

4. **Snapshot approach for test #29.** Capture the event stream from the _current_ `streamSimplePong` before the refactor lands (or use the existing compliance test recording). Store as a JSON fixture. The new `ctx.run([messageBlock("pong")])` output must match modulo dynamic fields (`id`, `created_at`, timestamps) — assert structural equivalence with those fields masked.

5. **Tester comment conventions.** Every `it()` must follow the three-line comment format from tester-standards SKILL: WHAT / WHY / STEPS with `// --- Arrange ---`, `// --- Act ---`, `// --- Assert ---` markers.

6. **`AsyncQueue` isolation tests.** If the `AsyncQueue` helper is non-trivial (blocking/unblocking semantics), add 2–3 dedicated tests for it inside `lang-graph-blocks.test.ts`: push-then-consume, consume-blocks-until-push, close-unblocks-consumer.

7. **Mock LLM for langGraphBlocks tests.** Use `@langchain/core/utils/testing`'s `FakeListChatModel` or a custom `FakeChatModel` that yields predetermined chunks. Do not require Ollama for unit/integration tests.

8. **Quality gate**: `pnpm check` must pass after every test file is written. Then `pnpm test <file>` must exit 0.

---

## 2. Docs Planner — Full Output

### New files

| File                                  | Purpose                                                                                                                                                                | Depends on ticket                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `docs/standards/streaming-runtime.md` | Standards doc for the ResponseStream pattern: the "always a graph" rule, Block contract, forbidden manual event construction in production, abort-handling obligations | ResponseStream + langGraphBlocks tickets |

### Updates to existing files

| File                                                                     | Section                            | Change description                                                                                                                                                                                                                                                                       | Depends on ticket               |
| ------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `docs/openresponses-backend-phased-design.md`                            | Phase 1 (line ~465)                | Add a paragraph after the Phase 1 acceptance criteria noting that the **canonical streaming architecture** is now defined in `docs/response-stream-builder.md`. The inline SSE target examples stay for historical context but link to the design doc as the implementation reference.   | Runtime refactor ticket         |
| `docs/openresponses-backend-phased-design.md`                            | Architecture Overview (line ~96)   | Add `ResponseStream` + `blocks/` + `lang-graph-blocks.ts` to the "Future internal runtime boundary" box in the ASCII diagram.                                                                                                                                                            | Runtime refactor ticket         |
| `docs/websocket-transport.md`                                            | §REQ-WS-03 (line ~46)              | Replace the reference to `PingPongRuntimeService.stream()` with `ResponseStream` (via the runtime's `yield* ctx.run(…)`). Note that `ResponseStreamEvent` objects are still the unit of transport — only the _source_ changes from hand-built events to `ResponseStream`-emitted events. | Runtime refactor ticket         |
| `src/international-space-bar-server/openresponses/agent-runtime.port.ts` | JSDoc on `stream` method (line ~7) | Update inline JSDoc to reference `ResponseStream` as the class that owns event emission, and `Block` as the composable unit. State that production runtimes MUST use `ctx.run(langGraphBlocks(graph, …))` — manual block arrays are for tests only.                                      | Widen AgentInvokeRequest ticket |
| `AGENTS.md`                                                              | Conventions section                | Add a "Streaming runtime" convention entry: (1) every production runtime uses `ResponseStream` + `langGraphBlocks`; (2) manual `ctx.run([…])` is for tests only; (3) every LLM invocation — even single-shot — is wrapped in a `CompiledStateGraph` via `wrapAsGraph(llm)`.              | langGraphBlocks ticket          |
| `docs/technical-stack.md`                                                | Core Conventions (after line ~320) | Add a "Streaming" subsection describing the `ResponseStream` + `Block` + `langGraphBlocks` pattern alongside existing State schema / Context schema conventions.                                                                                                                         | Runtime refactor ticket         |

### Standards documentation updates

| Standard                           | Action    | Change description                                                                                                                                                                                                                                                                                                    | Depends on ticket      |
| ---------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Code quality                       | No change | Existing patterns in `AGENTS.md` §Conventions and `.opencode/context/core/standards/code-quality.md` are sufficient. The design does not introduce new anti-patterns beyond what the streaming-runtime standard covers.                                                                                               | —                      |
| Directory structure / architecture | Update    | `AGENTS.md` §Project structure and §Allowed imports: add `openresponses/blocks/` sub-directory and `openresponses/lang-graph-blocks.ts` to the file tree. Note that `blocks/` files follow the same import rules as `openresponses/` (they may import from `generated/`, `responses.types.ts`, `response-stream.ts`). | ResponseStream ticket  |
| Test coverage                      | No change | The test plan (from Test Planner) covers unit + integration + compliance. No new **standards** doc is needed — existing `.opencode/context/core/standards/test-coverage.md` already defines the expectations. The test plan itself is a checklist, not a standards gap.                                               | —                      |
| Logging / observability            | No change | `ResponseStream` does not introduce new log categories. It emits protocol events, not log entries. Existing `docs/agent-observability-logging.md` and `docs/logging.md` remain sufficient.                                                                                                                            | —                      |
| Naming conventions                 | No change | New files follow established naming: kebab-case `.ts` files, PascalCase classes, camelCase functions. No novel pattern introduced.                                                                                                                                                                                    | —                      |
| Code review checklist              | Update    | Add rejection criterion to `.opencode/context/core/standards/security-patterns.md` §Code Review Checklist: "Reject any production runtime that hand-builds `ResponseStreamEvent` objects or bypasses `ResponseStream`. All streaming must go through `ctx.run(langGraphBlocks(…))`."                                  | langGraphBlocks ticket |
| Security                           | No change | Phase A security review confirmed: `config` excludes HTTP transport fields, `metadata` is not echoed without validation, `previous_response_id` with `store: false` uses connection-local state. No new security standard needed.                                                                                     | —                      |

### FLAG: Missing `docs/standards/` directory

The project has **no `docs/standards/`** directory in the main `docs/` tree. Standards documentation currently lives in two places:

1. `AGENTS.md` §Conventions (authoritative for agent-pipeline actors)
2. `.opencode/context/core/standards/` (OpenCode-specific context files)

The new `docs/standards/streaming-runtime.md` would be the first entry in a proper `docs/standards/` directory. The Docs Writer should create the directory and add a brief `docs/standards/README.md` index that links to all standards docs (including pointers back to `AGENTS.md` and `docs/technical-stack.md` for existing standards).

### Notes for the Docs Writer

- **Tone**: match the terse, imperative style of `AGENTS.md` §Conventions — rules, not explanations.
- **Cross-references**: every new doc must link to `docs/response-stream-builder.md` as the full design reference. Do not duplicate the design content — link to it.
- **Academic-reference rule applies**: any claim about LangGraph APIs must link to a fetched-at-write-time source (use Context7 to verify URLs before writing).
- **`docs/response-stream-builder.md` itself** does NOT need updating — it is the source of truth. The plan is about updating _other_ docs to reference it.
- **Ordering**: the AGENTS.md and technical-stack.md updates can land with the implementation tickets. The `docs/standards/streaming-runtime.md` file and code-review-checklist update should land after the langGraphBlocks adapter is merged (they reference the final API shape).

---

## 3. PM — Full Output

### Tickets created (13 total, in dependency order)

| ID       | Title                                                  | Type     | Priority | Dependencies                           |
| -------- | ------------------------------------------------------ | -------- | -------- | -------------------------------------- |
| isb-0077 | Add `responseIncompleteStreamingEventSchema` to union  | feature  | high     | —                                      |
| isb-0078 | Widen `AgentInvokeRequest` with `ResponseStreamConfig` | feature  | high     | —                                      |
| isb-0084 | Add `wrapAsGraph` helper                               | feature  | high     | —                                      |
| isb-0088 | Loosen item shapes for `"incomplete"` status           | feature  | medium   | —                                      |
| isb-0079 | Populate `config` defaults in `ResponsesService`       | feature  | high     | isb-0078                               |
| isb-0080 | Add `ResponseStream` class                             | feature  | high     | isb-0077, isb-0078                     |
| isb-0081 | Add `messageBlock` factory                             | feature  | high     | isb-0080                               |
| isb-0082 | Add `reasoningBlock` factory                           | feature  | medium   | isb-0080                               |
| isb-0083 | Add `functionCallBlock` factory                        | feature  | medium   | isb-0080                               |
| isb-0085 | Add `langGraphBlocks` adapter                          | feature  | high     | isb-0081, isb-0082, isb-0083, isb-0084 |
| isb-0086 | Refactor PingPong pong path to `messageBlock`          | refactor | high     | isb-0081                               |
| isb-0087 | Replace `_old` with LangGraph runtime, delete `_old`   | refactor | high     | isb-0085                               |
| isb-0089 | Update docs — cross-links, AGENTS.md, standards        | docs     | low      | isb-0087                               |

### Dependency graph (execution tiers)

```
Tier 0 (parallel): isb-0077, isb-0078, isb-0084, isb-0088
Tier 1 (parallel): isb-0079, isb-0080
Tier 2 (parallel): isb-0081, isb-0082, isb-0083
Tier 3 (parallel): isb-0085, isb-0086
Tier 4:            isb-0087
Tier 5:            isb-0089
```

### Flags processed

| Flag source                        | Decision         | Artifact | Reason                                 |
| ---------------------------------- | ---------------- | -------- | -------------------------------------- |
| Phase A — gateway DRY              | Already ticketed | isb-0074 | Created during Phase A flag processing |
| Phase A — AGENTS.md import table   | Already ticketed | isb-0075 | Created during Phase A flag processing |
| Phase A — echo-field defaults docs | Already ticketed | isb-0076 | Created during Phase A flag processing |

### Clarifications created

None — no ambiguities encountered.

---

## 4. Verdict

Phase B planning is **APPROVED**. All 13 tickets created with proper IDs (minted via `next-id.mjs`), dependency graph established, test strategy covers 34 tests + 4 security tests, documentation plan identifies 6 file updates + 1 new standards file. No blockers or open clarifications.
