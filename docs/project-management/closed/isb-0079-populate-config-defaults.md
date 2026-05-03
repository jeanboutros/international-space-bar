# isb-0079: Populate `config` defaults in `ResponsesService`

| Field      | Value         |
| ---------- | ------------- |
| Type       | `feature`     |
| Priority   | `high`        |
| Status     | `not-started` |
| Epic       | isb-epic-011  |
| Depends on | isb-0078      |

## Description

Wire `ResponsesService.create` and `ResponsesService.createStream` to build a
`ResponseStreamConfig` from the incoming request body, applying spec defaults
for any omitted fields (e.g. `temperature ?? 1`, `store ?? true`). Strip
HTTP-only fields that runtimes must not see.

## Files affected

- `src/international-space-bar-server/openresponses/responses.service.ts` — build `ResponseStreamConfig` from body, pass via `AgentInvokeRequest.config`

## Acceptance criteria

- [ ] AC-1: `create()` and `createStream()` both populate `config` on `AgentInvokeRequest`
- [ ] AC-2: Spec defaults applied for omitted fields (temperature, store, truncation)
- [ ] AC-3: HTTP-only fields (stream, stream_options) are not forwarded to runtimes
- [ ] AC-4: `pnpm check` exits 0
