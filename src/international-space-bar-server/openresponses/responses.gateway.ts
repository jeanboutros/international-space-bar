import { UseGuards } from "@nestjs/common";
import {
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
    type WsResponse,
} from "@nestjs/websockets";
import { Observable } from "rxjs";
import type { Server } from "socket.io";
import { BearerAuthGuard } from "../common/bearer-auth.guard.js";

/* 
    {
    "type": "response.create",
    "model": "gpt-openresponses-1",
    "store": false,
    "input": [
        {
            "type": "message",
            "role": "user",
            "content": "Find the bug in fizz_buzz()."
        }
    ],
    "tools": []
}
*/

interface ResponseInputMessage {
    type: "message";
    role: "user";
    content: string;
}

interface ResponseCreateEvent {
    type: string;
    model: string;
    store: boolean;
    input: ResponseInputMessage[]; // Simplified for this example
    tools: any[]; // Simplified for this example
}

@WebSocketGateway({ path: "v1/responses", namespace: "events" })
export class ResponsesGateway {
    @WebSocketServer()
    server: Server;

    @UseGuards(BearerAuthGuard)
    @SubscribeMessage("event")
    handleSubscribe(
        @MessageBody() data: ResponseCreateEvent,
    ): Observable<WsResponse<ResponseCreateEvent>> {
        return new Observable<WsResponse<ResponseCreateEvent>>((observer) => {
            const newData = {
                type: data.type,
                model: data.model,
                store: data.store,
                input: [
                    {
                        type: "message",
                        role: "user",
                        content: "Find the bug in fizz_buzz().",
                    },
                ],
                tools: [],
            } as ResponseCreateEvent;

            observer.next({ event: "response.created", data: newData });
            observer.complete();
        });
    }
}
// https://www.openresponses.org/specification#websocket-transport
