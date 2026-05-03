# isb-epic-001: Phase 0 — Backend Scaffold (NestJS + OpenResponses Ping-Pong)

| Field      | Value                                                                |
| ---------- | -------------------------------------------------------------------- |
| Priority   | `critical`                                                           |
| Status     | `not-started`                                                        |
| Created    | 2026-04-28                                                           |
| Design doc | `docs/openresponses-backend-phased-design.md` — Phase 0              |
| Tickets    | isb-0001, isb-0002, isb-0003, isb-0004, isb-0005, isb-0006, isb-0007 |

## Summary

Deliver the Phase 0 backend scaffold: a NestJS 11 service with a health endpoint, a non-streaming OpenResponses ping-pong endpoint, bearer token auth, TUI archive, and updated project scripts. This epic replaces the Ink TUI entry point with a backend HTTP service as the primary runtime.

## Scope

- NestJS 11 service scaffold (`src/international-space-bar-server/`)
- Health endpoint (`GET /health`)
- OpenResponses `POST /v1/responses` ping-pong endpoint (non-streaming)
- Zod validation pipe using `z.looseObject()`
- Bearer token auth guard (`ISB_OPENRESPONSES_API_KEY`)
- Archive legacy Ink TUI to `archive/legacy-ink-tui/`
- Update package.json scripts for the new server runtime
- Add `node:test` + `supertest` test infrastructure
- Integration, unit, and smoke tests
- Documentation: archive README, OpenCode example config, `.env.example`, AGENTS.md update

## Design decisions referenced

- Use `z.looseObject()` (not `.passthrough()`) for OpenResponses schema forward-compatibility
- Use explicit `@Inject()` tokens — no `emitDecoratorMetadata`
- Add `experimentalDecorators: true` to tsconfig
- NestJS 11 with rxjs ^7.8
- `node:test` runner with `supertest` (no Jest/Vitest)
- Agent runtime port pattern for future agent integration

## Acceptance criteria (from design doc)

- [ ] `pnpm dev:server` starts the NestJS service on the configured port
- [ ] `GET /health` returns `{ status: "ok" }` with 200
- [ ] `POST /v1/responses` with valid bearer token and `{ input: "ping" }` returns `{ output: [{ type: "message", content: [{ type: "output_text", text: "pong" }] }] }`
- [ ] `POST /v1/responses` without bearer token returns 401
- [ ] Legacy TUI source is archived at `archive/legacy-ink-tui/` and not importable from main source
- [ ] `pnpm build:server` compiles without errors
- [ ] All tests pass via `pnpm test`
- [ ] `pnpm check` exits 0

## Dependencies

None — this is the first epic.
