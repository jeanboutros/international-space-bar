# isb-0075: Update AGENTS.md import table for @langchain/\* in server layer

| Field      | Value               |
| ---------- | ------------------- |
| Type       | `docs`              |
| Priority   | `low`               |
| Status     | `not-started`       |
| Epic       | isb-epic-011        |
| Depends on | none                |
| Raised by  | Architect (Phase A) |

## Problem

AGENTS.md's "Allowed imports per layer" table states the server layer may only
import from `interfaces/` (via port contracts) and NestJS framework. However:

1. `src/international-space-bar-server/graphs/simple-workflow.graph.ts` already
   imports `@langchain/langgraph` directly (pre-existing)
2. The Response Stream Builder design makes `@langchain/*` imports permanent in
   the server layer via `lang-graph-blocks.ts` and `wrap-as-graph.ts`

The table is inconsistent with reality and the intended architecture.

## Solution

Update AGENTS.md to clarify that runtime port implementations and graph definitions
within the server layer are permitted to import from `@langchain/*` packages for
orchestration framework types. Add a row or footnote to the imports table:

```
| `openresponses/` runtime impls | `interfaces/`, `services/`, `@langchain/*`, `generated/` |
| `graphs/`                      | `interfaces/`, `services/`, `@langchain/*`               |
```

## Acceptance criteria

- [ ] AGENTS.md import table reflects actual permitted imports for runtime/graph code
- [ ] Rationale documented (LangGraph is the mandatory orchestration layer per design)
- [ ] No functional code changes
