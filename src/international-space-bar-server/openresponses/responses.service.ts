import { Inject, Injectable } from "@nestjs/common";
import {
    AGENT_RUNTIME_PORT,
    type AgentRuntimePort,
    type ResponseStreamConfig,
} from "./agent-runtime.port.js";
import type {
    CreateResponseBody,
    ResponseResource,
    ResponseStreamEvent,
} from "./responses.types.js";

@Injectable()
export class ResponsesService {
    private readonly runtime: AgentRuntimePort;

    constructor(@Inject(AGENT_RUNTIME_PORT) runtime: AgentRuntimePort) {
        this.runtime = runtime;
    }

    async create(body: CreateResponseBody, requestId: string): Promise<ResponseResource> {
        return this.runtime.invoke({
            model: body.model as string,
            input: (body.input as string | readonly unknown[]) ?? "",
            instructions: body.instructions as string | undefined,
            requestId: requestId,
            config: this.buildConfig(body),
        });
    }

    createStream(
        body: CreateResponseBody,
        abortSignal: AbortSignal,
        requestId: string,
    ): AsyncIterable<ResponseStreamEvent> {
        return this.runtime.stream({
            model: body.model as string,
            input: (body.input as string | readonly unknown[]) ?? "",
            instructions:
                body.instructions && typeof body.instructions === "string"
                    ? body.instructions
                    : JSON.stringify(body.instructions),
            requestId: requestId,
            abortSignal,
            config: this.buildConfig(body),
        });
    }

    private buildConfig(body: CreateResponseBody): ResponseStreamConfig {
        return {
            model: body.model as string,
            instructions: (body.instructions as string | undefined) ?? null,
            temperature: (body.temperature as number | undefined) ?? null,
            top_p: (body.top_p as number | undefined) ?? null,
            max_output_tokens: (body.max_output_tokens as number | undefined) ?? null,
            tools: (body.tools as readonly unknown[] | undefined) ?? [],
            tool_choice: body.tool_choice ?? null,
            truncation: (body.truncation as string | undefined) ?? null,
            metadata: (body.metadata as Record<string, string> | undefined) ?? null,
            store: (body.store as boolean | undefined) ?? true,
            previous_response_id: (body.previous_response_id as string | undefined) ?? null,
        };
    }
}
