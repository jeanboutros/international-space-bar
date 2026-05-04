# Epic: isb-epic-012 — Block factory type narrowing

| Field  | Value    |
| ------ | -------- |
| Status | `closed` |

## Summary

Replace unsafe `as unknown as ItemField` double-casts in block factories with
specific generated types (`FunctionCall`, `Message`, `ReasoningBody`). Drop the
non-spec `status` field from reasoning item construction.

## Motivation

- The `as unknown as ItemField` pattern bypasses compile-time type checking
- The reasoning block sets a `status` field not present in the OpenAPI spec
- Using specific generated types restores compiler protection and aligns with
  the "never hand-roll types that duplicate generated schemas" convention

## Scope

| Ticket   | Title                                                 | Depends on |
| -------- | ----------------------------------------------------- | ---------- |
| isb-0090 | Type-narrow block factories + drop reasoning `status` | —          |
| isb-0091 | Block unit tests + advisory/docs update               | isb-0090   |

## Acceptance criteria

- All 3 block factories use specific generated types (no `as unknown as` casts)
- Reasoning items no longer emit `status` field
- Block-level unit tests cover all 3 factories
- `isb-adv-0002` updated with partial resolution note
- `pnpm check` passes

## Reviews

(populated during execution)
