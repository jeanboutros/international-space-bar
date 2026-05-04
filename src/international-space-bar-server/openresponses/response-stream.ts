import { randomUUID } from "node:crypto";

import type { AgentInvokeRequest } from "./agent-runtime.port.js";
import {
    responseCompletedStreamingEventSchema,
    responseCreatedStreamingEventSchema,
    responseFailedStreamingEventSchema,
    responseIncompleteStreamingEventSchema,
    responseResourceSchema,
} from "./generated/zod/index.js";
import type { ItemField, ResponseResource, ResponseStreamEvent, Usage } from "./responses.types.js";

/**
 * A block factory: given a {@link ResponseStream} context, yields the
 * OpenResponses streaming events for one output item (message, reasoning,
 * or function call).
 *
 * @example
 * ```ts
 * const block: Block = messageBlock("hello world");
 * for await (const event of block(ctx)) {
 *   console.log(event.type);
 * }
 * ```
 */
export type Block = (ctx: ResponseStream) => AsyncGenerator<ResponseStreamEvent>;

/**
 * Orchestrates an OpenResponses streaming response.
 *
 * Owns protocol-level state (sequence counter, output index, usage
 * accumulator) and emits the `response.created` / `response.completed`
 * envelope around an iterable of {@link Block} instances.
 *
 * @example
 * ```ts
 * const ctx = new ResponseStream(request);
 * yield* ctx.run(langGraphBlocks(graph, messages));
 * ```
 */
export class ResponseStream {
    private _seq = 0;
    private _outputIndex = 0;
    private readonly _output: ItemField[] = [];
    private readonly _usage: Usage = {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
    };
    private readonly _shell: ResponseResource;

    readonly abortSignal: AbortSignal | undefined;

    constructor(request: AgentInvokeRequest) {
        this.abortSignal = request.abortSignal;
        this._shell = this.buildShell(request);
    }

    /**
     * The zero-based index of the current output item being processed.
     * Incremented by {@link run} after each block completes.
     */
    get outputIndex(): number {
        return this._outputIndex;
    }

    /**
     * Returns the next monotonically-increasing sequence number for
     * an SSE event and advances the internal counter.
     *
     * @returns The sequence number to use for the next event.
     */
    nextSeq(): number {
        return this._seq++;
    }

    /**
     * Records a completed output item so it appears in the final
     * `response.completed` payload.
     *
     * @param item - The completed output item (message, reasoning, or function call).
     */
    recordOutputItem(item: ItemField): void {
        this._output.push(item);
    }

    /**
     * Accumulates token usage from a block into the response-level totals.
     *
     * @param delta - Partial usage counts to add (e.g. `{ output_tokens: 42 }`).
     */
    addUsage(delta: Partial<Usage>): void {
        if (delta.input_tokens != null) this._usage.input_tokens += delta.input_tokens;
        if (delta.output_tokens != null) this._usage.output_tokens += delta.output_tokens;
        this._usage.total_tokens = this._usage.input_tokens + this._usage.output_tokens;
    }

    /**
     * Executes the streaming response lifecycle: emits `response.created`,
     * iterates blocks yielding their events, then emits the terminal event
     * (`completed`, `incomplete`, or `failed`).
     *
     * @param blocks - An iterable (or async iterable) of {@link Block} factories.
     * @returns An async generator of {@link ResponseStreamEvent} objects.
     *
     * @example
     * ```ts
     * const ctx = new ResponseStream(request);
     * yield* ctx.run([messageBlock("pong")]);
     * ```
     */
    async *run(
        blocks: Iterable<Block> | AsyncIterable<Block>,
    ): AsyncGenerator<ResponseStreamEvent> {
        yield responseCreatedStreamingEventSchema.parse({
            type: "response.created",
            sequence_number: this.nextSeq(),
            response: this._shell,
        });

        try {
            for await (const block of blocks) {
                if (this.abortSignal?.aborted) break;
                yield* block(this);
                this._outputIndex++;
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            yield responseFailedStreamingEventSchema.parse({
                type: "response.failed",
                sequence_number: this.nextSeq(),
                response: {
                    ...this._shell,
                    status: "failed",
                    output: this._output,
                    usage: this._usage,
                    error: { code: "server_error", message },
                },
            });
            return;
        }

        if (this.abortSignal?.aborted) {
            yield responseIncompleteStreamingEventSchema.parse({
                type: "response.incomplete",
                sequence_number: this.nextSeq(),
                response: {
                    ...this._shell,
                    status: "incomplete",
                    output: this._output,
                    usage: this._usage,
                    incomplete_details: { reason: "cancelled" },
                },
            });
            return;
        }

        yield responseCompletedStreamingEventSchema.parse({
            type: "response.completed",
            sequence_number: this.nextSeq(),
            response: {
                ...this._shell,
                status: "completed",
                completed_at: Math.floor(Date.now() / 1000),
                output: this._output,
                usage: this._usage,
            },
        });
    }

    private buildShell(request: AgentInvokeRequest): ResponseResource {
        const config = request.config;
        return responseResourceSchema.parse({
            id: `resp_${randomUUID()}`,
            object: "response",
            created_at: Math.floor(Date.now() / 1000),
            completed_at: null,
            status: "in_progress",
            incomplete_details: null,
            model: request.model,
            previous_response_id: config?.previous_response_id ?? null,
            instructions: config?.instructions ?? null,
            output: [],
            error: null,
            tools: (config?.tools ?? []).map((t) => {
                // FunctionToolParam.strict is optional but FunctionTool.strict requires boolean | null.
                // Normalise missing strict to null before schema validation.
                if (typeof t !== "object" || t === null || "strict" in t) return t;
                return { ...t, strict: null };
            }),
            tool_choice: config?.tool_choice ?? "auto",
            truncation: config?.truncation ?? "disabled",
            parallel_tool_calls: config?.parallel_tool_calls ?? true,
            text: config?.text ?? { format: { type: "text" } },
            top_p: config?.top_p ?? 1,
            presence_penalty: 0,
            frequency_penalty: 0,
            top_logprobs: 0,
            temperature: config?.temperature ?? 1,
            reasoning: config?.reasoning ?? null,
            usage: null,
            max_output_tokens: config?.max_output_tokens ?? null,
            max_tool_calls: config?.max_tool_calls ?? null,
            store: config?.store ?? true,
            background: false,
            service_tier: config?.service_tier ?? "default",
            metadata: config?.metadata ?? {},
            safety_identifier: null,
            prompt_cache_key: null,
        });
    }
}
