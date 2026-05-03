import { randomUUID } from "node:crypto";

// TODO(isb-0020): Replace content_part.added/done with reasoning_summary_part.added/done
// and add reasoning_summary.done event between last delta and content_part.done.
// Current implementation uses generic content_part events instead of reasoning-specific ones.
import {
    responseContentPartAddedStreamingEventSchema,
    responseContentPartDoneStreamingEventSchema,
    responseOutputItemAddedStreamingEventSchema,
    responseOutputItemDoneStreamingEventSchema,
    responseReasoningSummaryDeltaStreamingEventSchema,
} from "../generated/zod/index.js";
import type { ResponseStream } from "../response-stream.js";
import type { ItemField, ResponseStreamEvent } from "../responses.types.js";
import type { AsyncQueue, Delta } from "./message-block.js";

function reasoningBlock(
    summary: string,
): (ctx: ResponseStream) => AsyncGenerator<ResponseStreamEvent>;
function reasoningBlock(
    queue: AsyncQueue<Delta>,
): (ctx: ResponseStream) => AsyncGenerator<ResponseStreamEvent>;
function reasoningBlock(
    input: string | AsyncQueue<Delta>,
): (ctx: ResponseStream) => AsyncGenerator<ResponseStreamEvent> {
    return async function* (ctx) {
        const itemId = `rs_${randomUUID()}`;
        const outputIndex = ctx.outputIndex;
        const contentIndex = 0;

        const item: ItemField = {
            type: "reasoning",
            id: itemId,
            status: "in_progress",
            summary: [],
        } as unknown as ItemField;

        yield responseOutputItemAddedStreamingEventSchema.parse({
            type: "response.output_item.added",
            sequence_number: ctx.nextSeq(),
            output_index: outputIndex,
            item,
        }) as ResponseStreamEvent;

        yield responseContentPartAddedStreamingEventSchema.parse({
            type: "response.content_part.added",
            sequence_number: ctx.nextSeq(),
            item_id: itemId,
            output_index: outputIndex,
            content_index: contentIndex,
            part: { type: "summary_text", text: "" },
        }) as ResponseStreamEvent;

        let accumulated = "";

        if (typeof input === "string") {
            accumulated = input;
            yield responseReasoningSummaryDeltaStreamingEventSchema.parse({
                type: "response.reasoning_summary.delta",
                sequence_number: ctx.nextSeq(),
                item_id: itemId,
                output_index: outputIndex,
                content_index: contentIndex,
                delta: input,
            }) as ResponseStreamEvent;
        } else {
            for await (const delta of input) {
                if (ctx.abortSignal?.aborted) break;
                accumulated += delta.text;
                yield responseReasoningSummaryDeltaStreamingEventSchema.parse({
                    type: "response.reasoning_summary.delta",
                    sequence_number: ctx.nextSeq(),
                    item_id: itemId,
                    output_index: outputIndex,
                    content_index: contentIndex,
                    delta: delta.text,
                }) as ResponseStreamEvent;
            }
        }

        yield responseContentPartDoneStreamingEventSchema.parse({
            type: "response.content_part.done",
            sequence_number: ctx.nextSeq(),
            item_id: itemId,
            output_index: outputIndex,
            content_index: contentIndex,
            part: { type: "summary_text", text: accumulated },
        }) as ResponseStreamEvent;

        const completedItem: ItemField = {
            type: "reasoning",
            id: itemId,
            status: "completed",
            summary: [{ type: "summary_text", text: accumulated }],
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

export { reasoningBlock };
