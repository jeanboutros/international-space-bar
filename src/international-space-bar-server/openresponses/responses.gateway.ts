// OpenResponses WebSocket Gateway — native ws implementation per the spec.
//
// Spec reference: https://github.com/openresponses/openresponses/blob/main/src/pages/specification.mdx
// "Servers MAY expose the Responses API over a persistent WebSocket connection
//  at the same /v1/responses resource."
//
// Implements:
//   REQ-WS-01  Transport path: /v1/responses
//   REQ-WS-02  Message format: { type: "response.create", ... }
//   REQ-WS-03  Same streaming event format as SSE
//   REQ-WS-04  store:false with connection-local state
//   REQ-WS-05  Failed continuation cache eviction
//   REQ-WS-06  Sequential processing (at most one in-flight response)
//   REQ-WS-07  Error envelope format
//   REQ-WS-10  Authorization via upgrade request headers
//
// NOT yet implemented (see docs/websocket-transport.md TODOs):
//   REQ-WS-08  [DONE] sentinel — not needed; terminal events signal completion
//   REQ-WS-09  60-minute connection limit — TODO(ISB-WS-CONN-LIMIT)

import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
    type OnGatewayConnection,
    type OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
} from "@nestjs/websockets";
import type WebSocket from "ws";
import { AGENT_RUNTIME_PORT, type AgentRuntimePort } from "./agent-runtime.port.js";
import { webSocketErrorEventSchema } from "./generated/zod/webSocketErrorEventSchema.js";
import { webSocketResponseCreateEventSchema } from "./generated/zod/webSocketResponseCreateEventSchema.js";
import type { ResponseResource, ResponseStreamEvent } from "./responses.types.js";

// ── Connection-local state ────────────────────────────────────────────────
//
// Each WebSocket gets its own ConnectionState holding store:false responses
// keyed by their id. WeakMap ensures GC when the ws socket is collected.

interface ConnectionState {
    /** Store:false responses cached for previous_response_id lookup */
    previousResponses: Map<string, ResponseResource>;
    /** Whether a response is currently being streamed on this connection */
    processing: boolean;
    /** Queue of pending messages to process sequentially */
    queue: Array<{ data: unknown; raw: string }>;
}

// ── Auth helpers ──────────────────────────────────────────────────────────
// Reuses the same timing-safe comparison as BearerAuthGuard for the HTTP path.

function isTokenValid(token: string, expected: string): boolean {
    const tokenBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expected);
    if (tokenBuffer.length !== expectedBuffer.length) {
        return false;
    }
    return timingSafeEqual(tokenBuffer, expectedBuffer);
}

function validateAuth(request: IncomingMessage): boolean {
    const apiKey = process.env.ISB_OPENRESPONSES_API_KEY;
    if (!apiKey) return false;

    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) return false;

    const token = authorization.slice(7);
    return isTokenValid(token, apiKey);
}

// ── Error helpers ─────────────────────────────────────────────────────────

function sendError(
    client: WsClient,
    status: number,
    code: string,
    message: string,
    param?: string,
): void {
    const envelope = webSocketErrorEventSchema.parse({
        type: "error",
        status,
        error: {
            code,
            message,
            ...(param !== undefined ? { param } : {}),
        },
    });

    client.send(JSON.stringify(envelope));
}

// ── Gateway ───────────────────────────────────────────────────────────────

type WsClient = InstanceType<typeof WebSocket>;

@Injectable()
@WebSocketGateway({ path: "/v1/responses" })
export class ResponsesGateway
    implements OnGatewayConnection<WsClient>, OnGatewayDisconnect<WsClient>
{
    private readonly logger = new Logger(ResponsesGateway.name);
    private readonly connections = new WeakMap<WsClient, ConnectionState>();

    constructor(@Inject(AGENT_RUNTIME_PORT) private readonly runtime: AgentRuntimePort) {}

    // ── Connection lifecycle ──────────────────────────────────────────────

    /**
     * Called by NestJS when a new WebSocket connection is established.
     * Receives both the ws client and the original HTTP upgrade request.
     *
     * NestJS's WsAdapter emits 'connection' with (ws, request),
     * and the framework spreads these args into handleConnection(...args).
     */
    handleConnection(client: WsClient, request: IncomingMessage): void {
        // REQ-WS-10: Authorization via headers on the HTTP upgrade request
        if (!validateAuth(request)) {
            sendError(client, 401, "unauthorized", "Invalid or missing Authorization header");

            client.close();
            return;
        }

        this.connections.set(client, {
            previousResponses: new Map(),
            processing: false,
            queue: [],
        });
        this.logger.log("WebSocket client connected");
    }

    handleDisconnect(client: WsClient): void {
        const state = this.connections.get(client);
        if (state) {
            state.previousResponses.clear();
            state.queue.length = 0;
        }
        this.connections.delete(client);
        this.logger.log("WebSocket client disconnected");
    }

    // ── Message handling ──────────────────────────────────────────────────

    @SubscribeMessage("response.create")
    async handleResponseCreate(client: WsClient, payload: unknown): Promise<void> {
        const state = this.connections.get(client);
        if (!state) {
            // Connection state was lost — shouldn't happen but guard against it
            sendError(client, 500, "internal_error", "Connection state not found");
            return;
        }

        // Queue the message for sequential processing (REQ-WS-06)
        const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
        state.queue.push({ data: payload, raw });

        // If already processing, the queue will be drained after the current response
        if (state.processing) {
            return;
        }

        await this.drainQueue(client, state);
    }

    // ── Sequential message processing ─────────────────────────────────────

    private async drainQueue(client: WsClient, state: ConnectionState): Promise<void> {
        while (state.queue.length > 0) {
            const item = state.queue.shift();
            if (!item) break;

            state.processing = true;
            try {
                await this.processMessage(client, state, item.data, item.raw);
            } finally {
                state.processing = false;
            }
        }
    }

    private async processMessage(
        client: WebSocket,
        state: ConnectionState,
        data: unknown,
        _raw: string,
    ): Promise<void> {
        // 1. Validate against the WebSocket create event schema
        const parseResult = webSocketResponseCreateEventSchema.safeParse(data);
        if (!parseResult.success) {
            const issues = parseResult.error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ");
            sendError(client, 400, "invalid_request", `Invalid response.create event: ${issues}`);
            return;
        }

        const message = parseResult.data;

        // 2. Strip HTTP-only fields (REQ-WS-02)
        // These fields MUST NOT be sent on WebSocket but the server strips them
        // gracefully if present rather than rejecting the request.
        const body: Record<string, unknown> = { ...message };
        delete body.stream;
        delete body.stream_options;
        delete body.background;
        // Also remove the type field — it's a WebSocket envelope field, not a request body field
        delete body.type;

        // 3. Resolve previous_response_id (REQ-WS-04)
        const previousResponseId: string | null =
            typeof message.previous_response_id === "string" ? message.previous_response_id : null;
        if (previousResponseId) {
            const cached = state.previousResponses.get(previousResponseId);
            if (!cached) {
                // REQ-WS-04: "if the referenced response is not available from
                // connection-local state, the server MUST fail the turn with
                // an error whose code is previous_response_not_found"
                sendError(
                    client,
                    400,
                    "previous_response_not_found",
                    `Previous response with id '${previousResponseId}' not found.`,
                    "previous_response_id",
                );
                return;
            }
        }

        // 4. Build the request for the runtime
        const input =
            typeof message.input === "string" ? message.input : JSON.stringify(message.input);

        const requestId = `req_${crypto.randomUUID()}`;
        // The runtime requires a non-null model; default to "isb-ping" if not provided.
        // This matches the ping-pong runtime scaffold behavior.
        const model = message.model ?? "isb-ping";

        // 5. Stream the response through the runtime
        try {
            for await (const event of this.runtime.stream({
                model,
                input,
                instructions: message.instructions ?? undefined,
                requestId,
            })) {
                // REQ-WS-03: same event format as SSE — send as JSON frame
                this.sendEvent(client, event);

                // Cache store:false responses for continuation (REQ-WS-04)
                // Track the response id from terminal events
                if (event.type === "response.completed" || event.type === "response.failed") {
                    const response = (event as { response?: ResponseResource }).response;
                    if (response?.id && message.store === false) {
                        state.previousResponses.set(response.id, response);
                    }
                }
            }
        } catch (error) {
            const message_ = error instanceof Error ? error.message : String(error);

            // REQ-WS-05: Failed continuation cache eviction
            if (previousResponseId) {
                state.previousResponses.delete(previousResponseId);
                this.logger.log(
                    `Evicted previous_response_id='${previousResponseId}' from connection-local cache after error`,
                );
            }

            sendError(client, 500, "internal_error", message_);
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private sendEvent(client: WsClient, event: ResponseStreamEvent): void {
        if ((client as { readyState: number }).readyState !== 1) return; // WebSocket.OPEN = 1

        client.send(JSON.stringify(event));
    }
}
