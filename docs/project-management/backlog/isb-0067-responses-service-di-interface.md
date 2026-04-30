# isb-0067: Introduce `IResponsesService` interface + `RESPONSES_SERVICE` injection token

| Field | Value |
|-------|-------|
| ID | isb-0067 |
| Epic | [isb-epic-010](../epics/isb-epic-010-kubb-preprocessing-server-bootstrap-hardening.md) |
| Type | `feature` |
| Assignee | Engineer |
| Priority | `medium` |
| Status | `open` |
| Created | 2026-04-30 |
| Dependencies | none |

---

## Background

`ResponsesController` currently injects `ResponsesService` by its concrete class (`@Inject(ResponsesService)`), not through an interface token. AGENTS.md requires the server layer to depend on port interfaces, not concrete implementations. This is a pre-existing DI violation discovered during the isb-0064 Phase A architectural review.

**Raised by**: Architect (Phase A flag, isb-0064 pipeline).

---

## Scope

1. Define `IResponsesService` interface in `src/international-space-bar-server/openresponses/` (or `common/interfaces/`) capturing the public API of `ResponsesService`.
2. Create `RESPONSES_SERVICE` injection token (e.g. `Symbol('RESPONSES_SERVICE')` or a `const` string token).
3. Update `ResponsesModule` to provide `ResponsesService` under the `RESPONSES_SERVICE` token.
4. Update `ResponsesController` to inject via `@Inject(RESPONSES_SERVICE) responses: IResponsesService`.
5. Update any existing tests that rely on the concrete class injection to use the token.

Do NOT change `ResponsesService` implementation — this is purely a DI-wiring refactor.

---

## Files Affected

- `src/international-space-bar-server/openresponses/responses.controller.ts` — switch to `@Inject(RESPONSES_SERVICE)` with `IResponsesService` type
- `src/international-space-bar-server/openresponses/responses.module.ts` — register `ResponsesService` under `RESPONSES_SERVICE` token
- `src/international-space-bar-server/openresponses/responses.service.ts` — implement `IResponsesService` (add `implements` clause if interface is introduced)
- New file: interface and token definition (location TBD by Engineer — either alongside the service or in `common/interfaces/`)
- Any test files that inject `ResponsesService` by class reference — update to use the token

---

## Acceptance Criteria

- AC-1: `ResponsesController` no longer imports `ResponsesService` directly — it uses only `IResponsesService` type and `RESPONSES_SERVICE` token.
- AC-2: `ResponsesService` is provided under `RESPONSES_SERVICE` in `ResponsesModule`.
- AC-3: `pnpm check` exits 0.
- AC-4: `pnpm test` exits 0 with no test regressions.
- AC-5: No other controller or module in the server layer injects `ResponsesService` by concrete class reference.

---

## Definition of Done

- `pnpm check` exits 0.
- `pnpm test` exits 0 with no regressions.
- `ResponsesController` depends only on `IResponsesService`, not the concrete class.
