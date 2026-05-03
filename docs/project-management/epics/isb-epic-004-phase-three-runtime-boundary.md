# isb-epic-004: Phase 3 — Backend Runtime Boundary

| Field      | Value                  |
| ---------- | ---------------------- |
| Phase      | 3                      |
| Status     | `backlog`              |
| Priority   | `high`                 |
| Created    | 2026-04-28             |
| Depends on | isb-epic-003 (Phase 2) |

## Objective

Replace ping-pong internals with an internal agent runtime service backed by LangGraph/DeepAgents without changing the OpenResponses route contract. Define a framework-free runtime port and integrate the existing director workflow.

## Tickets

| Ticket   | Title                                                                       | Priority |
| -------- | --------------------------------------------------------------------------- | -------- |
| isb-0018 | Expand AgentRuntimePort with stream() and session support                   | high     |
| isb-0019 | Protocol mapper service (OpenResponses ↔ internal events)                   | high     |
| isb-0020 | Integrate LangGraph director workflow behind runtime port                   | high     |
| isb-0021 | Map OpenResponses input/instructions/previous_response_id to thread/session | high     |
| isb-0022 | Normalize LangGraph output to internal response events                      | high     |

## Acceptance Criteria

- `/v1/responses` returns a real agent final response in non-streaming mode
- `stream: true` streams normalized agent text deltas
- Ping runtime remains available as an explicit test model
- Layered dependency rules preserved (NestJS never imported in agent/workflow/llm/tool)
- Context7 used to revalidate LangGraph, LangChain, and DeepAgents APIs
- `pnpm check` and `pnpm build` exit 0
