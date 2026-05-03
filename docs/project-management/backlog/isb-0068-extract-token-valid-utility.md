# isb-0068: Extract `isTokenValid` into shared `common/auth/` utility

| Field        | Value                                                                                  |
| ------------ | -------------------------------------------------------------------------------------- |
| Epic         | [isb-epic-010](../epics/isb-epic-010-kubb-preprocessing-server-bootstrap-hardening.md) |
| Type         | `feature`                                                                              |
| Status       | `backlog`                                                                              |
| Assignee     | Engineer                                                                               |
| Priority     | `low`                                                                                  |
| Created      | 2026-04-30                                                                             |
| Completed    | —                                                                                      |
| Dependencies | none                                                                                   |

---

## Background

`isTokenValid` — a timing-safe bearer-token comparison using `timingSafeEqual` — is duplicated byte-for-byte in two files:

- `src/international-space-bar-server/common/bearer-auth.guard.ts` (private method on `BearerAuthGuard`)
- `src/international-space-bar-server/openresponses/responses.gateway.ts` (module-level function)

The gateway even carries a comment acknowledging the duplication: _"Reuses the same timing-safe comparison as BearerAuthGuard for the HTTP path."_ This comment is a code smell — an explicit acknowledgement that the function should be shared but isn't.

**Why it matters**: The function is security-critical. Two copies mean two places to patch if a vulnerability is discovered. A shared utility centralises the implementation, ensures both callers stay in sync, and makes the security-sensitive comparison easy to audit in one place.

**Raised by**: Architect (Phase A flag, isb-0064 pipeline, 2026-04-30).

---

## Technical Context

**Current state**:

`bearer-auth.guard.ts` (private class method):

```typescript
private isTokenValid(token: string, expected: string): boolean {
    const tokenBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expected);
    if (tokenBuffer.length !== expectedBuffer.length) {
        return false;
    }
    return timingSafeEqual(tokenBuffer, expectedBuffer);
}
```

`responses.gateway.ts` (module-level function, identical logic):

```typescript
function isTokenValid(token: string, expected: string): boolean {
    const tokenBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expected);
    if (tokenBuffer.length !== expectedBuffer.length) {
        return false;
    }
    return timingSafeEqual(tokenBuffer, expectedBuffer);
}
```

**Expected state after this ticket**:

A new file `src/international-space-bar-server/common/auth/token-validation.ts` exports a single `isTokenValid(token: string, expected: string): boolean` utility. Both `BearerAuthGuard` and `responses.gateway.ts` import and delegate to it. Neither file retains a local copy of the logic.

`common/auth/` should be re-exported from `src/international-space-bar-server/common/index.ts` (or a new barrel if one doesn't exist yet) — check existing barrel structure before adding.

**Key design decisions**:

- The function signature stays unchanged: `(token: string, expected: string): boolean`
- The implementation stays unchanged: length check first, then `timingSafeEqual`
- Do NOT change `BearerAuthGuard` or `ResponsesGateway` behaviour — this is a pure extraction refactor

---

## Acceptance Criteria

- AC-1: `src/international-space-bar-server/common/auth/token-validation.ts` exists and exports `isTokenValid(token: string, expected: string): boolean`.
- AC-2: `BearerAuthGuard` no longer contains a local `isTokenValid` method — it imports from the shared utility.
- AC-3: `responses.gateway.ts` no longer contains a local `isTokenValid` function — it imports from the shared utility.
- AC-4: The shared utility comment in `responses.gateway.ts` (_"Reuses the same timing-safe comparison as BearerAuthGuard"_) is removed — it no longer applies when both use the same source.
- AC-5: `pnpm check` exits 0.
- AC-6: `pnpm test` exits 0 with no test regressions.
- AC-7: No other file in `src/` contains a local copy of the `timingSafeEqual`-based token comparison pattern.

---

## Files Affected

- `src/international-space-bar-server/common/bearer-auth.guard.ts` — remove private `isTokenValid` method; import from shared utility
- `src/international-space-bar-server/openresponses/responses.gateway.ts` — remove local `isTokenValid` function and its comment; import from shared utility
- `src/international-space-bar-server/common/auth/token-validation.ts` — **new file**: single exported `isTokenValid` function with `timingSafeEqual` implementation

---

## Test Expectations

The Tester should add a unit test for the extracted utility in `src/international-space-bar-server/common/auth/token-validation.test.ts`:

- **Scenario 1**: matching tokens → returns `true`
- **Scenario 2**: mismatched tokens, same length → returns `false`
- **Scenario 3**: mismatched lengths → returns `false` (short-circuits before `timingSafeEqual`)
- **Test kind**: unit
- **Assert**: return value only — do not assert on internal `Buffer` construction

Existing `bearer-auth.guard` and `responses.gateway` test coverage is sufficient to confirm the delegation wiring; no additional integration tests required.

---

## Definition of Done

- `pnpm check` exits 0
- `pnpm test` exits 0 with no regressions
- `common/auth/token-validation.ts` exists with the extracted function
- Neither `bearer-auth.guard.ts` nor `responses.gateway.ts` contain a local `isTokenValid` implementation
- At least 3 unit tests exist for the extracted utility covering match, mismatch-same-length, mismatch-different-length
