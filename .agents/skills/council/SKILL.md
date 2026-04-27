---
name: council
description: "Run any question, idea, or decision through a council of 5 AI advisors who independently analyze it, peer-review each other anonymously, and synthesize a final verdict. MANDATORY TRIGGERS: '/council', 'council this', 'run the council', 'war room this', 'pressure-test this', 'stress-test this', 'debate this'. Do NOT trigger on simple yes/no questions, factual lookups, or creation tasks. Only trigger when the user presents a genuine decision with stakes and multiple angles worth exploring."
---

# Council

## Agent Definitions

| Agent | File | Role | Standalone? |
|---|---|---|---|
| Council Conductor | `council.conductor.yaml` | Orchestrates the full protocol | Yes — invoked by Agency Director |
| Council Advisor | `council.sub.advisor.yaml` | Reusable advisor (identity injected at invocation) | No — sub-agent of conductor |
| Council Reviewer | `council.sub.reviewer.yaml` | Peer-reviews anonymized responses | No — sub-agent of conductor |
| Council Chairman | `council.sub.chairman.yaml` | Synthesizes final verdict | No — sub-agent of conductor |

## The Five Advisors

### 1. The Contrarian
Actively looks for what's wrong, missing, what will fail. Assumes the idea has a fatal flaw and tries to find it.

### 2. The First Principles Thinker
Ignores surface-level question, asks "what are we actually trying to solve?" Strips assumptions. Rebuilds from ground up.

### 3. The Expansionist
Looks for upside everyone else is missing. What could be bigger? What adjacent opportunity is hiding?

### 4. The Outsider
Zero context about the user, their field, or history. Responds purely to what's in front of them.

### 5. The Executor
Only cares about: can this actually be done, and what's the fastest path? Ignores theory, strategy, big-picture.

---

## Model Configuration

| Round | Agents | Model |
|---|---|---|
| **Advisors** (Step 2) | 5 advisors | `sonnet` |
| **Peer Reviewers** (Step 3) | 5 reviewers | `opus` |
| **Chairman** (Step 4) | 1 chairman | `opus` |

All agents run at **max reasoning effort**.

### Overriding Models

Users can override via parenthetical: `"council this (all opus)"`, `"council this (all sonnet)"`, `"council this (advisors on opus)"`, `"council this (reviewers on sonnet)"`.

If no override is specified, use defaults above. Always set the `model` parameter on the Agent tool call.

Never downgrade the chairman below `opus` — warn the user if they request "all sonnet" that chairman quality will suffer.

---

## Process Flow

### Step 1: Frame the Question

#### A. Scan workspace for context

Quick scan for relevant context files:

- CLAUDE.md / agents.md in project root
- Any memory/ folder
- Files the user explicitly referenced or attached
- Recent council transcripts in council-reports/
- Other relevant context files for the specific question

Use Glob and quick Read calls. Don't spend more than 30 seconds. Looking for 2-3 files that give advisors context for specific, grounded advice.

#### B. Frame the question

Reframe user's raw question with enriched context as a clear neutral prompt. Include:

1. Core decision or question
2. Key context from user's message
3. Key context from workspace files (business stage, audience, constraints, past results, numbers)
4. What's at stake

No opinion injected. No steering.

If too vague, ask ONE clarifying question. Then proceed.

Save framed question for transcript.

---

### Step 2: Convene the Council (5 sub-agents in parallel)

Spawn 5 instances of `council.sub.advisor` via task(). Each gets:

1. Their advisor identity and thinking style
2. The framed question
3. Instruction: respond independently, no hedging, no balancing, lean fully into assigned perspective

Each produces 150-300 words.

#### Sub-agent prompt template

```
You are [Advisor Name] on a Council.

Your thinking style: [advisor description from above]

A user has brought this question to the council:

---
[framed question]
---

Respond from your perspective. Be direct and specific. Don't hedge or try to be balanced. Lean fully into your assigned angle. The other advisors will cover the angles you're not covering.

Keep your response between 150-300 words. No preamble. Go straight into your analysis.
```

Always spawn all 5 in parallel. Sequential bleeds context.

**Model:** `sonnet` (or user override). Set `model: "sonnet"` on each Agent tool call.

---

### Step 3: Peer Review (5 sub-agents in parallel)

Collect all 5 responses. Anonymize as Response A through E (randomize mapping).

Spawn 5 instances of `council.sub.reviewer` via task(). Each sees all 5 anonymized responses and answers:

1. Which response is the strongest and why? (pick one)
2. Which response has the biggest blind spot and what is it?
3. What did ALL responses miss?

#### Reviewer prompt template

```
You are reviewing the outputs of a Council. Five advisors independently answered this question:

---
[framed question]
---

Here are their anonymized responses:

**Response A:**
[response]

**Response B:**
[response]

**Response C:**
[response]

**Response D:**
[response]

**Response E:**
[response]

Answer these three questions. Be specific. Reference responses by letter.

1. Which response is the strongest? Why?
2. Which response has the biggest blind spot? What is it missing?
3. What did ALL five responses miss that the council should consider?

Keep your review under 200 words. Be direct.
```

Always anonymize. Reviewers defer to thinking styles instead of evaluating on merit if they know which advisor said what.

---

### Step 4: Chairman Synthesis

Spawn 1 instance of `council.sub.chairman` via task(). It gets everything: framed question, all 5 de-anonymized responses, all 5 peer reviews.

#### Chairman prompt template

```
You are the Chairman of a Council. Your job is to synthesize the work of 5 advisors and their peer reviews into a final verdict.

The question brought to the council:

---
[framed question]
---

ADVISOR RESPONSES:

**The Contrarian:**
[response]

**The First Principles Thinker:**
[response]

**The Expansionist:**
[response]

**The Outsider:**
[response]

**The Executor:**
[response]

PEER REVIEWS:

[all 5 peer reviews]

Produce the council verdict using this exact structure:

## Where the Council Agrees
[Points multiple advisors converged on independently. These are high-confidence signals.]

## Where the Council Clashes
[Genuine disagreements. Present both sides. Explain why reasonable advisors disagree.]

## Blind Spots the Council Caught
[Things that only emerged through peer review. Things individual advisors missed that others flagged.]

## The Recommendation
[A clear, direct recommendation. Not "it depends." A real answer with reasoning.]

## The One Thing to Do First
[A single concrete next step. Not a list. One thing.]

Be direct. Don't hedge. The whole point of the council is to give the user clarity they couldn't get from a single perspective.
```

Chairman can disagree with majority if reasoning supports it.

**Model:** Always `opus`. Set `model: "opus"` on the Agent tool call.

---

### Step 5: Generate the Council Report

Three files in log/council-reports/ (create dir if needed):

```
log/council-reports/
  council-report-YYYY-MM-DD-HHMMSS.html
  council-report-YYYY-MM-DD-HHMMSS.md
  council-transcript-YYYY-MM-DD-HHMMSS.md
```

#### HTML Report

Single self-contained HTML with inline CSS. Contents:

1. Question at top
2. Chairman's verdict prominently displayed
3. Agreement/disagreement visual — grid or spectrum showing advisor positions
4. Collapsible sections for each advisor's full response (collapsed by default)
5. Collapsible section for peer review highlights
6. Footer with timestamp

Styling: white background, subtle borders, system font stack, soft accent colors per advisor. Professional briefing document.

#### Markdown Report

Same content as HTML, formatted for terminals/Obsidian/GitHub. Uses standard markdown headers, blockquotes, and `<details>` sections.

#### Transcript

Complete raw record:

- Original question (as user asked it)
- Framed question (after context enrichment)
- All 5 advisor responses (labeled by name)
- Anonymization mapping (which advisor was which letter)
- All 5 peer reviews
- Chairman's full synthesis
