<!-- Context: project-intelligence/business | Priority: critical | Version: 2.0 | Updated: 2026-05-01 -->

# Business Domain

**Purpose**: Why this project exists, who it serves, and what value it creates.
**Last Updated**: 2026-05-01 | **Update Triggers**: Business pivot, new features shipped, roadmap changes

## Project Identity

**Project**: International Space Bar
**Tagline**: A production-grade OpenResponses-compatible server with a multi-agent AI workflow
**Problem**: No standardised, self-hostable server exists that both (a) implements the OpenResponses protocol for remote model access and (b) orchestrates specialist AI agents behind that protocol
**Solution**: A clean-architecture scaffold that exposes `POST /v1/responses` over HTTP/SSE and WebSocket, with a LangGraph multi-agent workflow (director, council, orchestrator) designed to plug in behind the runtime port

## Target Users

| Segment            | Who                                                               | Need                                                             | Pain Point                                                      |
| ------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| AI developers      | Builders using OpenCode, GitHub Copilot, or OpenResponses clients | A self-hosted remote model provider                              | No compliant self-hosted option; locked into hosted APIs        |
| AI agencies        | Teams running multi-agent workflows                               | Structured deliberation (council) + task execution in one system | Ad-hoc agent chaining; no satisfaction loop or council protocol |
| Platform engineers | DevOps running agent infrastructure                               | Observable, configurable, secure server                          | No standardised protocol surface; each deployment is bespoke    |

## Value Proposition

**For AI Developers**:

- Drop-in remote model provider — point any OpenResponses client at the server
- Multi-agent routing (query, reasoning, council) — automatic, no manual dispatch
- Satisfaction loop — outcomes iterate until quality threshold is met

**For AI Agencies**:

- Council protocol — 5 advisors + 5 reviewers + chairman for pressure-testing decisions
- Agent validation pipeline — every feature goes through architect → engineer → security → challenger
- Structured observability — separate logs for system, agent audit, and server

**For Platform Engineers**:

- Loopback-only default, bearer auth, SECRET resolution — security-first
- OpenAPI-driven schema generation — protocol surface is always spec-compliant
- Environment-specific config — dev/test/prod YAML with secrets from env vars

## Roadmap Context

**Current State**: OpenResponses server is production-grade (HTTP/SSE + WebSocket ping/pong). Agent workflow is designed and documented but not yet wired to the HTTP layer.
**Next Milestone**: LangGraph integration behind the runtime port (tickets: isb-0020, isb-0018, isb-0019)
**Long-term Vision**: Full engineering-task platform — PAU-loop, human intervention register, self-reflection, build capability

### Planned (NOT YET IMPLEMENTED)

1. **Engineering Task Workflow** — `intent = engineering` path with Plan-Apply-Unify loop
2. **Human Intervention Register** — persistent `STATUS: BLOCKED` registry with query/resume
3. **Self-Reflection** — feedback loop that improves agent prompts from user signals
4. **Build Capability** — `run_command`, `run_tests`, `run_lint` tools for autonomous builds

## Business Constraints

- **Protocol compliance** — must match OpenResponses spec exactly (validated by compliance tests)
- **Self-hostable** — no dependency on external cloud services for core functionality
- **Security by default** — loopback-only, bearer auth, no credential leaks in logs
- **Agent workflow integration** — runtime port is the seam; server must never import agent internals

## Key Stakeholders

| Role                         | Responsibility                                     |
| ---------------------------- | -------------------------------------------------- |
| Project owner (Jean Boutros) | Architecture, roadmap, agent design                |
| AI developers (consumers)    | Use the server as a remote model provider          |
| Agent framework (LangGraph)  | Orchestrates multi-agent workflows behind the port |

## Success Metrics

| Metric                    | Target                                 | Current                      |
| ------------------------- | -------------------------------------- | ---------------------------- |
| OpenResponses compliance  | 100% spec coverage                     | Ping/pong fully compliant    |
| Transport support         | HTTP/SSE + WebSocket                   | Both operational             |
| Agent workflow wired      | Director + council behind runtime port | Designed, not yet integrated |
| Council reports generated | Automatic Markdown to logs/            | Working in standalone mode   |

## 📂 Codebase References

**Server entry**: `src/international-space-bar-server/main.ts`
**Protocol surface**: `src/international-space-bar-server/openresponses/` — controller, service, schemas
**Config**: `config.yaml`, `config.dev.yaml` — environment-specific YAML
**Agent workflow**: `src/international-space-bar/workflow/` — director.graph, council.graph
**Compliance**: `scripts/compliance-test.mjs`, `docs/compliance-test.md`

## Related Files

- `technical-domain.md` — How this business need is solved technically
- `business-tech-bridge.md` — Business → technical mapping
- `decisions-log.md` — Business decisions with context
