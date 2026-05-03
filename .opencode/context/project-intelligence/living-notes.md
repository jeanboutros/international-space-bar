<!-- Context: project-intelligence/notes | Priority: high | Version: 2.0 | Updated: 2026-05-01 -->

# Living Notes

**Purpose**: Current state, open questions, technical debt, and insights. Keep this alive.
**Last Updated**: 2026-05-01 | **Update**: When status changes or new issues surface

## Technical Debt

| Item                                    | Impact                          | Priority | Status       |
| --------------------------------------- | ------------------------------- | -------- | ------------ |
| Core→Server migration incomplete        | Two parallel source trees       | Medium   | In progress  |
| `pnpm check` has no pre-commit hook     | Lint errors can reach CI        | Medium   | Acknowledged |
| No linter rule enforcing correct logger | Wrong logger used in some files | Low      | Acknowledged |

### Details

**Core→Server Migration**
_Priority_: Medium | _Status_: In progress
`src/international-space-bar/` is being absorbed into `src/international-space-bar-server/`. Logging, secrets, config already migrated. Remaining: legacy utilities and LangGraph workflow. New features add to the server layer.

**No pre-commit hook for `pnpm check`**
_Priority_: Medium | _Status_: Acknowledged
Currently relies on developer discipline + CI. A `husky` or `lint-staged` pre-commit hook would catch errors earlier.

## Open Questions

| Question                                              | Stakeholders | Status           | Next Action                                     |
| ----------------------------------------------------- | ------------ | ---------------- | ----------------------------------------------- |
| How to wire LangGraph behind runtime port?            | Architecture | Planned          | Tickets isb-0020, isb-0018, isb-0019            |
| Should core domain keep its own pino or use NestJS's? | Architecture | Under discussion | Logging already migrated; verify no regressions |

## Known Issues

| Issue                                                     | Severity | Workaround                               | Status                              |
| --------------------------------------------------------- | -------- | ---------------------------------------- | ----------------------------------- |
| `Annotation.Root` still referenced in some LangGraph docs | Medium   | Use `StateSchema` per project convention | Known — use Context7 for latest API |

## Insights & Lessons Learned

### What Works Well

- **Layered architecture** — port contracts make cross-boundary communication explicit and minimal
- **Separate logging domains** — each audience (infra, agent, server) tunes their own signal
- **Council protocol** — anonymised peer review produces higher-quality decisions
- **Zod validation everywhere** — catches config and schema errors at startup, not at runtime

### What Could Be Better

- **Two source trees** — `international-space-bar/` and `international-space-bar-server/` creates confusion about where new code lives
- **No integration tests for agent→server** — the runtime port is designed but not yet wired

### Gotchas for Maintainers

- **Never edit `generated/` dirs** — change the OpenAPI spec, then `pnpm generate:schemas`
- **Sentinel fields are intentional** — `minLength:1, maxLength:0` is NOT a bug
- **`Annotation.Root` is forbidden** — always use `StateSchema` from `@langchain/langgraph`
- **ContextSchema uses `typeof`** — not `z.infer<>` in the GraphNode type bag
- **Director is dispatch-only** — if it starts "doing work", the system quality collapses

## Active Projects

| Project               | Goal                                          | Tickets                      | Status      |
| --------------------- | --------------------------------------------- | ---------------------------- | ----------- |
| LangGraph integration | Wire agent workflow behind runtime port       | isb-0020, isb-0018, isb-0019 | Planned     |
| Core→Server migration | Absorb `international-space-bar/` into server | Ongoing                      | In progress |

## Archive (Resolved Items)

### Resolved: Ink TUI retirement

- **Resolved**: Earlier phase
- **Resolution**: Archived to `archive/legacy-ink-tui/`; server + OpenResponses is primary interface
- **Learnings**: Terminal UI was useful for early prototyping but server-first is the right architecture

### Resolved: PinoLoggerService bridge pattern

- **Resolved**: isb-0055
- **Resolution**: Single `PinoLoggerService` implements both `LoggerService` (NestJS) and `ILogger` (inner) via port contract
- **Learnings**: Bridge pattern works well — one injectable class, two contracts, zero coupling

## 📂 Codebase References

**Migration target**: `src/international-space-bar-server/` — all new features go here
**Integration seam**: `src/international-space-bar-server/openresponses/agent-runtime.port.ts`
**Agent workflow**: `src/international-space-bar/workflow/` — will migrate eventually
**Compliance tests**: `scripts/compliance-test.mjs`

## Related Files

- `decisions-log.md` — Past decisions that inform current state
- `business-domain.md` — Business context for priorities
- `technical-domain.md` — Technical context for current state
