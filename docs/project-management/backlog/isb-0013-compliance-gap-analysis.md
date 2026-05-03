# isb-0013: Run OpenResponses compliance suite and document gaps

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-003 |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `high`       |
| Created      | 2026-04-28   |
| Dependencies | isb-0012     |

## Description

Set up the OpenResponses compliance test runner against the local backend. Run the `basic-response` and `streaming-response` filters, document all failures, and create a gap analysis with prioritized fix list.

## Acceptance Criteria

- [ ] Compliance runner executes against `http://127.0.0.1:3000/v1`
- [ ] All test results documented in a gap analysis file
- [ ] Failures categorized as: must-fix, nice-to-fix, out-of-scope
- [ ] Repeatable command documented in repo
- [ ] `pnpm check` exits 0

## Files Affected

- `docs/compliance-gap-analysis.md` (new)
- `package.json` (optional: add compliance script)
