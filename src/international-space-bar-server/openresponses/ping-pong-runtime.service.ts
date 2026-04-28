import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { AgentInvokeRequest, AgentRuntimePort } from "./agent-runtime.port.js";
import type { ResponseResource } from "./responses.types.js";

@Injectable()
export class PingPongRuntimeService implements AgentRuntimePort {
    invoke(request: AgentInvokeRequest): Promise<ResponseResource> {
        return Promise.resolve({
            id: `resp_${randomUUID()}`,
            object: "response",
            created_at: Math.floor(Date.now() / 1000),
            model: request.model,
            status: "completed",
            output: [
                {
                    id: `msg_${randomUUID()}`,
                    type: "message",
                    status: "completed",
                    role: "assistant",
                    content: [
                        {
                            type: "output_text",
                            text: "pong",
                            annotations: [],
                        },
                    ],
                },
            ],
            usage: {
                input_tokens: 0,
                output_tokens: 1,
                total_tokens: 1,
            },
        });
    }
}
