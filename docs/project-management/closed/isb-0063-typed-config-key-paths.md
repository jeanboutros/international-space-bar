# isb-0063: Improve ApplicationConfigService.get() to typed key paths

| Field        | Value                                              |
| ------------ | -------------------------------------------------- |
| Epic         | isb-epic-010                                       |
| Type         | `feature`                                          |
| Status       | `backlog`                                          |
| Assignee     | Engineer                                           |
| Priority     | `low`                                              |
| Created      | 2026-04-30                                         |
| Completed    | —                                                  |
| Dependencies | `isb-0059` (hard — see AC-3 and Technical Context) |

## Description

Improve `ApplicationConfigService.get()` to enforce valid config key paths at
compile time via a two-overload design using recursive mapped types. Currently
`get<T = unknown>(key: string)` accepts any string — a mistyped key silently
returns `undefined` with no compile-time error and no throw.

This is pre-existing debt, not a regression. It was surfaced during Phase A
review when the `server.enableCors` key was manually typed at the call site and
no compiler feedback was available to catch potential typos.

## Background

`ApplicationConfigService.get()` accepts an arbitrary dot-notation string key
and traverses the config object at runtime. There is no compile-time check that
the key is valid. For example:

```typescript
config.get("server.enableCors"); // valid — compiles and works
config.get("server.enabelCors"); // typo — silently returns undefined at runtime
config.get("nonexistent.key"); // invalid — silently returns undefined at runtime
```

When `get()` returns `undefined` for a mistyped key, downstream logic silently
treats it as falsy. In `main.ts`, CORS would be silently disabled with no log
message, no error, and no compiler warning.

The correct fix is:

1. A **two-overload design**: one overload for "required" lookups (throws on
   absent key), one for "optional with default" lookups (returns the default
   when absent).
2. Constrain the `key` parameter to a union of valid dot-notation paths derived
   from `AppConfig` using TypeScript mapped types with an index-signature strip.

This eliminates silent failures for known keys at both compile time and runtime.

This debt was explicitly called out in the `TODO` comment in `main.ts`:

> `TODO: Constants should all live in one place, ideally typed and validated via zod.`

## Technical Context

### Files and current state

**Service file:** `src/international-space-bar-server/application-config/application-config.service.ts`

**Current signature (to be replaced):**

```typescript
get<T = unknown>(key: string): T | undefined {
    if (key === "environment") {
        return String(this.environment) as T;
    }
    const parts = key.split(".");
    let current: unknown = this.config;
    for (const part of parts) {
        if (current === null || typeof current !== "object") return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current as T | undefined;
}
```

**Config type:** `AppConfig` is the inferred type of `ConfigSchema` in
`src/international-space-bar-server/application-config/config.schema.ts`. It is
a `z.looseObject(...)` shape (Zod 4), which adds an index signature
`[key: string]: unknown` to the TypeScript type.

### Why `StripIndex<T>` is mandatory

`z.looseObject()` adds `[key: string]: unknown` to the inferred type. Without
stripping this index signature before computing `keyof T`, the expression
`keyof T & string` resolves to `string` — collapsing the entire `DotKeys<T>`
union to `string` and defeating compile-time enforcement. `StripIndex<T>` must
be applied at **every recursion level** of `DotKeys<T>`.

```typescript
// Strips index signatures, preserving only named keys
type StripIndex<T> = {
    [K in keyof T as string extends K ? never : K]: T[K];
};

type DotKeys<T> = {
    [K in keyof StripIndex<T> & string]: StripIndex<T>[K] extends Record<string, unknown>
        ? `${K}` | `${K}.${DotKeys<StripIndex<T>[K]>}`
        : `${K}`;
}[keyof StripIndex<T> & string];

type DotValue<T, K extends string> = K extends `${infer Head}.${infer Tail}`
    ? Head extends keyof StripIndex<T>
        ? DotValue<StripIndex<T>[Head], Tail>
        : never
    : K extends keyof StripIndex<T>
      ? StripIndex<T>[K]
      : never;
```

**Known limitation:** For paths where a parent is optional (e.g., `server?:
{...}`), `DotValue<AppConfig, "server.port">` may resolve to `number |
undefined` in the TypeScript type even when the Engineer's intent is `number`.
The implementation throws at runtime when the path is absent and no default is
provided. Document this in a code comment in the service file.

### Two-overload design (mandatory)

Replace the current single `get()` with two overloads and a private `MISSING`
sentinel to distinguish "no default supplied" from "default is undefined":

```typescript
// Sentinel — distinguishes "no default argument" from "default is undefined"
const MISSING = Symbol("MISSING");

// Overload 1 — required lookup: throws ConfigurationException if key is absent or malformed
get<K extends DotKeys<AppConfig>>(key: K): DotValue<AppConfig, K>;

// Overload 2 — optional lookup: returns defaultValue if key is absent; throws if malformed
get<K extends DotKeys<AppConfig>>(key: K, defaultValue: DotValue<AppConfig, K>): DotValue<AppConfig, K>;

// Implementation
get<K extends DotKeys<AppConfig>>(
    key: K,
    defaultValue: DotValue<AppConfig, K> | typeof MISSING = MISSING,
): DotValue<AppConfig, K> {
    // ... (see Acceptance Criteria for exact behaviour)
}
```

Using `Symbol("MISSING")` avoids `arguments.length` (which fails ESLint
`@typescript-eslint/no-unused-expressions`).

### Malformation rule

A key is **malformed** if it matches any of these four cases:

1. Empty string: `""`
2. Leading dot: `".server.port"`
3. Trailing dot: `"server.port."`
4. Consecutive dots: `"server..port"`

Malformed keys must throw `ConfigurationException` in **both** overloads,
regardless of whether a `defaultValue` is supplied.

### `environment` virtual key — removal from `get()` scope

The `if (key === "environment")` branch in the current implementation must be
**removed**. The `environment` property is already exposed as a `public readonly`
field on the service. The one call site that reads it via `get("environment")`
must migrate to the direct property access (see AC-3 below).

### `ConfigurationException`

All throws within the updated `get()` must use the existing
`ConfigurationException` class already imported in the service file:

```typescript
import { ConfigurationException } from "../common/exceptions/index.js";
```

Do NOT introduce a new exception class.

### `isb-0059` hard dependency

`isb-0059` adds `server.enableCors` and `server.corsOrigins` to `ConfigSchema`.
Until that ticket lands, these keys do not exist in `AppConfig`. The two call
sites in `main.ts` that reference `"server.enableCors"` **cannot compile** with
the new typed signature until `isb-0059` is merged. See AC-3 for the explicit
per-call-site migration plan.

### Call sites in `main.ts`

The current `main.ts` (as of 2026-04-30) has 7 `config.get(...)` calls, on
lines 29, 32, 35, 36, 39, 40, and 41:

| Line | Expression                        | Current         |
| ---- | --------------------------------- | --------------- |
| 29   | `config.get("server.enableCors")` | CORS gate       |
| 32   | `config.get("environment")`       | log message     |
| 35   | `config.get("server.port")`       | port resolution |
| 36   | `config.get("server.host")`       | host resolution |
| 39   | `config.get("server.enableCors")` | debug log       |
| 40   | `config.get("server.port")`       | debug log       |
| 41   | `config.get("server.host")`       | debug log       |

See AC-3 for the required migration of each call site.

## Acceptance Criteria

- **AC-1**: `DotKeys<AppConfig>` produces a finite union of valid dot-notation
  key paths. `StripIndex<T>` is applied at every recursion level. The compiler
  rejects `config.get("server.nonExistentKey")` with a type error.

- **AC-2**: The return type of `get()` is inferred from the key path:
    - `config.get("server.port", DEFAULT_PORT)` → return type `number`
    - `config.get("server.host", DEFAULT_HOST)` → return type `string`
      No overload returns `unknown` or `T | undefined` for known key paths.

- **AC-3**: All 7 call sites in `main.ts` are handled as follows — no other
  migration is required for this ticket:
    - **Line 29** (`config.get("server.enableCors")`) — **deferred**. Leave
      as-is, add comment:
      `// TODO(isb-0059): migrate to typed get() once server.enableCors is in ConfigSchema`
    - **Line 32** (`String(config.get("environment"))`) — migrate to
      `String(config.environment)` (direct property access; removes the virtual
      key branch from `get()`).
    - **Line 35** (`config.get("server.port") ?? process.env.PORT ?? DEFAULT_PORT`) —
      migrate to `config.get("server.port", DEFAULT_PORT)` using Sig2; return type
      is `number`; `?? process.env.PORT ?? DEFAULT_PORT` fallback chain can be
      simplified or retained (Engineer decides, but the `get()` call must use the
      typed overload).
    - **Line 36** (`config.get("server.host") ?? process.env.HOST ?? DEFAULT_HOST`) —
      migrate to `config.get("server.host", DEFAULT_HOST)` using Sig2; return type
      is `string`.
    - **Line 39** (`config.get("server.enableCors")`) — **deferred**. Leave
      as-is, add comment:
      `// TODO(isb-0059): migrate to typed get() once server.enableCors is in ConfigSchema`
    - **Line 40** (`config.get("server.port")`) — migrate using Sig1 or Sig2
      (Engineer decides; used only in a debug log string).
    - **Line 41** (`config.get("server.host")`) — migrate using Sig1 or Sig2
      (Engineer decides; used only in a debug log string).

    `pnpm check` must exit 0 with the two deferred lines still present as-is.

- **AC-4**: ~~`environment` virtual key~~ — the `if (key === "environment")` branch
  is **removed** from `get()`. The `environment` property is accessed via
  `config.environment` at all call sites. No overload for `"environment"` is needed.

- **AC-5**: Both overloads throw `ConfigurationException` for malformed keys.
  Malformed means: empty string, leading dot, trailing dot, or consecutive dots.
  Malformation throws take priority over the absent-key behaviour in Sig2
  (i.e., even if a `defaultValue` is supplied, a malformed key still throws).

- **AC-6**: Sig1 (no default) throws `ConfigurationException` when the key is
  a valid `DotKeys<AppConfig>` path but the value is `undefined` at runtime
  (e.g., optional parent not present in the loaded config).

- **AC-7**: Sig2 (with default) returns `defaultValue` when the key is absent
  at runtime. It does NOT throw for an absent key.

- **AC-8**: `pnpm check` exits 0.

- **AC-9**: Existing `application-config.service.test.ts` tests pass unchanged.

## Files Affected

- `src/international-space-bar-server/application-config/application-config.service.ts` —
  replace the current `get<T = unknown>(key: string): T | undefined` with the
  two-overload typed design; add `StripIndex`, `DotKeys`, `DotValue` utility
  types (inline or imported from a co-located types file); add `MISSING`
  sentinel constant; remove `if (key === "environment")` branch; add malformation
  guard; add known-limitation comment for optional parent paths.

- `src/international-space-bar-server/main.ts` — migrate lines 32, 35, 36, 40,
  41 to the typed overloads; add `TODO(isb-0059)` comments on lines 29 and 39.

- `src/international-space-bar-server/application-config/application-config.service.test.ts` —
  add new test cases T-01 through T-11 (see Test Expectations); add one
  `// @ts-expect-error` negative compile test.

## Test Expectations

Add the following scenarios to `application-config.service.test.ts`. All tests
use `ISB_PROJECT_ENVIRONMENT=test` and a minimal in-memory config fixture.

| ID   | Scenario                                     | Kind    | Expected                                                       |
| ---- | -------------------------------------------- | ------- | -------------------------------------------------------------- |
| T-01 | Sig1 — key present in config                 | unit    | Returns typed value, no throw                                  |
| T-02 | Sig1 — key absent in config                  | unit    | Throws `ConfigurationException`                                |
| T-03 | Sig2 — key present in config                 | unit    | Returns config value (not default)                             |
| T-04 | Sig2 — key absent in config                  | unit    | Returns `defaultValue`, no throw                               |
| T-05 | Malformed: empty string `""`                 | unit    | Throws `ConfigurationException` (both sigs)                    |
| T-06 | Malformed: leading dot `".server.port"`      | unit    | Throws `ConfigurationException`                                |
| T-07 | Malformed: trailing dot `"server.port."`     | unit    | Throws `ConfigurationException`                                |
| T-08 | Malformed: consecutive dots `"server..port"` | unit    | Throws `ConfigurationException`                                |
| T-09 | Sig2 with malformed key                      | unit    | Throws `ConfigurationException` (not returns default)          |
| T-10 | `config.environment` direct access           | unit    | Returns `ProjectEnvironment` value                             |
| T-11 | Negative compile test — invalid key path     | compile | `// @ts-expect-error` on `config.get("server.nonExistentKey")` |

Test T-11 must appear as an inline `// @ts-expect-error` comment in the test
file so the TypeScript compiler enforces it (it is not a runtime assertion).

## Definition of Done

- `get<T = unknown>(key: string): T | undefined` no longer exists in
  `application-config.service.ts`.
- Both typed overloads (Sig1 and Sig2) are present and compile cleanly.
- `StripIndex<T>` is applied at every recursion level of `DotKeys<T>`.
- The `if (key === "environment")` branch is removed.
- All four malformation cases are guarded and throw `ConfigurationException`.
- All 7 `main.ts` call sites are handled (5 migrated, 2 deferred with
  `TODO(isb-0059)` comments).
- `pnpm check` exits 0.
- `pnpm test` exits 0, including T-01 through T-11.
- The known-limitation comment (optional parent → `undefined` return type)
  appears in the service file.
- No new exception class is introduced.
