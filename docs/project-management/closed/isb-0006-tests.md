# isb-0006: Tests — integration, unit, and smoke

| Field        | Value              |
| ------------ | ------------------ |
| Epic         | isb-epic-001       |
| Status       | `backlog`          |
| Assignee     | Tester             |
| Priority     | `high`             |
| Created      | 2026-04-28         |
| Completed    | —                  |
| Dependencies | isb-0004, isb-0005 |

## Description

Write the test suite for Phase 0 using `node:test` as the runner and `supertest` for HTTP integration tests. Cover the health endpoint, OpenResponses endpoint (auth, validation, happy path), ZodValidationPipe unit tests, PingPongRuntimeService unit tests, and smoke tests for archive isolation and build.

## Acceptance Criteria

- [ ] Test dependencies installed: `supertest`, `@types/supertest`, `@nestjs/testing`
- [ ] Integration test: `GET /health` returns 200 `{ status: "ok" }`
- [ ] Integration test: `POST /v1/responses` with valid auth + valid body returns pong response
- [ ] Integration test: `POST /v1/responses` without auth returns 401
- [ ] Integration test: `POST /v1/responses` with invalid body returns 400
- [ ] Unit test: `ZodValidationPipe` passes valid data through
- [ ] Unit test: `ZodValidationPipe` throws `BadRequestException` on invalid data
- [ ] Unit test: `PingPongRuntimeService.run()` returns expected pong structure
- [ ] Smoke test: no `src/` file imports from `archive/`
- [ ] Smoke test: `pnpm build:server` exits 0
- [ ] All tests pass via `pnpm test`
- [ ] `pnpm check` exits 0

## Files Affected

- `package.json` — add `supertest`, `@types/supertest`, `@nestjs/testing` as dev dependencies
- `src/international-space-bar-server/health/health.controller.test.ts` — health integration test
- `src/international-space-bar-server/openresponses/responses.controller.test.ts` — responses integration tests (auth, validation, happy path)
- `src/international-space-bar-server/common/zod-validation.pipe.test.ts` — ZodValidationPipe unit tests
- `src/international-space-bar-server/openresponses/ping-pong-runtime.service.test.ts` — PingPongRuntime unit tests
- `src/international-space-bar-server/smoke.test.ts` — archive isolation + build smoke tests

## PoC Snippets

```typescript
// health.controller.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { AppModule } from "../app.module.js";

describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        const app = moduleRef.createNestApplication();
        await app.init();

        const res = await request(app.getHttpServer()).get("/health");
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { status: "ok" });

        await app.close();
    });
});
```

## Comments

Tests use `node:test` with `--import tsx` for TypeScript support. No Jest or Vitest — per test strategy decision.
