# isb-0002: Bearer token auth guard

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-001 |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `critical`   |
| Created      | 2026-04-28   |
| Completed    | —            |
| Dependencies | isb-0001     |

## Description

Create a NestJS `CanActivate` guard that validates bearer tokens against the `ISB_OPENRESPONSES_API_KEY` environment variable. The guard will be applied to the OpenResponses endpoint to prevent unauthorized access.

## Acceptance Criteria

- [ ] `src/international-space-bar-server/common/bearer-auth.guard.ts` implements `CanActivate`
- [ ] Guard reads the expected key from `ISB_OPENRESPONSES_API_KEY` environment variable
- [ ] Guard extracts the `Authorization: Bearer <token>` header and compares using timing-safe comparison
- [ ] Returns 401 Unauthorized when: header is missing, not a Bearer scheme, or token doesn't match
- [ ] Guard is injectable and can be applied per-route or globally
- [ ] Uses explicit `@Inject()` token pattern (no `emitDecoratorMetadata`)
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/common/bearer-auth.guard.ts` — new guard implementation
- `src/international-space-bar-server/common/injection-tokens.ts` — token constants (if needed)

## PoC Snippets

```typescript
import {
    type CanActivate,
    type ExecutionContext,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

@Injectable()
export class BearerAuthGuard implements CanActivate {
    private readonly apiKey: string;

    constructor() {
        const key = process.env.ISB_OPENRESPONSES_API_KEY;
        if (!key) throw new Error("ISB_OPENRESPONSES_API_KEY is not set");
        this.apiKey = key;
    }

    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<Request>();
        const auth = req.headers.authorization;
        if (!auth?.startsWith("Bearer ")) throw new UnauthorizedException();

        const token = auth.slice(7);
        const expected = Buffer.from(this.apiKey);
        const actual = Buffer.from(token);

        if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
            throw new UnauthorizedException();
        }
        return true;
    }
}
```

## Comments

Uses `timingSafeEqual` from `node:crypto` to prevent timing attacks on token comparison.
