# Agent Validation Pipeline — Reusable Workflow

A multi-agent execution pipeline for validating, planning, and implementing changes to the codebase. Designed for reuse across any design document or feature request that requires architectural review, implementation, and quality assurance.

---

## Pipeline Principles

<constraints enforcement="absolute">
  These constraints apply to every agent in every phase. They override all other considerations.

1. **NEVER execute without loading context first.** Every agent must load relevant standards, skills, and project conventions before producing any output. No agent may skip context loading for speed or simplicity.

2. **NEVER skip an approval gate.** No phase transition happens without explicit go-ahead from the gatekeeper (Tech Validator for A→B, PM readiness for B→C, Challenger for commit). No agent may proceed past a failing quality gate.

3. **NEVER auto-fix errors.** When an error is found during validation or implementation, the discovering agent must **report first** and request direction. Report the error, propose a fix, and get approval before applying it. Silent self-fixing is prohibited.

4. **NEVER implement an entire plan at once.** Break work into incremental logical steps. Implement one unit of work, validate it, then proceed to the next. Each step gets its own quality check between steps, not just once at the end.

5. **ALWAYS validate after each step.** Run the project's quality command (e.g. `pnpm check`) after each logical unit of work within a ticket, not just once after the whole ticket. Catch regressions early.

6. **NEVER create project-management artifacts directly.** Only the PM creates tickets, epics, clarifications, and ADRs. Any agent that identifies work requiring a ticket must raise a **flag** (structured request) to the PM. The PM evaluates the flag, assigns an ID via `next-id.mjs`, and creates the artifact. No agent bypasses the PM to create project-management artifacts directly. (See: Flag Protocol below.)

If you find yourself violating these rules, STOP and correct course.
</constraints>

### Flag Protocol

When any agent identifies work that needs a ticket, clarification, epic, or ADR, they produce a **flag** rather than creating the artifact themselves.

```markdown
## Flag: [type] — [short title]

| Field     | Value                                                     |
| --------- | --------------------------------------------------------- |
| Type      | `ticket` / `clarification` / `epic` / `adr`               |
| Priority  | `critical` / `high` / `medium` / `low`                    |
| Raised by | Agent role (e.g. "Security Reviewer", "Architect")        |
| Blocking  | `yes` / `no` — does this block the current pipeline step? |
| Reference | Current ticket/phase (e.g. "isb-0042", "Phase A")         |

## Description

What was found and why it needs a project-management artifact.

## Evidence

Relevant code, findings, or PoC snippets that support the flag.

## Suggested action

What the flagging agent recommends (the PM decides).
```

Agent Zero routes flags to the PM. The PM evaluates whether to create the artifact, merge it with existing work, or defer it. **Flags marked `Blocking: yes`** pause the current step until the PM resolves them. **Flags marked `Blocking: no`** are queued and do not block the pipeline.

### Skill Loading Protocol

Every agent must load relevant skills **before** producing any output. Skills are loaded in order: general first, then project-specific.

| Skill                  | When to load                                 | By whom                                                            |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `assumption-trap`      | Before any agent's work begins               | All agents — universal                                             |
| `pau-loop`             | Before any implementation task               | Engineer, Tester, Docs Writer                                      |
| `backend-engineering`  | Before any backend work                      | Architect, Engineer, Tech Validator, Security Reviewer, Challenger |
| `frontend-engineering` | Before any frontend work                     | Architect, Engineer, Tech Validator, Security Reviewer, Challenger |
| `isb-backend`          | Before any ISB-specific backend work         | Architect, Engineer, Tech Validator, Security Reviewer, Challenger |
| `isb-frontend`         | Before any ISB-specific frontend work        | Architect, Engineer, Tech Validator, Security Reviewer, Challenger |
| `tester-standards`     | Before writing any test code                 | Tester                                                             |
| `complex-reasoning`    | When validation is ambiguous or multi-factor | Tech Validator, Security Reviewer                                  |

Agents load only the skills relevant to their domain. If the ticket spans both backend and frontend, load both domain skill pairs.

---

## Pipeline Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                   Phase A — Validation                            │
│                     (max 3 loops)                                 │
│                                                                  │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐       │
│   │ 1: Architect  │  │ 2: Engineer  │  │ 1b: Security     │       │
│   └──────┬───────┘  └──────┬───────┘  │    Reviewer      │       │
│          └────────┬────────┘         └──────┬───────────┘       │
│                   ▼                                 │             │
│         ┌──────────────────┐                        │             │
│         │ 3: Tech Validator │  (sequential — PoC + Context7) │    │
│         └────────┬─────────┘                        │             │
│                  │ satisfied?                        │             │
│                  ├── no → loop back (max 3x) ───────┐│             │
│                  └── yes ─────────────────────────────┘│            │
└──────────────────────────┼──────────────────────────────┘           │
                           │                                        │
┌──────────────────────────┼────────────────────────────────────────┐
│              Phase B — Planning                                    │
│                                                                   │
│   ┌──────────────────┐  ┌──────────────────┐                     │
│   │ 4: Test Planner   │  │ 5: Docs Planner  │  (parallel)         │
│   │                   │  │ (incl. standards) │                    │
│   └──────┬───────────┘  └──────┬───────────┘                     │
│          └────────┬────────────┘                                 │
│                   ▼                                               │
│         ┌────────────────────────┐                                │
│         │ 6: PM — creates tickets │  (sole ticket creation authority)│
│         └────────┬───────────────┘                                │
└──────────────────┼────────────────────────────────────────────────┘
                   │
┌──────────────────┼────────────────────────────────────────────────┐
│         Phase C — Execution (per ticket)                           │
│                                                                   │
│         ┌────────────────────┐                                    │
│         │ 7a: Engineer       │  writes production code             │
│         └────────┬───────────┘                                    │
│                  │ pnpm check (fail fast)                          │
│                  ▼                                                 │
│   ┌──────────────────┐  ┌──────────────────┐ ┌──────────────────┐ │
│   │ 7b: Tester        │  │ 7c: Docs Writer  │ │ 7d: Security     │ │
│   └──────┬───────────┘  └──────┬───────────┘ │    Reviewer     │ │
│          └────────┬────────────┘              └──────┬───────────┘ │
│                   │ pnpm check (7b + 7c)             │ scan output  │
│                   ▼                                  │              │
│         ┌────────────────────┐                      │              │
│         │ 8: Challenger      │  ← receives security assessment    │
│         └────────┬───────────┘                      │              │
│                  │ satisfied?                        │              │
│                  ├── no → route feedback (max 3x) ──┤              │
│                  └── yes → commit                    │              │
│                                                     │              │
│   Security Reviewer flags ──→ PM (vulnerability tickets, non-blocking)      │
│                                                                   │
│   After ALL tickets → back to Phase A (1 re-entry)                │
└───────────────────────────────────────────────────────────────────┘
```

---

## Agent Files

Each pipeline role maps to a `.agent.md` file in `.github/agents/`. Agent Zero
is the only user-invocable agent — all others are subagents invoked by Agent Zero.

| Pipeline role                         | Agent file                   | Phase | Tools                                                                                                                                                                                                | Mode           |
| ------------------------------------- | ---------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **Agent Zero** (orchestrator)         | `agent-zero.agent.md`        | All   | read, search, execute, edit, agent, todo, web, vscode/getProjectSetupInfo, vscode/memory, vscode/resolveMemoryFileUri, vscode/runCommand, vscode/switchAgent, vscode/askQuestions, vscode/toolSearch | User-invocable |
| **Architect** (Agent 1)               | `architect.agent.md`         | A     | read, search, context7, vscode/getProjectSetupInfo, vscode/memory, vscode/resolveMemoryFileUri, vscode/askQuestions, vscode/toolSearch                                                               | Subagent       |
| **Engineer** (Agent 2 / 7a)           | `engineer.agent.md`          | A, C  | read, search, edit, execute, context7, vscode/getProjectSetupInfo, vscode/memory, vscode/resolveMemoryFileUri, vscode/runCommand, vscode/askQuestions, vscode/toolSearch                             | Subagent       |
| **Security Reviewer** (Agent 1b / 7d) | `security-reviewer.agent.md` | A, C  | read, search, execute, context7, vscode/getProjectSetupInfo, vscode/memory, vscode/resolveMemoryFileUri, vscode/runCommand, vscode/askQuestions, vscode/toolSearch                                   | Subagent       |
| **Tech Validator** (Agent 3)          | `tech-validator.agent.md`    | A     | read, search, execute, web, context7, vscode/getProjectSetupInfo, vscode/memory, vscode/resolveMemoryFileUri, vscode/runCommand, vscode/askQuestions, vscode/toolSearch                              | Subagent       |
| **Test Planner** (Agent 4)            | `test-planner.agent.md`      | B     | read, search, context7, vscode/getProjectSetupInfo, vscode/memory, vscode/resolveMemoryFileUri, vscode/askQuestions, vscode/toolSearch                                                               | Subagent       |
| **Docs Planner** (Agent 5)            | `docs-planner.agent.md`      | B     | read, search, context7, vscode/getProjectSetupInfo, vscode/memory, vscode/resolveMemoryFileUri, vscode/askQuestions, vscode/toolSearch                                                               | Subagent       |
| **PM** (Agent 6)                      | `pm.agent.md`                | B     | read, search, edit, execute, vscode/getProjectSetupInfo, vscode/memory, vscode/resolveMemoryFileUri, vscode/runCommand, vscode/askQuestions, vscode/toolSearch                                       | Subagent       |
| **Tester** (Agent 7b)                 | `tester.agent.md`            | C     | read, search, edit, execute, context7, vscode/getProjectSetupInfo, vscode/memory, vscode/resolveMemoryFileUri, vscode/runCommand, vscode/askQuestions, vscode/toolSearch                             | Subagent       |
| **Docs Writer** (Agent 7c)            | `docs-writer.agent.md`       | C     | read, search, edit, context7, vscode/getProjectSetupInfo, vscode/memory, vscode/resolveMemoryFileUri, vscode/askQuestions, vscode/toolSearch                                                         | Subagent       |
| **Challenger** (Agent 8)              | `challenger.agent.md`        | C     | execute, read, search, web, context7, vscode/getProjectSetupInfo, vscode/memory, vscode/resolveMemoryFileUri, vscode/runCommand, vscode/askQuestions, vscode/toolSearch                              | Subagent       |

### Handoff diagram

```
User
  │
  ▼
Agent Zero (orchestrator)
  │
  ├── Phase A ──┬── Architect ───────────┐
  │             ├── Engineer (review) ────┤ parallel
  │             └── Security Reviewer ────┘ advisory
  │                                         │
  │                                    ┌────┴────┐
  │                                    │ flags → PM (non-blocking)
  │                                    ▼
  │                              Tech Validator
  │                                    │
  │             ┌── satisfied? ────────┤
  │             │                      └── not satisfied → loop (max 3x)
  │             ▼
  ├── Phase B ──┬── Test Planner ─────┐
  │             ├── Docs Planner ──────┤ parallel (includes standards)
  │             └──────────────────────┤
  │                                    ▼
  │                                   PM
  │                                    │
  │             creates epics + tickets in backlog/
  │             (sole ticket creation authority)
  │                                    │
  ├── Phase C ─── per ticket: ─────────┤
  │             │                      │
  │             ├── Engineer (impl) ───┤
  │             │   └── pnpm check     │ incremental
  │             ├── Tester ────────────┤ parallel
  │             ├── Docs Writer ───────┤ parallel
  │             ├── Security Reviewer ─┤ parallel scan
  │             │   └── flags → PM    │ (non-blocking)
  │             │   └── assessment ────┤→ feeds Challenger
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

Validate that a design document or feature request is architecturally sound, engineering-feasible, **secure by design**, and consistent with the actual codebase before any implementation begins.

### Agents

| #   | Role                  | Receives                                | Produces                                                                              | Runs                          |
| --- | --------------------- | --------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------- |
| 1   | **Architect**         | Design document + AGENTS.md             | Architecture review: layered boundaries, DI patterns, separation of concerns          | Parallel with Agents 2 and 1b |
| 2   | **Engineer**          | Design document + relevant source files | Engineering review: API signatures, implementation feasibility, code patterns         | Parallel with Agents 1 and 1b |
| 1b  | **Security Reviewer** | Design document + relevant source files | Security review: attack surfaces, trust boundaries, security gotchas, recommendations | Parallel with Agents 1 and 2  |
| 3   | **Tech Validator**    | Combined output from Agents 1 + 2 + 1b  | Validated findings with PoC snippets, Context7 lookups, codebase reads                | Sequential after 1 + 2 + 1b   |

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
6. **Security findings from Agent 1b are accounted for** (mitigations in the design, or flags for PM)

### What Agent 1b (Security Reviewer) reviews in Phase A

The Security Reviewer provides **advisory** security review during Phase A — identifying risks and recommending mitigations, not blocking implementation:

1. **Attack surfaces** — new entry points for untrusted input, authentication boundaries, authorization checks
2. **Trust boundaries** — where data crosses trust domains, sanitisation requirements
3. **Security gotchas** — common vulnerability patterns relevant to the technologies used
4. **Data flow** — sensitive data handling (secrets, PII, credentials) through the proposed design
5. **Design-level mitigations** — recommendations to include in the design before implementation begins

Phase A security review is **advisory**: findings become inputs to the Tech Validator and, if they require design changes, are flagged for the PM as clarifications. They do not block the pipeline directly — the Tech Validator decides whether unsatisfied security concerns warrant a loop-back.

---

## Phase B — Planning

### Purpose

Decompose the validated design into actionable, dependency-ordered tickets with clear acceptance criteria, **and ensure standards documentation is up to date**.

### Agents

| #   | Role             | Receives                                     | Produces                                                                                              | Runs                   |
| --- | ---------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------- |
| 4   | **Test Planner** | Validated design document                    | Test strategy: what to test, test types, coverage expectations                                        | Parallel with Agent 5  |
| 5   | **Docs Planner** | Validated design document                    | Documentation plan: what to document, **which standards need updating**, which files to create/update | Parallel with Agent 4  |
| 6   | **PM**           | Outputs from Agents 3, 4, 5 + security flags | Ordered tickets with dependencies, acceptance criteria, file lists + standards tickets                | Sequential after 4 + 5 |

### Standards documentation

Every feature implementation must be accompanied by **standards documentation** that defines how code should be written, not just what the feature does. The Docs Planner is responsible for identifying which standards docs need creating or updating.

**Core standards docs to review/update for every feature:**

| Standard                           | Purpose                                             | Minimum content                                                            |
| ---------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| Code quality                       | What "good code" means for this project             | Patterns, anti-patterns, naming rules, function size limits                |
| Directory structure / architecture | Where files live and why                            | Layered boundaries, allowed imports per layer, file placement rules        |
| Test coverage                      | How tests are written and what must be covered      | Minimum coverage, test structure, mocking patterns, edge-case expectations |
| Logging / observability            | What must be logged and how                         | Log levels, structured logging fields, what not to log                     |
| Naming conventions                 | Consistent naming across all agents' output         | File naming, variable naming, exported symbol naming                       |
| Code review checklist              | What the Challenger checks (definitive reference)   | Explicit list of rejection criteria, not ad-hoc judgment                   |
| Security                           | What security patterns and mitigations are required | Input validation, auth patterns, secret handling, vulnerability categories |

The Docs Planner must evaluate each feature against these standards and produce a plan item for any that need updating. If the project doesn't yet have a standards doc in one of these categories, the Docs Planner flags it for creation.

### Ticket creation authority

**Only the PM creates tickets, epics, clarifications, and ADRs.** All other agents raise **flags** (see Flag Protocol above) and the PM decides whether to create the corresponding artifact. This ensures:

- Consistent ID assignment via `next-id.mjs`
- No duplicate or skipped numbers from agent hallucination
- PM has visibility into all work being proposed
- PM can merge, split, or defer flags based on priority and dependencies

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
>
> ```json
> { "kind": "ticket", "ids": ["isb-0001", "isb-0002"], "dryRun": false }
> ```

#### Epic template

```markdown
# isb-epic-NNN: Epic title

| Field      | Value                                  |
| ---------- | -------------------------------------- |
| Priority   | `critical` / `high` / `medium` / `low` |
| Status     | `not-started` / `in-progress` / `done` |
| Created    | YYYY-MM-DD                             |
| Design doc | Link to the design document section    |
| Tickets    | isb-NNNN, isb-NNNN, ...                |

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

### Ticket types

Every ticket has a `type` field in its metadata. The type determines how the pipeline processes it:

| Type       | Meaning                            | Assignee                                                     | Typical flow                            |
| ---------- | ---------------------------------- | ------------------------------------------------------------ | --------------------------------------- |
| `feature`  | New functionality or enhancement   | Engineer → Tester → Docs Writer → Challenger                 | Full Phase C                            |
| `bug`      | Fix for existing broken behaviour  | Engineer → Tester → Challenger                               | Phase C (Docs Writer optional)          |
| `security` | Proven vulnerability requiring fix | Engineer → Tester → Security Reviewer (re-scan) → Challenger | Phase C with mandatory security re-scan |

### Ticket template

````markdown
# isb-NNNN: Short descriptive title

| Field        | Value                                  |
| ------------ | -------------------------------------- |
| Epic         | isb-epic-NNN                           |
| Type         | `feature` / `bug` / `security`         |
| Status       | `backlog` / `open` / `closed`          |
| Assignee     | Agent role (e.g. "Engineer", "Tester") |
| Priority     | `critical` / `high` / `medium` / `low` |
| Created      | YYYY-MM-DD                             |
| Completed    | —                                      |
| Dependencies | isb-NNNN, isb-NNNN (or "none")         |

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
````

## Security PoC (for type: security tickets only)

| Field                  | Value                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------- |
| Vulnerability category | `injection` / `auth-bypass` / `data-exposure` / `crypto` / `input-validation` / `other` |
| Confidence             | 1–10 (7+ required for filing)                                                           |
| Exploit scenario       | Step-by-step description of how this vulnerability could be exploited                   |
| Impact                 | What happens if exploited (data breach, RCE, etc.)                                      |
| Fix recommendation     | Specific fix approach                                                                   |

```bash
# Proof-of-concept exploit script or code snippet
# Must demonstrate the vulnerability is real, not theoretical
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
- Security vulnerability fixes are prioritized by severity (`critical` first)
- Tickets within the same epic share a priority tier; cross-epic dependencies are explicit

---

## Phase C — Execution

### Purpose

Implement each ticket with production code, tests, documentation, **and security verification** before committing.

### Per-ticket execution order

```

Step 1: 7a: Engineer writes production code
└── pnpm check (must pass before proceeding)
└── Incremental: implement one logical unit → validate → next unit

Step 2: 7b: Tester writes tests ┐
7c: Docs Writer writes docs ┤ parallel (both depend on 7a)
7d: Security Reviewer scans ┘ (also depends on 7a)
└── pnpm check (7b + 7c must pass before proceeding)
└── Security Reviewer produces:
(a) security assessment → feeds into Challenger
(b) vulnerability flags → queued for PM (non-blocking)

Step 3: 8: Challenger validates the ticket
└── Receives ALL outputs including security assessment
└── satisfied? → commit
└── not satisfied? → route feedback (includes security target)

````

### Incremental execution

Within a single ticket, the Engineer does **not** implement the entire ticket at once. Instead:

1. Identify the logical units of work within the ticket (e.g., "add interface", "implement service", "wire up config")
2. Implement one unit → run `pnpm check` → confirm it passes
3. Report progress to Agent Zero between units
4. Proceed to the next unit
5. Only after all units are complete and validated → hand off to Tester/Docs Writer/Security Reviewer

This follows the Plan-Apply-Unify (PAU) loop from the `pau-loop` skill:
- **Plan**: Identify logical units and acceptance criteria
- **Apply**: Implement one unit, self-validate with `pnpm check`
- **Unify**: Verify the unit meets its acceptance criteria before moving to the next

### Agent responsibilities

| # | Role | Input | Output | Quality gate |
|---|------|-------|--------|--------------|
| 7a | **Engineer** | Ticket + design doc | Production code changes | `pnpm check` exits 0 after each logical unit |
| 7b | **Tester** | Ticket + implemented code from 7a | Test files | `pnpm check` exits 0 |
| 7c | **Docs Writer** | Ticket + implemented code from 7a | Documentation updates | `pnpm check` exits 0 (if lint-checked docs) |
| 7d | **Security Reviewer** | Ticket + implemented code from 7a | Security assessment + vulnerability flags | Confidence ≥ 7 for filed flags |
| 8 | **Challenger** | Ticket + all outputs from 7a/7b/7c + security assessment from 7d | Pass/fail verdict + specific feedback | — |

### Security Reviewer in Phase C

The Security Reviewer operates differently in Phase C compared to Phase A:

| Aspect | Phase A (Agent 1b) | Phase C (Agent 7d) |
|--------|-------------------|-------------------|
| Mode | Advisory — recommendations and gotchas | Scanning — verify and prove vulnerabilities |
| Scope | Design-level security concerns | Implementation-level security issues |
| Output | Security recommendations → Tech Validator | Two outputs: assessment → Challenger, flags → PM |
| Blocking | No — advisory only | Assessment feeds Challenger, flags are non-blocking |
| Proof required | No | Yes — PoC code or bash script for confidence ≥ 7 |
| Confidence threshold | N/A | ≥ 7 out of 10 for filing vulnerability flags |

#### Security Reviewer output format (Phase C)

```markdown
## Security Assessment

### Ticket: isb-NNNN

### Findings

#### [Finding title]
- **Category**: injection / auth-bypass / data-exposure / crypto / input-validation / other
- **Severity**: critical / high / medium / low
- **Confidence**: 1–10
- **File**: `path/to/file.ts`
- **Description**: What the vulnerability is
- **Exploit scenario**: How it could be exploited (concrete steps)
- **Fix recommendation**: Specific fix approach

### Vulnerability Flags (for PM)

#### Flag: [title]
- **Type**: ticket (type: security)
- **Priority**: critical / high / medium
- **Confidence**: 1–10
- **Blocking**: yes / no
- **PoC Snippet**:
```bash
# Proof-of-concept demonstrating the vulnerability
````

- **Recommended acceptance criteria**: [what the fix ticket should verify]

### Summary

One paragraph on overall security posture of this ticket's changes.

```

#### Confidence scoring

The Security Reviewer uses a 1–10 confidence scale when assessing vulnerabilities:

| Confidence | Meaning | Action |
|------------|---------|--------|
| 1–6 | Low confidence, likely false positive or theoretical | Do NOT file a flag. Include in assessment as informational only. |
| 7–8 | Medium confidence, likely real vulnerability with specific attack path | File a vulnerability flag for PM. Include PoC and exploit scenario. |
| 9–10 | High confidence, proven vulnerability with demonstrated exploitation | File a `critical` priority flag immediately. Include working PoC. |

#### False-positive exclusion categories

The Security Reviewer must NOT flag the following as vulnerabilities:

- Denial of Service (DoS) vulnerabilities
- Secrets or credentials stored on disk if otherwise secured
- Rate limiting or resource exhaustion concerns
- Lack of input validation on non-security-critical fields without proven impact
- Theoretical race conditions without a concrete attack path
- Memory safety issues in memory-safe languages
- Logging non-PII data
- Vulnerabilities solely in test files

### Challenger feedback routing

The Challenger inspects the implementation against the ticket's acceptance criteria and provides targeted feedback:

| Feedback targets | Route to | Effect |
|-----------------|----------|--------|
| Production code issues | 7a: Engineer | Engineer applies fixes (not re-implementation) |
| Test-only issues | 7b: Tester (pass-through) | 7a untouched, tester revises tests |
| Documentation-only issues | 7c: Docs Writer (pass-through) | 7a untouched, writer revises docs |
| Security issues | 7a: Engineer + re-scan by 7d | Engineer fixes, Security Reviewer re-scans changed files |
| Multiple concerns | Routed independently | Each agent receives only their relevant feedback |

After fixes → `pnpm check` → re-validate with Challenger. **If any fix touches code that the Security Reviewer previously scanned, the Security Reviewer must re-scan the changed files.**

### Loop limits

| Loop | Max iterations | On exhaustion |
|------|---------------|---------------|
| Phase A (validation) | 3 | Escalate to user |
| Phase C inner (7→8 per ticket) | 3 | Escalate to user |
| Phase C → Phase A (full review) | 1 re-entry | Final — no further loops |

### Post-execution full review

After ALL tickets in Phase C are complete:
1. Return to Phase A (Agents 1 + 2 + 1b + 3) for a full review of the implemented code
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
| Context loading | Before any agent produces output | Relevant skills and standards loaded per Skill Loading Protocol |
| Security scan | After implementation, before Challenger review | Security Reviewer assessment confidence ≥ 7 for any flagged vulnerability |
| Challenger review | After each ticket's implementation | All acceptance criteria met, no regressions, security assessment addressed |
| Full review | After all tickets complete | Architecture + engineering + security review on final code |

---

## Clarifications & Architecture Decision Records (ADRs)

### When to create a clarification

A **clarification** is created whenever:
- There is no consensus between agents (e.g. Architect and Engineer disagree)
- Two or more valid approaches exist and the tradeoffs are non-trivial
- An assumption needs user confirmation before implementation proceeds
- A design decision has significant risk, complexity, or long-term impact
- A security concern requires user decision on acceptable risk level

Clarifications **pause the pipeline** — no implementation proceeds on the
affected area until the user resolves them. Unaffected tickets may continue.

### Clarification lifecycle

```

Agent identifies ambiguity → raises FLAG to PM
→ PM creates clarification in clarifications/
→ user reads and decides
→ PM records decision as ADR in adrs/
→ PM updates clarification file with a link to the ADR
→ implementation proceeds

````

**Note:** Agents do not create clarification files directly. They raise a flag (see Flag Protocol) and the PM creates the artifact.

### Clarification template

```markdown
# isb-clar-NNNN: Short question title

| Field | Value |
|-------|-------|
| Status | `open` / `resolved` |
| Created | YYYY-MM-DD |
| Resolved | — |
| ADR | — (link to ADR once resolved) |
| Raised by | Agent role (e.g. "Architect", "Security Reviewer") |
| Blocking | isb-NNNN, isb-epic-NNN (tickets/epics this blocks) |

## Question

One-sentence summary of what needs to be decided.

## Background

Full context: why this came up, what was being worked on, relevant history.

## Code context

Relevant code snippets, file paths, and current signatures.

```typescript
// Current state of the code
````

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

| Dimension          | Option A | Option B |
| ------------------ | -------- | -------- |
| Complexity         |          |          |
| Risk               |          |          |
| Short-term benefit |          |          |
| Long-term benefit  |          |          |
| Migration effort   |          |          |

## Recommendation

Agent's recommendation and reasoning (if any). The user makes the final call.

````

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
````

### Integration with the pipeline

| Phase         | How clarifications/ADRs interact                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase A**   | Architect, Engineer, or Security Reviewer raises a flag when they disagree or spot ambiguity. Tech Validator may also raise one if PoC reveals multiple valid paths. PM creates the clarification file. |
| **Phase B**   | PM checks for open clarifications before creating tickets. Blocked areas are not ticketed until resolved.                                                                                               |
| **Phase C**   | Engineer, Tester, Security Reviewer, or Challenger may raise a flag if implementation reveals an unforeseen choice. Work on the affected ticket pauses. PM creates the clarification.                   |
| **Any phase** | User resolves clarification → PM records ADR → blocked work resumes.                                                                                                                                    |

---

## Reuse Guide

To apply this pipeline to a new design document or feature request:

1. **Prepare**: Write or receive a design document with clear problem statement, decisions, and acceptance criteria
2. **Phase A**: Run Architect + Engineer + Security Reviewer → Tech Validator against the design doc and codebase
3. **Phase B**: Run Test Planner + Docs Planner (including standards review) → PM to produce epics and tickets
    - PM creates epics in `epics/` for each design phase or priority tier
    - PM creates tickets in `backlog/` linked to their parent epic
4. **Phase C**: For each ticket in dependency order:
    - Move ticket from `backlog/` to `open/`
    - Execute: Engineer (incremental) → Tester/Docs Writer/Security Reviewer → Challenger loop
    - On approval: move ticket from `open/` to `closed/`
5. **Full review**: Return to Phase A for final validation of implemented code

### Configuration checklist

The pipeline is designed to be framework-agnostic. When adapting it to a new project, configure these parameters:

| Parameter                                   | Default in this doc                                                          | Replace with                             |
| ------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------- |
| Quality command                             | `pnpm check`                                                                 | Project's lint/format/typecheck command  |
| Project prefix                              | `isb-`                                                                       | Project's ticket/ID prefix               |
| Commit scopes                               | `config`, `interfaces`, `logging`, `agent`, `workflow`, `tui`, `services`    | Project's module/layer names             |
| Domain skills                               | `backend-engineering`, `frontend-engineering`, `isb-backend`, `isb-frontend` | Project-specific skill pairs             |
| Agent file location                         | `.github/agents/`                                                            | Project's agent configuration directory  |
| PM artifact location                        | `docs/project-management/`                                                   | Project's project management directory   |
| Security vulnerability confidence threshold | 7 (out of 10)                                                                | Adjust based on project's risk tolerance |

The pipeline works for any codebase that has:

- A lint/format/typecheck command (replaces `pnpm check`)
- A layered or modular architecture (for Architect review)
- Conventional commit conventions (for commit grouping)
- Project-management directory with `next-id.mjs` and folder structure (or adapt)

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
