import type { BaseMessage } from "@langchain/core/messages";

import type { Block } from "./response-stream.js";
import { messageBlock, reasoningBlock, functionCallBlock } from "./blocks/index.js";
import type { Delta, AsyncQueue as IAsyncQueue } from "./blocks/index.js";

/**
 * Contract for a compiled LangGraph that exposes a streaming event interface.
 *
 * Satisfied by any `CompiledStateGraph` from `@langchain/langgraph`.
 */
interface StreamableGraph {
    streamEvents(
        input: Record<string, unknown>,
        options: Record<string, unknown>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): AsyncIterable<{ event: string; data: any }>;
}

/**
 * A minimal async queue that provides back-pressure between a producer
 * (LangGraph `streamEvents`) and a consumer (block factory).
 *
 * Used both as a delta channel within individual blocks and as the
 * block-level channel inside {@link langGraphBlocks}.
 *
 * @typeParam T - The element type flowing through the queue.
 *
 * @example
 * ```ts
 * const q = new AsyncQueue<Delta>();
 * q.push({ text: "hello" });
 * q.end();
 * for await (const delta of q) {
 *   console.log(delta.text);
 * }
 * ```
 */
export class AsyncQueue<T> implements IAsyncQueue<T> {
    private buffer: T[] = [];
    private resolve: ((value: IteratorResult<T>) => void) | null = null;
    private done = false;

    /**
     * Enqueue a value, resolving a pending consumer if one is waiting.
     *
     * @param value - The element to enqueue.
     */
    push(value: T): void {
        if (this.resolve) {
            const r = this.resolve;
            this.resolve = null;
            r({ value, done: false });
        } else {
            this.buffer.push(value);
        }
    }

    /**
     * Signal that no more values will be pushed.
     *
     * Any pending or future consumer iteration will complete.
     */
    end(): void {
        this.done = true;
        if (this.resolve) {
            const r = this.resolve;
            this.resolve = null;
            r({ value: undefined, done: true });
        }
    }

    /**
     * Returns an async iterator that yields values as they are pushed.
     *
     * @returns An `AsyncIterator` that completes when {@link end} is called.
     */
    [Symbol.asyncIterator](): AsyncIterator<T> {
        return {
            next: () => {
                if (this.buffer.length > 0) {
                    return Promise.resolve({ value: this.buffer.shift()!, done: false });
                }
                if (this.done) {
                    return Promise.resolve({
                        value: undefined as unknown as T,
                        done: true,
                    });
                }
                return new Promise<IteratorResult<T>>((r) => {
                    this.resolve = r;
                });
            },
        };
    }
}

/**
 * Options controlling which block types {@link langGraphBlocks} emits.
 */
export interface LangGraphBlocksOptions {
    /** When `true`, model reasoning/thinking content is emitted as `reasoningBlock` instances. */
    readonly hasReasoning?: boolean;
}

/**
 * Subscribes to a compiled LangGraph's `streamEvents()` and yields
 * {@link Block} instances in real-time for {@link ResponseStream.run}.
 *
 * @remarks
 * Uses a **concurrent producer** pattern: a detached async IIFE drives
 * the `streamEvents` iteration and pushes blocks to an {@link AsyncQueue}
 * channel, while this generator yields blocks from the channel as they
 * arrive. This avoids a yield/pull deadlock that would occur with a
 * naive `async function*` approach — if the generator yielded a block
 * and then waited for the consumer to pull, it could never push the
 * next delta to that block's queue because it would be suspended at
 * the `yield` point.
 *
 * @param graph - A compiled LangGraph exposing `streamEvents()`.
 * @param input - The conversation messages to pass as graph input.
 * @param options - Optional flags (e.g. enable reasoning blocks).
 * @returns An async generator of {@link Block} instances, each ready
 *   to be consumed by {@link ResponseStream.run}.
 *
 * @example
 * ```ts
 * const ctx = new ResponseStream(request);
 * yield* ctx.run(langGraphBlocks(graph, baseMessages, { hasReasoning: true }));
 * ```
 */
export async function* langGraphBlocks(
    graph: StreamableGraph,
    input: readonly BaseMessage[],
    options?: LangGraphBlocksOptions,
): AsyncGenerator<Block> {
    const blockChannel = new AsyncQueue<Block>();

    const producer = (async () => {
        let currentMessageQueue: AsyncQueue<Delta> | null = null;
        let currentReasoningQueue: AsyncQueue<Delta> | null = null;
        const toolQueues = new Map<string, AsyncQueue<Delta>>();

        try {
            const stream = graph.streamEvents(
                { messages: input },
                { version: "v2", streamMode: "values" },
            );

            for await (const event of stream) {
                const { event: eventType, data } = event;

                if (eventType === "on_chat_model_stream") {
                    const chunk = data?.chunk;
                    if (!chunk) continue;

                    // Handle tool calls
                    if (chunk.tool_call_chunks?.length) {
                        for (const toolChunk of chunk.tool_call_chunks) {
                            const id = toolChunk.id ?? toolChunk.index?.toString() ?? "0";
                            if (!toolQueues.has(id)) {
                                const q = new AsyncQueue<Delta>();
                                toolQueues.set(id, q);
                                blockChannel.push(
                                    functionCallBlock(q, {
                                        name: toolChunk.name ?? "unknown",
                                        callId: id,
                                    }),
                                );
                            }
                            if (toolChunk.args) {
                                toolQueues.get(id)!.push({ text: toolChunk.args });
                            }
                        }
                        continue;
                    }

                    // Handle reasoning (thinking) content
                    if (options?.hasReasoning && chunk.additional_kwargs?.reasoning_content) {
                        if (!currentReasoningQueue) {
                            currentReasoningQueue = new AsyncQueue<Delta>();
                            blockChannel.push(reasoningBlock(currentReasoningQueue));
                        }
                        currentReasoningQueue.push({
                            text: chunk.additional_kwargs.reasoning_content as string,
                        });
                        continue;
                    }

                    // Handle text content
                    const text = typeof chunk.content === "string" ? chunk.content : null;
                    if (text) {
                        if (currentReasoningQueue) {
                            currentReasoningQueue.end();
                            currentReasoningQueue = null;
                        }
                        if (!currentMessageQueue) {
                            currentMessageQueue = new AsyncQueue<Delta>();
                            blockChannel.push(messageBlock(currentMessageQueue));
                        }
                        currentMessageQueue.push({ text });
                    }
                } else if (eventType === "on_chat_model_end") {
                    // Close all open queues for this model invocation
                    if (currentMessageQueue) {
                        currentMessageQueue.end();
                        currentMessageQueue = null;
                    }
                    if (currentReasoningQueue) {
                        currentReasoningQueue.end();
                        currentReasoningQueue = null;
                    }
                    for (const q of toolQueues.values()) {
                        q.end();
                    }
                    toolQueues.clear();
                }
            }
        } finally {
            // End ALL open queues to prevent consumer deadlock on error
            currentMessageQueue?.end();
            currentReasoningQueue?.end();
            for (const q of toolQueues.values()) {
                q.end();
            }
            blockChannel.end();
        }
    })();

    try {
        for await (const block of blockChannel) {
            yield block;
        }
    } finally {
        // Swallow producer errors — consumer error takes priority
        await producer.catch(() => {});
    }
}
