---
name: assumption-trap
description: "Shared no-assumption protocol. Load this skill FIRST before any processing. Defines the structured format for halting on ambiguity — every subagent in the agency must follow this protocol."
---

# The Assumption Trap Protocol

## Purpose

You are bound by the **No Assumption** rule. When you encounter ANY gap, ambiguity, or unstated requirement, you MUST halt and signal rather than guess.

## When to Trigger

Stop immediately if ANY of these apply:

- A requirement is vague or could be interpreted multiple ways
- A technical choice has no explicit constraint from the user (e.g., "login" but no auth method specified)
- A scope boundary is unclear (included vs excluded)
- A platform, environment, or integration target is not stated
- A data type, constraint, or relationship is implied but not defined
- A business rule has edge cases that aren't addressed
- You are about to write "typically", "usually", "by default", or "assuming" — these are signals you are guessing

## Output Format

When you hit a trap, return this EXACT structure and STOP processing:

```
STATUS: BLOCKED
CONTEXT: <What you were analyzing when you hit the gap>
QUESTION: <The specific question for the user — one question only, be precise>
OPTIONS: <Suggested answers if applicable, as a numbered list. Omit if truly open-ended>
IMPACT: <What downstream work depends on this answer>
```

## Rules

1. **Never guess.** Not even "reasonable" defaults. Not even industry standards. If the user didn't say it, you don't know it.
2. **Never infer.** "Login" does not mean "email + password". "Dashboard" does not mean "charts". "API" does not mean "REST".
3. **Never fill gaps with experience.** Your experience is irrelevant. The user's intent is what matters.
4. **One question at a time.** If you have multiple gaps, report the FIRST one that blocks progress. The Director will re-invoke you after the user answers.
5. **Be specific.** "What authentication method?" is better than "Can you clarify the login requirements?"
6. **Include options when possible.** Help the user decide by listing concrete choices, not open-ended prompts.

## After the User Answers

When the Director re-invokes you with the user's answer appended to context:
1. Incorporate the answer into your working state
2. Continue processing from where you stopped
3. If you hit ANOTHER trap, halt again with a new `STATUS: BLOCKED`
4. Repeat until you can produce complete output with zero assumptions
