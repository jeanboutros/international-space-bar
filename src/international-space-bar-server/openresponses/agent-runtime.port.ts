import type { ResponseResource, ResponseStreamEvent } from "./responses.types.js";

export const AGENT_RUNTIME_PORT = Symbol("AgentRuntimePort");

export interface AgentRuntimePort {
    invoke(request: AgentInvokeRequest): Promise<ResponseResource>;
    stream(request: AgentInvokeRequest): AsyncIterable<ResponseStreamEvent>;
}

/**
 * Request contract for the agent runtime.
 *
 * `input` accepts either a plain string or an array of OpenResponses items
 * (messages, function_call_output, reasoning, etc.). The array form preserves
 * structured multi-turn context from the client. Runtime implementations are
 * responsible for converting these items to framework-specific types (e.g.
 * LangChain BaseMessage[]) — the port boundary stays framework-agnostic.
 */
export interface AgentInvokeRequest {
    readonly model: string;
    readonly input: string | readonly unknown[];
    readonly instructions?: string;
    readonly requestId: string;
    readonly abortSignal?: AbortSignal;
}
