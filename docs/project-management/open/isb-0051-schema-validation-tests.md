# isb-0051: Schema validation tests — unit, integration, and smoke

| Field | Value |
|-------|-------|
| Epic | isb-epic-002 |
| Type | feature |
| Status | `backlog` |
| Assignee | Tester |
| Priority | `high` |
| Created | 2026-04-29 |
| Dependencies | isb-0050 |
| Parent | isb-0046 |

## Description

Add three test layers covering the migrated schema:

- **Group A** — 8 unit tests for `CreateResponseSchema` parse semantics in a new dedicated test file
- **Group B** — 4 integration test cases added to the existing controller test file
- **Group C** — 4-case smoke script for manual and CI use

**FLAG-1 note:** `z.string().min(1)` accepts `" "` (a single space as `model`). This is consistent with the existing hand-written schema and is **accepted by design**. Test cases must document this: `model: " "` is a valid value.

## Acceptance Criteria

### Group A — Unit tests (`responses.schemas.test.ts`)

- [ ] New file `src/international-space-bar-server/openresponses/responses.schemas.test.ts` created
- [ ] 8 test cases cover:
  1. Valid minimal request (model + input string) → parses successfully
  2. `model` absent → parse fails
  3. `model: ""` (empty string) → parse fails (`min(1)` violated)
  4. `model: " "` (single space) → parse **succeeds** (accepted by design — `min(1)` checks length, not whitespace; documented in test comment)
  5. `model: null` → parse fails
  6. `input` as array (valid item array) → parses successfully
  7. Unknown field present → preserved in parse output (`.passthrough()` contract)
  8. `stream: true` → parses successfully

### Group B — Integration test additions (`responses.controller.test.ts`)

- [ ] 4 new test cases added to existing `responses.controller.test.ts`:
  1. B-1: `model: ""` → HTTP 422 (validation rejects empty string at boundary)
  2. B-2: `model: null` → HTTP 422 (validation rejects null at boundary)
  3. B-3: `input` as array → HTTP 2xx (valid array form accepted)
  4. B-4: `stream: true` → response is SSE content-type (streaming path exercised)

### Group C — Smoke script (`scripts/test-api-schema-validation.mjs`)

- [ ] New file `scripts/test-api-schema-validation.mjs` created as a standalone Node.js script (no test framework dependency)
- [ ] 4 smoke cases: valid request, empty model, null model, array input
- [ ] Script exits 0 on success, non-zero on failure
- [ ] Script is runnable with `node scripts/test-api-schema-validation.mjs` against a locally running server

### Quality gate

- [ ] `pnpm test` exits 0 (all Groups A and B pass)
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/responses.schemas.test.ts` (new)
- `src/international-space-bar-server/openresponses/responses.controller.test.ts` (4 new cases added)
- `scripts/test-api-schema-validation.mjs` (new)
