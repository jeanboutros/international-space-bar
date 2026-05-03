<!-- Context: project-intelligence/nav | Priority: critical | Version: 2.0 | Updated: 2026-05-01 -->

# Project Intelligence

> Start here for quick project understanding. These files bridge business and technical domains.

## Structure

```
.opencode/context/project-intelligence/
├── navigation.md              # This file - quick overview
├── business-domain.md         # Business context: what, why, who
├── technical-domain.md        # Stack, architecture, patterns, conventions
├── business-tech-bridge.md    # Business needs → technical solutions mapping
├── decisions-log.md           # Major decisions with rationale (8 decisions)
└── living-notes.md            # Active issues, debt, open questions
```

## Quick Routes

| What You Need               | File                      | Key Content                                             |
| --------------------------- | ------------------------- | ------------------------------------------------------- |
| **Tech stack**              | `technical-domain.md`     | Node 22, TS strict, NestJS, LangGraph, Zod 4, Pino      |
| **Architecture rules**      | `technical-domain.md`     | Layered arch, import rules, port contracts              |
| **LangGraph conventions**   | `technical-domain.md`     | StateSchema, MessagesValue, GraphNode type bag          |
| **Code patterns**           | `technical-domain.md`     | Config, controller, state schemas — real code           |
| **Naming conventions**      | `technical-domain.md`     | kebab-case files, PascalCase classes, I-prefix          |
| **Security**                | `technical-domain.md`     | Zod, Bearer auth, SECRET syntax, loopback               |
| **Why this project exists** | `business-domain.md`      | OpenResponses server + multi-agent orchestration        |
| **Who it's for**            | `business-domain.md`      | AI devs, agencies, platform engineers                   |
| **Roadmap**                 | `business-domain.md`      | LangGraph integration → engineering tasks → build       |
| **Business → Tech mapping** | `business-tech-bridge.md` | 7 feature mappings with rationale                       |
| **Key decisions**           | `decisions-log.md`        | 8 decisions: layered arch, LangGraph, logging, Zod+Kubb |
| **Current issues**          | `living-notes.md`         | Migration incomplete, no pre-commit hook, gotchas       |

## Usage

**New Developer / Agent**:

1. Start with `navigation.md` (this file)
2. Read `technical-domain.md` for coding conventions and patterns
3. Check `business-domain.md` for "why does this exist?"
4. Skim `decisions-log.md` for architectural rationale

**Quick Reference**:

- How to structure code? → `technical-domain.md` → Architecture section
- Why this naming convention? → `technical-domain.md` → Naming Conventions
- Why this tech choice? → `decisions-log.md` → D1–D8
- What's the current state? → `living-notes.md` → Active Projects + Tech Debt
- How does feature X serve the business? → `business-tech-bridge.md` → Core Mapping

## Integration

This folder is referenced from:

- `AGENTS.md` — project-level agent instructions
- `.opencode/context/navigation.md` — broader context index
- `.opencode/context/core/standards/` — coding and quality standards

## Maintenance

- Update `technical-domain.md` when stack changes, new patterns adopted
- Update `business-domain.md` when business direction shifts
- Update `decisions-log.md` for every significant architectural choice
- Update `living-notes.md` weekly or when issue status changes
- Archive resolved items from `living-notes.md` to the bottom section
