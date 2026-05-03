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

/**
 * A single text chunk yielded by a streaming producer (e.g. an LLM token).
 */
export interface Delta {
    /** The text content of this chunk. */
    readonly text: string;
}

/**
 * An async iterable queue contract used by block factories to consume
 * streamed deltas from a producer.
 *
 * @typeParam T - The element type (typically {@link Delta}).
 */
export interface AsyncQueue<T> extends AsyncIterable<T> {}

/**
 * Creates a {@link Block} that emits an assistant message output item.
 *
 * Accepts either a complete string (single-shot) or an {@link AsyncQueue}
 * of {@link Delta} chunks for real-time streaming from an LLM.
 *
 * @param text - The full message text (single-shot mode).
 * @returns A block factory that yields OpenResponses message events.
 *
 * @example
 * ```ts
 * // Single-shot
 * yield* ctx.run([messageBlock("pong")]);
 * ```
 */
function messageBlock(text: string): (ctx: ResponseStream) => AsyncGenerator<ResponseStreamEvent>;
/**
 * Creates a {@link Block} that emits an assistant message output item.
 *
 * @param queue - An async iterable of text deltas (streaming mode).
 * @returns A block factory that yields OpenResponses message events.
 *
 * @example
 * ```ts
 * // Streaming from an AsyncQueue
 * const q = new AsyncQueue<Delta>();
 * const block = messageBlock(q);
 * q.push({ text: "hel" });
 * q.push({ text: "lo" });
 * q.end();
 * yield* ctx.run([block]);
 * ```
 */
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
