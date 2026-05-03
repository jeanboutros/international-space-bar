---
name: pau-loop
description: "Plan-Apply-Unify execution protocol for implementation work. Ensures every task follows a structured cycle: plan the work, execute with self-validation, then verify against acceptance criteria."
---

# Plan-Apply-Unify (PAU) Loop Protocol

## Purpose

Every implementation task follows a mandatory three-phase cycle. No phase can be skipped. This ensures that acceptance criteria are verified, not assumed.

---

## The Loop

```
PLAN ──→ APPLY ──→ UNIFY
  ↑                   │
  └───── NOT MET ─────┘
```

---

## Phase 1: PLAN

**Goal:** Understand the task and define exactly what will change.

### Steps

1. **Read the task:** Understand the title, type, acceptance criteria, dependencies, and referenced materials.

2. **Plan the implementation:**

```markdown
## Implementation Plan — [Task ID]

**Task:** [title]
**Type:** [backend | frontend | database | testing | devops]

### Acceptance Criteria

1. [AC-1 from task]
2. [AC-2 from task]
   ...

### Files to Create/Modify

| #   | File Path | Action | Description    |
| --- | --------- | ------ | -------------- |
| 1   | src/...   | Create | [what and why] |

### Approach

[Brief description of implementation approach — max 3 paragraphs]

### Risks / Unknowns

[Any concerns — or "None identified"]
```

3. **Present the plan** to the Agency Director.
    - The Director approves, or escalates to the user for complex tasks.
    - Do NOT proceed to APPLY until the plan is approved.

### PLAN Phase Rules

- If ANY acceptance criterion is ambiguous → `STATUS: BLOCKED` (assumption-trap)
- If a dependency is not yet completed → `STATUS: BLOCKED`
- Keep the plan concise — it is a plan, not documentation

---

## Phase 2: APPLY

**Goal:** Write the code and self-validate.

### Steps

1. **Write the code** as planned:
    - Follow the architecture patterns from the project's conventions
    - Follow the coding conventions from the project's existing code

2. **Self-validate** — run available checks (typecheck, lint, format, build).

3. **Self-qualify** — read the code back and check each acceptance criterion:
    - For each AC: does the code I just wrote satisfy this?
    - If NO: fix it now, before leaving APPLY
    - If UNCLEAR: note it for UNIFY phase

4. **Report status** to the Director:

| Status               | Meaning                                          |
| -------------------- | ------------------------------------------------ |
| `DONE`               | All AC appear met; self-validation passed        |
| `DONE_WITH_CONCERNS` | AC appear met but there are concerns (list them) |
| `NEEDS_CONTEXT`      | Missing information prevents completion          |
| `BLOCKED`            | Cannot proceed (trigger assumption-trap)         |

### APPLY Phase Rules

- Write **complete, runnable code** — no TODO placeholders unless explicitly accepted by the Director
- Run **all available self-validation** — do not skip typecheck or lint
- If self-validation fails, **fix before reporting** — up to 3 attempts
- If 3 fix attempts fail, report `DONE_WITH_CONCERNS` with the failures listed

---

## Phase 3: UNIFY (Mandatory — Never Skipped)

**Goal:** Verify that the implementation actually meets the acceptance criteria. This is the loop closure.

### Steps

1. **For each acceptance criterion**, determine:

| Verdict        | Meaning                                  | Evidence Required                      |
| -------------- | ---------------------------------------- | -------------------------------------- |
| **MET**        | Criterion is satisfied                   | Specific code reference or test result |
| **NOT MET**    | Criterion is not satisfied               | What is missing and why                |
| **UNTESTABLE** | Criterion is vague or cannot be verified | Triggers re-engagement with user       |

2. **Report the UNIFY results:**

```markdown
## UNIFY Report — [Task ID]

| #    | Acceptance Criterion | Verdict | Evidence                 |
| ---- | -------------------- | ------- | ------------------------ |
| AC-1 | [criterion text]     | MET     | [file:line or test name] |
| AC-2 | [criterion text]     | NOT MET | [what is missing]        |

**Overall:** [ALL MET | HAS GAPS | BLOCKED]
```

3. **If ALL MET:**
    - Task is implementation-complete
    - Proceed to the next task

4. **If NOT MET (any criterion):**
    - Loop back to APPLY with the specific gaps
    - Maximum 3 APPLY-UNIFY iterations per task
    - If 3 iterations fail: escalate to user via Director

5. **If UNTESTABLE (any criterion):**
    - Director re-engages the user to clarify the criterion
    - Loop pauses until clarification received

### UNIFY Phase Rules

- **NEVER skip UNIFY** — even if APPLY reported DONE
- **NEVER mark a criterion as MET without evidence** — cite the code or test
- **NEVER allow more than 3 APPLY-UNIFY iterations** — escalate after 3
- If the Director asks you to skip UNIFY, refuse and explain why loop closure is mandatory
