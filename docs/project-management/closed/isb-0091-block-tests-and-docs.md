# isb-0091 — Block unit tests + advisory/docs update

## Epic

isb-epic-012

## Depends on

isb-0090

## Description

Write unit tests for all 3 block factories to verify they produce valid
streaming events after the type-narrowing refactor. Update advisory and docs.

## Changes

### New file: blocks/blocks.test.ts

- Unit tests for `functionCallBlock`, `messageBlock`, `reasoningBlock`
- Verify events pass their respective Zod schemas
- Assert reasoning items do NOT have `status` field
- Test both sync (string) and async (queue) overloads where applicable
- Test abort signal mid-stream edge case

### Update: isb-adv-0002-reasoning-block-spec-gaps.md

- Add partial resolution note: `status` field removed from reasoning items

### Update: docs/response-stream-builder.md

- Clarify that reasoning items have no `status` field per the spec (near §9.3.4)

## Acceptance criteria

- [ ] `blocks.test.ts` exists with tests for all 3 block factories
- [ ] All tests pass (`pnpm test`)
- [ ] `isb-adv-0002` has partial resolution note
- [ ] `response-stream-builder.md` clarifies reasoning item lacks `status`
- [ ] `pnpm check` passes
