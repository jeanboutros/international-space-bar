# isb-0048: Kubb toolchain setup — install packages, config, linter excludes

| Field | Value |
|-------|-------|
| Epic | isb-epic-002 |
| Type | feature |
| Status | `backlog` |
| Assignee | Engineer |
| Priority | `high` |
| Created | 2026-04-29 |
| Dependencies | none |
| Parent | isb-0046 |

## Description

Install the Kubb code-generation toolchain, create `kubb.config.ts` at workspace root, add the `pnpm generate:schemas` script to `package.json`, and configure linter excludes in `biome.json` and `eslint.config.js` so that the (not-yet-generated) output directory is already excluded before any files land there.

No schema generation is performed in this ticket. The linter configuration must be in place — and verified with `pnpm check` — before Ticket 2 runs generation.

## Acceptance Criteria

- [ ] Kubb dev-dependencies installed: `@kubb/core`, `@kubb/plugin-oas`, `@kubb/plugin-ts`, `@kubb/plugin-zod`, `@kubb/cli`
- [ ] `kubb.config.ts` created at workspace root with:
  - `input.path: "./docs/openapi/openresponses.json"`
  - `output.path: "./src/international-space-bar-server/openresponses/generated"`
  - `output.extension: { '.ts': '.js' }` (NodeNext ESM requirement)
  - `pluginOas()`, `pluginTs()`, `pluginZod({ output: { path: './zod' }, version: '4', unknownType: 'unknown', typed: true, inferred: true })`
- [ ] `"generate:schemas": "kubb generate"` script added to `package.json`
- [ ] `"src/**/openresponses/generated/**"` added to `biome.json` `files.ignore` array
- [ ] `"src/**/openresponses/generated/**"` added to `eslint.config.js` top-level `ignores` array
- [ ] `pnpm check` exits 0 (linter excludes are syntactically correct; no generated files exist yet)

## Files Affected

- `package.json` (dev-dependencies, `generate:schemas` script)
- `kubb.config.ts` (new — workspace root)
- `biome.json` (`files.ignore` array)
- `eslint.config.js` (`ignores` array)
