import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { AGENT_RUNTIME_PORT, type AgentRuntimePort } from "./agent-runtime.port.js";
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

    async create(body: CreateResponseBody): Promise<ResponseResource> {
        const input = typeof body.input === "string" ? body.input : JSON.stringify(body.input);

        return this.runtime.invoke({
            model: body.model,
            input,
            instructions: body.instructions,
            requestId: `req_${randomUUID()}`,
        });
    }

    createStream(body: CreateResponseBody): AsyncIterable<ResponseStreamEvent> {
        const input = typeof body.input === "string" ? body.input : JSON.stringify(body.input);

        return this.runtime.stream({
            model: body.model,
            input,
            instructions: body.instructions,
            requestId: `req_${randomUUID()}`,
        });
    }
}
