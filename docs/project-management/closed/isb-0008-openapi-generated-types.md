# isb-0008: Generate OpenResponses types from OpenAPI spec

| Field | Value |
|-------|-------|
| Epic | isb-epic-001 |
| Status | `open` |
| Assignee | Engineer |
| Priority | `high` |
| Created | 2026-04-28 |
| Completed | — |
| Dependencies | isb-0004 |

## Description

Replace the incomplete hand-authored TypeScript interfaces in `responses.types.ts` with types auto-generated from the official OpenResponses OpenAPI specification at `https://www.openresponses.org/openapi/openapi.json`. Keep the hand-authored Zod input validation schema (`responses.schemas.ts`) as it is intentionally a subset for controller-level validation.

## Acceptance Criteria

- [ ] OpenAPI spec downloaded and pinned in the repo
- [ ] `openapi-typescript` generates types from the spec
- [ ] A generation script is added to `package.json`
- [ ] `responses.types.ts` imports and re-exports the generated types needed by the server
- [ ] `PingPongRuntimeService` and `ResponsesService` use the generated `ResponseResource` type
- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0

## Files Affected

- `docs/openapi/openresponses.json` — pinned OpenAPI spec
- `src/international-space-bar-server/openresponses/openresponses.generated.d.ts` — generated types
- `src/international-space-bar-server/openresponses/responses.types.ts` — updated to use generated types
- `package.json` — add openapi-typescript devDep and generation script
