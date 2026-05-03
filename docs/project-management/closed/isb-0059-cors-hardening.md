# isb-0059: Harden CORS — explicit origin list and ConfigSchema declaration

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-010 |
| Type         | `security`   |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `medium`     |
| Created      | 2026-04-30   |
| Completed    | —            |
| Dependencies | none         |

## Description

Replace the argument-free `app.enableCors()` call in `main.ts` with an
explicit origin allowlist read from config. Add `enableCors` and `corsOrigins`
to the `server` block of `ConfigSchema` so both keys are validated at startup
rather than passing through `z.looseObject()` silently.

## Background

During Phase A security review of the server bootstrap design document, the
Security Reviewer identified that `app.enableCors()` is called with no arguments
when `config.get("server.enableCors")` resolves truthy.

`config.dev.yaml` has `server.enableCors: true`. Because `enableCors()` is
called without options, NestJS/CORS sets `Access-Control-Allow-Origin: *` — a
wildcard that allows any origin to make credentialed cross-origin requests to
the API.

The `BearerAuthGuard` and `timingSafeEqual` token comparison in
`ResponsesGateway` provide API-key protection at the request level. However,
wildcard CORS creates additional risk:

- If a browser ever includes credentials (cookies, storage) alongside the API
  key in a same-site scenario, the wildcard ACAO header would expose the
  response to attacker-controlled pages.
- `server.enableCors` is currently not declared in `ConfigSchema`'s `server`
  block — it silently passes through `z.looseObject()`. A typo in the YAML
  (e.g. `enablecors: true`) would be silently ignored, leaving CORS disabled
  without any validation error.

The fix: pass an explicit `origin` list to `app.enableCors()` and declare both
`enableCors` and `corsOrigins` in `ConfigSchema`.

## Technical Context

**Current state (`main.ts` ~line 33):**

```typescript
config.get("server.enableCors") && app.enableCors();
```

**Expected state:**

```typescript
if (config.get("server.enableCors")) {
    const origins = config.get<string[]>("server.corsOrigins") ?? [];
    app.enableCors({ origin: origins });
}
```

**Current `ConfigSchema` `server` block (`config.schema.ts`):**

```typescript
server: z
    .looseObject({
        port: z.number(),
        host: z.string(),
    })
    .optional(),
```

**Expected `server` block:**

```typescript
server: z
    .looseObject({
        port: z.number(),
        host: z.string(),
        enableCors: z.boolean().optional(),
        corsOrigins: z.array(z.string()).optional(),
    })
    .optional(),
```

**`config.dev.yaml`** already has `server.enableCors: true`. Add a
`server.corsOrigins` array with a suitable dev-only value (e.g. `["http://localhost:3000"]`).
In production (`config.prod.yaml` / `config.yaml`), `corsOrigins` should be an
empty array or explicitly absent to default to denying all cross-origin requests.

**`ApplicationConfigService.get()`** is the existing accessor used everywhere.
It accepts `string` keys and traverses the config object. The `config.get<string[]>("server.corsOrigins")` call is valid with the current implementation.

## Security PoC

| Field                  | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vulnerability category | `data-exposure`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Confidence             | 7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Exploit scenario       | An attacker hosts a page at `https://attacker.example`. A victim user visits the page while logged into a browser session that also holds an ISB API key (e.g. via a browser extension or stored credential). The attacker's page makes a `fetch("http://localhost:3000/v1/responses", { credentials: "include" })` request. Because `Access-Control-Allow-Origin: *` is set, the browser sends the request; the response body is readable by the attacker's page JS. The `*` header is set regardless of whether credentials are actually included — no preflight blocks it. |
| Impact                 | Exposure of API response content to attacker-controlled cross-origin pages when wildcard CORS is active.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Fix recommendation     | Pass `origin: config.get<string[]>("server.corsOrigins") ?? []` to `app.enableCors()`. An empty array means no origin is allowed, which is the safe default. Dev environments explicitly opt in with a localhost entry.                                                                                                                                                                                                                                                                                                                                                       |

## Acceptance Criteria

- **AC-1**: `app.enableCors()` is never called without arguments — it always receives `{ origin: origins }` where `origins` is the resolved `server.corsOrigins` array.
- **AC-2**: `ConfigSchema`'s `server` block declares `enableCors: z.boolean().optional()` and `corsOrigins: z.array(z.string()).optional()`.
- **AC-3**: `config.dev.yaml` has a non-empty `server.corsOrigins` array (at minimum `["http://localhost:3000"]`).
- **AC-4**: `config.yaml` (base config) either omits `corsOrigins` or sets it to `[]`.
- **AC-5**: If `server.enableCors` is absent or `false`, `app.enableCors()` is not called at all.
- **AC-6**: `pnpm check` exits 0 after all changes.
- **AC-7**: Existing config schema tests (`config.schema.test.ts`) still pass; new tests cover the added fields (see Test Expectations).

## Files Affected

- `src/international-space-bar-server/main.ts` — replace `app.enableCors()` with `app.enableCors({ origin: origins })` gated on `server.enableCors`; read `server.corsOrigins` from config.
- `src/international-space-bar-server/application-config/config.schema.ts` — add `enableCors: z.boolean().optional()` and `corsOrigins: z.array(z.string()).optional()` to the `server` block.
- `config.dev.yaml` — add `server.corsOrigins: ["http://localhost:3000"]` (dev-only allowlist).
- `config.yaml` (if it defines a `server` block) — ensure `corsOrigins` is absent or `[]`.

## Test Expectations

| ID   | Scenario                                                                             | Type                | Key assertion                                                                                                 |
| ---- | ------------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| T-14 | `ConfigSchema` accepts a config with `server.corsOrigins: ["http://localhost:3000"]` | Unit                | `safeParse` succeeds, `corsOrigins` field is present                                                          |
| T-15 | `ConfigSchema` accepts a config without `server.corsOrigins`                         | Unit                | `safeParse` succeeds, `corsOrigins` is `undefined`                                                            |
| T-16 | `ConfigSchema` accepts `server.enableCors: false`                                    | Unit                | `safeParse` succeeds                                                                                          |
| T-17 | `ConfigSchema` accepts `server.enableCors: true`                                     | Unit                | `safeParse` succeeds                                                                                          |
| T-18 | `ConfigSchema` rejects `server.corsOrigins: "not-an-array"`                          | Unit                | `safeParse` fails with a validation error                                                                     |
| S-01 | `app.enableCors` is called with `{ origin: [...] }` when `server.enableCors: true`   | Integration / smoke | Mock `config.get` to return `true` and `["http://localhost:3000"]`; verify `enableCors` receives correct args |
| S-02 | `app.enableCors` is NOT called when `server.enableCors` is absent                    | Integration / smoke | Mock `config.get` to return `undefined`; verify `enableCors` is never called                                  |

## Definition of Done

- `app.enableCors()` no longer appears without an `{ origin: ... }` argument in `main.ts`.
- `ConfigSchema` declares `enableCors` and `corsOrigins` in the `server` block.
- `config.dev.yaml` has a `corsOrigins` array.
- `ISB_PROJECT_ENVIRONMENT=test pnpm test` includes the new schema tests and exits 0.
- `pnpm check` exits 0.
- Security Reviewer re-scans after implementation and produces a cleared assessment before the Challenger approves.
