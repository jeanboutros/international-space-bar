# isb-0098 — Remove inaccurate "errors are logged" comment

| Field       | Value                                      |
| ----------- | ------------------------------------------ |
| ID          | isb-0098                                   |
| Status      | backlog                                    |
| Priority    | low                                        |
| Epic        | —                                          |
| Source      | Challenger review isb-epic-013 (obs. 2)    |
| Depends on  | —                                          |

## Context

Line ~224 in `lang-graph-blocks.ts` contains the comment "Producer errors are
logged inside the producer itself" but no logging statements exist in the
producer IIFE.

## Acceptance criteria

1. Remove or correct the inaccurate comment
2. Optionally: add `console.error` or structured logging for producer errors
   before they are swallowed (if isb-0097 decides to keep them swallowed)
3. `pnpm check` passes on the modified file

## Notes

- Trivial fix — can be bundled with other cleanup work
