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

export type Block = (ctx: ResponseStream) => AsyncGenerator<ResponseStreamEvent>;

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

    get outputIndex(): number {
        return this._outputIndex;
    }

    nextSeq(): number {
        return this._seq++;
    }

    recordOutputItem(item: ItemField): void {
        this._output.push(item);
    }

    addUsage(delta: Partial<Usage>): void {
        if (delta.input_tokens != null) this._usage.input_tokens += delta.input_tokens;
        if (delta.output_tokens != null) this._usage.output_tokens += delta.output_tokens;
        this._usage.total_tokens = this._usage.input_tokens + this._usage.output_tokens;
    }

    async *run(
        blocks: Iterable<Block> | AsyncIterable<Block>,
    ): AsyncGenerator<ResponseStreamEvent> {
        yield responseCreatedStreamingEventSchema.parse({
            type: "response.created",
            sequence_number: this.nextSeq(),
            response: this._shell,
        }) as ResponseStreamEvent;

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
            }) as ResponseStreamEvent;
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
            }) as ResponseStreamEvent;
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
        }) as ResponseStreamEvent;
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
            tools: config?.tools ?? [],
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
