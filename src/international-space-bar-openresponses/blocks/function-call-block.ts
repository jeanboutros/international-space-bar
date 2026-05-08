import { randomUUID } from "node:crypto";

import {
    responseFunctionCallArgumentsDeltaStreamingEventSchema,
    responseFunctionCallArgumentsDoneStreamingEventSchema,
    responseOutputItemAddedStreamingEventSchema,
    responseOutputItemDoneStreamingEventSchema,
} from "../generated/zod/index.js";
import type { ResponseStream } from "../response-stream.js";
import type { FunctionCall, ResponseStreamEvent } from "../responses.types.js";
import type { AsyncQueue, Delta } from "./message-block.js";

/**
 * Options for constructing a function-call block.
 */
export interface FunctionCallOptions {
    /** The name of the tool/function being invoked. */
    readonly name: string;
    /** Optional call identifier; a UUID is generated if omitted. */
    readonly callId?: string;
}

/**
 * Creates a {@link Block} that emits a function-call output item.
 *
 * Streams the serialised arguments as deltas from the provided queue,
 * then emits the completed function-call item.
 *
 * @param queue - An async iterable of argument-text deltas.
 * @param options - The function name and optional call ID.
 * @returns A block factory that yields OpenResponses function-call events.
 *
 * @example
 * ```ts
 * const q = new AsyncQueue<Delta>();
 * const block = functionCallBlock(q, { name: "get_weather", callId: "call_1" });
 * q.push({ text: '{"city":"' });
 * q.push({ text: 'Paris"}' });
 * q.end();
 * yield* ctx.run([block]);
 * ```
 */
function functionCallBlock(
    queue: AsyncQueue<Delta>,
    options: FunctionCallOptions,
): (ctx: ResponseStream) => AsyncGenerator<ResponseStreamEvent> {
    return async function* (ctx) {
        const callId = options.callId ?? `call_${randomUUID()}`;
        const itemId = `fc_${randomUUID()}`;
        const outputIndex = ctx.outputIndex;

        const item: FunctionCall = {
            type: "function_call",
            id: itemId,
            status: "in_progress",
            call_id: callId,
            name: options.name,
            arguments: "",
        };

        yield responseOutputItemAddedStreamingEventSchema.parse({
            type: "response.output_item.added",
            sequence_number: ctx.nextSeq(),
            output_index: outputIndex,
            item,
        });

        let accumulated = "";

        for await (const delta of queue) {
            if (ctx.abortSignal?.aborted) break;
            accumulated += delta.text;
            yield responseFunctionCallArgumentsDeltaStreamingEventSchema.parse({
                type: "response.function_call_arguments.delta",
                sequence_number: ctx.nextSeq(),
                item_id: itemId,
                output_index: outputIndex,
                call_id: callId,
                delta: delta.text,
            });
        }

        yield responseFunctionCallArgumentsDoneStreamingEventSchema.parse({
            type: "response.function_call_arguments.done",
            sequence_number: ctx.nextSeq(),
            item_id: itemId,
            output_index: outputIndex,
            call_id: callId,
            arguments: accumulated,
        });

        const completedItem: FunctionCall = {
            type: "function_call",
            id: itemId,
            status: "completed",
            call_id: callId,
            name: options.name,
            arguments: accumulated,
        };

        yield responseOutputItemDoneStreamingEventSchema.parse({
            type: "response.output_item.done",
            sequence_number: ctx.nextSeq(),
            output_index: outputIndex,
            item: completedItem,
        });

        ctx.recordOutputItem(completedItem);
    };
}

export { functionCallBlock };
