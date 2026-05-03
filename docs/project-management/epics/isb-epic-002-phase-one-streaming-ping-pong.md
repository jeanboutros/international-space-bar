# isb-epic-002: Phase 1 — Streaming Ping-Pong

| Field      | Value                  |
| ---------- | ---------------------- |
| Phase      | 1                      |
| Status     | `backlog`              |
| Priority   | `high`                 |
| Created    | 2026-04-28             |
| Depends on | isb-epic-001 (Phase 0) |

## Objective

Prove OpenResponses streaming over `POST /v1/responses` with `stream: true`. Emit semantic SSE events (`response.created`, `response.output_text.delta`, `response.completed`) and handle connection cancellation.

## Tickets

| Ticket   | Title                                   | Priority |
| -------- | --------------------------------------- | -------- |
| isb-0009 | SSE frame writer utility                | high     |
| isb-0010 | Streaming route in ResponsesController  | high     |
| isb-0011 | Connection cancellation handling        | medium   |
| isb-0012 | Streaming tests and OpenCode validation | high     |

## Acceptance Criteria

- `curl -N` against `POST /v1/responses` with `stream: true` shows semantic OpenResponses events
- Event order is deterministic: `response.created` → output deltas → `response.completed`
- OpenCode can consume the streaming route without hanging
- `pnpm check` and `pnpm build` exit 0
