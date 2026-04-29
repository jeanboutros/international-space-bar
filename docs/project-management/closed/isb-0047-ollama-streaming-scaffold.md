# isb-0047: Ollama streaming scaffold for `ping-pong-runtime.service.ts`

## Status
open

## Epic
(none — standalone)

## Summary
Replace the static hardcoded SSE sequence in `PingPongRuntimeService.stream()` with six real `ChatOllama` LLM calls that produce a live, ordered `reasoning → message → reasoning → function_call → reasoning → message` event stream. This is explicitly temporary scaffold code and must be removed when the LangGraph runtime is wired (see isb-0020).

## Background
The current `stream()` implementation returns a fixed array of hardcoded SSE frames so that the OpenResponses endpoint returns *something* while the real agent runtime is being built. Phase A validation confirmed the existing shape is correct but the content is entirely static. This ticket upgrades the scaffold to fire actual Ollama inference calls so the streaming pipeline can be exercised end-to-end with real model output before LangGraph takes over. Because the dependency (`@langchain/ollama`) is dev-only and all ChatOllama references are surrounded by `// TODO: REMOVE BEFORE PRODUCTION` markers, it can never accidentally be promoted to production.

## Acceptance criteria
- [ ] `stream()` in `ping-pong-runtime.service.ts` fires exactly 6 sequential `ChatOllama` calls using model `gemma4:e2b` at `http://localhost:11434`
- [ ] `ChatOllama` is imported solely from `@langchain/ollama`; no imports from `src/international-space-bar/` are introduced
- [ ] Every `ChatOllama` instantiation and call site carries the comment `// TODO: REMOVE BEFORE PRODUCTION`
- [ ] Every chunk content read is guarded: `typeof chunk.content === "string" ? chunk.content : ""`
- [ ] `reasoning_summary_part.added` events include `{ type: "summary_text", text: "" }` as their `delta.summary_part` value
- [ ] `reasoning_summary_part.done` events include the full accumulated text: `{ type: "summary_text", text: <accumulated> }` and the containing `ReasoningBody` includes `summary: [{ type: "summary_text", text: <accumulated> }]`
- [ ] `ReasoningBody` on `reasoning_summary.added` events includes `summary: []`
- [ ] Event output indices are assigned 0–5 matching the position in the sequence
- [ ] The file carries a file-level scaffold comment, a method-level comment on `stream()`, six per-section divider comments, and a removal anchor comment `// TODO(isb-0020): remove when LangGraph wired`
- [ ] `@langchain/ollama` remains in `devDependencies` only — the `pnpm check` gate must pass
- [ ] `pnpm check` exits 0 after the change (Biome + ESLint)
- [ ] Unit/integration test `responses.controller.stream.test.ts` exists, uses a mocked service (no live Ollama), asserts 6 SSE frames in the correct order, and passes with `pnpm test`
- [ ] Manual smoke script `scripts/test-api-responses-stream.mjs` exists, requires `ISB_OPENRESPONSES_API_KEY` env var, and is guarded to exit early if the var is absent
- [ ] `smoke.test.ts` is not modified

## Technical notes

### Phase A mandatory conditions
1. **Import boundary** — `ChatOllama` comes from `@langchain/ollama` only. Do not reach into `src/international-space-bar/` for any LLM infrastructure; this is isolated scaffold code.
2. **Chunk guard** — all `chunk.content` reads must use `typeof chunk.content === "string" ? chunk.content : ""` to prevent type errors on non-string content.
3. **`reasoning_summary_part.added`** — `delta.summary_part` must be `{ type: "summary_text", text: "" }` (empty text on add event).
4. **`reasoning_summary_part.done`** — `delta.summary_part` must be `{ type: "summary_text", text: <fullAccumulated> }` containing the complete streamed text.
5. **`ReasoningBody.summary`** — `reasoning_summary.added` must include `summary: []`; `reasoning_summary.done` must include `summary: [{ type: "summary_text", text: <fullAccumulated> }]`.
6. **Removal markers** — every ChatOllama reference requires `// TODO: REMOVE BEFORE PRODUCTION`.

### Event sequence (output indices 0–5)
| Index | Event family | LLM call |
|-------|-------------|----------|
| 0 | `reasoning` | call 1 — intro reasoning |
| 1 | `message` | call 2 — first assistant message |
| 2 | `reasoning` | call 3 — mid reasoning |
| 3 | `function_call` | call 4 — tool invocation, arguments from model output |
| 4 | `reasoning` | call 5 — post-tool reasoning |
| 5 | `message` | call 6 — final assistant message |

### LLM call structure
- Provider: `ChatOllama` from `@langchain/ollama`
- Model: `gemma4:e2b`
- Base URL: `http://localhost:11434` (localhost Ollama instance)
- Each call is `await llm.stream(prompt)` — accumulated via async iteration
- Function call arguments (index 3) are read from the raw model output string and passed through unchanged

## Test plan

### Integration test — `src/international-space-bar-server/openresponses/responses.controller.stream.test.ts`
- Does **not** require a live Ollama instance
- Mocks `PingPongRuntimeService.stream()` to return a deterministic 6-item async iterable
- Sends a POST to the streaming endpoint and collects SSE frames
- Asserts: exactly 6 `data:` lines, correct event type order (`reasoning`, `message`, `reasoning`, `function_call`, `reasoning`, `message`), valid JSON on each frame, correct `output_index` values 0–5
- Must pass in CI with `pnpm test`

### Manual smoke script — `scripts/test-api-responses-stream.mjs`
- Standalone Node.js ESM script, no test runner dependency
- Guards on `ISB_OPENRESPONSES_API_KEY` env var — exits with a clear message if absent
- Starts the server, sends a streaming request, prints each SSE frame to stdout
- Requires a live Ollama instance with `gemma4:e2b` loaded
- Not run in CI

## Out of scope
- Replacing or modifying the real agent runtime (`src/international-space-bar/`) — all changes are confined to `ping-pong-runtime.service.ts` and the new test/script files
- Wiring LangGraph (that is isb-0020)
- Promoting `@langchain/ollama` to production dependencies
- Changing `smoke.test.ts`
- Any changes to OpenResponses schema, controllers, or other services

## Files to change
| File | Change |
|------|--------|
| `src/international-space-bar-server/openresponses/ping-pong-runtime.service.ts` | Replace static SSE sequence with 6 `ChatOllama` calls |
| `src/international-space-bar-server/openresponses/responses.controller.stream.test.ts` | **New** — integration test, mocked service |
| `scripts/test-api-responses-stream.mjs` | **New** — manual smoke script, requires live Ollama |

## Assignee
Engineer

## Priority
medium

## Type
feature

## Dependencies
- isb-0020 (LangGraph integration) — this ticket's code is deleted when that ticket lands
