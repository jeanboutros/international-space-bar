# WebSocket Transport — Implementation Document

> **Status**: Implemented — streaming works end-to-end, 1/6 compliance tests passing
> **Reference spec**: [OpenResponses Specification — WebSocket Transport](https://github.com/openresponses/openresponses/blob/main/src/pages/specification.mdx)
> **Compliance tests**: `pnpm test:compliance -- --filter websocket-response,websocket-sequential-responses,websocket-continuation,websocket-previous-response-not-found,websocket-failed-continuation-evicts-cache,websocket-reconnect-store-false-recovery`

---

## Overview

This document describes the WebSocket transport layer for the OpenResponses API at `/v1/responses`. The WebSocket transport is an alternative to HTTP/SSE — same response object model, same streaming event format, but delivered over a persistent bidirectional connection.

The implementation uses the native `ws` library via `@nestjs/platform-ws` with a custom `OpenResponsesWsAdapter` that routes `message.type` as the NestJS event name. Auth is extracted from the HTTP upgrade request's `Authorization` header in the gateway's `handleConnection` method.

---

## Specification Requirements

> Source: [OpenResponses Specification — WebSocket Transport section](https://github.com/openresponses/openresponses/blob/main/src/pages/specification.mdx)

### REQ-WS-01: Transport path

> "Servers MAY expose the Responses API over a persistent WebSocket connection at the same `/v1/responses` resource."

The WebSocket endpoint shares the same path as the HTTP endpoint. The server upgrades from HTTP to WebSocket at `/v1/responses`. Implemented via `@WebSocketGateway({ path: "/v1/responses" })`.

### REQ-WS-02: Message format — `response.create`

> "Clients MUST start each turn by sending a JSON object with `type: "response.create"`. The remaining fields follow the standard response creation request body, except HTTP/SSE transport-specific fields such as `stream`, `stream_options`, and `background` MUST NOT be sent on WebSocket requests."

The `OpenResponsesWsAdapter` parses `message.type` as the NestJS event name. The gateway validates incoming messages against `webSocketResponseCreateEventSchema` and strips HTTP-only fields (`stream`, `stream_options`, `background`).

Invalid messages are silently discarded — the adapter never throws on bad input. Two cases are handled and both emit a `warn`-level log entry before returning `undefined` (which NestJS drops):

| Case                                  | Log message                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| Valid JSON but no string `type` field | `"Received WebSocket message that is not an object with a string 'type' field. Ignoring."` |
| Unparseable / non-JSON frame          | `"Failed to parse WebSocket message. Ignoring."`                                           |

Both log entries include the raw `data` or parsed `message` as a structured field so the payload is visible in `app.log` without crashing the connection.

### REQ-WS-03: Same event format

> "Servers MUST send response progress over the WebSocket using the same streaming event objects defined for streaming HTTP responses."

Every `ResponseStreamEvent` emitted by `PingPongRuntimeService.stream()` is sent as a JSON frame over the WebSocket. Verified working with `websocat` — all streaming events (response.created, output_item.added, output_text.delta, output_text.done, content_part.done, output_item.done, response.completed) flow correctly.

### REQ-WS-04: `store: false` with connection-local state

> "Servers SHOULD keep the most recent previous-response state in connection-local memory for the active WebSocket."

Each WebSocket connection has a `Map<string, ResponseResource>` for `store: false` responses. Implemented in `ConnectionState.previousResponses` within `ResponsesGateway`.

### REQ-WS-05: Failed continuation cache eviction

> "If a continuation turn fails with a 4xx or 5xx error, the server MUST evict the referenced `previous_response_id` from the connection-local cache."

Implemented — on error, the gateway calls `state.previousResponses.delete(previousResponseId)`.

### REQ-WS-06: Sequential processing

> "A single WebSocket connection MUST process at most one in-flight response at a time."

Implemented via a per-connection queue in `ConnectionState`. If a response is already being streamed, new `response.create` messages are queued and processed sequentially after the current response completes.

### REQ-WS-07: Error envelope format

> "WebSocket failures MUST be sent as a JSON `error` envelope with a `status` code and an `error.code`."

Implemented — validated by the `websocket-previous-response-not-found` test.

### REQ-WS-08: `[DONE]` sentinel — not required

The spec does not define a `[DONE]` sentinel for WebSocket. Terminal events (`response.completed`, `response.failed`, `response.incomplete`) signal completion. The connection stays open for the next `response.create`.

### REQ-WS-09: 60-minute connection limit (TODO)

> "WebSocket connections are limited to 60 minutes."

**TODO(ISB-WS-CONN-LIMIT)**: Not implemented. Should add a `setTimeout` on `handleConnection` that sends `websocket_connection_limit_reached` and closes after 60 minutes.

### REQ-WS-10: Authorization via headers

> The compliance tests pass an `Authorization` header during the WebSocket upgrade handshake.

Implemented in `handleConnection` — the `IncomingMessage` (HTTP upgrade request) is received as the second argument via NestJS's WsAdapter connection event propagation. Auth is validated using the same timing-safe comparison as `BearerAuthGuard`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  NestJS HTTP Server (port 3000)                         │
│                                                         │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │ ResponsesController  │  │ ResponsesGateway         │ │
│  │ POST /v1/responses   │  │ WS /v1/responses        │ │
│  │ (HTTP + SSE)          │  │ (native ws transport)    │ │
│  └──────────┬───────────┘  └──────────┬───────────────┘ │
│             │                          │                  │
│             │  ┌───────────────────────┘                  │
│             │  │ per-connection state                       │
│             │  │ Map<responseId, ResponseResource>         │
│             │  │ sequential message queue                  │
│             │  │                                           │
│             ▼  ▼                                           │
│  ┌──────────────────────┐                                │
│  │   ResponsesService   │  ← shared business logic       │
│  └──────────┬───────────┘                                │
│             │                                             │
│             ▼                                             │
│  ┌──────────────────────┐                                │
│  │  AgentRuntimePort    │  ← ping-pong-runtime (scaffold)│
│  │  (PingPongRuntime)   │    or ChatOllama when available │
│  └──────────────────────┘                                │
│                                                         │
│  ┌──────────────────────┐                                │
│  │ OpenResponsesWsAdapter│  ← extends NestJS WsAdapter   │
│  │ (native ws library)  │    message.type → event name   │
│  └──────────────────────┘                                │
└─────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component                | File                           | Responsibility                                                                                                          |
| ------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `OpenResponsesWsAdapter` | `ws-adapter.ts`                | Extends NestJS `WsAdapter`, parses `message.type` as event name, mounts on `/v1/responses`                              |
| `ResponsesGateway`       | `responses.gateway.ts`         | Handles `response.create`, auth validation, connection-local state, sequential queue, streaming events, error envelopes |
| `ResponsesService`       | `responses.service.ts`         | Shared business logic — `createStream()` called by both HTTP and WebSocket                                              |
| `AgentRuntimePort`       | `agent-runtime.port.ts`        | Pluggable runtime interface                                                                                             |
| `PingPongRuntimeService` | `ping-pong-runtime.service.ts` | Scaffold runtime — uses ChatOllama when available, falls back to simple "pong" streaming                                |

---

## Manual Testing with websocat

The easiest way to test the WebSocket transport manually is using `websocat`.

### Prerequisites

```bash
# Install websocat and rlwrap (macOS)
brew install websocat rlwrap

# Ensure ISB server is running
pnpm dev:server
```

> **Important — keep the connection open**: The server ties the LLM request lifetime to the WebSocket connection via an `AbortController`. If the client exits before the stream completes, the in-flight request is cancelled. Always use `--no-close` when piping input, or use the interactive form with `rlwrap` described below.

### Basic response

```bash
echo '{"type":"response.create","model":"isb-ping","input":"hello"}' | \
  websocat --no-close "ws://127.0.0.1:3000/v1/responses" \
    -H "Authorization: Bearer local-dev-key"
```

`--no-close` keeps the connection open after stdin reaches EOF so the full stream is received before the client exits. Without it the connection closes immediately after the message is sent, which triggers the server-side `AbortController` and cancels the LLM request.

Expected: a stream of JSON events ending with `response.completed`.

### View just event types

```bash
(echo '{"type":"response.create","model":"isb-ping","input":"ping"}'; sleep 10) | \
  websocat "ws://127.0.0.1:3000/v1/responses" \
    -H "Authorization: Bearer local-dev-key" | \
  jq -r '.type //?'
```

### Auth failure test

```bash
# Should receive an error envelope and close
echo '{"type":"response.create","model":"isb-ping","input":"test"}' | \
  websocat "ws://127.0.0.1:3000/v1/responses" \
    -H "Authorization: Bearer wrong-key"
```

Expected: `{"type":"error","status":401,"error":{"code":"unauthorized","message":"Invalid or missing Authorization header"}}` then connection close.

### previous_response_not_found test

```bash
# Send a response.create with a non-existent previous_response_id
echo '{"type":"response.create","model":"isb-ping","input":"test","previous_response_id":"resp_nonexistent","store":false}' | \
  websocat "ws://127.0.0.1:3000/v1/responses" \
    -H "Authorization: Bearer local-dev-key"
```

Expected: `{"type":"error","status":400,"error":{"code":"previous_response_not_found","message":"Previous response with id 'resp_nonexistent' not found.","param":"previous_response_id"}}`.

### Sequential responses (interactive)

Use `rlwrap` for readline editing, arrow-key history, and reliable paste handling. websocat sends each line on Enter:

```bash
rlwrap websocat "ws://127.0.0.1:3000/v1/responses" \
  -H "Authorization: Bearer local-dev-key"
```

Then type (or paste) and press **Enter** to send:

```json
{ "type": "response.create", "model": "isb-ping", "input": "first message" }
```

Wait for `response.completed`, then:

```json
{ "type": "response.create", "model": "isb-ping", "input": "second message" }
```

> **Paste tip**: websocat is line-buffered. If a paste does not appear to send, press Enter explicitly. Multi-line JSON will not be sent until a newline is received — always collapse to a single line before pasting.

### store:false continuation (interactive)

```bash
rlwrap websocat "ws://127.0.0.1:3000/v1/responses" \
  -H "Authorization: Bearer local-dev-key"
```

1. Send: `{"type":"response.create","model":"isb-ping","input":"remember this","store":false}`
2. Note the `response.id` from the `response.completed` event (e.g., `resp_abc123`)
3. Send: `{"type":"response.create","model":"isb-ping","input":"continue","previous_response_id":"resp_abc123","store":false}`
4. This should succeed because the response is in connection-local state
5. Close the connection, open a new one, and try the same `previous_response_id` — should get `previous_response_not_found`

---

## Compliance Test Matrix

| Test ID                                      | What it tests                                      | Status           | Notes                                                                                                             |
| -------------------------------------------- | -------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `websocket-previous-response-not-found`      | Missing previous_response_id error envelope        | ✅ Passing       | Validates REQ-WS-04 error code and REQ-WS-07 error format                                                         |
| `websocket-response`                         | Basic WebSocket response creation                  | ❌ Failing       | Receives events but compliance test parser expects specific terminal response structure; likely a schema mismatch |
| `websocket-sequential-responses`             | Multiple response.create on one connection         | ❌ Failing       | Depends on basic response working first                                                                           |
| `websocket-continuation`                     | store:false continuation with previous_response_id | ❌ Failing       | Depends on basic response working first                                                                           |
| `websocket-reconnect-store-false-recovery`   | Reconnect after store:false                        | ❌ Failing       | Depends on basic response working first                                                                           |
| `websocket-failed-continuation-evicts-cache` | Failed continuation cache eviction                 | ❌ Failing       | Depends on basic response working first                                                                           |
| `websocket-compact-new-chain`                | Compact output → new WebSocket chain               | ❌ Blocked       | `/v1/responses/compact` endpoint not implemented                                                                  |
| `basic-response`                             | Simple text response via HTTP                      | ✅ Passing       |                                                                                                                   |
| `streaming-response`                         | SSE streaming events via HTTP                      | ✅ Passing       |                                                                                                                   |
| `system-prompt`                              | System role message via HTTP                       | ✅ Passing       |                                                                                                                   |
| `multi-turn`                                 | Multi-turn conversation via HTTP                   | ✅ Passing       |                                                                                                                   |
| `image-input`                                | Image URL in user content via HTTP                 | ✅ Passing       |                                                                                                                   |
| `assistant-phase`                            | Assistant phase labels via HTTP                    | ✅ Passing       |                                                                                                                   |
| `response-output-phase-schema`               | ResponseResource schema validation                 | ✅ Passing       |                                                                                                                   |
| `tool-calling`                               | Function tool call output                          | ❌ Runtime issue | Depends on LLM producing function_call                                                                            |
| `compact-response`                           | /v1/responses/compact endpoint                     | ❌ Blocked       | Endpoint not implemented                                                                                          |
| `compact-missing-model`                      | /v1/responses/compact 400 error                    | ❌ Blocked       | Endpoint not implemented                                                                                          |

### Why most WebSocket tests fail

The `websocket-response` test receives events but its `getTerminalResponse()` function returns `null`. Manual testing with `websocat` confirms that events stream correctly (response.created → output_item.added → reasoning events → output_text.delta → output_text.done → content_part.done → output_item.done → response.completed). The failure is likely a mismatch between the event schema the compliance test expects and what the ping-pong runtime produces (e.g., reasoning items, function_call items from the ChatOllama-backed runtime).

When Ollama is not running, the ping-pong runtime falls back to a simple streaming "pong" response that doesn't include reasoning blocks, which may better match compliance test expectations.

---

## Out of Scope — TODO Items

### TODO(ISB-WS-CONN-LIMIT): 60-minute connection limit

The spec requires closing connections after 60 minutes with `websocket_connection_limit_reached` error. Add a `setTimeout` on `handleConnection` that sends the error envelope and closes the connection.

### TODO(ISB-WS-COMPACTION): `/v1/responses/compact` endpoint

The `websocket-compact-new-chain` test and `compact-response`/`compact-missing-model` tests depend on this endpoint. Needs a new `POST /v1/responses/compact` route.

### TODO(ISB-WS-PRODUCTION-RUNTIME): Replace PingPongRuntimeService

The scaffold runtime now uses `ResponseStream` + block factories for streaming
(see [Response Stream Builder](response-stream-builder.md)). When Ollama is
reachable, it routes through `wrapAsGraph` + `langGraphBlocks`. The WebSocket
gateway consumes the same `AsyncIterable<ResponseStreamEvent>` surface — no
transport-specific changes are needed for the new architecture.

### TODO(ISB-WS-HEALTH-MONITOR): WebSocket health monitoring

Add connection count metrics and health indicators to the NestJS health endpoint.

### TODO(ISB-WS-GRACEFUL-SHUTDOWN): Graceful WebSocket shutdown

When the server shuts down, open WebSocket connections should be closed gracefully (send a final error event, then close). NestJS's `enableShutdownHooks()` handles HTTP connections but WebSocket connections need explicit cleanup.
