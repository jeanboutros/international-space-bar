# isb-0077: Add `responseIncompleteStreamingEventSchema` to `ResponseStreamEvent` union

| Field      | Value         |
| ---------- | ------------- |
| Type       | `feature`     |
| Priority   | `high`        |
| Status     | `not-started` |
| Epic       | isb-epic-011  |
| Depends on | —             |

## Description

The `ResponseStreamEvent` union in `responses.types.ts` is missing the
`responseIncompleteStreamingEventSchema` variant. Add the import and include it
in the union so that `response.incomplete` events can be emitted by
`ResponseStream`.

## Files affected

- `src/international-space-bar-server/openresponses/responses.types.ts` — add import and union member

## Acceptance criteria

- [ ] AC-1: `responseIncompleteStreamingEventSchema` is imported and included in the `ResponseStreamEvent` union
- [ ] AC-2: `pnpm check` exits 0
