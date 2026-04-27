# Execution Order & Dependencies

## Parallel Tracks

The TUI refactoring (Stream 1) and workflow loop (Stream 2) are **mostly independent** and can run in parallel. The intersection points are:

1. **`IWorkflowRunner` interface change** — Adding `stream()` to the interface affects both the workflow layer (Stream 2) and the TUI layer (Stream 1). This should be done first or coordinated.
2. **Store fields for workflow events** — The zustand store needs `currentIteration`, `satisfactionScore`, and workflow event fields that come from Stream 2.

## Recommended Execution Order

### Step 1 (Foundation — do first)
- Install zustand
- Create `tui/store.ts` with current fields only
- Refactor TuiApp + children to use the store
- Fix stale closure bug
- Fix scroll estimation

### Step 2 (Workflow loop — independent of Step 1 completion)
- Add iteration/satisfaction fields to DirectorState (threshold: 0.7, maxIterations: 3)
- Create `satisfaction-evaluator.ts` (uses `ollama:glm-5.1` for important evaluations)
- Add evaluate node + loop edges to director workflow
- Test with `pnpm dev`

### Step 3 (Merge point)
- Add streaming `WorkflowEvent` types to interfaces
- Add `stream()` to `IWorkflowRunner`
- Update zustand store to handle workflow events
- Wire streaming in TuiApp (replace `invoke` with `stream`)
- Add iteration/satisfaction display to StatusPane

### Step 4 (Clean up)
- Fix YAML model references
- Add model alias resolver
- Remove/archive `graph.ts`
- Run `pnpm check`

## Verification

After each step, run:
```bash
pnpm check
```

After step 2 (workflow loop), manually test:
1. Simple query → should complete in 1 iteration
2. Vague query → should loop and improve
3. Max iterations → should stop and present best result
4. Council trigger → should iterate if council verdict is unsatisfactory