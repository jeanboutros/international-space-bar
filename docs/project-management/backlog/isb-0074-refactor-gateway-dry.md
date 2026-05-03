# isb-0074: Refactor gateway to delegate through ResponsesService (DRY)

| Field      | Value                                  |
| ---------- | -------------------------------------- |
| Type       | `refactor`                             |
| Priority   | `medium`                               |
| Status     | `not-started`                          |
| Epic       | isb-epic-011                           |
| Depends on | isb-NNNN (AgentInvokeRequest widening) |
| Raised by  | Architect (Phase A)                    |

## Problem

The WebSocket gateway (`responses.gateway.ts`) builds `AgentInvokeRequest` directly
at line 326-332, bypassing `ResponsesService`. When `AgentInvokeRequest` gains
`config: ResponseStreamConfig`, the gateway must also populate that config.

Currently both the HTTP controller and the gateway duplicate request construction
logic. The gateway strips HTTP-only fields (`stream`, `stream_options`, `background`)
inline and calls `this.runtime.stream(...)` directly.

## Solution

Refactor the gateway to delegate stream creation through `ResponsesService.createStream()`.
This ensures:

1. Config population logic lives in one place (DRY)
2. Future changes to request construction propagate to both transports automatically
3. The gateway focuses on WebSocket-specific concerns (connection state, previous_response_id
   lookup, error envelopes) while the service owns request assembly

## Acceptance criteria

- [ ] Gateway injects `ResponsesService` instead of (or alongside) `AgentRuntimePort` directly
- [ ] Gateway calls `responsesService.createStream(body, abortSignal, requestId)` instead of
      building `AgentInvokeRequest` inline
- [ ] HTTP-only field stripping still happens before the body reaches the service
- [ ] All existing WebSocket streaming tests pass unchanged
- [ ] No duplicate `AgentInvokeRequest` construction exists in gateway code

## Files affected

- `src/international-space-bar-server/openresponses/responses.gateway.ts`
- `src/international-space-bar-server/openresponses/responses.module.ts` (if DI wiring changes)
