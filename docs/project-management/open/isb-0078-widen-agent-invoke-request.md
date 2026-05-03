# isb-0078: Widen `AgentInvokeRequest` with `config: ResponseStreamConfig`

| Field      | Value         |
| ---------- | ------------- |
| Type       | `feature`     |
| Priority   | `high`        |
| Status     | `not-started` |
| Epic       | isb-epic-011  |
| Depends on | —             |

## Description

Define a `ResponseStreamConfig` interface capturing the HTTP-body fields that
control streaming behaviour (instructions echo, model echo, temperature echo,
truncation strategy, tool-choice mode, previous_response_id, etc.) and add a
`config` property to `AgentInvokeRequest` so runtimes receive these values
without coupling to NestJS request objects.

## Files affected

- `src/international-space-bar-server/common/interfaces/agent-runtime.port.ts` — add `ResponseStreamConfig` interface and `config` field on `AgentInvokeRequest`

## Acceptance criteria

- [ ] AC-1: `ResponseStreamConfig` is exported with fields listed in design doc §4.2
- [ ] AC-2: `AgentInvokeRequest` has an optional `config: ResponseStreamConfig` property
- [ ] AC-3: Existing runtimes continue to compile without changes (field is optional)
- [ ] AC-4: `pnpm check` exits 0
