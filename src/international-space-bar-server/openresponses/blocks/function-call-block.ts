import { randomUUID } from "node:crypto";

import {
    responseFunctionCallArgumentsDeltaStreamingEventSchema,
    responseFunctionCallArgumentsDoneStreamingEventSchema,
    responseOutputItemAddedStreamingEventSchema,
    responseOutputItemDoneStreamingEventSchema,
} from "../generated/zod/index.js";
import type { ResponseStream } from "../response-stream.js";
import type { ItemField, ResponseStreamEvent } from "../responses.types.js";
import type { AsyncQueue, Delta } from "./message-block.js";

export interface FunctionCallOptions {
    readonly name: string;
    readonly callId?: string;
}

function functionCallBlock(
    queue: AsyncQueue<Delta>,
    options: FunctionCallOptions,
): (ctx: ResponseStream) => AsyncGenerator<ResponseStreamEvent> {
    return async function* (ctx) {
        const callId = options.callId ?? `call_${randomUUID()}`;
        const itemId = `fc_${randomUUID()}`;
        const outputIndex = ctx.outputIndex;

        const item: ItemField = {
            type: "function_call",
            id: itemId,
            status: "in_progress",
            call_id: callId,
            name: options.name,
            arguments: "",
        } as unknown as ItemField;

        yield responseOutputItemAddedStreamingEventSchema.parse({
            type: "response.output_item.added",
            sequence_number: ctx.nextSeq(),
            output_index: outputIndex,
            item,
        }) as ResponseStreamEvent;

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
            }) as ResponseStreamEvent;
        }

        yield responseFunctionCallArgumentsDoneStreamingEventSchema.parse({
            type: "response.function_call_arguments.done",
            sequence_number: ctx.nextSeq(),
            item_id: itemId,
            output_index: outputIndex,
            call_id: callId,
            arguments: accumulated,
        }) as ResponseStreamEvent;

        const completedItem: ItemField = {
            type: "function_call",
            id: itemId,
            status: "completed",
            call_id: callId,
            name: options.name,
            arguments: accumulated,
        } as unknown as ItemField;

        yield responseOutputItemDoneStreamingEventSchema.parse({
            type: "response.output_item.done",
            sequence_number: ctx.nextSeq(),
            output_index: outputIndex,
            item: completedItem,
        }) as ResponseStreamEvent;

        ctx.recordOutputItem(completedItem);
    };
}

export { functionCallBlock };
