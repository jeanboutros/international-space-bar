# isb-0050: Schema migration — wire generated schemas into responses.schemas.ts and responses.types.ts

| Field | Value |
|-------|-------|
| Epic | isb-epic-002 |
| Type | feature |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `high` |
| Created | 2026-04-29 |
| Dependencies | isb-0049 |
| Parent | isb-0046 |

## Description

Replace the hand-written `CreateResponseSchema` in `responses.schemas.ts` with a wrapper around the Kubb-generated `createResponseBodySchema`. Apply the ISB-specific overrides (`.passthrough()` and `model: z.string().min(1)`) at the entry-point schema only — internal generated schemas remain strict as produced by Kubb.

Migrate `responses.types.ts` to derive `CreateResponseBody`, `ResponseResource`, and `ResponseStreamEvent` via `z.infer<>` from their corresponding generated schemas rather than from `openresponses.generated.d.ts`.

Mark `openresponses.generated.d.ts` as deprecated but do not delete it — downstream consumers that have not yet migrated must continue to compile.

## Acceptance Criteria

- [ ] `responses.schemas.ts` imports `createResponseBodySchema` from the generated zod output
- [ ] `CreateResponseSchema` is defined as:
  ```ts
  export const CreateResponseSchema = createResponseBodySchema
    .extend({ model: z.string().min(1) })
    .passthrough();
  ```
  (ISB business rule: `model` is required and non-empty; `.passthrough()` preserves unknown fields matching existing `z.looseObject()` contract)
- [ ] Internal generated schemas are **not** modified — `.passthrough()` is applied only to `CreateResponseSchema`
- [ ] `responses.types.ts` derives `CreateResponseBody`, `ResponseResource`, and `ResponseStreamEvent` via `z.infer<typeof xSchema>` from their respective generated schemas
- [ ] `openresponses.generated.d.ts` has a top-of-file comment: `@deprecated — migrate to z.infer<> from generated schemas`
- [ ] All existing imports in controller, service, and port files that consume `CreateResponseBody`, `ResponseResource`, or `ResponseStreamEvent` continue to compile without change (types are re-exported from `responses.types.ts` as before)
- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 (all pre-existing tests pass)

## Files Affected

- `src/international-space-bar-server/openresponses/responses.schemas.ts`
- `src/international-space-bar-server/openresponses/responses.types.ts`
- `src/international-space-bar-server/openresponses/openresponses.generated.d.ts` (deprecation comment only)
