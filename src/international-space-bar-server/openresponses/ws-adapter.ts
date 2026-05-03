// Custom NestJS WebSocket adapter for the OpenResponses spec.
// Extends the built-in WsAdapter to mount on /v1/responses path
// and parse OpenResponses message format (type: "response.create").
//
// Spec reference: https://github.com/openresponses/openresponses/blob/main/src/pages/specification.mdx
// "Servers MAY expose the Responses API over a persistent WebSocket connection
//  at the same /v1/responses resource."
//
// Auth validation is handled in ResponsesGateway.handleConnection()
// using the HTTP upgrade request passed as the second argument.
// This is necessary because NestJS guards don't work on WebSocket
// connections — they operate on HTTP execution contexts.
//
// Error routing:
// Messages that fail parsing (invalid JSON) or lack a string `type` field
// are routed to WS_ERROR_EVENT so the gateway can send an error envelope
// without breaking the connection. Messages with a `type` field that has
// no registered @SubscribeMessage handler are also routed to WS_ERROR_EVENT
// via the bindMessageHandler override.

import type { INestApplicationContext } from "@nestjs/common";
import { WsAdapter as BaseWsAdapter } from "@nestjs/platform-ws";
import type { MessageMappingProperties } from "@nestjs/websockets";
import type { Observable } from "rxjs";
import { EMPTY } from "rxjs";

// ── Error event for routing invalid/unrecognized messages ──────────────────
//
// When a message fails parsing or has no registered handler, the adapter
// routes it to this event name. The gateway registers a @SubscribeMessage
// handler for this event to send an error envelope back to the client.

export const WS_ERROR_EVENT = "__error";

/** Data passed to the gateway when a message fails parsing or has no handler. */
export type WsErrorData =
    | { kind: "parse_error"; raw: string }
    | { kind: "invalid_format"; raw: string }
    | { kind: "unknown_event"; event: string; data: unknown };

// ── Parsed message ─────────────────────────────────────────────────────────

/**
 * Parsed message shape returned by the OpenResponses message parser.
 * The `event` field maps to `message.type` for NestJS routing.
 * The `data` field carries the full parsed JSON object.
 */
interface ParsedMessage {
    event: string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- NestJS WsAdapter typed this as any; carries the full parsed JSON message object
    data: any;
}

/**
 * Converts WebSocket message data to a UTF-8 string, handling all
 * possible ws library data types (string, Buffer, ArrayBuffer, Buffer[]).
 * Avoids String() which would produce "[object Object]" for ArrayBuffers.
 */
function dataToString(data: string | Buffer | ArrayBuffer | Buffer[]): string {
    if (typeof data === "string") return data;
    if (Buffer.isBuffer(data)) return data.toString("utf-8");
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
    if (Array.isArray(data)) return Buffer.concat(data).toString("utf-8");
    // ArrayBufferView (e.g. Uint8Array)
    if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
    // Fallback — should not be reached with ws library
    return new TextDecoder().decode(new Uint8Array(data));
}

/**
 * OpenResponsesWsAdapter — extends NestJS's built-in WsAdapter.
 *
 * Customisations:
 * - Mounts on path /v1/responses (same as HTTP endpoint, per spec)
 * - Parses incoming JSON messages using `message.type` as the event name
 *   (OpenResponses uses `type: "response.create"`, not Socket.IO event names)
 * - Routes invalid/unparseable messages to WS_ERROR_EVENT instead of
 *   silently dropping them, so the gateway can send error envelopes
 * - Routes unrecognized event types (no @SubscribeMessage handler) to
 *   WS_ERROR_EVENT so the gateway can respond with an appropriate error
 *
 * Auth validation happens in ResponsesGateway.handleConnection()
 * because NestJS guards operate on HTTP execution contexts, not WebSocket.
 */
export class OpenResponsesWsAdapter extends BaseWsAdapter {
    constructor(app: INestApplicationContext) {
        super(app);

        // Override the message parser to use `message.type` as the event name.
        // The default parser expects `{ event: "eventName", data: ... }` (Socket.IO style).
        // OpenResponses sends `{ type: "response.create", ... }`.
        //
        // When a message is invalid (can't parse JSON, no string `type` field),
        // we route it to WS_ERROR_EVENT instead of returning undefined.
        // Returning undefined causes NestJS to silently drop the message,
        // which violates the spec requirement that servers should send error
        // envelopes for bad requests without breaking the connection.
        this.setMessageParser((data: string | Buffer | ArrayBuffer | Buffer[]): ParsedMessage => {
            try {
                const raw = dataToString(data);
                const message: unknown = JSON.parse(raw);
                if (
                    typeof message === "object" &&
                    message !== null &&
                    "type" in message &&
                    typeof (message as Record<string, unknown>).type === "string"
                ) {
                    return {
                        event: (message as Record<string, unknown>).type as string,
                        data: message,
                    };
                }
                // Valid JSON but no string `type` field — route to error handler
                this.logger.warn(
                    { message },
                    "Received WebSocket message without a string 'type' field. Routing to error handler.",
                );
                return {
                    event: WS_ERROR_EVENT,
                    data: { kind: "invalid_format", raw } satisfies WsErrorData,
                };
            } catch {
                // JSON parse failure — route to error handler
                const raw = typeof data === "string" ? data : "[binary data]";
                this.logger.warn(
                    { raw },
                    "Failed to parse WebSocket message as JSON. Routing to error handler.",
                );
                return {
                    event: WS_ERROR_EVENT,
                    data: { kind: "parse_error", raw } satisfies WsErrorData,
                };
            }
        });
    }

    // ── Override bindMessageHandler ──────────────────────────────────────
    //
    // The base class silently drops messages whose `event` field has no
    // registered @SubscribeMessage handler — it throws TypeError when
    // destructuring `undefined.callback`, caught by the catch block returning
    // EMPTY. We intercept this to route unrecognized events to WS_ERROR_EVENT
    // so the gateway can send an error envelope back to the client.

    // The override signature must match the base class which uses `any` for
    // buffer, transform input, and transform output. This is NestJS's public
    // API surface — we cannot tighten these types without breaking the override.

    /* eslint-disable @typescript-eslint/no-unsafe-argument */

    /* eslint-disable @typescript-eslint/no-unsafe-member-access */

    public override bindMessageHandler(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- must match NestJS WsAdapter base class signature
        buffer: any,
        handlersMap: Map<string, MessageMappingProperties>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- must match NestJS WsAdapter base class signature
        transform: (data: any) => Observable<any>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- must match NestJS WsAdapter base class signature
    ): Observable<any> {
        const message = this.messageParser(buffer.data ?? buffer);
        if (!message) {
            return EMPTY;
        }

        const handler = handlersMap.get(message.event);
        if (!handler) {
            // No registered @SubscribeMessage handler for this event type.
            // Route to error handler so the gateway can inform the client.
            const errorHandler = handlersMap.get(WS_ERROR_EVENT);
            if (errorHandler) {
                return transform(
                    errorHandler.callback(
                        {
                            kind: "unknown_event" as const,
                            event: message.event,
                            data: message.data,
                        } satisfies WsErrorData,
                        WS_ERROR_EVENT,
                    ),
                );
            }
            this.logger.warn(
                `No handler for event '${message.event}' and no error handler registered. Dropping message.`,
            );
            return EMPTY;
        }

        try {
            return transform(handler.callback(message.data, message.event));
        } catch {
            return EMPTY;
        }
    }

    /* eslint-enable @typescript-eslint/no-unsafe-argument */

    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
}
