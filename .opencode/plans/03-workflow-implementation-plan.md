# Implementation Plan — Stream 2: AI Workflow Iterative Loop

## Overview

Add an iterative refinement loop to the director workflow so it evaluates the quality of each output and re-executes when the result is unsatisfactory, up to a configurable max iteration count.

## Current Flow (Linear)

```
START → classifyIntent → [orchestrator|reasoning|council] → councilGate → [council|present] → END
```

## Proposed Flow (Iterative)

```
START → classifyIntent → [orchestrator|reasoning|council] → councilGate → [council|evaluate] → evaluate → ─┐
                                                                                    │
                                                              unsatisfied + below max  ──┘
                                                                                    │
                                                              satisfied or max reached → present → END
```

## Phase 1: Extend Director State

Add to `director.state.ts`:

```ts
iteration: z.number().default(0),
maxIterations: z.number().default(3),
satisfactionScore: z.number().min(0).max(1).default(0),
feedback: z.string().default(""),
```

- `iteration` — current loop count
- `maxIterations` — configurable guard (default 3)
- `satisfactionScore` — 0–1 score from the evaluator
- `feedback` — evaluator's reasoning for why the output is unsatisfactory (fed back into next iteration)

## Phase 2: Create the Satisfaction Evaluator

**New file**: `src/international-space-bar/agent/satisfaction-evaluator.ts`

A structured-output LLM call that evaluates an outcome against the original query:

```ts
const SatisfactionSchema = z.object({
  score: z.number().min(0).max(1).describe("0 = completely unsatisfied, 1 = fully satisfied"),
  feedback: z.string().describe("Specific reasons why the output is unsatisfactory, or 'Satisfactory' if score >= 0.7"),
});
```

The evaluator receives:
- The original user query
- The current outcome
- The iteration number
- Any previous feedback

Its job is to assess:
1. **Completeness** — Did the response address all parts of the query?
2. **Accuracy** — Are claims verifiable or well-reasoned?
3. **Clarity** — Is the response clear and well-structured?
4. **Actionability** — Can the user act on this response?

Score threshold (configurable): `score >= 0.7` → satisfied

## Phase 3: Add the Evaluate Node

**Modify**: `director.workflow.ts`

New node:

```ts
const evaluate: DirectorNode = async (state) => {
  if (state.iteration >= state.maxIterations) {
    logger.info({ iteration: state.iteration }, "Max iterations reached, accepting result");
    return { satisfactionScore: 1 };
  }

  const { score, feedback } = await evaluateSatisfaction(
    state.query, state.outcome, state.iteration, state.feedback, config
  );

  logger.info({ score, feedback, iteration: state.iteration }, "Satisfaction evaluation");

  return {
    satisfactionScore: score,
    feedback: score < SATISFACTION_THRESHOLD ? feedback : "",
    iteration: state.iteration + 1,
  };
};
```

## Phase 4: Add Conditional Edges for the Loop

The `evaluate` node becomes the new convergence point after councilGate or direct execution. Its routing:

```ts
const routeAfterEvaluate: ConditionalEdgeRouter<...> = (state) => {
  if (state.satisfactionScore >= SATISFACTION_THRESHOLD) return "present";
  if (state.iteration >= state.maxIterations) return "present";

  // Route back to the original execution path based on intent
  logger.info({ iteration: state.iteration }, "Re-executing with feedback");
  if (state.intent === "council") return "council";
  if (state.intent === "reasoning") return "reasoning";
  return "orchestrator";
};
```

The feedback from the evaluator is injected into the next execution:
- For **orchestrator**: appended to the query as `Previous attempt feedback: ...`
- For **reasoning**: prepended as a constraint
- For **council**: added to the raw question passed to the council

## Phase 5: Update the Graph Edges

```ts
// After councilGate, always go to evaluate
.addEdge("councilGate", "evaluate")

// After direct council (intent === "council"), evaluate
.addEdge("council", "evaluate")

// Evaluate routes: back to execution OR to present
.addConditionalEdges("evaluate", routeAfterEvaluate, [
  "orchestrator", "reasoning", "council", "present"
])

// present → END (unchanged)
.addEdge("present", END)
```

Remove the old direct edge from `councilGate` to `council` or `present` — now `councilGate → evaluate` always, and `evaluate` handles the routing.

## Phase 6: Feedback Injection

When looping back, the query must carry feedback. Two approaches:

**Option A (Recommended): Augment the query in the state**
```ts
// In the evaluate node, when score < threshold:
const enhancedQuery = state.feedback
  ? `${state.query}\n\n[Refinement feedback from iteration ${state.iteration}: ${state.feedback}]`
  : state.query;
return { ...result, query: enhancedQuery };
```

**Option B: Pass feedback as separate state field** — more explicit but requires all execution nodes to read it.

I recommend Option A — keeps the contract simple since execution nodes already receive `state.query`.

## Phase 7: Fix Model References in YAML

The council agents use shorthand model names (`opus`, `sonnet`) but the system expects `ollama:model` format:

| YAML | Current | Should be |
|------|---------|-----------|
| `council.conductor.yaml` | `model: "opus"` | `model: "ollama:glm-5.1"` |
| `council.sub.advisor.yaml` | `model: "sonnet"` | Remove model override (uses defaultModel) |
| `council.sub.reviewer.yaml` | `model: "opus"` | `model: "ollama:glm-5.1"` |
| `council.sub.chairman.yaml` | `model: "opus"` | `model: "ollama:glm-5.1"` |

**Approach**: Add a model alias resolver in `agent-loader.ts`. The mapping uses `ollama:glm-5.1` as the "important task" model (chairman, conductor, reviewer — high-quality roles) and the app's `defaultModel` for everything else:

| Alias | Resolves to |
|-------|-------------|
| `opus` | `ollama:glm-5.1` |
| `sonnet` | (config `defaultModel`, currently `ollama:gemma4:e2b`) |
| `haiku` | (config `defaultModel`) |

This mapping is centralized so adding cloud models later only requires updating the resolver.

## Phase 8: Streaming / Progress Events

To support the TUI showing progress during long-running workflows:

1. Extend `IWorkflowRunner` to support event emission:
   ```ts
   export interface IWorkflowRunner {
     invoke(query: string): Promise<WorkflowResult>;
     stream(query: string): AsyncIterable<WorkflowEvent>;
   }
   ```

2. Use LangGraph's `.stream()` instead of `.invoke()` for the director workflow
3. The zustand store's `addMessage` method can receive streaming chunks
4. Each node transition emits an event:

```ts
type WorkflowEvent =
  | { type: "node_start"; node: string; iteration?: number }
  | { type: "node_complete"; node: string; output?: string }
  | { type: "satisfaction_check"; score: number; iteration: number }
  | { type: "loop_retry"; iteration: number; feedback: string }
  | { type: "complete"; result: WorkflowResult };
```

## Phase 9: Clean Up Dead Code

- Archive `graph.ts` to `archive/graph.ts` for reference

## File Changes Summary

| Action | File |
|--------|------|
| Modify | `workflow/director.state.ts` — add iteration, satisfaction fields |
| Create | `agent/satisfaction-evaluator.ts` — structured-output evaluator |
| Modify | `workflow/director.workflow.ts` — add evaluate node + loop edges |
| Modify | `interfaces/agent.interface.ts` — add WorkflowEvent, stream method |
| Modify | `agent/agent-loader.ts` — add model alias resolution |
| Modify | `.agents/agents/council.conductor.yaml` — fix model |
| Modify | `.agents/agents/council.sub.advisor.yaml` — fix model |
| Modify | `.agents/agents/council.sub.reviewer.yaml` — fix model |
| Modify | `.agents/agents/council.sub.chairman.yaml` — fix model |
| Delete/Archive | `graph.ts` — dead code |