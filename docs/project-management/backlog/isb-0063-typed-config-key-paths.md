# isb-0063: Improve ApplicationConfigService.get() to typed key paths

| Field | Value |
|-------|-------|
| Epic | isb-epic-010 |
| Type | `feature` |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `low` |
| Created | 2026-04-30 |
| Completed | — |
| Dependencies | none |

## Description

Improve `ApplicationConfigService.get()` to enforce valid config key paths at
compile time via a template-literal or mapped-type approach. Currently
`get<T = unknown>(key: string)` accepts any string — a mistyped key silently
returns `undefined` with no compile-time error.

This is pre-existing debt, not a regression. It was surfaced during Phase A
review when the `server.enableCors` key was manually typed at the call site and
no compiler feedback was available to catch potential typos.

## Background

`ApplicationConfigService.get()` accepts an arbitrary dot-notation string key
and traverses the config object at runtime. There is no compile-time check that
the key is valid. For example:

```typescript
config.get("server.enableCors")   // valid — works
config.get("server.enabelCors")   // typo — silently returns undefined at runtime
config.get("nonexistent.key")     // invalid — silently returns undefined at runtime
```

When `get()` returns `undefined` for a mistyped key, the downstream logic
silently treats it as falsy. In `main.ts`, this means CORS would be silently
disabled if the key name was mistyped — with no log message, no error, and no
compiler warning.

The correct fix is to constrain the `key` parameter to a union of valid dot-notation
paths derived from `AppConfig` using TypeScript mapped types. This catches typos
at compile time without any runtime overhead.

This debt was explicitly called out in the `TODO` comment in `main.ts`:
> `TODO: Constants should all live in one place, ideally typed and validated via zod.`

## Technical Context

**File:** `src/international-space-bar-server/application-config/application-config.service.ts`

**Current signature:**
```typescript
get<T = unknown>(key: string): T | undefined {
```

**Target signature (conceptual — Engineer to determine exact implementation):**
```typescript
get<K extends DotKeys<AppConfig>>(key: K): DotValue<AppConfig, K> | undefined {
```

Where `DotKeys<T>` is a recursive mapped type that produces a union of all valid
dot-notation key paths for the `AppConfig` type, and `DotValue<T, K>` resolves
the return type for a given key path.

**Example utility types** (Engineer to verify these compile correctly with the
actual `AppConfig` shape — `z.looseObject` fields may have optional/undefined
values that affect the type resolution):

```typescript
type DotKeys<T, Prefix extends string = ""> = {
    [K in keyof T & string]: T[K] extends Record<string, unknown>
        ? DotKeys<T[K], `${Prefix}${K}.`> | `${Prefix}${K}`
        : `${Prefix}${K}`;
}[keyof T & string];

type DotValue<T, K extends string> =
    K extends `${infer Head}.${infer Tail}`
        ? Head extends keyof T
            ? DotValue<T[Head], Tail>
            : never
        : K extends keyof T
            ? T[K]
            : never;
```

**Known complication:** `AppConfig` uses `z.looseObject()` which allows
additional properties at the type level. The `DotKeys` utility will only
enumerate explicitly declared keys; undeclared pass-through keys won't appear
in the union. This is acceptable — it improves safety for known keys while
remaining permissive for unknown ones (via a fallback `get(key: string)` overload
if needed).

**Call sites that will be affected** (must be updated after changing the signature):
- `src/international-space-bar-server/main.ts` — multiple `config.get(...)` calls
- Any other file that calls `config.get()` — run `grep -r "config\.get(" src/` to find all

**Compatibility note:** The `environment` virtual key (`key === "environment"`)
in the current implementation is a special case. The new typed approach must
handle or preserve this case.

## Acceptance Criteria

- **AC-1**: `ApplicationConfigService.get()` accepts only valid `AppConfig` dot-notation key paths at compile time — `config.get("server.enableCors")` compiles, `config.get("server.nonExistentKey")` is a type error.
- **AC-2**: The return type of `get()` is inferred from the key path — `config.get("server.port")` returns `number | undefined`, not `unknown`.
- **AC-3**: All existing call sites in `src/` compile without errors after the signature change.
- **AC-4**: The `"environment"` virtual key is handled (either as a declared key in the type or via a string overload fallback).
- **AC-5**: Runtime behaviour is unchanged — no regression in config loading or value resolution.
- **AC-6**: `pnpm check` exits 0.
- **AC-7**: Existing `application-config.service.test.ts` tests still pass.

## Files Affected

- `src/international-space-bar-server/application-config/application-config.service.ts` — update `get()` signature to use typed key paths; add `DotKeys` / `DotValue` utility types (or import from a shared types file if appropriate).
- `src/international-space-bar-server/application-config/config.schema.ts` — may need to add `enableCors` and `corsOrigins` before this ticket begins (if isb-0059 has not yet landed); or take isb-0059 as a soft dependency.
- `src/international-space-bar-server/main.ts` — update call sites if type inference forces explicit key corrections.
- Any other file with `config.get(...)` call sites (verify with `grep -r "\.get(" src/ --include="*.ts"`).

## Test Expectations

No new test file is required. Correctness is validated by:
- TypeScript compile-time: `pnpm check` confirms the new signature catches invalid keys
- Existing `application-config.service.test.ts` confirms runtime behaviour is unchanged
- A deliberate negative compile test (inline `// @ts-expect-error` comment above an invalid key call in the test file) demonstrates the constraint is enforced

## Definition of Done

- `get<T = unknown>(key: string)` is replaced with a typed signature in `application-config.service.ts`.
- `pnpm check` exits 0 (TypeScript compiler confirms all call sites are valid).
- Existing service tests pass.
- Engineer documents any known limitations (e.g. `z.looseObject()` pass-through keys not in the union) in a code comment.
