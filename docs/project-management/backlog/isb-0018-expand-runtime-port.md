# isb-0018: Expand AgentRuntimePort with stream() and session support

| Field        | Value        |
| ------------ | ------------ |
| Epic         | isb-epic-004 |
| Status       | `backlog`    |
| Assignee     | Engineer     |
| Priority     | `high`       |
| Created      | 2026-04-28   |
| Dependencies | isb-0017     |

## Description

Expand the `AgentRuntimePort` interface to include a `stream()` method returning `AsyncIterable<AgentRuntimeEvent>` and add session/thread support via `threadId` in `AgentInvokeRequest`. Define the `AgentRuntimeEvent` discriminated union for internal events.

## Acceptance Criteria

- [ ] `AgentRuntimePort` has `invoke()` and `stream()` methods
- [ ] `AgentInvokeRequest` includes optional `threadId`
- [ ] `AgentRuntimeEvent` union defined (text delta, tool call, completed, error)
- [ ] PingPongRuntimeService implements both methods
- [ ] Layered boundary preserved: port is framework-free
- [ ] `pnpm check` exits 0

## Files Affected

- `src/international-space-bar-server/openresponses/agent-runtime.port.ts`
- `src/international-space-bar-server/openresponses/ping-pong-runtime.service.ts`
