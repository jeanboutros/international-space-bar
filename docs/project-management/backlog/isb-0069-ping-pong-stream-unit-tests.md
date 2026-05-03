# isb-0069: Unit tests for `PingPongRuntimeService.stream()`

| Field        | Value                                                                                  |
| ------------ | -------------------------------------------------------------------------------------- |
| Epic         | [isb-epic-010](../epics/isb-epic-010-kubb-preprocessing-server-bootstrap-hardening.md) |
| Type         | `feature`                                                                              |
| Status       | `backlog`                                                                              |
| Assignee     | Tester                                                                                 |
| Priority     | `medium`                                                                               |
| Created      | 2026-04-30                                                                             |
| Completed    | —                                                                                      |
| Dependencies | none                                                                                   |

---

## Background

`PingPongRuntimeService.stream()` exists at line 126 of `ping-pong-runtime.service.ts` and is exercised by the streaming controller route in production. However, `ping-pong-runtime.service.test.ts` only tests the `invoke()` method — `stream()` has no unit tests at all.

**Why it matters**: `stream()` is the core of the streaming scaffold and the path exercised by `responses.controller.stream.test.ts` (controller-level integration tests). Without unit-level tests on the service itself, regressions in the SSE event sequence (e.g. missing `response.created`, wrong delta ordering, missing `response.completed`) would only be caught at the controller level, making them harder to isolate.

**Raised by**: Engineer (Phase A flag, isb-0064 pipeline, 2026-04-30).

---

## Technical Context

**Current state**: `ping-pong-runtime.service.test.ts` contains tests for `invoke()` only. `stream()` is uncovered.

**`stream()` method signature** (line 126 of `ping-pong-runtime.service.ts`):

```typescript
async *stream(request: AgentInvokeRequest): AsyncIterable<ResponseStreamEvent>
```

**Behaviour under test** (fallback path — no Ollama):
When `OLLAMA_BASE_URL` is unset or Ollama is unreachable, `stream()` delegates to `streamSimplePong()` which yields a deterministic sequence of `ResponseStreamEvent` items:

1. `response.created`
2. One or more delta events containing "pong" chunks
3. `response.completed`

The test environment will never have Ollama running, so the fallback path is reliably exercised. Do NOT mock `isOllamaReachable` — let it resolve naturally (it will return `false` in test).

**Key type**: `ResponseStreamEvent` — imported from `responses.types.ts` (or generated Kubb types). The `object` field on each event identifies the event type.

---

## Acceptance Criteria

- AC-1: A test block `describe("PingPongRuntimeService — stream()", ...)` exists in `ping-pong-runtime.service.test.ts`.
- AC-2: Test T-S1: consuming the async iterable to completion yields a non-empty array of events.
- AC-3: Test T-S2: the first event has `object === "response.created"`.
- AC-4: Test T-S3: the last event has `object === "response.completed"`.
- AC-5: Test T-S4: at least one intermediate event is a delta event (e.g. `object === "response.output_item.delta"` or equivalent — check the actual type emitted by `streamSimplePong()`).
- AC-6: Test T-S5: the concatenated delta content contains the string `"pong"` (case-insensitive).
- AC-7: Tests follow the mandatory comment conventions from tester-standards (ARRANGE / ACT / ASSERT, T-ID labels).
- AC-8: `pnpm check` exits 0 after adding the tests.
- AC-9: `pnpm test` exits 0 with all new tests passing.

---

## Files Affected

- `src/international-space-bar-server/openresponses/ping-pong-runtime.service.test.ts` — add `stream()` test block with 5 test cases (T-S1 through T-S5)

No production code changes required.

---

## Test Expectations

All tests are **unit tests** — no HTTP server, no NestJS bootstrap, no real Ollama connection.

Collect the async iterable into an array using:

```typescript
const events: ResponseStreamEvent[] = [];
for await (const event of service.stream({
    model: "test-model",
    input: "ping",
    requestId: "req_test-stream",
})) {
    events.push(event);
}
```

Then assert on `events[0]`, `events[events.length - 1]`, intermediate events, and concatenated delta text.

---

## Definition of Done

- `pnpm check` exits 0
- `pnpm test` exits 0 with all new tests passing
- `ping-pong-runtime.service.test.ts` contains at least 5 new test cases for `stream()`
- All 5 tests are labelled with T-IDs and follow ARRANGE/ACT/ASSERT comment structure
- No mocking of `isOllamaReachable` — tests rely on the natural fallback path
