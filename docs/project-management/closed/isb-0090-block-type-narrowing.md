# isb-0090 — Type-narrow block factories + drop reasoning `status`

## Epic

isb-epic-012

## Description

Replace the generic `ItemField` type and `as unknown as ItemField` double-casts
in all 3 block factories with the specific generated types already re-exported
from `responses.types.ts`. Remove the non-spec `status` field from reasoning
item construction.

## Changes

### function-call-block.ts

- Import `FunctionCall` instead of `ItemField` from `../responses.types.js`
- Replace `const item: ItemField = {...} as unknown as ItemField` with `const item: FunctionCall = {...}`
- Replace `const completedItem: ItemField = {...} as unknown as ItemField` with `const completedItem: FunctionCall = {...}`

### message-block.ts

- Import `Message` instead of `ItemField` from `../responses.types.js`
- Replace both item constructions (in_progress + completed) with `Message` type

### reasoning-block.ts

- Import `ReasoningBody` instead of `ItemField` from `../responses.types.js`
- Replace both item constructions with `ReasoningBody` type
- **Remove `status` field** from both item object literals (the OpenAPI spec's
  `ReasoningBody` has no `status` property)

## Acceptance criteria

- [ ] No `as unknown as ItemField` casts remain in any block factory
- [ ] `FunctionCall`, `Message`, `ReasoningBody` used as local item types
- [ ] Reasoning items have no `status` field in either added or done events
- [ ] `pnpm check` passes (TypeScript compilation + lint + format)
- [ ] Existing tests still pass (`pnpm test`)

## Notes

- Use the openapi-typescript re-exports from `responses.types.ts`, NOT Kubb's
  `generated/types/` (the openapi-typescript versions use `& unknown` which
  preserves narrow enum types; Kubb uses `& any` which widens to `any`)
