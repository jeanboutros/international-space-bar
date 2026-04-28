# isb-0010: Streaming route in ResponsesController

| Field | Value |
|-------|-------|
| Epic | isb-epic-002 |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `high` |
| Created | 2026-04-28 |
| Dependencies | isb-0009 |

## Description

Extend `POST /v1/responses` to handle `stream: true`. When streaming is requested, set SSE headers, emit `response.created`, one or more `response.output_text.delta` events (splitting "pong" into multiple deltas), and `response.completed`. Use the SSE writer from isb-0009.

## Acceptance Criteria

- [ ] `stream: true` triggers SSE response with `Content-Type: text/event-stream`
- [ ] Events emitted in order: `response.created` → output deltas → `response.completed`
- [ ] "pong" is split into multiple deltas to exercise incremental output
- [ ] Non-streaming path unchanged
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/responses.controller.ts`
- `src/international-space-bar-server/openresponses/responses.service.ts`
- `src/international-space-bar-server/openresponses/ping-pong-runtime.service.ts`
