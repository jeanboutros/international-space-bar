import type { BaseMessage } from "@langchain/core/messages";

import type { Block } from "./response-stream.js";
import { messageBlock, reasoningBlock, functionCallBlock } from "./blocks/index.js";
import type { Delta, AsyncQueue as IAsyncQueue } from "./blocks/index.js";

interface StreamableGraph {
    streamEvents(
        input: Record<string, unknown>,
        options: Record<string, unknown>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): AsyncIterable<{ event: string; data: any }>;
}

/**
 * A minimal AsyncQueue that provides back-pressure between a producer
 * (LangGraph streamEvents) and a consumer (block factory).
 */
export class AsyncQueue<T> implements IAsyncQueue<T> {
    private buffer: T[] = [];
    private resolve: ((value: IteratorResult<T>) => void) | null = null;
    private done = false;

    push(value: T): void {
        if (this.resolve) {
            const r = this.resolve;
            this.resolve = null;
            r({ value, done: false });
        } else {
            this.buffer.push(value);
        }
    }

    end(): void {
        this.done = true;
        if (this.resolve) {
            const r = this.resolve;
            this.resolve = null;
            r({ value: undefined, done: true });
        }
    }

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

export interface LangGraphBlocksOptions {
    readonly hasReasoning?: boolean;
}

/**
 * Subscribes to a compiled LangGraph's streamEvents() and yields Block
 * instances in real-time for ResponseStream.run().
 *
 * Uses a concurrent producer pattern: a detached async IIFE drives the
 * streamEvents iteration and pushes blocks to an AsyncQueue channel,
 * while this generator yields blocks from the channel as they arrive.
 * This avoids a yield/pull deadlock that would occur with a naive
 * async generator approach.
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
