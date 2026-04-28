import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { AgentInvokeRequest, AgentRuntimePort } from "./agent-runtime.port.js";
import type { ResponseResource } from "./responses.types.js";

@Injectable()
export class PingPongRuntimeService implements AgentRuntimePort {
    invoke(request: AgentInvokeRequest): Promise<ResponseResource> {
        const now = Math.floor(Date.now() / 1000);
        return Promise.resolve({
            id: `resp_${randomUUID()}`,
            object: "response",
            created_at: now,
            completed_at: now,
            status: "completed",
            model: request.model,
            previous_response_id: null,
            instructions: null,
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
            error: null,
            tools: [],
            tool_choice: "auto",
            truncation: "disabled",
            parallel_tool_calls: true,
            text: { format: { type: "text" } },
            top_p: 1,
            presence_penalty: 0,
            frequency_penalty: 0,
            top_logprobs: 0,
            temperature: 1,
            reasoning: null,
            usage: {
                input_tokens: 0,
                output_tokens: 1,
                total_tokens: 1,
                input_tokens_details: { cached_tokens: 0 },
                output_tokens_details: { reasoning_tokens: 0 },
            },
            max_output_tokens: null,
            max_tool_calls: null,
            store: true,
            background: false,
            service_tier: "default",
            metadata: {},
            safety_identifier: null,
            prompt_cache_key: null,
            incomplete_details: null,
        });
    }
}
