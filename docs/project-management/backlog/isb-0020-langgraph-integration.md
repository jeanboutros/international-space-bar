# isb-0020: Integrate LangGraph director workflow behind runtime port

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-004 |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `high`       |
| Created      | 2026-04-28   |
| Dependencies | isb-0019     |

## Description

Create a `DirectorRuntimeService` that implements `AgentRuntimePort` and delegates to the existing LangGraph director workflow. Use Context7 to revalidate current LangGraph, LangChain, and DeepAgents APIs for streaming, messages, tool messages, async agents, and interrupts.

## Acceptance Criteria

- [ ] `DirectorRuntimeService` implements `AgentRuntimePort.invoke()` and `stream()`
- [ ] Calls the existing director workflow from `src/international-space-bar/workflow/`
- [ ] NestJS imports do not leak into agent/workflow/llm/tool layers
- [ ] Context7 lookup results documented in implementation notes
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/director-runtime.service.ts` (new)
- `src/international-space-bar-server/openresponses/openresponses.module.ts` (DI wiring)
