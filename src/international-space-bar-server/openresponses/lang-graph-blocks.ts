import type { BaseMessage } from "@langchain/core/messages";

import type { Block } from "./response-stream.js";
import { messageBlock, reasoningBlock, functionCallBlock } from "./blocks/index.js";
import type { Delta, AsyncQueue as IAsyncQueue } from "./blocks/index.js";
import { ILogger } from "../common/interfaces/index.js";

// ─── Stream event types ─────────────────────────────────────────────────────

/** A single tool call fragment from a `on_chat_model_stream` event. */
interface ToolCallChunkParsed {
    readonly id: string | undefined;
    readonly index: number | undefined;
    readonly name: string | undefined;
    readonly args: string | undefined;
}

/** Parsed chat model chunk with typed fields. */
interface ChatModelChunk {
    readonly content: string | null;
    readonly toolCallChunks: readonly ToolCallChunkParsed[];
    readonly reasoningContent: string | null;
}

/** Discriminated union of parsed LangGraph stream events. */
type ParsedStreamEvent =
    | { readonly type: "chat_model_stream"; readonly chunk: ChatModelChunk }
    | { readonly type: "chat_model_end" }
    | { readonly type: "other" };

/**
 * Narrows a raw LangGraph `streamEvents` v2 entry into a typed discriminated
 * union. Contains the single `any`-boundary — all downstream code operates on
 * the narrowed types.
 */
function parseStreamEvent(raw: { event: string; data: unknown }): ParsedStreamEvent {
    if (raw.event === "on_chat_model_stream") {
        const data = raw.data as Record<string, unknown> | null | undefined;
        const rawChunk = data?.chunk;
        if (!rawChunk || typeof rawChunk !== "object") return { type: "other" };
        const chunk = rawChunk as Record<string, unknown>;

        // Tool call chunks
        const rawTools: unknown[] = Array.isArray(chunk.tool_call_chunks)
            ? (chunk.tool_call_chunks as unknown[])
            : [];
        const toolCallChunks: ToolCallChunkParsed[] = rawTools.map((t) => {
            const obj = t && typeof t === "object" ? (t as Record<string, unknown>) : {};
            return {
                id: typeof obj.id === "string" ? obj.id : undefined,
                index: typeof obj.index === "number" ? obj.index : undefined,
                name: typeof obj.name === "string" ? obj.name : undefined,
                args: typeof obj.args === "string" ? obj.args : undefined,
            };
        });

        // Reasoning content
        const additionalKwargs =
            typeof chunk.additional_kwargs === "object" && chunk.additional_kwargs
                ? (chunk.additional_kwargs as Record<string, unknown>)
                : null;
        const reasoningContent =
            additionalKwargs && typeof additionalKwargs.reasoning_content === "string"
                ? additionalKwargs.reasoning_content
                : null;

        // Text content
        const content = typeof chunk.content === "string" ? chunk.content : null;

        return { type: "chat_model_stream", chunk: { content, toolCallChunks, reasoningContent } };
    }

    if (raw.event === "on_chat_model_end") {
        return { type: "chat_model_end" };
    }

    return { type: "other" };
}

// ─── StreamableGraph interface ──────────────────────────────────────────────

/**
 * Contract for a compiled LangGraph that exposes a streaming event interface.
 *
 * Satisfied by any `CompiledStateGraph` from `@langchain/langgraph`.
 */
interface StreamableGraph {
    streamEvents(
        input: Record<string, unknown>,
        options: Record<string, unknown>,
    ): AsyncIterable<{ event: string; data: unknown }>;
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
    logger?: ILogger,
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
                const parsed = parseStreamEvent(event);
                if (logger) {
                    logger.debug({ event, parsed }, "Parsed LangGraph stream event");
                }

                if (parsed.type === "chat_model_stream") {
                    const { chunk } = parsed;

                    // Handle tool calls
                    if (chunk.toolCallChunks.length) {
                        for (const toolChunk of chunk.toolCallChunks) {
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
                    if (options?.hasReasoning && chunk.reasoningContent) {
                        if (!currentReasoningQueue) {
                            currentReasoningQueue = new AsyncQueue<Delta>();
                            blockChannel.push(reasoningBlock(currentReasoningQueue));
                        }
                        currentReasoningQueue.push({ text: chunk.reasoningContent });
                        continue;
                    }

                    // Handle text content
                    if (chunk.content) {
                        if (currentReasoningQueue) {
                            currentReasoningQueue.end();
                            currentReasoningQueue = null;
                        }
                        if (!currentMessageQueue) {
                            currentMessageQueue = new AsyncQueue<Delta>();
                            blockChannel.push(messageBlock(currentMessageQueue));
                        }
                        currentMessageQueue.push({ text: chunk.content });
                    }
                } else if (parsed.type === "chat_model_end") {
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
        await producer.catch((reason) => {
            logger?.error(
                `LangGraph producer error: ${reason instanceof Error ? reason.stack : reason}`,
            );
        });
    }
}
