import type { ResponseResource, ResponseStreamEvent } from "./responses.types.js";

export const AGENT_RUNTIME_PORT = Symbol("AgentRuntimePort");

export interface AgentRuntimePort {
    invoke(request: AgentInvokeRequest): Promise<ResponseResource>;
    stream(request: AgentInvokeRequest): AsyncIterable<ResponseStreamEvent>;
}

export interface AgentInvokeRequest {
    readonly model: string;
    readonly input: string;
    readonly instructions?: string;
    readonly requestId: string;
    readonly abortSignal?: AbortSignal;
}
