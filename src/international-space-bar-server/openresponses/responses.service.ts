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

    async create(body: CreateResponseBody, requestId: string): Promise<ResponseResource> {
        return this.runtime.invoke({
            model: body.model as string,
            input: body.input as string | readonly unknown[] ?? "",
            instructions: body.instructions as string | undefined,
            requestId: requestId,
        });
    }

    createStream(
        body: CreateResponseBody,
        abortSignal: AbortSignal,
        requestId: string,
    ): AsyncIterable<ResponseStreamEvent> {
        return this.runtime.stream({
            model: body.model as string,
            input: body.input as string | readonly unknown[] ?? "",
            instructions: body.instructions && typeof body.instructions === "string" ? body.instructions : JSON.stringify(body.instructions),
            requestId: requestId,
            abortSignal,
        });
    }
}
