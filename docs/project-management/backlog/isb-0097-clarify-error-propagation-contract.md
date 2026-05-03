# isb-0097 — Clarify error propagation contract in langGraphBlocks

| Field       | Value                                      |
| ----------- | ------------------------------------------ |
| ID          | isb-0097                                   |
| Status      | backlog                                    |
| Priority    | low                                        |
| Epic        | —                                          |
| Source      | Challenger review isb-epic-013 (obs. 1)    |
| Depends on  | —                                          |

## Context

The design doc AC-4 text states "Error in `streamEvents` propagates to
`ResponseStream.run()` and emits `response.failed`", but the code sample in §4
and the implementation intentionally swallow producer errors via
`await producer.catch(() => {})`. The consumer sees a clean channel end, not an
error.

## Acceptance criteria

1. Decide whether producer errors should surface to the consumer (emit
   `response.failed`) or remain swallowed (current behaviour)
2. If errors should surface: refactor producer `catch` to re-throw into the
   generator
3. Update design doc AC-4 text to match the chosen behaviour
4. Update tests to reflect the contract

## Notes

- Current behaviour is safe (no information leak, no consumer deadlock)
- Surfacing errors would require `blockChannel.error(e)` or similar mechanism
- This is a PM/design decision, not a bug
