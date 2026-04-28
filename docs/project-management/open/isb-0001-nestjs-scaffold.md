# isb-0001: NestJS scaffold + tsconfig + dependencies

| Field | Value |
|-------|-------|
| Epic | isb-epic-001 |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `critical` |
| Created | 2026-04-28 |
| Completed | — |
| Dependencies | none |

## Description

Bootstrap the NestJS 11 backend service. Install all required dependencies, configure TypeScript for decorators, and create the minimal module structure with a health endpoint and a reusable Zod validation pipe.

## Acceptance Criteria

- [ ] NestJS 11 dependencies installed: `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `reflect-metadata`, `rxjs@^7.8`, `@types/express`
- [ ] `experimentalDecorators: true` added to `tsconfig.json`
- [ ] `src/international-space-bar-server/main.ts` bootstraps the NestJS app
- [ ] `src/international-space-bar-server/app.module.ts` defines root module
- [ ] `src/international-space-bar-server/health/health.controller.ts` exposes `GET /health` returning `{ status: "ok" }`
- [ ] `src/international-space-bar-server/common/zod-validation.pipe.ts` created — accepts a Zod schema and validates request body
- [ ] The pipe uses `z.looseObject()` schemas (not `.passthrough()`)
- [ ] Service starts without errors via `pnpm dev:server`
- [ ] `pnpm check` exits 0

## Files Affected

- `package.json` — add NestJS, reflect-metadata, rxjs, @types/express dependencies
- `tsconfig.json` — add `experimentalDecorators: true`
- `src/international-space-bar-server/main.ts` — NestJS bootstrap entry point
- `src/international-space-bar-server/app.module.ts` — root AppModule
- `src/international-space-bar-server/health/health.controller.ts` — health endpoint
- `src/international-space-bar-server/common/zod-validation.pipe.ts` — Zod validation pipe

## PoC Snippets

```typescript
// main.ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3007);
}
bootstrap();
```

```typescript
// zod-validation.pipe.ts
import { type PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import type { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(result.error.format());
    }
    return result.data;
  }
}
```

## Comments

This is the foundation ticket — all other Phase 0 tickets depend on it.
