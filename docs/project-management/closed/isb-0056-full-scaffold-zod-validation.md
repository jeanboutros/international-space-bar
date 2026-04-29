# isb-0056: Add Zod `.parse()` validation to all 20 constructed objects in ping-pong scaffold

| Field | Value |
|-------|-------|
| Epic | isb-epic-002 |
| Type | `feature` |
| Status | `open` |
| Assignee | Engineer |
| Priority | `medium` |
| Created | 2026-04-29 |
| Completed | — |
| Dependencies | isb-0054 |

## Description

isb-0054 added Zod validation for only the three local item-shape schemas
(`ReasoningItemShape`, `MessageItemShape`, `FunctionCallItemShape`). Every
other constructed object in `ping-pong-runtime.service.ts` is unvalidated:
all 18 `yield` statements, the `inProgressResponse` ResponseResource, and the
`invoke()` return value. Malformed fields (wrong type, missing required key,
mismatched literal) surface only when the client receives a broken event, not
at construction time.

Generated Zod schemas exist for every streaming event type and for
`ResponseResource` in `./generated/zod/index.js`. This ticket wires them in.

**Scope**: `src/international-space-bar-server/openresponses/ping-pong-runtime.service.ts`

### Import block to add

Add a runtime import from `./generated/zod/index.js` alongside the existing
type-only import:

```typescript
import {
    responseCompletedStreamingEventSchema,
    responseContentPartAddedStreamingEventSchema,
    responseContentPartDoneStreamingEventSchema,
    responseCreatedStreamingEventSchema,
    responseFunctionCallArgumentsDeltaStreamingEventSchema,
    responseFunctionCallArgumentsDoneStreamingEventSchema,
    responseOutputItemAddedStreamingEventSchema,
    responseOutputItemDoneStreamingEventSchema,
    responseOutputTextDeltaStreamingEventSchema,
    responseOutputTextDoneStreamingEventSchema,
    responseReasoningSummaryDeltaStreamingEventSchema,
    responseReasoningSummaryDoneStreamingEventSchema,
    responseReasoningSummaryPartAddedStreamingEventSchema,
    responseReasoningSummaryPartDoneStreamingEventSchema,
    responseResourceSchema,
} from "./generated/zod/index.js";
```

### Yield wrapping pattern

Every `yield` is wrapped in its schema's `.parse()`:

```typescript
// Before
yield {
    type: "response.output_item.added",
    sequence_number: seq++,
    output_index: outputIndex,
    item: ReasoningItemShape.parse({ ... }),
};

// After
yield responseOutputItemAddedStreamingEventSchema.parse({
    type: "response.output_item.added",
    sequence_number: seq++,
    output_index: outputIndex,
    item: ReasoningItemShape.parse({ ... }),
});
```

`as unknown as ResponseStreamEvent` casts are retained only where TypeScript
cannot widen the `.parse()` return to the `ResponseStreamEvent` union — each
retained cast is now paired with a `.parse()` call and serves as a type
assertion only, not a correctness bypass.

### ResponseResource validation

```typescript
// inProgressResponse — validate before first use
const inProgressResponse: ResponseResource = responseResourceSchema.parse({
    id: respId,
    object: "response",
    // ... all fields
});

// invoke() return value
return responseResourceSchema.parse({ ... });
```

### Full inventory (20 objects)

**`streamReasoningBlock` — 6 yields**
1. `response.output_item.added` → `responseOutputItemAddedStreamingEventSchema`
2. `response.reasoning_summary_part.added` → `responseReasoningSummaryPartAddedStreamingEventSchema`
3. *(delta loop)* `response.reasoning_summary_text.delta` → `responseReasoningSummaryDeltaStreamingEventSchema`
4. `response.reasoning_summary_text.done` → `responseReasoningSummaryDoneStreamingEventSchema`
5. `response.reasoning_summary_part.done` → `responseReasoningSummaryPartDoneStreamingEventSchema`
6. `response.output_item.done` → `responseOutputItemDoneStreamingEventSchema`

**`streamMessageBlock` — 6 yields**
7. `response.output_item.added` → `responseOutputItemAddedStreamingEventSchema`
8. `response.content_part.added` → `responseContentPartAddedStreamingEventSchema`
9. *(delta loop)* `response.output_text.delta` → `responseOutputTextDeltaStreamingEventSchema`
10. `response.output_text.done` → `responseOutputTextDoneStreamingEventSchema`
11. `response.content_part.done` → `responseContentPartDoneStreamingEventSchema`
12. `response.output_item.done` → `responseOutputItemDoneStreamingEventSchema`

**`stream()` body — 6 yields + 1 ResponseResource**
13. `inProgressResponse` → `responseResourceSchema.parse()`
14. `response.created` → `responseCreatedStreamingEventSchema`
15. `response.output_item.added` (function_call) → `responseOutputItemAddedStreamingEventSchema`
16. *(args loop)* `response.function_call_arguments.delta` → `responseFunctionCallArgumentsDeltaStreamingEventSchema`
17. `response.function_call_arguments.done` → `responseFunctionCallArgumentsDoneStreamingEventSchema`
18. `response.output_item.done` (function_call) → `responseOutputItemDoneStreamingEventSchema`
19. `response.completed` → `responseCompletedStreamingEventSchema`

**`invoke()` — 1 return value**
20. Return value → `responseResourceSchema.parse()`

## Acceptance Criteria

### Implementation (from design doc §Acceptance criteria)
- [ ] `responseResourceSchema.parse()` is called on the `invoke()` return value.
- [ ] `responseResourceSchema.parse()` is called on `inProgressResponse` before it is used in any yield.
- [ ] Every one of the 18 event yields is wrapped in its corresponding generated schema's `.parse()` call.
- [ ] No `as unknown as ResponseStreamEvent` cast is the sole guard — each retained cast is paired with a `.parse()` call.
- [ ] The 3 hand-rolled item schemas (`ReasoningItemShape`, `MessageItemShape`, `FunctionCallItemShape`) are retained.
- [ ] `pnpm check` exits 0.
- [ ] All existing tests pass (`pnpm test`).
- [ ] No new `// biome-ignore` or `// eslint-disable` directives are introduced.

### Smoke tests (new file: `ping-pong-schema.smoke.test.ts`)
- [ ] `responseResourceSchema` passes `.parse()` for the `invoke()` return shape.
- [ ] `responseResourceSchema` passes `.parse()` for the `inProgressResponse` shape.
- [ ] `responseCreatedStreamingEventSchema` passes `.parse()` for a `response.created` event.
- [ ] `responseOutputItemAddedStreamingEventSchema` passes `.parse()` with a `ReasoningItemShape`-structured `item` field.
- [ ] `responseOutputTextDeltaStreamingEventSchema` passes `.parse()` for a delta event.
- [ ] `responseCompletedStreamingEventSchema` passes `.parse()` for a `response.completed` event.
- [ ] Negative: passing an object with the wrong `type` literal causes `.parse()` to throw `ZodError`.

### Documentation
- [ ] `docs/designs/isb-full-scaffold-validation.md` status updated from `Draft` to `Implemented`.

## Files Affected

- `src/international-space-bar-server/openresponses/ping-pong-runtime.service.ts` — add 15 generated schema imports; wrap all 18 yields and 2 ResponseResource constructions in `.parse()` calls
- `src/international-space-bar-server/openresponses/ping-pong-schema.smoke.test.ts` — **new file**; 7 smoke-test cases validating schema round-trips (Tester)
- `docs/designs/isb-full-scaffold-validation.md` — status `Draft` → `Implemented` (Docs Writer)

## PoC Snippets

```typescript
// responseResourceSchema.parse() on invoke() return
return responseResourceSchema.parse({
    id: respId,
    object: "response",
    status: "completed",
    // ...
}) as ResponseResource;

// Yield wrapped in generated schema
yield responseCreatedStreamingEventSchema.parse({
    type: "response.created",
    sequence_number: seq++,
    response: inProgressResponse,
}) as unknown as ResponseStreamEvent;

// Negative smoke test
import assert from "node:assert/strict";
import { ZodError } from "zod";
import { responseCreatedStreamingEventSchema } from "./generated/zod/index.js";

assert.throws(
    () => responseCreatedStreamingEventSchema.parse({ type: "wrong.type", sequence_number: 0, response: {} }),
    ZodError,
);
```

## Comments

- Design source: `docs/designs/isb-full-scaffold-validation.md`
- Known constraint: generated schemas use `zod/v4` import internally; scaffold uses `zod`. No conflict — both resolve to the same Zod 4 instance in this project.
- All scaffold code remains marked `// TODO: REMOVE BEFORE PRODUCTION`. No change to scaffold lifecycle.
- isb-0054 (closed) introduced the 3 hand-rolled item schemas; this ticket extends that pattern to all generated event schemas.

## Completion

**Closed**: 2026-04-29  
**Phase C**: APPROVED (Challenger, loop 2 — docs fix + gateway revert)  
**Commits**:
- `df5f3bf` — feat(openresponses): add Zod parse validation to all 20 scaffold objects
- `8c4be4b` — test(openresponses): add schema smoke tests for scaffold validation

All 16 acceptance criteria met. pnpm check exits 0. All tests pass.
