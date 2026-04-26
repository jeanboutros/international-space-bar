# international-space-bar

Agent orchestration platform for a software development agency. Runs a multi-agent system with roles such as agency director, HR, engineers, testers, QA, project managers, and documentation writers.

## Stack

- **Runtime**: Node.js 22 (Active LTS)
- **Language**: TypeScript 5 (strict mode, ESM)
- **Agent framework**: `@langchain/langgraph` with `StateSchema` + `MessagesValue`
- **Validation**: Zod 4
- **Package manager**: pnpm

## Project structure

```
src/international-space-bar/   # Source files
dist/                          # Compiled output (tsup)
```

## Commands

| Task | Command |
|------|---------|
| Run (dev) | `pnpm dev` |
| Build | `pnpm build` |
| Run (built) | `pnpm start` |
| Lint | `pnpm lint` |
| Lint + auto-fix | `pnpm lint:fix` |
| Format | `pnpm format` |
| Lint + format + fix (all) | `pnpm check` |

## Code quality — mandatory after every change

After **every** code change, run the following and ensure both exit with code 0 before considering the task complete:

```bash
pnpm check
```

`pnpm check` runs Biome (formatting + non-type-aware linting, auto-fix) followed by ESLint (type-aware rules, auto-fix). If either reports errors that cannot be auto-fixed, resolve them manually before proceeding.

- Biome owns: formatting, import organisation, and all non-type-aware lint rules.
- ESLint owns: type-aware rules only (`no-floating-promises`, `no-misused-promises`, `await-thenable`, `no-unsafe-*`).
- Never suppress a lint rule without a comment explaining why.

## LangGraph reference

When clarification about LangGraph APIs, patterns, or behaviour is needed, use Context7 to fetch up-to-date documentation:

```
resolve-library-id: "langgraph"  → use /websites/langchain-ai_github_io_langgraphjs
get-library-docs: context7CompatibleLibraryID="/websites/langchain-ai_github_io_langgraphjs", topic="<your topic>"
```

## General principles

- Always suggest modern, ergonomic tooling over legacy alternatives (e.g. `tsup` over `tsc` + `tsc-alias`, `tsx` over `ts-node`)
- Prefer fewer tools with broader capabilities over composing many single-purpose tools
- Favour ESM-native packages and patterns
- When multiple approaches exist, recommend the one with the better developer experience and lower maintenance burden
- Always verify suggestions against up-to-date documentation (use Context7 when available)

## Conventions

- State schemas use `StateSchema` from `@langchain/langgraph`, not `Annotation.Root`
- Message fields use `MessagesValue` (prebuilt reducer), not plain Zod arrays
- Context schemas use a Zod `z.object(...)` passed to `StateGraph({ context: ... })`
- `GraphNode` is typed using the type bag pattern: `GraphNode<{ InputSchema, OutputSchema, ContextSchema, Nodes }>`
- `ContextSchema` in the type bag takes the Zod schema (`typeof MySchema`), not the inferred type (`z.infer<typeof MySchema>`)
- Source lives in `src/`, never in `node_modules/`
- `"type": "module"` is set — use ESM imports throughout
