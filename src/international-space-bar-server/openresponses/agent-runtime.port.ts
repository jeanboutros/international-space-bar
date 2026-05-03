import type { ResponseResource, ResponseStreamEvent } from "./responses.types.js";

export const AGENT_RUNTIME_PORT = Symbol("AgentRuntimePort");

export interface AgentRuntimePort {
    invoke(request: AgentInvokeRequest): Promise<ResponseResource>;
    stream(request: AgentInvokeRequest): AsyncIterable<ResponseStreamEvent>;
}

/**
 * Echo-config fields carried from the HTTP request body into the runtime.
 *
 * Populated by `ResponsesService` with spec defaults for any omitted fields.
 * HTTP-only fields (`stream`, `stream_options`, `background`) are intentionally
 * excluded — they control transport, not runtime behaviour.
 */
export interface ResponseStreamConfig {
    readonly model: string;
    readonly instructions?: string | null;
    readonly temperature?: number | null;
    readonly top_p?: number | null;
    readonly max_output_tokens?: number | null;
    readonly max_tool_calls?: number | null;
    readonly tools?: readonly unknown[];
    readonly tool_choice?: unknown;
    readonly truncation?: string | null;
    readonly metadata?: Record<string, string> | null;
    readonly parallel_tool_calls?: boolean | null;
    readonly text?: unknown;
    readonly reasoning?: unknown;
    readonly store?: boolean | null;
    readonly previous_response_id?: string | null;
    readonly service_tier?: string | null;
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
    readonly config?: ResponseStreamConfig;
}
