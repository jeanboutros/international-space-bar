# isb-0065: Add `DEFAULT_LOG_LEVEL` to `constants.ts`

| Field        | Value                                                                                  |
| ------------ | -------------------------------------------------------------------------------------- |
| ID           | isb-0065                                                                               |
| Epic         | [isb-epic-010](../epics/isb-epic-010-kubb-preprocessing-server-bootstrap-hardening.md) |
| Type         | `feature`                                                                              |
| Assignee     | Engineer                                                                               |
| Priority     | `low`                                                                                  |
| Status       | `open`                                                                                 |
| Created      | 2026-04-30                                                                             |
| Dependencies | isb-0064 (must be merged first — `constants.ts` must exist)                            |

---

## Background

After isb-0064 creates `constants.ts`, a stale TODO comment in `config.schema.ts` references a future `constants.ts` file for `DEFAULT_LOG_LEVEL`. That comment becomes orphaned noise the moment isb-0064 lands without this value. Completing this ticket eliminates the orphan and makes the schema self-documenting.

**Raised by**: Architect (Phase A flag, isb-0064 pipeline).

---

## Scope

1. Add `export const DEFAULT_LOG_LEVEL = "info"` to `src/international-space-bar-server/constants.ts`.
2. Apply `.default(DEFAULT_LOG_LEVEL)` to the `logger.level` field in `config.schema.ts`, importing `DEFAULT_LOG_LEVEL` from `../constants.js`.
3. Remove the orphaned TODO comment from `config.schema.ts`.
4. Add a test case in `config.schema.test.ts` verifying that `logger.level` defaults to `"info"` when omitted.

---

## Files Affected

- `src/international-space-bar-server/constants.ts` — add `DEFAULT_LOG_LEVEL` export
- `src/international-space-bar-server/application-config/config.schema.ts` — apply `.default(DEFAULT_LOG_LEVEL)`, remove TODO comment
- `src/international-space-bar-server/application-config/config.schema.test.ts` — add default-injection test for `logger.level`

---

## Acceptance Criteria

- AC-1: `constants.ts` exports `DEFAULT_LOG_LEVEL = "info"`.
- AC-2: Parsing a config with no `logger.level` field yields `logger.level === "info"` in the output.
- AC-3: The TODO comment referencing `constants.ts` for `DEFAULT_LOG_LEVEL` is removed from `config.schema.ts`.
- AC-4: `pnpm check` exits 0.
- AC-5: `pnpm test` exits 0 including the new test case.

---

## Definition of Done

- `pnpm check` exits 0.
- `pnpm test` exits 0 and includes the new `logger.level` default test.
- No TODO comment referencing `DEFAULT_LOG_LEVEL` remains in `config.schema.ts`.
