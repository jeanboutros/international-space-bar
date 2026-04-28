import type { ResponseResource } from "./responses.types.js";

export const AGENT_RUNTIME_PORT = Symbol("AgentRuntimePort");

export interface AgentRuntimePort {
    invoke(request: AgentInvokeRequest): Promise<ResponseResource>;
}

export interface AgentInvokeRequest {
    readonly model: string;
    readonly input: string;
    readonly instructions?: string;
    readonly requestId: string;
}
