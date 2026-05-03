# isb-0066: Harden remaining `config.schema.ts` blocks with `.default({})`

| Field        | Value                                                                                  |
| ------------ | -------------------------------------------------------------------------------------- |
| ID           | isb-0066                                                                               |
| Epic         | [isb-epic-010](../epics/isb-epic-010-kubb-preprocessing-server-bootstrap-hardening.md) |
| Type         | `feature`                                                                              |
| Assignee     | Engineer                                                                               |
| Priority     | `low`                                                                                  |
| Status       | `open`                                                                                 |
| Created      | 2026-04-30                                                                             |
| Dependencies | isb-0064 (establishes the schema-defaults pattern for `server` block)                  |

---

## Background

isb-0064 applies `.default({})` to the `server` block and field-level defaults to `server.port` and `server.host`. The `config.schema.ts` top-level comment states the principle: **all config values must be non-optional after parse**. Six other top-level blocks remain `.optional()` with no `.default({})`: `app`, `logger`, `ollama`, `tavily`, `models`, and `paths`. A parsed config without those keys yields `undefined` fields, which forces all call sites to use optional-chaining or fallback arguments unnecessarily.

**Raised by**: Architect (Phase A flag, isb-0064 pipeline).

---

## Scope

For each remaining `.optional()` block (`app`, `logger`, `ollama`, `tavily`, `models`, `paths`):

1. Replace `.optional()` with `.default({})` (or `.default(value)` where a sensible scalar default applies — e.g. `logger.level` will be covered by isb-0065).
2. Add field-level `.default()` values for any sub-fields where a safe default is known and documented.
3. Update `config.schema.test.ts` to verify each block is present (non-`undefined`) in the parsed output when the input omits that block entirely.

Do NOT change `.looseObject()` to `.object()` — forward-compatibility passthrough is intentional (see isb-0064 notes).

---

## Files Affected

- `src/international-space-bar-server/application-config/config.schema.ts` — apply `.default({})` to each remaining optional top-level block and field-level defaults where known
- `src/international-space-bar-server/application-config/config.schema.test.ts` — add default-injection tests for each block

---

## Acceptance Criteria

- AC-1: Parsing an empty config object (`{}`) yields a result where none of `app`, `logger`, `ollama`, `tavily`, `models`, `paths` is `undefined`.
- AC-2: All newly defaulted blocks remain `.looseObject()` (not `.object()`).
- AC-3: Existing tests in `config.schema.test.ts` continue to pass unchanged.
- AC-4: New tests cover at least one default-injection assertion per block.
- AC-5: `pnpm check` exits 0.
- AC-6: `pnpm test` exits 0.

---

## Definition of Done

- `pnpm check` exits 0.
- `pnpm test` exits 0 including the new default-injection tests.
- No top-level schema block in `config.schema.ts` uses `.optional()` without a `.default()`.
