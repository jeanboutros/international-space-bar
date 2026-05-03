# isb-0088: Loosen item shapes for `"incomplete"` status

| Field      | Value         |
| ---------- | ------------- |
| Type       | `feature`     |
| Priority   | `medium`      |
| Status     | `not-started` |
| Epic       | isb-epic-011  |
| Depends on | —             |

## Description

`MessageItemShape` and `FunctionCallItemShape` currently only accept
`"completed"` as a status value. Widen the status field to also accept
`"incomplete"` so that `ResponseStream` can emit partial items when a stream
is cancelled or errors mid-flight (per OpenAI Responses spec).

## Files affected

- Item shape definition files (e.g. `responses.types.ts` or dedicated shape files) — widen status union to include `"incomplete"`

## Acceptance criteria

- [ ] AC-1: `MessageItemShape` accepts `status: "completed" | "incomplete"`
- [ ] AC-2: `FunctionCallItemShape` accepts `status: "completed" | "incomplete"`
- [ ] AC-3: Existing code that sets `status: "completed"` continues to compile
- [ ] AC-4: `pnpm check` exits 0
