# isb-0070: Replace hardcoded `"ISB_OPENRESPONSES_API_KEY"` string with `API_KEY_ENV_VAR` constant in tests

| Field | Value |
|-------|-------|
| Epic | [isb-epic-010](../epics/isb-epic-010-kubb-preprocessing-server-bootstrap-hardening.md) |
| Type | `bug` |
| Status | `backlog` |
| Assignee | Tester |
| Priority | `low` |
| Created | 2026-04-30 |
| Completed | — |
| Dependencies | none |

---

## Background

Four test files set `process.env` using the hardcoded string literal `"ISB_OPENRESPONSES_API_KEY"` instead of importing and using the `API_KEY_ENV_VAR` constant from `src/international-space-bar-server/constants.ts`. The isb-0064 ticket (constants consolidation) introduced `API_KEY_ENV_VAR` precisely to eliminate this kind of magic string, but the test files were not updated.

**Why it matters**: If `API_KEY_ENV_VAR` is ever renamed or reassigned (e.g. to support multi-key configs), the test files would silently set the wrong env var and tests would pass against a ghost key — masking authentication regressions. Using the constant makes the coupling explicit and rename-safe.

**Raised by**: Engineer (Phase A flag, isb-0064 pipeline, 2026-04-30).

---

## Technical Context

**Constant location**: `src/international-space-bar-server/constants.ts` line 19
```typescript
export const API_KEY_ENV_VAR = "ISB_OPENRESPONSES_API_KEY";
```

**Current state** (before this ticket):

All four files use the hardcoded string literal pattern:
```typescript
process.env.ISB_OPENRESPONSES_API_KEY = "test-key";
```

**Expected state** (after this ticket):
```typescript
import { API_KEY_ENV_VAR } from "../constants.js"; // (adjust relative path per file)
// ...
process.env[API_KEY_ENV_VAR] = "test-key";
```

`responses.gateway.test.ts` also deletes and saves/restores the env var — all such references must use `process.env[API_KEY_ENV_VAR]` bracket notation.

**Files containing hardcoded literals** (4 files, multiple occurrences):

| File | Occurrences |
|------|-------------|
| `src/international-space-bar-server/health/health.controller.test.ts` | 1 (`= "test-key"`) |
| `src/international-space-bar-server/openresponses/responses.controller.test.ts` | 2 (`= "test-key"`) |
| `src/international-space-bar-server/openresponses/responses.controller.stream.test.ts` | 1 (`= "test-key"`) |
| `src/international-space-bar-server/openresponses/responses.gateway.test.ts` | 5 (set + save + restore + delete references) |

**Relative import path** for `constants.ts` from each file:
- `health/health.controller.test.ts` → `"../constants.js"`
- `openresponses/responses.controller.test.ts` → `"../constants.js"`
- `openresponses/responses.controller.stream.test.ts` → `"../constants.js"`
- `openresponses/responses.gateway.test.ts` → `"../constants.js"`

---

## Acceptance Criteria

- AC-1: `health.controller.test.ts` imports `API_KEY_ENV_VAR` from `"../constants.js"` and uses `process.env[API_KEY_ENV_VAR]` instead of the literal `process.env.ISB_OPENRESPONSES_API_KEY`.
- AC-2: `responses.controller.test.ts` imports `API_KEY_ENV_VAR` and replaces all 2 literal occurrences.
- AC-3: `responses.controller.stream.test.ts` imports `API_KEY_ENV_VAR` and replaces the 1 literal occurrence.
- AC-4: `responses.gateway.test.ts` imports `API_KEY_ENV_VAR` and replaces all 5 occurrences (set, save, restore, delete, and the comment reference if applicable).
- AC-5: No test file in `src/` contains the string literal `process.env.ISB_OPENRESPONSES_API_KEY` after this ticket (grep confirms zero matches).
- AC-6: `pnpm check` exits 0.
- AC-7: `pnpm test` exits 0 with no test regressions — all tests that were passing before must still pass.

---

## Files Affected

- `src/international-space-bar-server/health/health.controller.test.ts` — add import for `API_KEY_ENV_VAR`; replace `process.env.ISB_OPENRESPONSES_API_KEY` with `process.env[API_KEY_ENV_VAR]`
- `src/international-space-bar-server/openresponses/responses.controller.test.ts` — add import; replace 2 occurrences
- `src/international-space-bar-server/openresponses/responses.controller.stream.test.ts` — add import; replace 1 occurrence
- `src/international-space-bar-server/openresponses/responses.gateway.test.ts` — add import; replace 5 occurrences including save/restore/delete patterns

No production code changes required.

---

## Test Expectations

No new tests needed. This is a pure mechanical substitution. The Tester verifies correctness by confirming:
1. The import is present in each file.
2. `grep -r "process.env.ISB_OPENRESPONSES_API_KEY" src/` returns zero matches.
3. `pnpm test` exits 0.

---

## Definition of Done

- `pnpm check` exits 0
- `pnpm test` exits 0 with no regressions
- `grep -r "process\.env\.ISB_OPENRESPONSES_API_KEY" src/` returns zero matches
- All 4 files import `API_KEY_ENV_VAR` from `"../constants.js"` and use bracket notation
