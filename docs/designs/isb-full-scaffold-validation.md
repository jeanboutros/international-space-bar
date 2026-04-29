# Design: Complete Zod Validation for Scaffold Streaming Events

**Status**: Draft  
**Ticket**: isb-0056 (to be assigned)  
**File in scope**: `src/international-space-bar-server/openresponses/ping-pong-runtime.service.ts`

---

## Problem

isb-0054 added Zod validation for only three local item-shape schemas
(`ReasoningItemShape`, `MessageItemShape`, `FunctionCallItemShape`). Every
other object constructed in the scaffold — all `yield` statements, the
`inProgressResponse` ResponseResource, and the `invoke()` return value — is
unvalidated. If a field is wrong (wrong type, missing required field, or
mismatched literal) the error surfaces only when the client receives a
malformed event, not at construction time.

Generated Zod schemas exist for every streaming event type and for
`ResponseResource` in `generated/zod/`. They are not being used in the
scaffold.

---

## Goal

Add Zod `.parse()` validation to **every** constructed object in
`ping-pong-runtime.service.ts`:

1. Every `yield` statement — validated against its specific generated event schema.
2. The `inProgressResponse` `ResponseResource` object — validated via
   `responseResourceSchema.parse()` before first use.
3. The `invoke()` return value — validated via `responseResourceSchema.parse()`.
4. Keep the 3 existing item-shape schemas (`ReasoningItemShape`,
   `MessageItemShape`, `FunctionCallItemShape`) — they provide narrower
   structural validation for `item:` fields than the permissive generated
   `itemFieldSchema.and(z.unknown())`.

---

## Generated schemas to import

All from `./generated/zod/index.js`:

| Event type emitted | Generated schema |
|--------------------|-----------------|
| `response.created` | `responseCreatedStreamingEventSchema` |
| `response.completed` | `responseCompletedStreamingEventSchema` |
| `response.output_item.added` | `responseOutputItemAddedStreamingEventSchema` |
| `response.output_item.done` | `responseOutputItemDoneStreamingEventSchema` |
| `response.reasoning_summary_part.added` | `responseReasoningSummaryPartAddedStreamingEventSchema` |
| `response.reasoning_summary_text.delta` | `responseReasoningSummaryDeltaStreamingEventSchema` |
| `response.reasoning_summary_text.done` | `responseReasoningSummaryDoneStreamingEventSchema` |
| `response.reasoning_summary_part.done` | `responseReasoningSummaryPartDoneStreamingEventSchema` |
| `response.content_part.added` | `responseContentPartAddedStreamingEventSchema` |
| `response.output_text.delta` | `responseOutputTextDeltaStreamingEventSchema` |
| `response.output_text.done` | `responseOutputTextDoneStreamingEventSchema` |
| `response.content_part.done` | `responseContentPartDoneStreamingEventSchema` |
| `response.function_call_arguments.delta` | `responseFunctionCallArgumentsDeltaStreamingEventSchema` |
| `response.function_call_arguments.done` | `responseFunctionCallArgumentsDoneStreamingEventSchema` |
| `ResponseResource` | `responseResourceSchema` |

---

## Implementation detail

### Import block addition

Add a second import from `./generated/zod/index.js` beside the existing
type-only imports:

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

### Pattern for every yield

Before:
```typescript
yield {
    type: "response.output_item.added",
    sequence_number: seq++,
    output_index: outputIndex,
    item: ReasoningItemShape.parse({ ... }),
};
```

After:
```typescript
yield responseOutputItemAddedStreamingEventSchema.parse({
    type: "response.output_item.added",
    sequence_number: seq++,
    output_index: outputIndex,
    item: ReasoningItemShape.parse({ ... }),
});
```

The `as unknown as ResponseStreamEvent` casts are removed where `.parse()` 
return type satisfies `ResponseStreamEvent`. Where TypeScript still can't
narrow the union (because the generated schema is typed as
`z.ZodType<SpecificEvent>` and `ResponseStreamEvent` is a wide union), the
cast must be retained but now serves only as a type assertion, not a
correctness bypass — the runtime `.parse()` call provides the actual
validation.

### ResponseResource validation

```typescript
const inProgressResponse: ResponseResource = responseResourceSchema.parse({
    id: respId,
    object: "response",
    // ... all fields
});
```

Same for `invoke()` return value.

### `as unknown as ResponseStreamEvent` cast retention

Generated streaming event schemas are typed as `z.ZodType<SpecificEventType>`.
TypeScript cannot widen the `.parse()` return to `ResponseStreamEvent` union
without an explicit cast. The casts are retained as type assertions only on
events whose `.parse()` return is not assignable to `ResponseStreamEvent`
without widening. This is a TypeScript limitation, not a validation gap — the
runtime `.parse()` is the validation.

---

## Affected events — full inventory

### `streamReasoningBlock` (6 yields)
1. `response.output_item.added` → `responseOutputItemAddedStreamingEventSchema`
2. `response.reasoning_summary_part.added` → `responseReasoningSummaryPartAddedStreamingEventSchema`
3. *(in delta loop)* `response.reasoning_summary_text.delta` → `responseReasoningSummaryDeltaStreamingEventSchema`
4. `response.reasoning_summary_text.done` → `responseReasoningSummaryDoneStreamingEventSchema`
5. `response.reasoning_summary_part.done` → `responseReasoningSummaryPartDoneStreamingEventSchema`
6. `response.output_item.done` → `responseOutputItemDoneStreamingEventSchema`

### `streamMessageBlock` (6 yields)
7. `response.output_item.added` → `responseOutputItemAddedStreamingEventSchema`
8. `response.content_part.added` → `responseContentPartAddedStreamingEventSchema`
9. *(in delta loop)* `response.output_text.delta` → `responseOutputTextDeltaStreamingEventSchema`
10. `response.output_text.done` → `responseOutputTextDoneStreamingEventSchema`
11. `response.content_part.done` → `responseContentPartDoneStreamingEventSchema`
12. `response.output_item.done` → `responseOutputItemDoneStreamingEventSchema`

### `stream()` body (6 yields + inProgressResponse)
13. `inProgressResponse` construction → `responseResourceSchema.parse()`
14. `response.created` → `responseCreatedStreamingEventSchema`
15. `response.output_item.added` (function_call) → `responseOutputItemAddedStreamingEventSchema`
16. *(in args loop)* `response.function_call_arguments.delta` → `responseFunctionCallArgumentsDeltaStreamingEventSchema`
17. `response.function_call_arguments.done` → `responseFunctionCallArgumentsDoneStreamingEventSchema`
18. `response.output_item.done` (function_call) → `responseOutputItemDoneStreamingEventSchema`
19. `response.completed` → `responseCompletedStreamingEventSchema`

### `invoke()` (1 return value)
20. Return value → `responseResourceSchema.parse()`

---

## Known constraints

- Generated schemas use `zod/v4` import (not `zod`) — the scaffold uses `zod`
  import. No conflict: both resolve to the same Zod 4 instance in this project.
- Generated schemas are cast as `z.ZodType<T>` — `.parse()` is available on
  `ZodType`. No `.extend()` or `.shape` access needed here.
- The 3 hand-rolled item schemas (`ReasoningItemShape` etc.) remain in place.
  They validate the `item:` payload; the generated event schema validates the
  outer envelope. Both layers of validation are intentional.
- All scaffold code remains marked `// TODO: REMOVE BEFORE PRODUCTION` and
  `// TODO(isb-0020): Delete...`. No net change to the scaffold lifecycle.

---

## Acceptance criteria

1. `responseResourceSchema.parse()` is called on the `invoke()` return value.
2. `responseResourceSchema.parse()` is called on `inProgressResponse` before
   it is used in any yield.
3. Every one of the 18 event yields is wrapped in its corresponding generated
   schema's `.parse()` call.
4. No `as unknown as ResponseStreamEvent` cast is the only guard — each cast
   is paired with a `.parse()` call.
5. The 3 hand-rolled item schemas are retained.
6. `pnpm check` exits 0.
7. All existing tests pass (`pnpm test`).
8. No new `// biome-ignore` or `// eslint-disable` directives are introduced.
