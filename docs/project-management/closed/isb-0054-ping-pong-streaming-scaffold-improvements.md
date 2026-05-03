# isb-0054: Add explicit Zod schemas, document chunk.content, and generalise streamReasoningBlock to BaseMessage[]

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-002 |
| Type         | `feature`    |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `medium`     |
| Created      | 2026-04-29   |
| Completed    | —            |
| Dependencies | none         |

## Description

Three tightly-coupled improvements to `ping-pong-runtime.service.ts` (scaffold), grouped into a single ticket because they touch the same file and splitting would create unnecessary overhead. All changes are scaffold-scoped and will be deleted when isb-0020 (LangGraph integration) lands.

1. **Explicit Zod schemas** — replace inline `as` casts with local Zod schemas for each output item type (`reasoning`, `message`, `function_call`). Schemas are marked with a `// SCAFFOLD TYPES — delete with file (TODO isb-0020)` banner so they are trivially removed.

2. **Document `chunk.content` type-narrowing** — the `typeof chunk.content !== "string"` guard in both `streamReasoningBlock` and `streamMessageBlock` is currently undocumented. Add an inline comment explaining the runtime type (`MessageContentComplex[]`), why non-string content is dropped, and what would be needed to forward it.

3. **Generalise `streamReasoningBlock` to `BaseMessage[]`** — changes the `prompt: string` parameter to `messages: BaseMessage[]` so callers can pass full conversation histories (including `ToolMessage` results). Updates all three call sites; OUTPUT 4 uses a `ToolMessage` to provide the tool result context to the final reasoning step.

## Acceptance Criteria

- [ ] Zod schemas defined locally at the top of `ping-pong-runtime.service.ts`, marked `// SCAFFOLD TYPES — delete with file (TODO isb-0020)`:
    ```typescript
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
- [ ] All `item:` payloads in `response.output_item.added` and `response.output_item.done` events are passed through the corresponding schema's `.parse()` before yielding — `streamReasoningBlock` uses `ReasoningItemShape`, `streamMessageBlock` uses `MessageItemShape`, the OUTPUT 3 function_call block uses `FunctionCallItemShape`
- [ ] The `chunk.content` type-narrowing line in both `streamReasoningBlock` and `streamMessageBlock` has an inline comment documenting: (a) what `chunk.content` is at runtime when not a string (`MessageContentComplex[]`), (b) why non-string is dropped here, (c) what additional handling would be needed to forward non-string content parts
- [ ] `streamReasoningBlock` signature changed to accept `messages: BaseMessage[]` instead of `prompt: string`; internal `model.stream([new HumanMessage(prompt)])` replaced with `model.stream(messages)`
- [ ] Import updated to `import { BaseMessage, HumanMessage, ToolMessage } from "@langchain/core/messages"; // TODO: REMOVE BEFORE PRODUCTION` (replaces current `HumanMessage`-only line)
- [ ] `import { z } from "zod"` added to the file
- [ ] All 3 call sites updated with `BaseMessage[]` arrays; OUTPUT 4 uses a `ToolMessage({ content: "...", tool_call_id: callId, name: "get_weather" })` that provides the tool result context to the final reasoning step
- [ ] `pnpm check` exits 0
- [ ] All existing 69 tests pass (`ISB_PROJECT_ENVIRONMENT=test pnpm test` exits 0)

## Testing Decision

**No new test file required.**

Rationale: this scaffold is deleted when isb-0020 lands. The Zod `.parse()` path is a developer-ergonomics feature — it throws a `ZodError` with a named path on malformed payloads during development. TypeScript static checks via `pnpm check` plus the existing `responses.controller.test.ts` B-4 regression guard are sufficient acceptance gates. Adding `mock.module('@langchain/ollama')` or equivalent module-level mocks for a temporary file would create maintenance overhead with zero long-term value.

_Flag resolution: Test Planner flag "Testing strategy for PingPongRuntimeService.stream()" → Option 3 accepted._

## Files Affected

- `src/international-space-bar-server/openresponses/ping-pong-runtime.service.ts` — only file (Zod schemas, import updates, signature change, inline comments, call-site updates)

## Comments

Docs Planner confirmed: no documentation artifacts needed. The inline comments ARE the documentation for this scaffold.
