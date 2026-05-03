import { randomUUID } from "node:crypto";

import {
    responseContentPartAddedStreamingEventSchema,
    responseContentPartDoneStreamingEventSchema,
    responseOutputItemAddedStreamingEventSchema,
    responseOutputItemDoneStreamingEventSchema,
    responseOutputTextDeltaStreamingEventSchema,
    responseOutputTextDoneStreamingEventSchema,
} from "../generated/zod/index.js";
import type { ResponseStream } from "../response-stream.js";
import type { Message, ResponseStreamEvent } from "../responses.types.js";

export interface Delta {
    readonly text: string;
}

export interface AsyncQueue<T> extends AsyncIterable<T> {}

function messageBlock(text: string): (ctx: ResponseStream) => AsyncGenerator<ResponseStreamEvent>;
function messageBlock(
    queue: AsyncQueue<Delta>,
): (ctx: ResponseStream) => AsyncGenerator<ResponseStreamEvent>;
function messageBlock(
    input: string | AsyncQueue<Delta>,
): (ctx: ResponseStream) => AsyncGenerator<ResponseStreamEvent> {
    return async function* (ctx) {
        const itemId = `msg_${randomUUID()}`;
        const outputIndex = ctx.outputIndex;
        const contentIndex = 0;

        const item: Message = {
            type: "message",
            id: itemId,
            status: "in_progress",
            role: "assistant",
            content: [],
        };

        yield responseOutputItemAddedStreamingEventSchema.parse({
            type: "response.output_item.added",
            sequence_number: ctx.nextSeq(),
            output_index: outputIndex,
            item,
        });

        yield responseContentPartAddedStreamingEventSchema.parse({
            type: "response.content_part.added",
            sequence_number: ctx.nextSeq(),
            item_id: itemId,
            output_index: outputIndex,
            content_index: contentIndex,
            part: { type: "output_text", text: "", annotations: [] },
        });

        let accumulated = "";

        if (typeof input === "string") {
            accumulated = input;
            yield responseOutputTextDeltaStreamingEventSchema.parse({
                type: "response.output_text.delta",
                sequence_number: ctx.nextSeq(),
                item_id: itemId,
                output_index: outputIndex,
                content_index: contentIndex,
                delta: input,
            });
        } else {
            for await (const delta of input) {
                if (ctx.abortSignal?.aborted) break;
                accumulated += delta.text;
                yield responseOutputTextDeltaStreamingEventSchema.parse({
                    type: "response.output_text.delta",
                    sequence_number: ctx.nextSeq(),
                    item_id: itemId,
                    output_index: outputIndex,
                    content_index: contentIndex,
                    delta: delta.text,
                });
            }
        }

        yield responseOutputTextDoneStreamingEventSchema.parse({
            type: "response.output_text.done",
            sequence_number: ctx.nextSeq(),
            item_id: itemId,
            output_index: outputIndex,
            content_index: contentIndex,
            text: accumulated,
        });

        yield responseContentPartDoneStreamingEventSchema.parse({
            type: "response.content_part.done",
            sequence_number: ctx.nextSeq(),
            item_id: itemId,
            output_index: outputIndex,
            content_index: contentIndex,
            part: { type: "output_text", text: accumulated, annotations: [] },
        });

        const completedItem: Message = {
            type: "message",
            id: itemId,
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: accumulated, annotations: [] }],
        };

        yield responseOutputItemDoneStreamingEventSchema.parse({
            type: "response.output_item.done",
            sequence_number: ctx.nextSeq(),
            output_index: outputIndex,
            item: completedItem,
        });

        ctx.recordOutputItem(completedItem);
        ctx.addUsage({ output_tokens: accumulated.length });
    };
}

export { messageBlock };
