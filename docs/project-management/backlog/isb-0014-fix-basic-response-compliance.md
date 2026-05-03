# isb-0014: Fix compliance failures for basic-response filter

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-003 |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `high`       |
| Created      | 2026-04-28   |
| Dependencies | isb-0013     |

## Description

Fix all must-fix compliance failures identified in the `basic-response` filter gap analysis. Ensure the non-streaming `POST /v1/responses` response shape, status codes, error formats, and field presence match the OpenResponses spec.

## Acceptance Criteria

- [ ] All must-fix `basic-response` compliance tests pass
- [ ] Unsupported fields safely ignored or return proper OpenResponses error shape
- [ ] `pnpm check` exits 0

## Files Affected

- TBD based on gap analysis from isb-0013
