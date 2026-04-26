---
description: "Use when committing changes, writing commit messages, staging files, or grouping changes into commits. Covers conventional commit format, body content, scope selection, grouping logic, and noting affected files."
---

# Git Commit Conventions

## Format

```
type(scope): short imperative description

Body explaining what changed, why, and any affected files.
```

- Subject line: 72 characters max, lowercase after colon, no trailing period.
- Body: separated from subject by one blank line.
- Use present-tense imperative mood throughout ("add", "replace", "remove", not "added").

## Types

| Type | When to use |
|------|-------------|
| `feat` | New capability or public API addition |
| `refactor` | Code restructure with no behaviour change |
| `fix` | Bug fix, lint error resolution, or broken-behaviour correction |
| `chore` | Tooling, dependencies, CI, config — no production code change |
| `docs` | Documentation only (`*.md`, JSDoc, comments) |
| `test` | Tests only |
| `perf` | Performance improvement |

## Scopes

Use the module or layer being changed: `config`, `logging`, `app`, `graph`, `tools`, `llm`, `agent`, `interfaces`, `tooling`.  
Omit the scope when the commit genuinely spans multiple unrelated modules (e.g., `fix: apply biome formatting across modules`).

## Body

Always include a body when:
- More than one file changed, OR
- The reason for the change is not obvious from the subject.

Structure the body with:

1. **What changed** — describe the new shape of the code.
2. **Why** — motivation, problem it solves, lint rule it fixes, or behaviour it enables.
3. **Affected files** — list files with a one-line note when multiple files are touched, using bullet points.

### Example

```
refactor(graph): replace console calls with logger and move nodes into factory

All console.log/debug/error replaced with structured logger calls via
ctx.logger. Nodes (mockLLM, mockLLMPostToolSummary) moved into a
buildGraph(logger) factory so they close over the ILogger instance.
The compiled graph and MemorySaver are module-level singletons so
thread memory persists across runGraph calls.

Affected:
- graph.ts: factory pattern, logger injection, module-level singleton
```

## Grouping Commits

Stage and commit changes in logical groups — one commit per concern.  
Never mix unrelated changes in a single commit.

Typical grouping order when committing a batch of changes:

1. Core infrastructure changes (logging, config, interfaces)
2. Feature or refactor changes (graph, agents, LLM)
3. Tool-level changes (tools/, llm/)
4. Mechanical/housekeeping fixes (formatting, lint suppression, dependency bumps)

Each group should be independently revertable.

## Noting Side Effects

When a change in one module affects another (e.g., `Logging.getLogger` is now callable before `init`), call it out explicitly:

```
Any module can now call Logging.getLogger('my.module') synchronously
without await or AppContext. Once the configured backend is ready it
takes over; the fallback is never allocated in the normal post-init path.
```

If a change requires a peer dependency or a consumer update, note it:

```
- agent/orchestrator.agent.ts: requires @langchain/anthropic as peer
  dep; install separately if not already present
```

## Biome / Lint Fixes

When a commit only fixes lint or formatting errors (no logic change):

- Use `fix:` or `chore:` type.
- Note the specific rule or tool where useful (`biome-ignore` comment, `require-await`, etc.).
- Group all mechanical fixes into a single commit rather than one per file.

## Dependency-Only Changes

Use `chore(deps):` for `package.json` / `pnpm-lock.yaml` changes.  
State the package name and version, and why it was added or updated.

```
chore(deps): add @langchain/anthropic as required by deepagents

deepagents@1.9.0 eagerly imports @langchain/anthropic at startup;
without it the process exits with MODULE_NOT_FOUND on first run.
```
