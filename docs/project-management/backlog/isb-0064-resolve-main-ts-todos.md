# isb-0064: Resolve `main.ts` TODOs — extract constants, schema-level defaults, remove stale comments

| Field | Value |
|-------|-------|
| ID | isb-0064 |
| Epic | [isb-epic-010](../epics/isb-epic-010-kubb-preprocessing-server-bootstrap-hardening.md) |
| Type | `feature` |
| Assignee | Engineer |
| Priority | `low` |
| Status | `open` |
| Created | 2026-04-30 |
| Dependencies | none (isb-0059 and isb-0063 are closed) |

---

## Background

`main.ts` accumulated three categories of TODO comments during the bootstrap-hardening phase covered by isb-epic-010. The pre-conditions those comments were waiting on — isb-0059 (CORS schema) and isb-0063 (typed `get()`) — have both landed and been closed. The TODOs are now either stale (the condition has been met) or fully actionable (the required infrastructure exists).

The three categories:

1. **Stale `TODO(isb-0059)` comments** — two comment lines reference isb-0059 and say "migrate to typed `get()` once `server.enableCors` is in ConfigSchema". Both isb-0059 and isb-0063 are closed; `enableCors` _is_ in the schema and typed `get()` _is_ implemented. The comments are now misleading noise.

2. **Inline `DEFAULT_PORT` / `DEFAULT_HOST` constants** — AGENTS.md records the explicit intention: "These values should eventually be taken out into a separate `constants.ts` file." They are still declared inline in `main.ts` with TODO comments calling this out. Every future file that needs the same defaults must duplicate the values or import from `main.ts`, which is wrong.

3. **Schema-level defaults missing for `server.port` and `server.host`** — `main.ts` compensates for the absent defaults by passing fallback arguments to `config.get(key, fallback)`. The TODO comment says "handle the defaults at schema validation level to make the logic simpler here." Now that the typed `get()` infrastructure is in place, the right fix is to embed the defaults in `ConfigSchema` so the config layer owns them and call sites need no fallback.

Not addressing this debt means: reviewers encounter misleading stale comments; `DEFAULT_PORT` and `DEFAULT_HOST` remain unshared; and `main.ts` carries default-fallback logic that belongs in the schema layer.

---

## Technical Context

### Files and current state

**`src/international-space-bar-server/main.ts`**

- Lines 8–15: declares `DEFAULT_PORT = 3000` and `DEFAULT_HOST = "127.0.0.1"` inline, each preceded by a TODO comment.
- Line 31: stale `// TODO(isb-0059): migrate to typed get() once server.enableCors is in ConfigSchema` comment before the `config.get("server.enableCors")` call.
- Lines 39–40: `// TODO: handle the defaults at schema validation level to make the logic simpler here.` above the port/host reads.
- Line 41: `config.get("server.port", DEFAULT_PORT)` — redundant fallback after schema defaults land.
- Line 42: `config.get("server.host", DEFAULT_HOST)` — redundant fallback after schema defaults land.
- Line 44: second stale `// TODO(isb-0059)` comment before the `logger.debug` call.
- Lines 47–48: `config.get("server.port", DEFAULT_PORT)` and `config.get("server.host", DEFAULT_HOST)` in the debug block — also redundant.
- Line 32: `config.get("server.corsOrigins", [])` — fallback to `[]` is also redundant once `corsOrigins` has a schema default.

**`src/international-space-bar-server/application-config/config.schema.ts`**

Current `server` sub-schema:

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

The base `config.yaml` does **not** include a `server:` block. When the base config is loaded without an environment overlay, `server` is `undefined` in the parsed config. Schema-level `.default()` values on `port` and `host` would never fire in this case because Zod only runs the inner defaults when the parent object is present. To make `config.get("server.port")` succeed with a default even when `server:` is absent, the `server` object itself must also carry a `.default({})`.

**`ApplicationConfigService.get()`**

Traverses the already-parsed frozen config object at call time — it does **not** re-parse. Schema-level `.default()` values must have been applied at parse time (during `loadConfig`) for defaults to be visible to `get()`. The TypeScript type `DotValue<AppConfig, "server.port">` already resolves to `number` (via `NonNullable`) — no call-site type changes are introduced by this ticket.

**`src/international-space-bar-server/application-config/config.schema.test.ts`**

Existing tests use `result.data.server?.port` with optional chaining. After the schema change, `server` is always present in the parsed output (never `undefined`) because of the `.default({})`. Existing tests remain valid but new tests must verify default-injection behaviour.

### Design decisions already settled

- `looseObject` (not `object`) is used throughout the schema for forward-compatibility passthrough — do not change this.
- `ApplicationConfigService` stores a frozen parsed config; there is no re-parsing at call time.
- `constants.ts` lives at the server-package root (`src/international-space-bar-server/constants.ts`), not inside `application-config/`. Both `main.ts` and `config.schema.ts` import from it (`./constants.js` and `../constants.js` respectively). This is an intra-layer import within `international-space-bar-server/` and does not cross an architecture boundary.

---

## Implementation

### Step 1 — Create `constants.ts`

Create `src/international-space-bar-server/constants.ts` with the following content:

```typescript
/** Default TCP port the server binds to when not overridden by config or environment. */
export const DEFAULT_PORT = 3000;

/**
 * Default host the server binds to.
 * Intentionally loopback — prevents accidental external exposure.
 * Override via `server.host` in config or the `HOST` environment variable.
 */
export const DEFAULT_HOST = "127.0.0.1";
```

### Step 2 — Update `main.ts`

- Remove the inline `DEFAULT_PORT` and `DEFAULT_HOST` declarations (lines 8–15, including the surrounding TODO comments).
- Add `import { DEFAULT_PORT, DEFAULT_HOST } from "./constants.js";` at the top of the imports.
- Remove both `// TODO(isb-0059)` comment lines (lines 31 and 44).
- Remove the `// TODO: handle the defaults at schema validation level...` comment block (lines 39–40).
- Replace all three `config.get("server.port", DEFAULT_PORT)` calls with `config.get("server.port")`.
- Replace both `config.get("server.host", DEFAULT_HOST)` calls with `config.get("server.host")`.
- Replace `config.get("server.corsOrigins", [])` with `config.get("server.corsOrigins")`.

### Step 3 — Update `config.schema.ts`

- Add `import { DEFAULT_PORT, DEFAULT_HOST } from "../constants.js";` at the top.
- Apply field-level defaults inside the `server` sub-object:
  - `port: z.number()` → `z.number().default(DEFAULT_PORT)`
  - `host: z.string()` → `z.string().default(DEFAULT_HOST)`
  - `enableCors: z.boolean().optional()` → `z.boolean().default(false)`
  - `corsOrigins: z.array(z.string()).optional()` → `z.array(z.string()).default([])`
- Change `.optional()` on the `server` object to `.default({})` so that when `server:` is absent from a YAML file, the schema substitutes `{}` and the field-level defaults populate a complete `server` object.

The resulting `server` sub-schema:

```typescript
server: z
    .looseObject({
        port: z.number().default(DEFAULT_PORT),
        host: z.string().default(DEFAULT_HOST),
        enableCors: z.boolean().default(false),
        corsOrigins: z.array(z.string()).default([]),
    })
    .default({}),
```

### Step 4 — Update `config.schema.test.ts`

Add tests for the new default-injection behaviour (see Test Expectations below). Update any assertion that uses `result.data.server?.port` with optional chaining to use direct access `result.data.server.port` where it makes sense — though optional chaining is not incorrect, it hides the guaranteed presence that the schema now provides.

---

## Files Affected

- `src/international-space-bar-server/constants.ts` — **new file**; exports `DEFAULT_PORT` and `DEFAULT_HOST` as the single typed source of truth for server bootstrap defaults; replacing the inline declarations in `main.ts`.
- `src/international-space-bar-server/main.ts` — import constants from `./constants.js`; remove five TODO comment blocks (two `isb-0059` stale comments, the constants TODO comments, and the schema-defaults TODO comment); replace six `config.get(key, fallback)` calls with `config.get(key)` once schema defaults are in place.
- `src/international-space-bar-server/application-config/config.schema.ts` — import constants from `../constants.js`; add `.default(DEFAULT_PORT)` / `.default(DEFAULT_HOST)` to `port` / `host`; add `.default(false)` to `enableCors`; add `.default([])` to `corsOrigins`; change `server` from `.optional()` to `.default({})`.
- `src/international-space-bar-server/application-config/config.schema.test.ts` — add new test cases covering default-injection when `server:` is absent and when individual fields are absent; remove the inline TODO comments that referenced the schema limitation.

---

## Test Expectations

Tests live in `config.schema.test.ts` and must follow the Tester standards (Arrange / Act / Assert with comment headers).

| # | Scenario | Kind | Assertion |
|---|----------|------|-----------|
| T-1 | `server:` block absent from config | unit | `result.data.server.port === 3000` and `result.data.server.host === "127.0.0.1"` |
| T-2 | `server:` block present, `port` absent | unit | `result.data.server.port === 3000` |
| T-3 | `server:` block present, `host` absent | unit | `result.data.server.host === "127.0.0.1"` |
| T-4 | `server:` block present, `enableCors` absent | unit | `result.data.server.enableCors === false` |
| T-5 | `server:` block present, `corsOrigins` absent | unit | `result.data.server.corsOrigins` deep-equals `[]` |
| T-6 | `server:` block present with explicit values | unit | explicit values are preserved (not overridden by defaults) |

---

## Acceptance Criteria

**AC-1** — `src/international-space-bar-server/constants.ts` exists and exports `DEFAULT_PORT` (value `3000`) and `DEFAULT_HOST` (value `"127.0.0.1"`) as named constants.

**AC-2** — `main.ts` no longer declares `DEFAULT_PORT` or `DEFAULT_HOST` inline; it imports them from `./constants.js`.

**AC-3** — Both `// TODO(isb-0059)` comment lines (at the `config.get("server.enableCors")` call and at the `logger.debug(...)` call) are absent from `main.ts`.

**AC-4** — The `// TODO: handle the defaults at schema validation level...` comment block is absent from `main.ts`.

**AC-5** — The inline constants TODO comments (above `DEFAULT_PORT` and above `DEFAULT_HOST`) are absent from `main.ts`.

**AC-6** — All occurrences of `config.get("server.port", DEFAULT_PORT)` in `main.ts` are replaced with `config.get("server.port")` (no fallback argument).

**AC-7** — All occurrences of `config.get("server.host", DEFAULT_HOST)` in `main.ts` are replaced with `config.get("server.host")` (no fallback argument).

**AC-8** — `config.get("server.corsOrigins", [])` in `main.ts` is replaced with `config.get("server.corsOrigins")` (no fallback argument).

**AC-9** — `config.schema.ts` imports `DEFAULT_PORT` and `DEFAULT_HOST` from `../constants.js` and applies them as field-level defaults on `server.port` and `server.host` respectively.

**AC-10** — `ConfigSchema.safeParse({ version: 1 }).data.server.port === 3000` — server block defaults inject when `server:` is absent from the config input.

**AC-11** — `ConfigSchema.safeParse({ version: 1 }).data.server.host === "127.0.0.1"` — same as AC-10 for `host`.

**AC-12** — `ConfigSchema.safeParse({ version: 1 }).data.server.enableCors === false` — `enableCors` defaults to `false` when absent.

**AC-13** — `config.schema.test.ts` includes at least the six test scenarios listed in Test Expectations above, and all pass.

**AC-14** — `pnpm check` exits 0 with no auto-fixable or manual-fix errors.

**AC-15** — `pnpm test` exits 0 and includes the updated `config.schema.test.ts`.

---

## Definition of Done

- `src/international-space-bar-server/constants.ts` exists, is importable, and exports both constants with correct values.
- `main.ts` contains no `TODO` comments related to constants, schema defaults, or isb-0059.
- `main.ts` imports `DEFAULT_PORT` and `DEFAULT_HOST` from `./constants.js`.
- No call to `config.get(...)` in `main.ts` passes a fallback default for `server.port`, `server.host`, or `server.corsOrigins`.
- `config.schema.ts` imports constants from `../constants.js`; `server.port`, `server.host`, `enableCors`, and `corsOrigins` all have schema-level defaults; `server` uses `.default({})` instead of `.optional()`.
- `config.schema.test.ts` includes all six test scenarios from the Test Expectations table and they all pass.
- `pnpm check` exits 0.
- `pnpm test` exits 0.
