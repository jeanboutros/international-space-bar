# Repository Analysis — Session 2026-04-27

## Architecture Summary

The project is an agent orchestration platform (International Space Bar) using:

- **Runtime**: Node.js 22, TypeScript 5 (strict ESM)
- **Agent Framework**: `deepagents` (built on LangChain/LangGraph) for individual agent execution
- **Orchestration**: Custom LangGraph `StateGraph` workflows (director + council)
- **TUI**: React + Ink (terminal UI)
- **LLM**: Ollama (local models, currently `gemma4:e2b`)
- **State**: No global state management — all TUI state is `useState` inside `TuiApp.tsx`
- **Validation**: Zod 4

---

## Stream 1: TUI — Issues Found

### Critical Problems

1. **No global state management** — All state lives in `TuiApp.tsx` via `useState`:
    - `messages`, `isProcessing`, `currentInterrupt`, `tokenUsage`
    - State is prop-drilled to children (`MessageList`, `InputBar`, `StatusPane`, `LogPane`, `InterruptPrompt`)
    - No way for non-component code (e.g. workflow callbacks, event listeners) to update state without passing setters
    - Race conditions: `handleSubmit` reads stale `currentInterrupt` from closure (line 84 checks `currentInterrupt` but the callback captures it at registration time)

2. **Stale closure bug in `handleSubmit`** — `TuiApp.tsx:84`:

    ```ts
    if (!currentInterrupt) {
        // ← reads captured value, not live state
        setIsProcessing(false);
    }
    ```

    If an interrupt arrives during processing, `isProcessing` never resets to `false`.

3. **Scroll state is message-count-based, not line-based** — `MessageList.tsx:27`:

    ```ts
    const approxVisible = Math.max(1, Math.floor(boxHeight / (1 + layout.messageGap)));
    ```

    Assumes each message ≈ 1 line. Multi-line messages cause incorrect viewport calculations.

4. **No streaming support** — `workflow.invoke()` is fully blocking. The TUI shows "Agent is thinking..." with no progress updates until the entire workflow completes. For long-running workflows (council with 5 advisors + 5 reviewers + chairman), this means minutes of silence.

5. **Keyboard conflicts** — Both `MessageList` and `InputBar` register `useInput` handlers. Ink's `useInput` is global — both fire on every keystroke. `PageUp/PageDown` for messages could interfere.

6. **LogPane polling via EventEmitter** — The ring buffer emitter triggers `setAllLines` on every log line, causing re-renders even when the log pane is scrolled away.

7. **No error boundary** — If any component throws, the entire Ink tree crashes with no recovery.

8. **Missing features**:
    - No way to cancel a running workflow
    - No conversation history persistence
    - No notification when workflow completes

### State Management Recommendation

**Zustand** is the best fit because:

- **No providers** — Ink's reconciler doesn't support React Context well; zustand works with bare `useStore` hooks
- **External access** — `store.getState()` / `store.setState()` callable from anywhere (workflow callbacks, event listeners)
- **Selectors** — Each component subscribes only to the slice it needs, cutting re-renders
- **Devtools** — `zustand/middleware` for logging and persistence
- **Alternatives considered**:
    - Jotai: requires `Provider` wrapping, fragile with Ink
    - Redux/RTK: overkill for terminal UI
    - Nanostores: less ecosystem than zustand

---

## Stream 2: AI Workflow — Issues Found

### Implemented Agents (fully working)

| Agent                  | Status  | Notes                                                        |
| ---------------------- | ------- | ------------------------------------------------------------ |
| `agency-director`      | Working | YAML config loaded; routing is in the graph, not the agent   |
| `orchestrator`         | Working | Executes queries with `web_fetch` + `get_weather` tools      |
| `reasoner`             | Working | Chain-of-thought with `reasoning` + `assumption-trap` skills |
| `council.conductor`    | Working | Frames questions for council deliberation                    |
| `council.sub.advisor`  | Working | Receives identity + framed question, produces analysis       |
| `council.sub.reviewer` | Working | Peer-reviews anonymised advisor responses                    |
| `council.sub.chairman` | Working | Synthesises verdict from advisors + reviews                  |

### Implemented Workflows (fully working)

| Workflow               | Notes                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `director.workflow.ts` | classifyIntent → orchestrator/reasoning/council → councilGate → present → END                          |
| `council.workflow.ts`  | frameQuestion → 5 advisors (parallel) → anonymise → 5 reviewers (parallel) → chairman → generateReport |

### Critical Missing Features

1. **No iterative refinement loop** — The workflow is strictly linear. No mechanism to evaluate output and loop back for improvement.

2. **No quality gate / satisfaction check** — After `present`, the graph goes to `END`. No node evaluates whether output is satisfactory.

3. **No self-correction** — If the orchestrator or reasoner produces a poor result, only path forward is through the council gate (optional) or manual resubmission.

4. **`graph.ts` is dead code** — Older standalone test graph not connected to the main flow.

5. **Model references in YAML use shorthand** (`opus`, `sonnet`) that don't match the `ollama:model` format expected by `createOllamaLLM` or `deepagents`. The `council.conductor` uses `model: "opus"` which likely fails at runtime.

6. **No progress streaming** — No intermediate events during execution. For council (5+5+1 LLM calls), long wait.

7. **Director prompt claims routing is in the graph** — True, but the agent is loaded with `createDeepAgent` which has its own tool-calling loop. Duplicated routing logic.

### Missing Loop Design (User Requirement)

"the workflow should handle an input, and should loop until a satisfactory outcome has been produced."

This requires:

- A **satisfaction evaluator** node that assesses output quality
- A **conditional edge** back to the execution path when quality is below threshold
- A **max iterations** guard to prevent infinite loops
- **Iteration tracking** in the state schema
- **Streaming/progress** so the user sees each iteration
