# isb-0053: Migrate `.passthrough()` to `z.looseObject()` in responses.schemas.ts

| Field | Value |
|-------|-------|
| Epic | isb-epic-002 |
| Type | `feature` |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `low` |
| Created | 2026-04-29 |
| Completed | — |
| Dependencies | none |

## Description

`responses.schemas.ts` currently applies the deprecated Zod 4 `.passthrough()` method to `CreateResponseSchema`:

```ts
export const CreateResponseSchema = createResponseBodySchema
  .extend({ model: z.string().min(1) })
  .passthrough(); // deprecated Zod 4 API
```

The preferred Zod 4 replacement is `z.looseObject(shape)`, which accepts an explicit shape and preserves unknown fields — same semantics, cleaner API.

Migration is currently **blocked** on Kubb's `@kubb/plugin-zod` exposing a typed shape export from the generated `createResponseBodySchema` (the `.shape` property, or a re-exported shape object). Without that, we cannot reconstruct the full schema shape to pass to `z.looseObject()`.

This ticket tracks the migration once the upstream blocker is resolved.

## Acceptance Criteria

- [ ] Kubb `@kubb/plugin-zod` generates or exposes a typed shape for `createResponseBodySchema` (via `.shape`, a named export, or equivalent)
- [ ] `responses.schemas.ts` updated: `.passthrough()` removed; `CreateResponseSchema` rebuilt using `z.looseObject({ ...createResponseBodySchema.shape, model: z.string().min(1) })` (or equivalent pattern once shape is accessible)
- [ ] No change to runtime semantics — unknown fields still pass through
- [ ] `pnpm check` exits 0
- [ ] All existing tests pass (no schema behaviour regression)

## Files Affected

- `src/international-space-bar-server/openresponses/responses.schemas.ts` — remove `.passthrough()`, adopt `z.looseObject()` pattern

## Comments

Flagged during Phase C final review of isb-0046. The legacy `.passthrough()` API functions correctly and this is purely a debt/modernisation item. Do not begin until Kubb exposes the required shape export — check Kubb release notes or upstream `@kubb/plugin-zod` changelog before picking up.
