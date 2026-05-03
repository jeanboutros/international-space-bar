# isb-epic-005: Phase 4 — Tools, Tool Messages, and Approvals

| Field      | Value                  |
| ---------- | ---------------------- |
| Phase      | 4                      |
| Status     | `backlog`              |
| Priority   | `medium`               |
| Created    | 2026-04-28             |
| Depends on | isb-epic-004 (Phase 3) |

## Objective

Support tool calls, tool messages, and simple approve/reject approvals. Map LangChain `AIMessage` tool calls and `ToolMessage` results into stable internal event envelopes. Decide how backend-owned interrupts map to OpenResponses and OpenCode.

## Tickets

| Ticket   | Title                                                           | Priority |
| -------- | --------------------------------------------------------------- | -------- |
| isb-0023 | Map LangChain tool calls to internal event envelopes            | high     |
| isb-0024 | Map ToolMessage results to OpenResponses function_call_output   | high     |
| isb-0025 | Approvals module (approve-once, reject, reject-with-feedback)   | medium   |
| isb-0026 | Interrupt handling with Command({ resume }) behind runtime port | medium   |

## Acceptance Criteria

- Backend-created approval request can pause a run
- Client decision can resume or reject the run
- Tool call IDs and interrupt IDs visible in logs and stream events
- OpenResponses output remains valid for clients that do not understand native approval extension
- `pnpm check` and `pnpm build` exit 0

## Notes

This phase may require a clarification or ADR. OpenCode has its own tool permission model and OpenResponses has its own function/tool call shapes. The pipeline must decide whether approvals are OpenResponses tool calls, a native side-channel endpoint, or both.
