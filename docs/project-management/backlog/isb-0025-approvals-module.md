# isb-0025: Approvals module (approve-once, reject, reject-with-feedback)

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-005 |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `medium`     |
| Created      | 2026-04-28   |
| Dependencies | isb-0024     |

## Description

Add an approvals module that supports approve-once, reject, and reject-with-feedback flows. Backend-created approval requests pause a run. Client decisions resume or reject. May require a clarification or ADR to decide representation (OpenResponses tool calls, native side-channel, or both).

## Acceptance Criteria

- [ ] Approval request can pause a run
- [ ] Client decision resumes or rejects the run
- [ ] Three modes: approve-once, reject, reject-with-feedback
- [ ] OpenResponses output remains valid for clients unaware of approval extension
- [ ] `pnpm check` exits 0

## Notes

May require ADR. OpenCode has its own tool permission model, and OpenResponses has its own function/tool call shapes. The pipeline must decide the approval representation.

## Files Affected

- TBD (new module under openresponses/ or separate approvals/ directory)
