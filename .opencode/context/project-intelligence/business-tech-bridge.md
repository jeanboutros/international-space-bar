<!-- Context: project-intelligence/bridge | Priority: high | Version: 2.0 | Updated: 2026-05-01 -->

# Business ↔ Tech Bridge

**Purpose**: How business needs map to technical solutions. The critical connection point.
**Last Updated**: 2026-05-01 | **Update Triggers**: New features, refactoring, business pivot

## Core Mapping

| Business Need                    | Technical Solution                                        | Why This Mapping                                  | Value                                    |
| -------------------------------- | --------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| Clients need a standard protocol | OpenResponses (HTTP/SSE + WebSocket)                      | Industry-standard response API                    | Any compatible client connects instantly |
| Quality outcomes                 | Satisfaction evaluation loop (0–1 score, iterate at <0.7) | Automated quality gate per request                | No manual re-prompting                   |
| Multi-perspective decisions      | Council sub-graph (5 advisors + 5 reviewers + chairman)   | Parallel fan-out + anonymised peer review         | Reduces groupthink, surfaces blind spots |
| Protocol compliance              | Kubb auto-generation from OpenAPI spec                    | Spec is source of truth; never hand-write schemas | Compliance by construction               |
| Security by default              | Bearer auth + loopback-only + SECRET syntax               | Prevent accidental credential exposure            | Safe to run on any machine               |
| Observable agents                | Separate pino instances per concern                       | System log ≠ agent audit ≠ server log             | Each audience tunes their own signal     |
| Self-hosted deployment           | NestJS + tsup build + env-config YAML                     | No cloud dependency; run anywhere                 | Full control over data and infra         |

## Feature Mappings

### Feature: OpenResponses Server

**Business**: Users need to point any OpenResponses client at a self-hosted remote model.
**Tech**: NestJS controller + service at `POST /v1/responses` with SSE streaming + WebSocket gateway.
**Connection**: The protocol surface is the product. Without spec compliance, no client can connect. The dual-transport design (HTTP/SSE + WebSocket) supports both stateless and persistent clients.

### Feature: Council Deliberation Protocol

**Business**: Decisions with stakes need diverse perspectives, not single-model answers.
**Tech**: LangGraph `Send` fan-out to 5 advisor nodes → anonymise → 5 reviewer nodes → chairman synthesis → Markdown report.
**Connection**: The council is the unique selling point. The anonymisation step (shuffle + relabel A–E) prevents authority bias. The chairman de-anonymises for the final verdict.

### Feature: Satisfaction Evaluation Loop

**Business**: Users shouldn't need to manually re-prompt when quality is low.
**Tech**: `evaluate` node scores outcome on 4 dimensions (completeness, accuracy, clarity, actionability). Score <0.7 → inject feedback + iterate. Max 3 iterations.
**Connection**: Transforms the system from "single-shot" to "self-improving per request". Council baseline starts at 0.6 (inherently thorough).

### Feature: Agent Validation Pipeline

**Business**: Every feature must be architecturally sound, tested, secure before merging.
**Tech**: Phase A (architect + engineer + security → tech-validator) → Phase B (test-planner + docs-planner → PM) → Phase C (engineer implements, tester/docs/security parallel, challenger validates).
**Connection**: Prevents regressions at scale. Max 3 loops per phase ensures convergence without infinite cycles.

## Trade-off Decisions

| Conflict                           | Business Priority      | Tech Priority       | Decision                          | Rationale                                                                 |
| ---------------------------------- | ---------------------- | ------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| Quick launch vs. clean arch        | Ship fast              | Layered boundaries  | Clean arch first                  | Protocol surface is the product; shortcuts create unmaintainable coupling |
| Agent workflow vs. server first    | Full AI experience     | Stable API surface  | Server first, agents second       | Server must be spec-compliant before agent wiring                         |
| pino-http convenience vs. security | Faster request tracing | No credential leaks | pino-http blocked until redaction | Logging raw headers = credentials leak — non-negotiable                   |

## 📂 Codebase References

**Protocol**: `src/international-space-bar-server/openresponses/` — controller, service, WebSocket
**Council**: `src/international-space-bar/workflow/council.workflow.ts`, `council.state.ts`
**Satisfaction loop**: `src/international-space-bar/agent/satisfaction-evaluator.ts`
**Validation pipeline**: `docs/agent-validation-pipeline.md`
**Runtime port**: `src/international-space-bar-server/openresponses/agent-runtime.port.ts`

## Related Files

- `business-domain.md` — Business needs in detail
- `technical-domain.md` — Technical implementation in detail
- `decisions-log.md` — Decisions with full context
