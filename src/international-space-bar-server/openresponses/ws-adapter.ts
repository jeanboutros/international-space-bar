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

import type { INestApplicationContext } from "@nestjs/common";
import { WsAdapter as BaseWsAdapter } from "@nestjs/platform-ws";

/**
 * Parsed message shape returned by the OpenResponses message parser.
 * The `event` field maps to `message.type` for NestJS routing.
 * The `data` field carries the full parsed JSON object.
 */
interface ParsedMessage {
    event: string;

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
        this.setMessageParser(
            (data: string | Buffer | ArrayBuffer | Buffer[]): ParsedMessage | undefined => {
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
                    return undefined;
                } catch {
                    return undefined;
                }
            },
        );
    }
}
