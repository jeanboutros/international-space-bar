# Design: Streaming Scaffold Improvements — explicit item shapes, chunk-content comment, multi-role input

## Status: DRAFT

## Date: 2026-04-29

## Scope: `src/international-space-bar-server/openresponses/ping-pong-runtime.service.ts`

---

## 1. Problem Statement

`ping-pong-runtime.service.ts` is a temporary scaffold (TODO: remove when LangGraph is wired — isb-0020). Three targeted improvements are requested while the scaffold is in use:

### 1a — Anonymous item objects are hard to debug

`streamReasoningBlock` and the main `stream()` method build event payload objects (e.g. the `item:` field of `response.output_item.added`) as anonymous inline object literals. When a Zod validation error occurs mid-stream (e.g. the `input` union bug fixed in the previous session), there is no schema-level label on the object being constructed, making it harder to identify which event payload failed.

**Requested change**: Define explicit Zod schemas for the item shapes built inside the scaffold and parse event payloads through them before yielding. This makes the shape contract explicit and causes Zod to emit a named error path (e.g. `"ReasoningItemShape.summary"`) rather than a raw structural mismatch.

### 1b — `chunk.content` type narrowing is unexplained

The expression:

```typescript
const text = typeof chunk.content === "string" ? chunk.content : "";
```

appears twice in the scaffold (in `streamReasoningBlock` and `streamMessageBlock`) with no comment. The narrowing is silent about what `chunk.content` can be when it is **not** a string, and what would be lost.

**Requested change**: Add an inline comment documenting:

- What `chunk.content` is at runtime (either a `string` for text deltas, or a `MessageContentComplex[]` for structured content — image, tool use, tool result, etc.)
- Why the non-string case is silently dropped here
- What additional handling would be needed if non-string content parts need to be forwarded

### 1c — `streamReasoningBlock` only accepts a `string` prompt

`streamReasoningBlock` calls `model.stream([new HumanMessage(prompt)])` where `prompt` is always a plain string constructed by the caller. However the agent runtime may need to stream reasoning in the context of:

- A system message (e.g. `SystemMessage` — sets the LLM's persona/context)
- A user message (`HumanMessage`)
- A function call result (`ToolMessage`) — the LLM reasons about what a tool returned

Passing only a `HumanMessage` wrapping a string means function-call results cannot be naturally expressed and system context cannot be set, producing lower-quality reasoning in the scaffold.

**Requested change**: Generalise `streamReasoningBlock`'s `prompt` parameter to accept a `BaseMessage[]` (from `@langchain/core/messages`) rather than a plain `string`. Callers construct the message array explicitly (e.g. `[new SystemMessage("..."), new HumanMessage("...")]` or `[new HumanMessage("..."), new ToolMessage({...})]`). Update all call sites.

---

## 2. Proposed Implementation

### 2a — Explicit Zod schemas for item shapes

Define small, local Zod schemas for the item objects that appear in `response.output_item.added` / `.done` events. These schemas live at the top of the scaffold file (clearly marked `// SCAFFOLD TYPES — delete with file`) and are used to `.parse()` item payloads before they are yielded.

```typescript
// SCAFFOLD TYPES — delete with file (TODO isb-0020)
const ReasoningItemShape = z.object({
    id: z.string(),
    type: z.literal("reasoning"),
    summary: z.array(z.unknown()),
    content: z.array(z.unknown()).optional(),
});

const MessageItemShape = z.object({
    id: z.string(),
    type: z.literal("message"),
    status: z.enum(["in_progress", "completed"]),
    role: z.literal("assistant"),
    content: z.array(z.unknown()),
});

const FunctionCallItemShape = z.object({
    id: z.string(),
    type: z.literal("function_call"),
    call_id: z.string(),
    name: z.string(),
    arguments: z.string(),
    status: z.enum(["in_progress", "completed"]),
});
```

Usage (example):

```typescript
yield {
    type: "response.output_item.added",
    sequence_number: seq++,
    output_index: outputIndex,
    item: ReasoningItemShape.parse({
        id: reasoningId,
        type: "reasoning",
        summary: [],
        content: [],
    }),
};
```

The `.parse()` call throws a `ZodError` with a named path if the shape is wrong, surfacing structural bugs earlier and with clearer error messages.

### 2b — `chunk.content` inline comment

Replace the silent type narrowing with a documented version:

```typescript
// chunk.content is either a plain string (streaming text delta) or a MessageContentComplex[]
// (e.g. [{type:"image_url",...}], [{type:"tool_use",...}], [{type:"tool_result",...}]).
// The non-string case occurs when the LLM returns structured content parts — multi-modal
// responses, tool call descriptions, or tool results forwarded from the input.
// Currently dropped silently ("") because this scaffold only forwards text deltas.
// TODO(isb-0020): When LangGraph is wired, route non-string content parts through
// the appropriate streaming event type (e.g. image content → response.output_item.added
// with type:"image_url", tool call → response.function_call_arguments.delta).
const text = typeof chunk.content === "string" ? chunk.content : "";
```

### 2c — Generalise `streamReasoningBlock` to `BaseMessage[]`

Change signature:

```typescript
// Before
async function* streamReasoningBlock(
    model: typeof llm,
    prompt: string,
    outputIndex: number,
): AsyncIterable<ResponseStreamEvent>

// After
async function* streamReasoningBlock(
    model: typeof llm,
    messages: BaseMessage[],
    outputIndex: number,
): AsyncIterable<ResponseStreamEvent>
```

Update internal call:

```typescript
// Before
for await (const chunk of await model.stream([new HumanMessage(prompt)])) {

// After
for await (const chunk of await model.stream(messages)) {
```

Update call sites (3 total in the `stream()` method):

```typescript
// OUTPUT 0
yield *
    streamReasoningBlock(
        llm,
        [new HumanMessage(`Think step by step about what the user is asking: ${request.input}`)],
        0,
    );

// OUTPUT 2
yield *
    streamReasoningBlock(
        llm,
        [new HumanMessage(`Think about what tool you need to fully answer: ${request.input}`)],
        2,
    );

// OUTPUT 4 — demonstrates ToolMessage context after function call
yield *
    streamReasoningBlock(
        llm,
        [
            new HumanMessage(String(request.input)),
            new ToolMessage({
                content: `{"temperature": 22, "unit": "celsius", "description": "Partly cloudy"}`,
                tool_call_id: callId,
                name: "get_weather",
            }),
            new HumanMessage("Reflect on the tool result and how to use it in your answer."),
        ],
        4,
    );
```

Imports to add:

```typescript
import { z } from "zod";
import { BaseMessage, HumanMessage, ToolMessage } from "@langchain/core/messages"; // TODO: REMOVE BEFORE PRODUCTION
```

---

## 3. Files affected

- `src/international-space-bar-server/openresponses/ping-pong-runtime.service.ts` — only file changed

## 4. Constraints

- All changes are within the scaffold. The `// TODO(isb-0020): Delete this file` markers remain.
- No new dependencies — `@langchain/core/messages` is already imported (`HumanMessage`).
- `zod` is already an installed project dependency — `import { z } from 'zod'` must be added to the file.
- `pnpm check` must exit 0.
- All existing tests must pass.
- The Zod schemas are local to the file (not exported) and carry `// SCAFFOLD TYPES` comments.

## 5. Out of scope

- `streamMessageBlock` signature generalisation (similar change but not requested)
- Handling non-string `chunk.content` beyond the comment
- Replacing scaffold with LangGraph (isb-0020)
