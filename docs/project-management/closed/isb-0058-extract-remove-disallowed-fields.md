# isb-0058: Extract removeDisallowedFields and write unit tests

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-010 |
| Type         | `feature`    |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `high`       |
| Created      | 2026-04-30   |
| Completed    | —            |
| Dependencies | none         |

## Description

Extract the `removeDisallowedFields` function from `kubb.config.ts` into a
named export in a testable companion module (`scripts/kubb-preprocessing.ts`),
then write unit tests for the function in `scripts/kubb-preprocessing.test.ts`.

## Background

`kubb.config.ts` is a build-time configuration file with module-level side
effects (file reads, file writes, `defineConfig(...)` call). The
`removeDisallowedFields` function was inlined directly in that file during
the initial kubb preprocessing implementation.

Side effects at module scope mean the function cannot be imported in isolation
for testing — any `import` of `kubb.config.ts` immediately reads
`docs/openapi/openresponses.json` and writes a temp file. This makes unit
testing the function impossible without complex mocking.

The function must be extracted to a standalone module (`scripts/kubb-preprocessing.ts`)
that:

- exports `removeDisallowedFields` as a named export
- has no module-level side effects
- lives outside `src/` (it is a build-time tool, not a server runtime module)

`kubb.config.ts` then imports and calls the function from the new module, keeping
behaviour identical.

Tests are written in `scripts/kubb-preprocessing.test.ts` using the Node.js
built-in `node:test` runner (consistent with the rest of the test suite).

This ticket is also a prerequisite for the documentation tickets (isb-0061)
because `docs/schema-generation.md` must document the correct import path for
the function, which is only stable after extraction.

## Technical Context

**Current state:** `removeDisallowedFields` is defined at the top of `kubb.config.ts`
(lines 11–35) and called directly on line 37 as a module-level side effect:

```typescript
// kubb.config.ts (current — simplified)
function removeDisallowedFields(node: unknown): void {
    if (Array.isArray(node)) {
        node.forEach(removeDisallowedFields);
    } else if (node !== null && typeof node === "object") {
        const obj = node as Record<string, unknown>;
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (
                val !== null &&
                typeof val === "object" &&
                (val as Record<string, unknown>).minLength === 1 &&
                (val as Record<string, unknown>).maxLength === 0 &&
                (val as Record<string, unknown>)["x-openresponses-disallowed"] === true
            ) {
                delete obj[key];
            } else {
                removeDisallowedFields(val);
            }
        }
    }
}

const rawSpec = JSON.parse(readFileSync("./docs/openapi/openresponses.json", "utf-8")) as unknown;
removeDisallowedFields(rawSpec);
```

**Expected state after extraction:**

New file `scripts/kubb-preprocessing.ts`:

```typescript
/**
 * Build-time preprocessing for the OpenResponses OpenAPI spec.
 * Removes properties whose schema value matches the x-openresponses-disallowed sentinel.
 */
export function removeDisallowedFields(node: unknown): void {
    if (Array.isArray(node)) {
        node.forEach(removeDisallowedFields);
    } else if (node !== null && typeof node === "object") {
        const obj = node as Record<string, unknown>;
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (
                val !== null &&
                typeof val === "object" &&
                (val as Record<string, unknown>).minLength === 1 &&
                (val as Record<string, unknown>).maxLength === 0 &&
                (val as Record<string, unknown>)["x-openresponses-disallowed"] === true
            ) {
                delete obj[key];
            } else {
                removeDisallowedFields(val);
            }
        }
    }
}
```

Updated `kubb.config.ts`:

```typescript
import { removeDisallowedFields } from "./scripts/kubb-preprocessing.js";
// ... (all other imports remain)

// module-level side effects continue here, unchanged:
const rawSpec = JSON.parse(readFileSync("./docs/openapi/openresponses.json", "utf-8")) as unknown;
removeDisallowedFields(rawSpec);
```

**Sentinel convention (for test reference):** A property is marked disallowed
when its schema value satisfies all three simultaneously:

- `minLength === 1`
- `maxLength === 0`
- `x-openresponses-disallowed === true`

All three must be present. Missing any one means the property is retained.

## Acceptance Criteria

- **AC-1**: `scripts/kubb-preprocessing.ts` exists and exports `removeDisallowedFields` as a named export.
- **AC-2**: `scripts/kubb-preprocessing.ts` has no module-level side effects (no file I/O, no `defineConfig`, no imports from `@kubb/*`).
- **AC-3**: `kubb.config.ts` imports `removeDisallowedFields` from `"./scripts/kubb-preprocessing.js"` and removes the inlined function definition.
- **AC-4**: `pnpm generate:schemas` still runs successfully after the refactor (the Kubb output is identical to before).
- **AC-5**: `scripts/kubb-preprocessing.test.ts` exists and tests pass via `ISB_PROJECT_ENVIRONMENT=test pnpm test`.
- **AC-6**: Tests cover all scenarios listed in Test Expectations (T-01 through T-09).
- **AC-7**: `pnpm check` exits 0 after all changes.

## Files Affected

- `kubb.config.ts` (root) — remove inlined `removeDisallowedFields` function body; add import from `"./scripts/kubb-preprocessing.js"`. All other logic (file read, temp write, `defineConfig`) remains unchanged.
- `scripts/kubb-preprocessing.ts` (new) — contains the extracted `removeDisallowedFields` function as a named export with no side effects.
- `scripts/kubb-preprocessing.test.ts` (new) — unit tests for `removeDisallowedFields` covering T-01 through T-09.

## Test Expectations

Test file: `scripts/kubb-preprocessing.test.ts`
Test runner: Node.js built-in `node:test` (same as all other test files in the repo)

All tests must use deep-clone inputs to verify source immutability (i.e. pass
`structuredClone(input)` into the function and verify the original is untouched).

| ID   | Scenario                                                                                               | Type | Key assertion                                |
| ---- | ------------------------------------------------------------------------------------------------------ | ---- | -------------------------------------------- |
| T-01 | All three conditions present — property removed                                                        | Unit | Object no longer contains the key after call |
| T-02 | Only `minLength: 1` present (missing `maxLength` and `x-openresponses-disallowed`) — property retained | Unit | Key still present after call                 |
| T-03 | Only `maxLength: 0` present — property retained                                                        | Unit | Key still present after call                 |
| T-04 | Only `x-openresponses-disallowed: true` present — property retained                                    | Unit | Key still present after call                 |
| T-05 | Two of three conditions present (`minLength` + `maxLength` but no sentinel) — property retained        | Unit | Key still present after call                 |
| T-06 | Nested object — disallowed property inside a nested schema is removed                                  | Unit | Nested key removed; outer object intact      |
| T-07 | Array of objects — disallowed property inside an array element is removed                              | Unit | Element's key removed                        |
| T-08 | Null value — function does not throw                                                                   | Unit | Returns without error; no keys affected      |
| T-09 | Primitive value (string, number, boolean) — function does not throw                                    | Unit | Returns without error                        |

## Definition of Done

- `scripts/kubb-preprocessing.ts` is created with the named export.
- `kubb.config.ts` imports from the new module — no inlined function body remains.
- `pnpm generate:schemas` produces the same generated output as before (no diff in `src/.../generated/`).
- `ISB_PROJECT_ENVIRONMENT=test pnpm test` includes `scripts/kubb-preprocessing.test.ts` and all 9 tests pass.
- `pnpm check` exits 0.
