# Agent Validation Pipeline — Reusable Workflow

A multi-agent execution pipeline for validating, planning, and implementing changes to the codebase. Designed for reuse across any design document or feature request that requires architectural review, implementation, and quality assurance.

---

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   Phase A — Validation                       │
│                     (max 3 loops)                            │
│                                                             │
│   ┌──────────────┐  ┌──────────────┐                        │
│   │ 1: Architect  │  │ 2: Engineer  │  (parallel)           │
│   └──────┬───────┘  └──────┬───────┘                        │
│          └────────┬────────┘                                │
│                   ▼                                         │
│         ┌──────────────────┐                                │
│         │ 3: Tech Validator │  (sequential — PoC + Context7) │
│         └────────┬─────────┘                                │
│                  │ satisfied?                                │
│                  ├── no → loop back (max 3x) ───────────┐   │
│                  └── yes ▼                               │   │
└──────────────────────────┼──────────────────────────────┘   │
                           │                                   │
┌──────────────────────────┼──────────────────────────────────┐
│              Phase B — Planning                              │
│                                                             │
│   ┌──────────────────┐  ┌──────────────────┐                │
│   │ 4: Test Planner   │  │ 5: Docs Planner  │  (parallel)  │
│   └──────┬───────────┘  └──────┬───────────┘               │
│          └────────┬────────────┘                            │
│                   ▼                                         │
│         ┌────────────────────────┐                          │
│         │ 6: PM — creates tickets │                         │
│         └────────┬───────────────┘                          │
└──────────────────┼──────────────────────────────────────────┘
                   │
┌──────────────────┼──────────────────────────────────────────┐
│         Phase C — Execution (per ticket)                     │
│                                                             │
│         ┌────────────────────┐                              │
│         │ 7a: Engineer       │  writes production code      │
│         └────────┬───────────┘                              │
│                  │ pnpm check (fail fast)                    │
│                  ▼                                           │
│   ┌──────────────────┐  ┌──────────────────┐                │
│   │ 7b: Tester        │  │ 7c: Docs Writer  │  (parallel)  │
│   └──────┬───────────┘  └──────┬───────────┘               │
│          └────────┬────────────┘                            │
│                   │ pnpm check (fail fast)                   │
│                   ▼                                         │
│         ┌────────────────────┐                              │
│         │ 8: Challenger      │  per-ticket validation       │
│         └────────┬───────────┘                              │
│                  │ satisfied?                                │
│                  ├── no → route feedback (max 3x) ──┐       │
│                  └── yes → commit ──────────────────▼       │
│                                                             │
│   After ALL tickets → back to Phase A (1 re-entry)          │
└─────────────────────────────────────────────────────────────┘
```

---

## Agent Files

Each pipeline role maps to a `.agent.md` file in `.github/agents/`. Agent Zero
is the only user-invocable agent — all others are subagents invoked by Agent Zero.

| Pipeline role | Agent file | Phase | Tools | Mode |
|---------------|-----------|-------|-------|------|
| **Agent Zero** (orchestrator) | `agent-zero.agent.md` | All | read, search, execute, edit, agent, todo, web | User-invocable |
| **Architect** (Agent 1) | `architect.agent.md` | A | read, search | Subagent |
| **Engineer** (Agent 2 / 7a) | `engineer.agent.md` | A, C | read, search, edit, execute | Subagent |
| **Tech Validator** (Agent 3) | `tech-validator.agent.md` | A | read, search, execute, web | Subagent |
| **Test Planner** (Agent 4) | `test-planner.agent.md` | B | read, search | Subagent |
| **Docs Planner** (Agent 5) | `docs-planner.agent.md` | B | read, search | Subagent |
| **PM** (Agent 6) | `pm.agent.md` | B | read, search, edit, execute | Subagent |
| **Tester** (Agent 7b) | `tester.agent.md` | C | read, search, edit, execute | Subagent |
| **Docs Writer** (Agent 7c) | `docs-writer.agent.md` | C | read, search, edit | Subagent |
| **Challenger** (Agent 8) | `challenger.agent.md` | C | read, search, execute | Subagent |

### Handoff diagram

```
User
  │
  ▼
Agent Zero (orchestrator)
  │
  ├── Phase A ──┬── Architect ────────┐
  │             └── Engineer (review) ─┤ parallel
  │                                    ▼
  │                              Tech Validator
  │                                    │
  │             ┌── satisfied? ────────┤
  │             │                      └── not satisfied → loop (max 3x)
  │             ▼
  ├── Phase B ──┬── Test Planner ─────┐
  │             └── Docs Planner ─────┤ parallel
  │                                    ▼
  │                                   PM
  │                                    │
  │             creates epics + tickets in backlog/
  │                                    │
  ├── Phase C ─── per ticket: ─────────┤
  │             │                      │
  │             ├── Engineer (impl) ───┤
  │             │   └── pnpm check     │
  │             ├── Tester ────────────┤ parallel
  │             ├── Docs Writer ───────┤
  │             │   └── pnpm check     │
  │             └── Challenger ────────┤
  │                 │                  │
  │                 ├── approved → commit + close ticket
  │                 └── rejected → route feedback → loop (max 3x)
  │
  └── Full review → back to Phase A (1 re-entry max)
```

---

## Phase A — Validation

### Purpose

Validate that a design document or feature request is architecturally sound, engineering-feasible, and consistent with the actual codebase before any implementation begins.

### Agents

| # | Role | Receives | Produces | Runs |
|---|------|----------|----------|------|
| 1 | **Architect** | Design document + AGENTS.md | Architecture review: layered boundaries, DI patterns, separation of concerns | Parallel with Agent 2 |
| 2 | **Engineer** | Design document + relevant source files | Engineering review: API signatures, implementation feasibility, code patterns | Parallel with Agent 1 |
| 3 | **Tech Validator** | Combined output from Agents 1 + 2 | Validated findings with PoC snippets, Context7 lookups, codebase reads | Sequential after 1 + 2 |

### Validation loop

Agent 3 produces a satisfaction verdict:
- **Satisfied** → proceed to Phase B
- **Not satisfied** → loop back with specific feedback (max 3 iterations)
- **Exhausted** (3 loops, still unsatisfied) → escalate to user

### What Agent 3 validates

1. Code examples in the design doc match actual codebase signatures
2. Proposed changes are consistent with layered architecture rules
3. No missing signature changes or dependency violations
4. PoC snippets compile and are type-correct
5. Library APIs referenced are current (verified via Context7)

---

## Phase B — Planning

### Purpose

Decompose the validated design into actionable, dependency-ordered tickets with clear acceptance criteria.

### Agents

| # | Role | Receives | Produces | Runs |
|---|------|----------|----------|------|
| 4 | **Test Planner** | Validated design document | Test strategy: what to test, test types, coverage expectations | Parallel with Agent 5 |
| 5 | **Docs Planner** | Validated design document | Documentation plan: what to document, which files to create/update | Parallel with Agent 4 |
| 6 | **PM** | Outputs from Agents 3, 4, 5 | Ordered tickets with dependencies, acceptance criteria, file lists | Sequential after 4 + 5 |

### Epics

When the design document describes distinct phases or priority tiers, the PM
creates **epics** — one per phase/priority group. Epics live in a dedicated
folder and act as the parent container for related tickets.

```
docs/project-management/
  epics/            # Epic definitions — one file per epic
  backlog/          # Tickets to be done (not yet started)
  open/             # Tickets currently active (in-progress)
  closed/           # Tickets completed or discarded
  clarifications/   # Open questions awaiting user decision
  adrs/             # Architecture Decision Records — resolved decisions
  counters.json     # Tracks last assigned IDs for all artifact types
  next-id.mjs       # Script to generate the next ID(s)
```

> **IMPORTANT — always use the ID generator script.**
> Never invent ticket, epic, clarification, or ADR numbers manually. Run the
> script to get the next available ID. This prevents duplicate or skipped
> numbers caused by hallucination or miscounting. Use `--dry-run` to preview
> without updating the counter.
>
> ```bash
> node docs/project-management/next-id.mjs ticket            # next ticket id
> node docs/project-management/next-id.mjs ticket 5          # next 5 ticket ids
> node docs/project-management/next-id.mjs epic              # next epic id
> node docs/project-management/next-id.mjs clarification     # next clarification id
> node docs/project-management/next-id.mjs adr               # next ADR id
> node docs/project-management/next-id.mjs ticket --dry-run  # preview only
> ```
>
> Output is JSON for easy parsing:
> ```json
> { "kind": "ticket", "ids": ["isb-0001", "isb-0002"], "dryRun": false }
> ```

#### Epic template

```markdown
# isb-epic-NNN: Epic title

| Field | Value |
|-------|-------|
| Priority | `critical` / `high` / `medium` / `low` |
| Status | `not-started` / `in-progress` / `done` |
| Created | YYYY-MM-DD |
| Design doc | Link to the design document section |
| Tickets | isb-NNNN, isb-NNNN, ... |

## Summary

What this epic delivers and why it exists as a group.

## Scope

Bullet list of what is included.

## Design decisions referenced

Which decisions from the design doc apply.

## Acceptance criteria (from design doc)

Subset of the design doc's ACs that this epic must satisfy.

## Dependencies

Other epics that must complete first (or "none").
```

### Ticket format

Tickets are markdown files that move between folders as they progress through
their lifecycle (see [Ticket lifecycle](#ticket-lifecycle) below).

```
docs/project-management/backlog/isb-NNNN-short-name.md   # to be done
docs/project-management/open/isb-NNNN-short-name.md      # active
docs/project-management/closed/isb-NNNN-short-name.md    # completed / discarded
```

### Ticket template

```markdown
# isb-NNNN: Short descriptive title

| Field | Value |
|-------|-------|
| Epic | isb-epic-NNN |
| Status | `backlog` / `open` / `closed` |
| Assignee | Agent role (e.g. "Engineer", "Tester") |
| Priority | `critical` / `high` / `medium` / `low` |
| Created | YYYY-MM-DD |
| Completed | — |
| Dependencies | isb-NNNN, isb-NNNN (or "none") |

## Description

What this ticket implements and why.

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Files Affected

- `path/to/file.ts` — description of change

## PoC Snippets

```typescript
// Proof-of-concept code from validation phase
```

## Comments

Agent notes, revision history, challenger feedback.
```

### Ticket lifecycle

Tickets move between folders — the folder **is** the status:

| Folder | Meaning | Entry condition | Exit condition |
|--------|---------|-----------------|----------------|
| `backlog/` | To be done | PM creates ticket during Phase B | Work begins → move to `open/` |
| `open/` | Active — currently being worked | Engineer/Tester/Writer picks it up | Challenger approves or ticket is discarded → move to `closed/` |
| `closed/` | Completed or discarded | Challenger satisfied + committed, or explicitly discarded | Terminal state |

When a ticket moves folders, update its `Status` field to match (`backlog` → `open` → `closed`). The file name stays the same — only the parent folder changes.

**Why this structure**: Keeping active tickets in `open/` and completed ones in
`closed/` prevents the working set from growing unbounded. Agents and humans
can scan `open/` to see current work without wading through hundreds of
finished tickets.

### Dependency ordering

The PM orders tickets so that:
- Infrastructure changes come first (interfaces, config, logging)
- Feature changes depend on infrastructure
- Tests depend on the code they test
- Documentation depends on implemented features
- Tickets within the same epic share a priority tier; cross-epic dependencies are explicit

---

## Phase C — Execution

### Purpose

Implement each ticket with production code, tests, and documentation, then validate quality before committing.

### Per-ticket execution order

```
Step 1:  7a: Engineer writes production code
         └── pnpm check (must pass before proceeding)

Step 2:  7b: Tester writes tests        ┐
         7c: Docs Writer writes docs     ┘ parallel (both depend on 7a)
         └── pnpm check (must pass before proceeding)

Step 3:  8: Challenger validates the ticket
         └── satisfied? → commit
         └── not satisfied? → route feedback
```

### Agent responsibilities

| # | Role | Input | Output | Quality gate |
|---|------|-------|--------|--------------|
| 7a | **Engineer** | Ticket + design doc | Production code changes | `pnpm check` exits 0 |
| 7b | **Tester** | Ticket + implemented code from 7a | Test files | `pnpm check` exits 0 |
| 7c | **Docs Writer** | Ticket + implemented code from 7a | Documentation updates | `pnpm check` exits 0 |
| 8 | **Challenger** | Ticket + all outputs from 7a/7b/7c | Pass/fail verdict + specific feedback | — |

### Challenger feedback routing

The Challenger inspects the implementation against the ticket's acceptance criteria and provides targeted feedback:

| Feedback targets | Route to | Effect |
|-----------------|----------|--------|
| Production code issues | 7a: Engineer | Engineer applies fixes (not re-implementation) |
| Test-only issues | 7b: Tester (pass-through) | 7a untouched, tester revises tests |
| Documentation-only issues | 7c: Docs Writer (pass-through) | 7a untouched, writer revises docs |
| Multiple concerns | Routed independently | Each agent receives only their relevant feedback |

After fixes → `pnpm check` → re-validate with Challenger.

### Loop limits

| Loop | Max iterations | On exhaustion |
|------|---------------|---------------|
| Phase A (validation) | 3 | Escalate to user |
| Phase C inner (7→8 per ticket) | 3 | Escalate to user |
| Phase C → Phase A (full review) | 1 re-entry | Final — no further loops |

### Post-execution full review

After ALL tickets in Phase C are complete:
1. Return to Phase A (Agents 1 + 2 + 3) for a full review of the implemented code
2. If the review produces new findings → PM creates additional tickets → re-enter Phase C
3. This full-review re-entry happens **at most once** to prevent infinite loops

---

## Commit Strategy

### Principles

- **Multiple commits per ticket**, grouped by concern
- Each commit is independently revertable
- `pnpm check` must pass before each commit
- Conventional commit format referencing the ticket number

### Commit grouping per ticket

```
feat(config): add agentLogFilePath to config schema [isb-0001]
feat(interfaces): add agentLogger to AppContext [isb-0001]
feat(logging): create separate agent pino instance [isb-0001]
test(logging): verify agent and system log separation [isb-0001]
docs(logging): update agent observability design doc [isb-0001]
```

After all commits for a ticket land and the Challenger approves, move the
ticket file from `open/` to `closed/` and update its `Status` and `Completed`
fields.

### Conventional commit format

```
type(scope): concise description [isb-NNNN]

What: one-line summary of the change
Why: motivation or design decision reference

Affected files:
- path/to/file.ts
- path/to/other-file.ts
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

Scopes match the project's layered structure: `config`, `interfaces`, `logging`, `agent`, `workflow`, `tui`, `services`

---

## Quality Gates

Every agent output passes through quality gates before proceeding:

| Gate | When | Criteria |
|------|------|----------|
| `pnpm check` | After every code change (7a, 7b, 7c, fixes) | Biome formatting + ESLint type-aware rules exit 0 |
| Challenger review | After each ticket's implementation | All acceptance criteria met, no regressions |
| Full review | After all tickets complete | Architecture review + engineering review on final code |

---

## Clarifications & Architecture Decision Records (ADRs)

### When to create a clarification

A **clarification** is created whenever:
- There is no consensus between agents (e.g. Architect and Engineer disagree)
- Two or more valid approaches exist and the tradeoffs are non-trivial
- An assumption needs user confirmation before implementation proceeds
- A design decision has significant risk, complexity, or long-term impact

Clarifications **pause the pipeline** — no implementation proceeds on the
affected area until the user resolves them. Unaffected tickets may continue.

### Clarification lifecycle

```
Agent identifies ambiguity → creates clarification in clarifications/
  → user reads and decides
  → decision recorded as ADR in adrs/
  → clarification file updated with a link to the ADR
  → implementation proceeds
```

### Clarification template

```markdown
# isb-clar-NNNN: Short question title

| Field | Value |
|-------|-------|
| Status | `open` / `resolved` |
| Created | YYYY-MM-DD |
| Resolved | — |
| ADR | — (link to ADR once resolved) |
| Raised by | Agent role (e.g. "Architect", "Tech Validator") |
| Blocking | isb-NNNN, isb-epic-NNN (tickets/epics this blocks) |

## Question

One-sentence summary of what needs to be decided.

## Background

Full context: why this came up, what was being worked on, relevant history.

## Code context

Relevant code snippets, file paths, and current signatures.

```typescript
// Current state of the code
```

## Options

### Option A: [name]

**Description**: What this option does.

**Example**:
```typescript
// How the code would look
```

**Benefits (short-term)**: ...
**Benefits (long-term)**: ...
**Risks**: ...
**Complexity**: low / medium / high
**Impact on existing code**: ...
**Estimated scope**: number of files, size of change

### Option B: [name]

**Description**: What this option does.

**Example**:
```typescript
// How the code would look
```

**Benefits (short-term)**: ...
**Benefits (long-term)**: ...
**Risks**: ...
**Complexity**: low / medium / high
**Impact on existing code**: ...
**Estimated scope**: number of files, size of change

## Comparison

| Dimension | Option A | Option B |
|-----------|----------|----------|
| Complexity | | |
| Risk | | |
| Short-term benefit | | |
| Long-term benefit | | |
| Migration effort | | |

## Recommendation

Agent's recommendation and reasoning (if any). The user makes the final call.
```

### When to create an ADR

An **ADR** is created when the user resolves a clarification by choosing an
option. ADRs are permanent records — they are never deleted, only superseded
by newer ADRs that reference the original.

### ADR template

```markdown
# isb-adr-NNNN: Short decision title

| Field | Value |
|-------|-------|
| Status | `accepted` / `superseded` |
| Created | YYYY-MM-DD |
| Clarification | isb-clar-NNNN (link to the clarification that prompted this) |
| Supersedes | — (or isb-adr-NNNN if replacing a previous decision) |
| Superseded by | — (updated if a later ADR replaces this one) |

## Decision

One-sentence summary: what was decided.

## Context

Why this decision was needed — reference the clarification for full background.

## Options considered

Brief summary of options (full details in the linked clarification).

## Rationale

Why this option was chosen over the alternatives. Include the user's reasoning.

## Consequences

- What changes as a result of this decision
- What constraints this imposes going forward
- What becomes easier or harder

## Implementation

Tickets affected: isb-NNNN, isb-NNNN
Files affected: list of files that will change as a result
```

### Integration with the pipeline

| Phase | How clarifications/ADRs interact |
|-------|----------------------------------|
| **Phase A** | Architect or Engineer raises a clarification when they disagree or spot ambiguity. Tech Validator may also raise one if PoC reveals multiple valid paths. |
| **Phase B** | PM checks for open clarifications before creating tickets. Blocked areas are not ticketed until resolved. |
| **Phase C** | Engineer, Tester, or Challenger may raise a clarification if implementation reveals an unforeseen choice. Work on the affected ticket pauses. |
| **Any phase** | User resolves clarification → ADR created → blocked work resumes. |

---

## Reuse Guide

To apply this pipeline to a new design document or feature request:

1. **Prepare**: Write or receive a design document with clear problem statement, decisions, and acceptance criteria
2. **Phase A**: Run Architect + Engineer + Tech Validator against the design doc and codebase
3. **Phase B**: Run Test Planner + Docs Planner + PM to produce epics and tickets
   - PM creates epics in `epics/` for each design phase or priority tier
   - PM creates tickets in `backlog/` linked to their parent epic
4. **Phase C**: For each ticket in dependency order:
   - Move ticket from `backlog/` to `open/`
   - Execute: Engineer → Tester/Docs → Challenger loop
   - On approval: move ticket from `open/` to `closed/`
5. **Full review**: Return to Phase A for final validation of implemented code

The pipeline is framework-agnostic — it works for any codebase that has:
- A lint/format command (replaces `pnpm check`)
- A layered or modular architecture (for Architect review)
- Conventional commit conventions (for commit grouping)

### Folder structure

```
docs/project-management/
  epics/                              # Epic definitions
    isb-epic-NNN-name.md
  backlog/                            # Tickets: to be done
    isb-NNNN-name.md
  open/                               # Tickets: currently active
    isb-NNNN-name.md
  closed/                             # Tickets: completed or discarded
    isb-NNNN-name.md
  clarifications/                     # Open questions awaiting user decision
    isb-clar-NNNN-name.md
  adrs/                               # Architecture Decision Records
    isb-adr-NNNN-name.md
  counters.json                       # ID counters for all artifact types
  next-id.mjs                         # ID generator script
```
