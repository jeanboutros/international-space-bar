# WebSocket Transport — Design Document

> **Status**: In Progress
> **Reference spec**: [OpenResponses Specification — WebSocket Transport](https://github.com/openresponses/openresponses/blob/main/src/pages/specification.mdx)
> **Compliance tests**: `scripts/compliance-test.mjs --filter websocket-response,websocket-sequential-responses,websocket-continuation,websocket-previous-response-not-found,websocket-failed-continuation-evicts-cache,websocket-compact-new-chain`

---

## Overview

This document describes the WebSocket transport layer for the OpenResponses API at `/v1/responses`. The WebSocket transport is an alternative to HTTP/SSE — same response object model, same streaming event format, but delivered over a persistent bidirectional connection.

The current implementation uses Socket.IO (`@nestjs/platform-socket.io`), which does not match the OpenResponses spec. Socket.IO uses its own framing protocol (not plain WebSocket), does not support custom headers on the upgrade request, and does not match the compliance tests' expectations. This design replaces Socket.IO with the native `ws` library via a custom NestJS adapter.

---

## Specification Requirements

> Source: [OpenResponses Specification — WebSocket Transport section](https://github.com/openresponses/openresponses/blob/main/src/pages/specification.mdx)

### REQ-WS-01: Transport path

> "Servers MAY expose the Responses API over a persistent WebSocket connection at the same `/v1/responses` resource."

The WebSocket endpoint shares the same path as the HTTP endpoint. The server upgrades from HTTP to WebSocket at `/v1/responses`.

### REQ-WS-02: Message format — `response.create`

> "Clients MUST start each turn by sending a JSON object with `type: "response.create"`. The remaining fields follow the standard response creation request body, except HTTP/SSE transport-specific fields such as `stream`, `stream_options`, and `background` MUST NOT be sent on WebSocket requests."

The server validates incoming `response.create` messages using the `webSocketResponseCreateEventSchema` from our generated Zod schemas. Fields `stream`, `stream_options`, and `background` are stripped if present (they are HTTP-only).

### REQ-WS-03: Same event format

> "Servers MUST send response progress over the WebSocket using the same streaming event objects defined for streaming HTTP responses. Event ordering, `sequence_number`, output item lifecycle, content part lifecycle, and terminal response events have the same meaning on both transports."

Every `ResponseStreamEvent` emitted by `ResponsesService.createStream()` is sent as a JSON frame over the WebSocket. The `sequence_number`, `type`, and all other fields are identical to HTTP/SSE.

### REQ-WS-04: `store: false` with connection-local state

> "Servers SHOULD keep the most recent previous-response state in connection-local memory for the active WebSocket. … With `store=false`, there is no persisted fallback; if the referenced response is not available from connection-local state, the server MUST fail the turn with an error whose code is `previous_response_not_found`."

Each WebSocket connection maintains a `Map<string, ResponseResource>` of `store: false` responses keyed by their `id`. When a `response.create` includes `previous_response_id`, the server looks up the referenced response in this map.

### REQ-WS-05: Failed continuation cache eviction

> "If a continuation turn fails with a 4xx or 5xx error, the server MUST evict the referenced `previous_response_id` from the connection-local cache. A later attempt to continue from that evicted `store=false` response ID on the same connection MUST fail with `previous_response_not_found`."

When a continuation fails, the referenced `previous_response_id` is removed from the connection-local map. Subsequent `response.create` messages referencing that ID receive a `previous_response_not_found` error.

### REQ-WS-06: Sequential processing

> "A single WebSocket connection MUST process at most one in-flight response at a time. Servers MAY accept multiple `response.create` messages over one connection, but they MUST process those messages sequentially."

Only one response is processed at a time per connection. If a client sends a `response.create` while one is in progress, the server queues it and processes it after the current response completes. The connection remains open between responses — no reconnect needed.

### REQ-WS-07: Error envelope format

> "WebSocket failures MUST be sent as a JSON `error` envelope with a `status` code and an `error.code`."

```json
{
  "type": "error",
  "status": 400,
  "error": {
    "code": "previous_response_not_found",
    "message": "Previous response with id 'resp_abc' not found.",
    "param": "previous_response_id"
  }
}
```

### REQ-WS-08: `[DONE]` sentinel not required

The OpenResponses WebSocket spec does not specify a `[DONE]` sentinel. The compliance tests check for terminal events (`response.completed`, `response.failed`, `response.incomplete`) to detect response completion. The connection stays open for the next `response.create`.

However, the upstream compliance test's SSE parser in `sse-parser.ts` treats `[DONE]` as an SSE stream terminator. For WebSocket, the spec says terminal events signal completion. Our implementation sends terminal events (e.g., `response.completed`) and the compliance test's `getTerminalResponse()` function handles detection.

### REQ-WS-09: 60-minute connection limit (TODO)

> "WebSocket connections are limited to 60 minutes. When the limit is reached, servers MUST return an error whose code is `websocket_connection_limit_reached`."

**TODO(ISB-WS-CONN-LIMIT)**: This is not implemented in the initial version. A production implementation should track connection start time and close with the appropriate error after 60 minutes.

### REQ-WS-10: Authorization via headers

> The OpenResponses spec does not explicitly define WebSocket auth, but the compliance tests pass an `Authorization` header during the WebSocket upgrade handshake (Bun supports this natively).

Our implementation extracts the `Authorization` header from the HTTP upgrade request and validates it using the same `BearerAuthGuard` logic as the HTTP endpoint.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  NestJS HTTP Server (port 3000)                         │
│                                                         │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │ ResponsesController  │  │ ResponsesGateway          │ │
│  │ POST /v1/responses   │  │ WS /v1/responses         │ │
│  │ (HTTP + SSE)         │  │ (WebSocket transport)    │ │
│  └──────────┬───────────┘  └──────────┬───────────────┘ │
│             │                          │                  │
│             │  ┌───────────────────────┘                  │
│             │  │ Connection-local state                    │
│             │  │ Map<responseId, ResponseResource>         │
│             │  │                                           │
│             ▼  ▼                                           │
│  ┌──────────────────────┐                                │
│  │   ResponsesService   │  ← shared business logic       │
│  └──────────┬───────────┘                                │
│             │                                             │
│             ▼                                             │
│  ┌──────────────────────┐                                │
│  │  AgentRuntimePort    │  ← ping-pong-runtime (scaffold)│
│  │  (PingPongRuntime)   │                                │
│  └──────────────────────┘                                │
│                                                         │
│  ┌──────────────────────┐                                │
│  │   WsAdapter          │  ← custom NestJS adapter        │
│  │   (native ws lib)    │                                │
│  └──────────────────────┘                                │
└─────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| `WsAdapter` | Creates `ws.Server` on path `/v1/responses`, extracts auth from upgrade request, routes messages to NestJS gateway handlers |
| `ResponsesGateway` | Handles `response.create` messages, manages connection-local state, sends streaming events back over WebSocket, handles error envelopes |
| `ResponsesService` | Shared business logic — `createStream()` is called by both HTTP and WebSocket paths |
| `AgentRuntimePort` | Pluggable runtime — currently `PingPongRuntimeService` (scaffold) |

---

## Technical Implementation

### 1. WsAdapter (`ws-adapter.ts`)

A custom NestJS `WebSocketAdapter` that uses the `ws` library instead of Socket.IO.

```typescript
import type { WebSocketAdapter, INestApplicationContext } from "@nestjs/common";
import type { MessageMappingProperties } from "@nestjs/websockets";
import { WebSocketServer, WebSocket } from "ws";
import { Observable, fromEvent, EMPTY } from "rxjs";
import { mergeMap, filter } from "rxjs/operators";

export class WsAdapter implements WebSocketAdapter {
  constructor(private app: INestApplicationContext) {}

  create(port: number, options: any = {}): any {
    // Mount on /v1/responses path — same as HTTP endpoint
    return new WebSocketServer({ noServer: true, path: "/v1/responses" });
  }

  bindClientConnect(server: WebSocketServer, callback: Function) {
    server.on("connection", callback);
  }

  bindMessageHandlers(
    client: WebSocket,
    handlers: MessageMappingProperties[],
    process: (data: any) => Observable<any>,
  ) {
    fromEvent(client, "message")
      .pipe(
        mergeMap((data) => this.bindMessageHandler(data, handlers, process)),
        filter((result) => result),
      )
      .subscribe((response) => client.send(JSON.stringify(response)));
  }

  bindMessageHandler(
    buffer: any,
    handlers: MessageMappingProperties[],
    process: (data: any) => Observable<any>,
  ): Observable<any> {
    try {
      const message = JSON.parse(
        typeof buffer === "string" ? buffer : buffer.toString(),
      );
      const handler = handlers.find((h) => h.message === message.type);
      if (!handler) return EMPTY;
      return process(handler.callback(message));
    } catch {
      return EMPTY;
    }
  }

  close(server: WebSocketServer) {
    server.close();
  }
}
```

**Key decisions:**
- Uses `ws` library directly (not Socket.IO) for native WebSocket protocol compliance
- Mounts on `/v1/responses` path to match HTTP endpoint
- Message routing uses `message.type` field (not Socket.IO event names)
- Auth header extraction happens in the gateway, not the adapter (see gateway design below)

### 2. ResponsesGateway (`responses.gateway.ts`)

The gateway handles the OpenResponses WebSocket protocol:

```typescript
@WebSocketGateway({ path: "/v1/responses" })
export class ResponsesGateway {
  // Per-connection state
  private connectionState = new WeakMap<WebSocket, {
    previousResponses: Map<string, ResponseResource>;
  }>();

  @SubscribeMessage("response.create")
  async handleMessage(client: WebSocket, message: any) {
    // 1. Validate message against webSocketResponseCreateEventSchema
    // 2. Strip HTTP-only fields (stream, stream_options, background)
    // 3. Resolve previous_response_id from connection-local state
    // 4. Call ResponsesService.createStream()
    // 5. Send each event as JSON frame over WebSocket
    // 6. Store store:false responses in connection-local map
    // 7. Handle errors → send error envelope
    // 8. Evict cache on failed continuation
  }

  handleConnection(client: WebSocket) {
    // Initialize connection-local state
    this.connectionState.set(client, {
      previousResponses: new Map(),
    });
  }

  handleDisconnect(client: WebSocket) {
    // Clean up connection-local state
    this.connectionState.delete(client);
  }
}
```

**Connection-local state management:**

```typescript
interface ConnectionState {
  previousResponses: Map<string, ResponseResource>;
}

private connectionState = new WeakMap<WebSocket, ConnectionState>();
```

- `WeakMap` ensures state is garbage-collected when the WebSocket is closed
- `previousResponses` stores `store: false` responses keyed by their `id`
- On `handleConnection`: initialize a new map
- On `handleDisconnect`: cleanup happens automatically via WeakMap GC

**Message processing flow:**

```
Client sends: { type: "response.create", model: "isb-ping", input: "hello" }
    │
    ▼
Gateway receives message
    │
    ├── Validate against webSocketResponseCreateEventSchema
    │   └── Invalid? → send error envelope, return
    │
    ├── Strip stream/stream_options/background if present
    │
    ├── Resolve previous_response_id (if provided)
    │   ├── Found in connection-local map → use it
    │   └── Not found → send previous_response_not_found error, return
    │
    ├── Call ResponsesService.createStream()
    │
    ├── For each event in stream:
    │   └── Send JSON.stringify(event) over WebSocket
    │
    ├── If store: false → store response in connection-local map
    │
    └── On error during continuation → evict previous_response_id from map
```

**Error envelope format:**

```typescript
function sendError(client: WebSocket, status: number, code: string, message: string, param?: string): void {
  client.send(JSON.stringify({
    type: "error",
    status,
    error: { code, message, ...(param ? { param } : {}) },
  }));
}
```

**Auth extraction from upgrade request:**

The `ws` library's `upgrade` event provides the HTTP request, from which we extract the `Authorization` header. This is handled in `main.ts` where we intercept the HTTP upgrade:

```typescript
// In main.ts — intercept WebSocket upgrade for auth
const httpServer = app.getHttpServer();
httpServer.on("upgrade", (request, socket, head) => {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  // Validate against ISB_OPENRESPONSES_API_KEY
  // ... (see main.ts design below)
  wsServer.handleUpgrade(request, socket, head, (ws) => {
    wsServer.emit("connection", ws, request);
  });
});
```

### 3. Main.ts changes

```typescript
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { PinoLoggerService } from "./logging/pino-logger.service.js";
import { WsAdapter } from "./openresponses/ws-adapter.js";
import { timingSafeEqual } from "node:crypto";

const DEFAULT_PORT = 3000;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLoggerService));

  // Register ws adapter for WebSocket transport at /v1/responses
  app.useWebSocketAdapter(new WsAdapter(app));

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  app.enableShutdownHooks();
  await app.listen(port, "127.0.0.1");
}

await bootstrap();
```

> **Note**: The `WsAdapter` uses NestJS's adapter pattern. The `ws.Server` is created by the adapter and attached to the existing HTTP server. Auth validation for WebSocket happens in the gateway's `handleConnection` method, where we can access the upgrade request headers through the ws library's `req` parameter.

### 4. Module changes

No structural changes needed. The `ResponsesGateway` class name stays the same — only its implementation changes. The `OpenResponsesModule` continues to provide it as-is.

```typescript
@Module({
  controllers: [ResponsesController],
  providers: [
    ResponsesService,
    { provide: AGENT_RUNTIME_PORT, useClass: PingPongRuntimeService },
    ResponsesGateway,
  ],
})
export class OpenResponsesModule {}
```

### 5. Package changes

```diff
  "dependencies": {
    ...
-   "@nestjs/platform-socket.io": "^11.1.19",
-   "@nestjs/websockets": "^11.1.19",
+   "@nestjs/platform-ws": "^11.1.19",
+   "@nestjs/websockets": "^11.1.19",
+   "ws": "^8.18.0",
    ...
  }
```

> **Note**: `@nestjs/websockets` is still needed (it provides the `@WebSocketGateway` and `@SubscribeMessage` decorators). We're only swapping the adapter from `@nestjs/platform-socket.io` to `@nestjs/platform-ws` + the `ws` library directly.

---

## Out of Scope — TODO Items

### TODO(ISB-WS-CONN-LIMIT): 60-minute connection limit

The spec requires closing connections after 60 minutes with `websocket_connection_limit_reached` error. Not implemented in this iteration.

**Implementation note**: Add a `setTimeout` on `handleConnection` that sends the error envelope and closes the connection after 60 minutes. Clear the timeout on `handleDisconnect`.

### TODO(ISB-WS-COMPACTION): `/v1/responses/compact` endpoint

The `/v1/responses/compact` HTTP endpoint does not exist yet. The compliance tests `compact-response` and `compact-missing-model` fail with 404. The `websocket-compact-new-chain` test also depends on this endpoint.

**Implementation note**: Add a new `POST /v1/responses/compact` route in `ResponsesController` that accepts a compaction request, calls a compaction service, and returns a `CompactResource`. The WebSocket `websocket-compact-new-chain` test first calls this HTTP endpoint, then uses the compacted output as input for a WebSocket continuation.

### TODO(ISB-WS-TOOL-CALLING): Tool calling in runtime

The `tool-calling` compliance test expects `function_call` output from the model. The `PingPongRuntimeService` currently hardcodes reasoning/message/function_call blocks in `stream()`. A real implementation should pass through `tools` from the request and let the LLM decide whether to call them.

**Implementation note**: The ping-pong runtime already emits `function_call` items (see `PingPongRuntimeService.stream()` output index 3). The compliance test failure is because `isb-ping` (the model name used in testing) doesn't have a real LLM behind it — the ping-pong runtime uses `ChatOllama` with `gemma4:e2b` which isn't guaranteed to produce tool calls. This is a runtime issue, not a WebSocket issue.

### TODO(ISB-WS-PRODUCTION-RUNTIME): Replace PingPongRuntimeService

The `PingPongRuntimeService` is a scaffold (marked `SCAFFOLD` and `TODO(isb-0020)`). It calls `ChatOllama` directly and has hardcoded reasoning/function-call patterns. Replace it with the LangGraph-based agent runtime once wired.

### TODO(ISB-WS-RECONNECT): WebSocket reconnection handling

The compliance test `websocket-reconnect-store-false-recovery` tests reconnecting after a `store:false` response. This requires opening a new WebSocket connection after the first one closes and attempting `previous_response_id` continuation. Since the previous response is `store:false`, it should not be in the new connection's cache, resulting in `previous_response_not_found`. This works correctly with connection-local state since each connection has its own map.

### TODO(ISB-WS-HEALTH-MONITOR): WebSocket health monitoring

No health check or monitoring endpoint for WebSocket connections. Consider adding connection count metrics and health indicators to the NestJS health endpoint.

### TODO(ISB-WS-GRACEFUL-SHUTDOWN): Graceful WebSocket shutdown

When the server shuts down, open WebSocket connections should be closed gracefully (send a final error event, then close). NestJS's `enableShutdownHooks()` handles HTTP connections but WebSocket connections need explicit cleanup.

---

## Compliance Test Matrix

| Test ID | What it tests | Status |
|---------|---------------|--------|
| `basic-response` | Simple text response via HTTP | ✅ Passing |
| `assistant-phase` | Assistant phase labels via HTTP | ✅ Passing |
| `response-output-phase-schema` | ResponseResource schema validation (mock, no HTTP) | ✅ Passing |
| `streaming-response` | SSE streaming events via HTTP | ✅ Passing |
| `system-prompt` | System role message via HTTP | ✅ Passing |
| `multi-turn` | Multi-turn conversation via HTTP | ✅ Passing |
| `image-input` | Image URL in user content via HTTP | ✅ Passing |
| `websocket-response` | Basic WebSocket response creation | Target of this implementation |
| `websocket-sequential-responses` | Multiple responses on one connection | Target of this implementation |
| `websocket-continuation` | `store:false` continuation with `previous_response_id` | Target of this implementation |
| `websocket-reconnect-store-false-recovery` | Reconnect after store:false, `previous_response_not_found` | Target of this implementation |
| `websocket-previous-response-not-found` | Missing previous_response_id error | Target of this implementation |
| `websocket-failed-continuation-evicts-cache` | Failed continuation cache eviction | Target of this implementation |
| `websocket-compact-new-chain` | Compact output → new WebSocket chain | ❌ Blocked by `/v1/responses/compact` |
| `tool-calling` | Function tool call output | ❌ Runtime issue (not WebSocket) |
| `compact-response` | `/v1/responses/compact` endpoint | ❌ Blocked by missing endpoint |
| `compact-missing-model` | `/v1/responses/compact` 400 error | ❌ Blocked by missing endpoint |