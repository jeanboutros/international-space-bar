# Schema Generation — Kubb + OpenAPI

> **AI agents:** Read this document before working with schemas in
> `src/international-space-bar-server/openresponses/`. Generated files in
> `openresponses/generated/` must not be edited directly — see
> [Linter exclusion](#linter-exclusion) and [How to regenerate](#how-to-regenerate).

---

## Overview

Zod schemas for the OpenResponses protocol surface are auto-generated from the
OpenAPI spec using **[Kubb](https://kubb.dev)** (`@kubb/plugin-zod`).

Kubb was chosen over manual schema authoring and alternatives (e.g.
`openapi-typescript` + hand-written Zod) for:

- **Typed Zod output** — generates `z.ZodType<T>` with full TypeScript
  inference, eliminating the `.d.ts` hand-type pattern.
- **OpenAPI-first** — the spec is the single source of truth; no schema drift.
- **NodeNext ESM support** — the `output.extension` map rewrites `.ts` → `.js`
  on import paths, satisfying the NodeNext module resolver without a post-build
  step.
- **Zod v4 support** — the `version: "4"` option emits Zod 4-compatible code.

---

## Input spec

The single source of truth is:

```
docs/openapi/openresponses.json
```

All schema changes must be made in this file first. Generated output is derived
from it — never edit generated files to work around a spec gap.

---

## Preprocessing

The source spec is not passed to Kubb directly. Before Kubb runs, a
preprocessing step strips all properties that carry the
`x-openresponses-disallowed` sentinel. This is necessary because Zod 4 builds
regexes eagerly at schema construction time and crashes on the impossible
`{1,0}` quantifier that the sentinel uses.

### Flow

```
docs/openapi/openresponses.json
        │
        │  readFileSync (in kubb.config.ts)
        ▼
 parsed spec object
        │
        │  removeDisallowedFields() — strips sentinel properties
        ▼
  cleaned spec object
        │
        │  writeFileSync to OS tmpdir
        ▼
  <tmpdir>/openresponses-cleaned.json
        │
        │  Kubb reads from here (input.path)
        ▼
 src/.../openresponses/generated/   (Zod 4 schemas)
```

The source spec is **never modified** — preprocessing is read-only from
`docs/openapi/openresponses.json`'s perspective.

### Function location

`removeDisallowedFields` is a named export in
[`scripts/kubb-preprocessing.ts`](../scripts/kubb-preprocessing.ts). It is
called from `kubb.config.ts` immediately after parsing the source spec and
before the Kubb config object is exported.

### Sentinel detection rule

A property is removed when its schema value satisfies **all three** of the
following simultaneously:

| Condition | Required value |
|-----------|----------------|
| `minLength` | `1` |
| `maxLength` | `0` |
| `x-openresponses-disallowed` | `true` |

All three must be present — removing any one disqualifies the property from
detection.

### How to mark a new field as disallowed

Add all three conditions to the property's schema in
`docs/openapi/openresponses.json`:

```json
"fieldName": {
    "type": "string",
    "minLength": 1,
    "maxLength": 0,
    "x-openresponses-disallowed": true
}
```

Then run `pnpm generate:schemas` — the field will be absent from the generated
Zod schemas. The source spec retains the sentinel so the intent is visible to
reviewers.

---

## Configuration

Full config: [`kubb.config.ts`](../kubb.config.ts)

```typescript
import { writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@kubb/core";
import { pluginOas } from "@kubb/plugin-oas";
import { pluginTs } from "@kubb/plugin-ts";
import { pluginZod } from "@kubb/plugin-zod";
import { removeDisallowedFields } from "./scripts/kubb-preprocessing.js";

const rawSpec = JSON.parse(readFileSync("./docs/openapi/openresponses.json", "utf-8")) as unknown;
removeDisallowedFields(rawSpec);
const cleanedSpecPath = join(tmpdir(), "openresponses-cleaned.json");
writeFileSync(cleanedSpecPath, JSON.stringify(rawSpec));

export default defineConfig({
    input: {
        path: cleanedSpecPath,
    },
    output: {
        path: "./src/international-space-bar-server/openresponses/generated",
        extension: { ".ts": ".js" },
    },
    plugins: [
        pluginOas(),
        pluginTs(),
        pluginZod({
            output: {
                path: "./zod",
            },
            version: "4",
            unknownType: "unknown",
            typed: true,
            inferred: true,
        }),
    ],
});
```

### Key options explained

| Option | Value | Why |
|--------|-------|-----|
| `output.extension` | `{ ".ts": ".js" }` | Required for NodeNext ESM — TypeScript resolves `.js` imports to `.ts` at build time; without this, generated imports break under `"moduleResolution": "NodeNext"` |
| `version` | `"4"` | Targets Zod v4 API (this project uses Zod 4) |
| `unknownType` | `"unknown"` | Unknown/additional fields are typed as `unknown` rather than `any` — safe by default |
| `typed` | `true` | Generates `z.ZodType<T>` wrappers — enables full TypeScript inference from Zod schemas |
| `inferred` | `true` | Generates `z.infer<...>` type aliases alongside schemas |

---

## Output directory

Generated files are written to:

```
src/international-space-bar-server/openresponses/generated/
  zod/    ← Zod schemas (one file per operation/model)
```

See the directory-level
[`generated/README.md`](../src/international-space-bar-server/openresponses/generated/README.md)
for the brief inline note.

---

## Commit policy

Generated files **are committed** to the repository. They are not gitignored.

Rationale:

- Mirrors the upstream spec at the point of commit — no regeneration step
  required in CI.
- Diffs in PRs show exactly what changed in the schema surface when the spec
  is updated, making reviews concrete and reviewable.
- Provides an audit trail: every spec change produces a visible diff.

No pre-build or CI step regenerates schemas automatically. The developer runs
`pnpm generate:schemas` locally after updating the spec and commits the result.

---

## How to regenerate

Run from the workspace root:

```bash
pnpm generate:schemas
```

This executes `kubb generate` using `kubb.config.ts`.

**When to regenerate:** whenever `docs/openapi/openresponses.json` changes.

**Regeneration workflow:**

1. Update `docs/openapi/openresponses.json` with the spec changes.
2. Run `pnpm generate:schemas`.
3. Review the diff in `openresponses/generated/` — confirm only expected
   changes appear.
4. Run `pnpm check` and `pnpm test` — both must exit 0.
5. Commit the spec and generated files together in the same commit.

---

## Linter exclusion

Generated files do not conform to project style and must be excluded from
linting.

**Biome** (`biome.json`):

```json
"files": {
    "includes": ["src/**/*.ts", "!src/**/openresponses/generated/**"]
}
```

**ESLint** (`eslint.config.js`):

```javascript
ignores: [
    "dist/**",
    "src/**/openresponses/openresponses.generated.d.ts",
    "src/**/openresponses/generated/**"
]
```

Do not add `// biome-ignore` or `// eslint-disable` comments inside generated
files. To fix issues in generated output, update
`docs/openapi/openresponses.json` and re-run `pnpm generate:schemas`.

---

## Entry-point wrapper pattern

Generated schemas are not used directly in production code. Instead,
`responses.schemas.ts` wraps the generated schema with ISB-specific overrides:

```typescript
// src/international-space-bar-server/openresponses/responses.schemas.ts
import { z } from "zod";
import { createResponseBodySchema } from "./generated/zod/createResponseBodySchema.js";

// Cast required: Kubb generates schemas typed as z.ZodType<T> but the runtime value is z.ZodObject.
export const CreateResponseSchema = (
    createResponseBodySchema as unknown as z.ZodObject<z.ZodRawShape>
)
    .extend({ model: z.string().min(1) })
    .passthrough();

export type CreateResponseBody = z.infer<typeof CreateResponseSchema>;
```

### Why `.passthrough()`

The generated schema uses Kubb's default for OpenAPI `additionalProperties`,
which maps to `z.looseObject` semantics. Calling `.extend(...)` on a Zod object
returns a strict schema by default — unknown fields are stripped. `.passthrough()`
restores the original loose-object behaviour so unknown fields pass through
untouched. This matches the OpenAPI contract where additional properties are
allowed.

### Why `.extend({ model: z.string().min(1) })`

The OpenAPI spec declares `model` as optional and nullable. ISB requires a
non-empty string for routing decisions. The wrapper overrides the generated
`model` field with a stricter `z.string().min(1)` constraint at the protocol
boundary.

### Rule

**Only the entry-point wrapper schema applies `.passthrough()`.** Downstream
consumers must not add `.passthrough()` independently — it is a deliberate
protocol-boundary override, not a general default.

---

## Type migration

The legacy `openresponses.generated.d.ts` (produced by `openapi-typescript`) is
**deprecated**. It is preserved only during the migration period and excluded
from ESLint.

Replace `.d.ts` imports with `z.infer<>` from the generated Zod schemas:

```typescript
// ❌ Deprecated
import type { CreateResponseBody } from "./openresponses.generated.js";

// ✅ Current
import type { CreateResponseBody } from "./responses.schemas.js";
// (exported as z.infer<typeof CreateResponseSchema>)
```

Once all consumers have migrated, `openresponses.generated.d.ts` can be deleted.

---

## Troubleshooting

### NodeNext extension error

**Symptom:** TypeScript reports `Cannot find module './generated/zod/...'` or
a similar resolution error.

**Cause:** Generated imports use `.js` extensions (correct for NodeNext), but
`kubb.config.ts` `output.extension` was not set or was removed.

**Fix:** Ensure `kubb.config.ts` includes:

```typescript
output: {
    path: "...",
    extension: { ".ts": ".js" },
},
```

Then re-run `pnpm generate:schemas`.

---

### `as unknown as z.ZodObject` cast

**Symptom:** TypeScript error when calling `.extend()` on a generated schema —
`Property 'extend' does not exist on type 'ZodType<...>'`.

**Cause:** `typed: true` in `pluginZod` causes Kubb to type the export as
`z.ZodType<T>` (the abstract base class). At runtime the value is a
`z.ZodObject`, but TypeScript does not know this statically.

**Fix:** Cast explicitly before calling `.extend()`:

```typescript
(schema as unknown as z.ZodObject<z.ZodRawShape>).extend({ ... })
```

This is the pattern used in `responses.schemas.ts` and is the correct
workaround for `typed: true` output.
