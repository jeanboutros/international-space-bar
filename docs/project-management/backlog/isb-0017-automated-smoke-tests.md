# isb-0017: Automated smoke tests for non-streaming and streaming

| Field        | Value              |
| ------------ | ------------------ |
| Epic         | isb-epic-003       |
| Status       | `backlog`          |
| Assignee     | Tester             |
| Priority     | `high`             |
| Created      | 2026-04-28         |
| Dependencies | isb-0014, isb-0015 |

## Description

Add automated smoke tests that validate the full OpenResponses contract for both non-streaming and streaming modes. These serve as a lightweight local compliance check that runs without the full upstream compliance suite.

## Acceptance Criteria

- [ ] Smoke test for non-streaming: validates response shape, status, all required fields
- [ ] Smoke test for streaming: validates event types, ordering, delta content
- [ ] Tests run as part of `pnpm test`
- [ ] Tests document which OpenResponses subset is covered
- [ ] `pnpm check` exits 0

## Files Affected

- `scripts/smoke-test-responses.mjs` (new) or inline test files
