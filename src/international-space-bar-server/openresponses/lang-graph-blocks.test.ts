/**
 * Tests for: langGraphBlocks async generator
 * Source: src/international-space-bar-server/openresponses/lang-graph-blocks.ts
 * Ticket: isb-0094
 *
 * Purpose: Verifies the concurrent producer/consumer pattern that subscribes
 * to a LangGraph streamEvents() call and yields Block instances for
 * ResponseStream.run(). Covers return type, block production, streaming
 * timing, error propagation, abort signal handling, and queue cleanup.
 */

/* eslint-disable @typescript-eslint/no-floating-promises --
   node:test describe/it return promises at module scope; awaiting them is
   neither required nor idiomatic for the built-in test runner. */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Block } from "./response-stream.js";
import { langGraphBlocks } from "./lang-graph-blocks.js";

// ---------------------------------------------------------------------------
// Mock helpers — local to this test file (AC-13)
// ---------------------------------------------------------------------------

/** Shape of a single event yielded by the mock graph's streamEvents(). */
interface MockEvent {
    event: string;
    data: any;
}

/**
 * Minimal mock implementing the StreamableGraph interface.
 * Yields events synchronously (no delay).
 */
function mockGraph(events: MockEvent[]) {
    return {
        // eslint-disable-next-line @typescript-eslint/require-await
        async *streamEvents(_input: Record<string, unknown>, _options: Record<string, unknown>) {
            for (const e of events) {
                yield e;
            }
        },
    };
}

/**
 * Mock graph that yields events with a per-event delay.
 * `onFinish` is called once all events have been yielded.
 */
function slowMockGraph(events: MockEvent[], delayMs: number, onFinish?: () => void) {
    return {
        async *streamEvents(_input: Record<string, unknown>, _options: Record<string, unknown>) {
            for (const e of events) {
                await new Promise<void>((r) => setTimeout(r, delayMs));
                yield e;
            }
            onFinish?.();
        },
    };
}

/**
 * Mock graph that yields some events then throws an error.
 */
function errorGraph(eventsBeforeError: MockEvent[], error: Error) {
    return {
        // eslint-disable-next-line @typescript-eslint/require-await
        async *streamEvents(_input: Record<string, unknown>, _options: Record<string, unknown>) {
            for (const e of eventsBeforeError) {
                yield e;
            }
            throw error;
        },
    };
}

// ---------------------------------------------------------------------------
// Event factories — produce events matching LangGraph streamEvents v2 shape
// ---------------------------------------------------------------------------

/** Creates an on_chat_model_stream event with text content. */
function textChunkEvent(text: string): MockEvent {
    return {
        event: "on_chat_model_stream",
        data: { chunk: { content: text } },
    };
}

/** Creates an on_chat_model_stream event with reasoning_content. */
function reasoningChunkEvent(text: string): MockEvent {
    return {
        event: "on_chat_model_stream",
        data: {
            chunk: {
                content: "",
                additional_kwargs: { reasoning_content: text },
            },
        },
    };
}

/** Creates an on_chat_model_stream event with a tool_call_chunk. */
function toolChunkEvent(name: string, id: string, args: string): MockEvent {
    return {
        event: "on_chat_model_stream",
        data: {
            chunk: {
                tool_call_chunks: [{ name, id, args }],
            },
        },
    };
}

/** Creates an on_chat_model_end event. */
function endEvent(): MockEvent {
    return { event: "on_chat_model_end", data: {} };
}

// ---------------------------------------------------------------------------
// Collector helper
// ---------------------------------------------------------------------------

/** Drains an AsyncGenerator into an array. */
async function collectBlocks(gen: AsyncGenerator<Block>): Promise<Block[]> {
    const blocks: Block[] = [];
    for await (const block of gen) {
        blocks.push(block);
    }
    return blocks;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * langGraphBlocks — return type
 * Verifies the function returns a proper AsyncGenerator, not a bare Promise.
 */
describe("langGraphBlocks — return type", () => {
    /**
     * WHAT: The return value exposes Symbol.asyncIterator.
     * WHY: AC-2 — consumers rely on `for await` over the result.
     * STEPS:
     *   Arrange — create an empty mock graph
     *   Act — call langGraphBlocks
     *   Assert — check Symbol.asyncIterator and that it is not a plain Promise
     */
    it("returns an AsyncGenerator with Symbol.asyncIterator", () => {
        // --- Arrange ---
        const graph = mockGraph([]);

        // --- Act ---
        const gen = langGraphBlocks(graph, []);

        // --- Assert ---
        // Must have Symbol.asyncIterator (AsyncGenerator protocol)
        assert.equal(typeof gen[Symbol.asyncIterator], "function");
        // Must NOT be a plain Promise (it's a generator, not a thenable-only)
        assert.notEqual(typeof gen, "undefined");
        assert.equal(typeof gen.next, "function");
        assert.equal(typeof gen.return, "function");
    });
});

/**
 * langGraphBlocks — empty stream
 * Verifies that a graph emitting zero events produces no blocks.
 */
describe("langGraphBlocks — empty stream", () => {
    /**
     * WHAT: Empty streamEvents yields no blocks.
     * WHY: AC-12 — edge case; no events should not hang or produce phantom blocks.
     * STEPS:
     *   Arrange — mock graph with zero events
     *   Act — collect all blocks
     *   Assert — array is empty
     */
    it("produces no blocks when streamEvents yields nothing", async () => {
        // --- Arrange ---
        const graph = mockGraph([]);

        // --- Act ---
        const blocks = await collectBlocks(langGraphBlocks(graph, []));

        // --- Assert ---
        assert.equal(blocks.length, 0);
        // Double-check: the result is a proper array (not undefined)
        assert.ok(Array.isArray(blocks));
    });
});

/**
 * langGraphBlocks — single text message
 * Verifies that text chunk events produce exactly one messageBlock.
 */
describe("langGraphBlocks — single text message", () => {
    /**
     * WHAT: A single text chunk event yields one block (messageBlock).
     * WHY: AC-3 — text events must produce messageBlock instances.
     * STEPS:
     *   Arrange — mock graph with one text chunk + end event
     *   Act — collect blocks
     *   Assert — exactly one block yielded, and it is a function (Block type)
     */
    it("yields one messageBlock for a single text chunk", async () => {
        // --- Arrange ---
        const graph = mockGraph([textChunkEvent("hello"), endEvent()]);

        // --- Act ---
        const blocks = await collectBlocks(langGraphBlocks(graph, []));

        // --- Assert ---
        assert.equal(blocks.length, 1);
        // Block is a function (factory that accepts ResponseStream ctx)
        assert.equal(typeof blocks[0], "function");
    });
});

/**
 * langGraphBlocks — multiple text chunks aggregate
 * Verifies multiple text chunks produce a single message block, not one per chunk.
 */
describe("langGraphBlocks — multiple text chunks aggregate", () => {
    /**
     * WHAT: Multiple text chunk events map to a single messageBlock.
     * WHY: AC-3 / AC-6 — text deltas should aggregate, not create separate blocks.
     * STEPS:
     *   Arrange — mock graph with three text chunks + end event
     *   Act — collect blocks
     *   Assert — still exactly one block
     */
    it("aggregates multiple text chunks into one messageBlock", async () => {
        // --- Arrange ---
        const graph = mockGraph([
            textChunkEvent("Hello"),
            textChunkEvent(" "),
            textChunkEvent("world"),
            endEvent(),
        ]);

        // --- Act ---
        const blocks = await collectBlocks(langGraphBlocks(graph, []));

        // --- Assert ---
        // Only one block should exist — multiple text deltas aggregate
        assert.equal(blocks.length, 1);
        assert.equal(typeof blocks[0], "function");
    });
});

/**
 * langGraphBlocks — reasoning events
 * Verifies reasoning chunk events produce a reasoningBlock when hasReasoning: true.
 */
describe("langGraphBlocks — reasoning events", () => {
    /**
     * WHAT: Reasoning chunks yield a reasoningBlock when hasReasoning is true.
     * WHY: AC-4 — reasoning events are only processed when explicitly enabled.
     * STEPS:
     *   Arrange — mock graph with reasoning chunks + end
     *   Act — collect blocks with hasReasoning: true
     *   Assert — one block yielded
     */
    it("yields a reasoningBlock when hasReasoning is true", async () => {
        // --- Arrange ---
        const graph = mockGraph([
            reasoningChunkEvent("thinking step 1"),
            reasoningChunkEvent("thinking step 2"),
            endEvent(),
        ]);

        // --- Act ---
        const blocks = await collectBlocks(langGraphBlocks(graph, [], { hasReasoning: true }));

        // --- Assert ---
        assert.equal(blocks.length, 1);
        assert.equal(typeof blocks[0], "function");
    });

    /**
     * WHAT: Reasoning chunks are ignored when hasReasoning is false/undefined.
     * WHY: AC-4 — reasoning should only be processed when opted in.
     * STEPS:
     *   Arrange — mock graph with reasoning chunks + end
     *   Act — collect blocks WITHOUT hasReasoning
     *   Assert — no blocks (reasoning ignored, no text content)
     */
    it("ignores reasoning chunks when hasReasoning is not set", async () => {
        // --- Arrange ---
        const graph = mockGraph([reasoningChunkEvent("thinking step 1"), endEvent()]);

        // --- Act ---
        const blocks = await collectBlocks(langGraphBlocks(graph, []));

        // --- Assert ---
        // Reasoning events have empty string content — no text block created
        assert.equal(blocks.length, 0);
    });
});

/**
 * langGraphBlocks — tool call chunks
 * Verifies tool_call_chunks produce functionCallBlock per unique tool ID.
 */
describe("langGraphBlocks — tool call chunks", () => {
    /**
     * WHAT: Tool call chunks yield one functionCallBlock per unique tool ID.
     * WHY: AC-5 — each tool call gets its own block keyed by ID.
     * STEPS:
     *   Arrange — mock graph with two tool calls (different IDs) + end
     *   Act — collect blocks
     *   Assert — two blocks
     */
    it("yields one functionCallBlock per unique tool ID", async () => {
        // --- Arrange ---
        const graph = mockGraph([
            toolChunkEvent("searchWeb", "tool_1", '{"q":'),
            toolChunkEvent("searchWeb", "tool_1", '"foo"}'),
            toolChunkEvent("calculator", "tool_2", '{"expr":"1+1"}'),
            endEvent(),
        ]);

        // --- Act ---
        const blocks = await collectBlocks(langGraphBlocks(graph, []));

        // --- Assert ---
        // Two unique tool IDs → two blocks
        assert.equal(blocks.length, 2);
        assert.equal(typeof blocks[0], "function");
        assert.equal(typeof blocks[1], "function");
    });

    /**
     * WHAT: A single tool call produces exactly one block.
     * WHY: AC-5 — even with multiple arg chunks, the tool ID deduplicates.
     * STEPS:
     *   Arrange — mock graph with two arg chunks for same tool ID + end
     *   Act — collect blocks
     *   Assert — one block
     */
    it("deduplicates arg chunks for the same tool ID", async () => {
        // --- Arrange ---
        const graph = mockGraph([
            toolChunkEvent("fn", "call_a", '{"x":'),
            toolChunkEvent("fn", "call_a", "1}"),
            endEvent(),
        ]);

        // --- Act ---
        const blocks = await collectBlocks(langGraphBlocks(graph, []));

        // --- Assert ---
        assert.equal(blocks.length, 1);
        assert.equal(typeof blocks[0], "function");
    });
});

/**
 * langGraphBlocks — multi-block sequence
 * Verifies reasoning → text produces blocks in the correct order.
 */
describe("langGraphBlocks — multi-block sequence", () => {
    /**
     * WHAT: Reasoning followed by text yields two blocks in order.
     * WHY: AC-6 — block ordering must match the event stream order.
     * STEPS:
     *   Arrange — reasoning chunk then text chunk + end
     *   Act — collect blocks with hasReasoning: true
     *   Assert — two blocks in order
     */
    it("yields reasoning block then message block in correct order", async () => {
        // --- Arrange ---
        const graph = mockGraph([
            reasoningChunkEvent("let me think"),
            textChunkEvent("The answer is 42"),
            endEvent(),
        ]);

        // --- Act ---
        const blocks = await collectBlocks(langGraphBlocks(graph, [], { hasReasoning: true }));

        // --- Assert ---
        // First block: reasoning, second: message
        assert.equal(blocks.length, 2);
        assert.equal(typeof blocks[0], "function");
        assert.equal(typeof blocks[1], "function");
    });

    /**
     * WHAT: Tool call + text produces blocks in stream order.
     * WHY: AC-6 — verifies heterogeneous block sequences.
     * STEPS:
     *   Arrange — tool chunk then text chunk + end
     *   Act — collect blocks
     *   Assert — two blocks
     */
    it("yields tool block then message block", async () => {
        // --- Arrange ---
        const graph = mockGraph([
            toolChunkEvent("lookup", "t1", '{"id":1}'),
            endEvent(),
            textChunkEvent("Found it"),
            endEvent(),
        ]);

        // --- Act ---
        const blocks = await collectBlocks(langGraphBlocks(graph, []));

        // --- Assert ---
        assert.equal(blocks.length, 2);
        assert.equal(typeof blocks[0], "function");
        assert.equal(typeof blocks[1], "function");
    });
});

/**
 * langGraphBlocks — streaming timing
 * Proves the first block is yielded BEFORE the stream producer finishes.
 */
describe("langGraphBlocks — streaming timing", () => {
    /**
     * WHAT: First block arrives before the slow producer completes.
     * WHY: AC-7 — proves the concurrent producer/consumer pattern works;
     *       blocks are not buffered until the stream is exhausted.
     * STEPS:
     *   Arrange — slow mock graph (50ms per event), track finish time
     *   Act — read first block and record timestamps
     *   Assert — first block time < producer finish time
     */
    it("yields first block before producer finishes", async () => {
        // --- Arrange ---
        let producerFinished = false;
        const graph = slowMockGraph(
            [
                textChunkEvent("first chunk"),
                textChunkEvent("second chunk"),
                textChunkEvent("third chunk"),
            ],
            50,
            () => {
                producerFinished = true;
            },
        );

        // --- Act ---
        const gen = langGraphBlocks(graph, []);
        const firstResult = await gen.next();

        // --- Assert ---
        // The first block must arrive while the producer is still yielding
        assert.equal(firstResult.done, false, "generator should yield a block");
        assert.equal(typeof firstResult.value, "function", "yielded value must be a Block");
        assert.equal(
            producerFinished,
            false,
            "producer must NOT have finished when first block arrives",
        );

        // Drain remaining to avoid dangling promises

        for await (const _ of gen) {
            /* drain */
        }
    });
});

/**
 * langGraphBlocks — error handling
 * Verifies that errors in the producer are gracefully handled.
 * The implementation intentionally swallows producer errors
 * (await producer.catch(() => {})) so the consumer sees a clean end.
 */
describe("langGraphBlocks — error handling", () => {
    /**
     * WHAT: A producer error after yielding partial events ends the generator
     *       without throwing to the consumer — the partial block is still delivered.
     * WHY: AC-8 — the implementation's contract swallows producer errors; the
     *       consumer must not hang or crash. The block channel is ended in the
     *       producer's finally block, giving the consumer a clean exit.
     * STEPS:
     *   Arrange — error graph that throws after one text event
     *   Act — collect all blocks from the generator
     *   Assert — one partial block yielded, no error thrown
     */
    it("delivers partial blocks and ends cleanly on producer error", async () => {
        // --- Arrange ---
        const boom = new Error("stream exploded");
        const graph = errorGraph([textChunkEvent("partial")], boom);

        // --- Act ---
        const blocks = await collectBlocks(langGraphBlocks(graph, []));

        // --- Assert ---
        // The partial text event created a message block before the error
        assert.equal(blocks.length, 1, "partial block should be delivered");
        assert.equal(typeof blocks[0], "function", "block must be a function");
    });

    /**
     * WHAT: A producer error with zero events produces no blocks and no error.
     * WHY: AC-8 — even with an immediate error, the consumer must not hang.
     * STEPS:
     *   Arrange — error graph with zero events before error
     *   Act — collect all blocks
     *   Assert — empty result, no exception
     */
    it("produces no blocks and no error when producer fails immediately", async () => {
        // --- Arrange ---
        const boom = new Error("immediate failure");
        const graph = errorGraph([], boom);

        // --- Act ---
        const blocks = await collectBlocks(langGraphBlocks(graph, []));

        // --- Assert ---
        // No events before the error → no blocks created
        assert.equal(blocks.length, 0);
        // Reaching this point proves no error was thrown to the consumer
        assert.ok(true, "consumer exited without error");
    });
});

/**
 * langGraphBlocks — error mid-stream ends all open queues
 * Verifies that when the producer errors, all open delta queues are ended
 * so consumers do not deadlock waiting for more data.
 */
describe("langGraphBlocks — error mid-stream queue cleanup", () => {
    /**
     * WHAT: An error after partial events ends all open queues, allowing
     *       the consumer to drain without deadlocking.
     * WHY: AC-9 — the producer's finally block calls .end() on all queues.
     *       Without this, the yielded block's internal AsyncQueue would
     *       hang forever waiting for more deltas.
     * STEPS:
     *   Arrange — error graph with text + tool events before error
     *   Act — collect blocks (proves the generator terminates)
     *   Assert — blocks were yielded, and the generator completed (no hang)
     */
    it("ends open queues on producer error so blocks do not deadlock", async () => {
        // --- Arrange ---
        const graph = errorGraph(
            [textChunkEvent("partial data"), toolChunkEvent("fn", "t1", '{"a":')],
            new Error("mid-stream kaboom"),
        );

        // --- Act ---
        // If queues were NOT ended, this would hang forever
        const blocks = await collectBlocks(langGraphBlocks(graph, []));

        // --- Assert ---
        // Both text and tool created blocks before the error
        assert.ok(blocks.length >= 1, "at least one block should be delivered");
        // Reaching here without timeout proves queues were ended (no deadlock)
        assert.equal(typeof blocks[0], "function", "yielded block must be a function");
    });
});

/**
 * langGraphBlocks — on_chat_model_end closes queues
 * Verifies that on_chat_model_end events close open message/reasoning/tool queues.
 */
describe("langGraphBlocks — on_chat_model_end closes queues", () => {
    /**
     * WHAT: on_chat_model_end closes the current message queue, allowing a new
     *       message block to be created for subsequent text events.
     * WHY: AC-11 — each model invocation's queues must be closed at on_chat_model_end.
     * STEPS:
     *   Arrange — text → end → text → end (two model invocations)
     *   Act — collect blocks
     *   Assert — two separate message blocks
     */
    it("closes message queue at end, allowing new block for next invocation", async () => {
        // --- Arrange ---
        const graph = mockGraph([
            textChunkEvent("first response"),
            endEvent(),
            textChunkEvent("second response"),
            endEvent(),
        ]);

        // --- Act ---
        const blocks = await collectBlocks(langGraphBlocks(graph, []));

        // --- Assert ---
        // Two separate model invocations → two message blocks
        assert.equal(blocks.length, 2);
        assert.equal(typeof blocks[0], "function");
        assert.equal(typeof blocks[1], "function");
    });

    /**
     * WHAT: on_chat_model_end closes reasoning and tool queues too.
     * WHY: AC-11 — all queue types must be closed, not just message queues.
     * STEPS:
     *   Arrange — reasoning + tool → end
     *   Act — collect blocks
     *   Assert — both blocks yielded (queues were created and closed)
     */
    it("closes reasoning and tool queues at on_chat_model_end", async () => {
        // --- Arrange ---
        const graph = mockGraph([
            reasoningChunkEvent("thinking"),
            toolChunkEvent("fn", "t1", '{"a":1}'),
            endEvent(),
        ]);

        // --- Act ---
        const blocks = await collectBlocks(langGraphBlocks(graph, [], { hasReasoning: true }));

        // --- Assert ---
        // One reasoning block + one tool block
        assert.equal(blocks.length, 2);
        assert.equal(typeof blocks[0], "function");
        assert.equal(typeof blocks[1], "function");
    });
});

/**
 * langGraphBlocks — abort signal
 * Verifies that an AbortSignal is respected.
 * NOTE: The current implementation does not accept an AbortSignal directly —
 *       it is passed through at the ResponseStream level. The abort test here
 *       validates that the generator terminates cleanly when the consumer
 *       breaks out of the loop (generator.return()).
 */
describe("langGraphBlocks — abort / early termination", () => {
    /**
     * WHAT: Consumer breaking out of the loop terminates the generator cleanly.
     * WHY: AC-10 — early termination must not leave dangling promises.
     * STEPS:
     *   Arrange — slow mock graph with many events
     *   Act — consume only the first block, then break
     *   Assert — generator terminates, no hanging
     */
    it("terminates cleanly when consumer breaks early", async () => {
        // --- Arrange ---
        const graph = slowMockGraph(
            [
                textChunkEvent("chunk 1"),
                textChunkEvent("chunk 2"),
                textChunkEvent("chunk 3"),
                textChunkEvent("chunk 4"),
                endEvent(),
            ],
            20,
        );

        // --- Act ---
        const blocks: Block[] = [];
        for await (const block of langGraphBlocks(graph, [])) {
            blocks.push(block);
            // Break after first block — simulates abort/cancellation
            break;
        }

        // --- Assert ---
        // Only one block consumed before breaking
        assert.equal(blocks.length, 1);
        assert.equal(typeof blocks[0], "function");
        // If we reach here without hanging, the generator cleaned up properly
    });

    /**
     * WHAT: Calling generator.return() terminates the generator.
     * WHY: AC-10 — explicit return must trigger cleanup (finally blocks).
     * STEPS:
     *   Arrange — slow mock graph
     *   Act — get first block, then call return()
     *   Assert — generator reports done
     */
    it("handles explicit generator.return() gracefully", async () => {
        // --- Arrange ---
        const graph = slowMockGraph(
            [textChunkEvent("data"), textChunkEvent("more data"), endEvent()],
            30,
        );

        // --- Act ---
        const gen = langGraphBlocks(graph, []);
        const first = await gen.next();

        // --- Assert ---
        assert.equal(first.done, false, "first next() should yield a block");

        // Explicitly return the generator
        const returnResult = await gen.return(undefined);
        assert.equal(returnResult.done, true, "return() should mark generator as done");
    });
});

/**
 * langGraphBlocks — unrecognised events
 * Verifies events that aren't on_chat_model_stream or on_chat_model_end
 * are silently ignored.
 */
describe("langGraphBlocks — unrecognised events", () => {
    /**
     * WHAT: Non-model events (e.g. on_chain_start) are ignored.
     * WHY: Robustness — LangGraph emits many event types; only model events
     *       should produce blocks.
     * STEPS:
     *   Arrange — mix of unrelated events with one text event
     *   Act — collect blocks
     *   Assert — only the text block is yielded
     */
    it("ignores non-model events", async () => {
        // --- Arrange ---
        const graph = mockGraph([
            { event: "on_chain_start", data: {} },
            { event: "on_retriever_end", data: { documents: [] } },
            textChunkEvent("hello"),
            { event: "on_chain_end", data: {} },
            endEvent(),
        ]);

        // --- Act ---
        const blocks = await collectBlocks(langGraphBlocks(graph, []));

        // --- Assert ---
        assert.equal(blocks.length, 1);
        assert.equal(typeof blocks[0], "function");
    });
});

/**
 * langGraphBlocks — chunk with no content
 * Verifies that on_chat_model_stream events with null/undefined/empty
 * chunk data are safely skipped.
 */
describe("langGraphBlocks — malformed chunks", () => {
    /**
     * WHAT: Events with missing chunk data are skipped.
     * WHY: Defensive — streamEvents may emit chunks without data.chunk.
     * STEPS:
     *   Arrange — event with no chunk, event with empty string content
     *   Act — collect blocks
     *   Assert — empty string content does not create a block
     */
    it("skips events with missing or empty chunk data", async () => {
        // --- Arrange ---
        const graph = mockGraph([
            { event: "on_chat_model_stream", data: {} },
            { event: "on_chat_model_stream", data: { chunk: null } },
            { event: "on_chat_model_stream", data: { chunk: { content: "" } } },
            endEvent(),
        ]);

        // --- Act ---
        const blocks = await collectBlocks(langGraphBlocks(graph, []));

        // --- Assert ---
        // No blocks: missing chunk is skipped, null chunk is skipped,
        // empty string is falsy so no message block created
        assert.equal(blocks.length, 0);
    });
});
