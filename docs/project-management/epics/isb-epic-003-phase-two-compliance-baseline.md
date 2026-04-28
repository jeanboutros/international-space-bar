# isb-epic-003: Phase 2 — OpenResponses Compliance Baseline

| Field | Value |
|-------|-------|
| Phase | 2 |
| Status | `backlog` |
| Priority | `high` |
| Created | 2026-04-28 |
| Depends on | isb-epic-002 (Phase 1) |

## Objective

Make the backend compatible with the OpenResponses compliance suite for `basic-response` and `streaming-response` filters. Pin the OpenAPI version, run compliance tests, and document the supported subset.

## Tickets

| Ticket | Title | Priority |
|--------|-------|----------|
| isb-0013 | Run OpenResponses compliance suite and document gaps | high |
| isb-0014 | Fix compliance failures for basic-response filter | high |
| isb-0015 | Fix compliance failures for streaming-response filter | high |
| isb-0016 | Add /v1/responses/compact stub or implementation | medium |
| isb-0017 | Automated smoke tests for non-streaming and streaming | high |

## Acceptance Criteria

- Compliance runner passes for `basic-response` and `streaming-response` filters
- Supported OpenResponses subset is documented in the repo
- Unsupported fields are safely ignored, preserved, or rejected with proper error shape
- `pnpm check` and `pnpm build` exit 0
