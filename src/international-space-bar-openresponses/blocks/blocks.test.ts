// Block factory unit tests — verifies type-narrowed blocks produce valid streaming events.
// Covers functionCallBlock, messageBlock, reasoningBlock.
// Ticket: isb-0091 | Epic: isb-epic-012

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { functionCallBlock } from "./function-call-block.js";
import type { AsyncQueue, Delta } from "./message-block.js";
import { messageBlock } from "./message-block.js";
import { reasoningBlock } from "./reasoning-block.js";

import type { ResponseStream } from "../response-stream.js";
import type { ItemField, ResponseStreamEvent } from "../responses.types.js";

// --- Helpers ---

/** Minimal mock of ResponseStream — satisfies block factory interface. */
function mockCtx(opts?: { abortSignal?: AbortSignal }): ResponseStream & {
    readonly recorded: ItemField[];
    readonly usageDeltas: { output_tokens?: number }[];
} {
    let seq = 0;
    let outputIdx = 0;
    const recorded: ItemField[] = [];
    const usageDeltas: { output_tokens?: number }[] = [];
    return {
        get outputIndex() {
            return outputIdx++;
        },
        nextSeq: () => seq++,
        recordOutputItem: (item: ItemField) => recorded.push(item),
        addUsage: (delta: { output_tokens?: number }) => usageDeltas.push(delta),
        abortSignal: opts?.abortSignal,
        recorded,
        usageDeltas,
    };
}

/** Creates an AsyncQueue from an array of strings. */
async function* arrayQueue(texts: string[]): AsyncQueue<Delta> {
    for (const text of texts) {
        yield { text };
    }
}

/** Collects all events from a block generator. */
async function collectEvents(
    gen: AsyncGenerator<ResponseStreamEvent>,
): Promise<ResponseStreamEvent[]> {
    const events: ResponseStreamEvent[] = [];
    for await (const event of gen) {
        events.push(event);
    }
    return events;
}

// --- functionCallBlock ---

describe("functionCallBlock", () => {
    // Verifies the block produces valid events with narrowed FunctionCall type.
    // The Zod parse inside the block validates schema conformance at runtime.
    it("produces valid streaming events from a queue", async () => {
        // --- Arrange ---
        const ctx = mockCtx();
        const queue = arrayQueue(['{"arg":', '"value"}']);
        const block = functionCallBlock(queue, { name: "myFunc", callId: "call_123" });

        // --- Act ---
        const events = await collectEvents(block(ctx));

        // --- Assert ---
        assert.ok(
            events.length >= 4,
            "expected at least 4 events (added, 2 deltas, args.done, item.done)",
        );

        const added = events[0] as Record<string, unknown>;
        assert.equal(added.type, "response.output_item.added");
        const addedItem = added.item as Record<string, unknown>;
        assert.equal(addedItem.type, "function_call");
        assert.equal(addedItem.status, "in_progress");
        assert.equal(addedItem.name, "myFunc");

        const done = events[events.length - 1] as Record<string, unknown>;
        assert.equal(done.type, "response.output_item.done");
        const doneItem = done.item as Record<string, unknown>;
        assert.equal(doneItem.status, "completed");
        assert.equal(doneItem.arguments, '{"arg":"value"}');

        assert.equal(ctx.recorded.length, 1);
    });

    // Verifies callId is auto-generated when not provided.
    it("generates a callId when not supplied", async () => {
        // --- Arrange ---
        const ctx = mockCtx();
        const queue = arrayQueue(["args"]);
        const block = functionCallBlock(queue, { name: "fn" });

        // --- Act ---
        const events = await collectEvents(block(ctx));

        // --- Assert ---
        const added = events[0] as Record<string, unknown>;
        const item = added.item as Record<string, unknown>;
        assert.ok(
            typeof item.call_id === "string" && item.call_id.startsWith("call_"),
            "auto-generated callId should start with call_",
        );
    });
});

// --- messageBlock ---

describe("messageBlock", () => {
    // Verifies sync (string) overload produces valid events.
    it("produces valid events from a static string", async () => {
        // --- Arrange ---
        const ctx = mockCtx();
        const block = messageBlock("Hello world");

        // --- Act ---
        const events = await collectEvents(block(ctx));

        // --- Assert ---
        assert.ok(events.length >= 5, "expected at least 5 events");

        const added = events[0] as Record<string, unknown>;
        assert.equal(added.type, "response.output_item.added");
        const addedItem = added.item as Record<string, unknown>;
        assert.equal(addedItem.type, "message");
        assert.equal(addedItem.status, "in_progress");
        assert.equal(addedItem.role, "assistant");

        const textDone = events.find(
            (e) => (e as Record<string, unknown>).type === "response.output_text.done",
        ) as Record<string, unknown>;
        assert.equal(textDone.text, "Hello world");

        const itemDone = events[events.length - 1] as Record<string, unknown>;
        assert.equal(itemDone.type, "response.output_item.done");
        const doneItem = itemDone.item as Record<string, unknown>;
        assert.equal(doneItem.status, "completed");

        assert.equal(ctx.recorded.length, 1);
    });

    // Verifies async (queue) overload produces valid events.
    it("produces valid events from an async queue", async () => {
        // --- Arrange ---
        const ctx = mockCtx();
        const queue = arrayQueue(["Hello", " ", "world"]);
        const block = messageBlock(queue);

        // --- Act ---
        const events = await collectEvents(block(ctx));

        // --- Assert ---
        const textDone = events.find(
            (e) => (e as Record<string, unknown>).type === "response.output_text.done",
        ) as Record<string, unknown>;
        assert.equal(textDone.text, "Hello world");
    });
});

// --- reasoningBlock ---

describe("reasoningBlock", () => {
    // Verifies reasoning items do NOT have a `status` field (spec compliance).
    it("reasoning items must not have status field", async () => {
        // --- Arrange ---
        const ctx = mockCtx();
        const block = reasoningBlock("A reasoning summary");

        // --- Act ---
        const events = await collectEvents(block(ctx));

        // --- Assert ---
        const added = events[0] as Record<string, unknown>;
        assert.equal(added.type, "response.output_item.added");
        const addedItem = added.item as Record<string, unknown>;
        assert.equal(addedItem.type, "reasoning");
        assert.equal("status" in addedItem, false, "reasoning item must not have status");

        const itemDone = events[events.length - 1] as Record<string, unknown>;
        assert.equal(itemDone.type, "response.output_item.done");
        const doneItem = itemDone.item as Record<string, unknown>;
        assert.equal("status" in doneItem, false, "reasoning item must not have status");
    });

    // Verifies sync (string) overload produces valid events.
    it("produces valid events from a static summary", async () => {
        // --- Arrange ---
        const ctx = mockCtx();
        const block = reasoningBlock("Summary text");

        // --- Act ---
        const events = await collectEvents(block(ctx));

        // --- Assert ---
        assert.ok(events.length >= 4, "expected at least 4 events");

        const added = events[0] as Record<string, unknown>;
        const addedItem = added.item as Record<string, unknown>;
        assert.equal(addedItem.type, "reasoning");
        assert.deepEqual(addedItem.summary, []);

        const done = events[events.length - 1] as Record<string, unknown>;
        const doneItem = done.item as Record<string, unknown>;
        assert.deepEqual(doneItem.summary, [{ type: "summary_text", text: "Summary text" }]);

        assert.equal(ctx.recorded.length, 1);
    });

    // Verifies async (queue) overload produces valid events.
    it("produces valid events from an async queue", async () => {
        // --- Arrange ---
        const ctx = mockCtx();
        const queue = arrayQueue(["Part 1", " Part 2"]);
        const block = reasoningBlock(queue);

        // --- Act ---
        const events = await collectEvents(block(ctx));

        // --- Assert ---
        const done = events[events.length - 1] as Record<string, unknown>;
        const doneItem = done.item as Record<string, unknown>;
        assert.deepEqual(doneItem.summary, [{ type: "summary_text", text: "Part 1 Part 2" }]);
    });

    // Verifies abort signal stops delta emission.
    it("respects abort signal mid-stream", async () => {
        // --- Arrange ---
        const controller = new AbortController();
        const ctx = mockCtx({ abortSignal: controller.signal });

        async function* slowQueue(): AsyncQueue<Delta> {
            yield { text: "first" };
            controller.abort();
            yield { text: "second" };
        }

        const block = reasoningBlock(slowQueue());

        // --- Act ---
        const events = await collectEvents(block(ctx));

        // --- Assert ---
        const deltas = events.filter(
            (e) => (e as Record<string, unknown>).type === "response.reasoning_summary_text.delta",
        );
        assert.equal(deltas.length, 1, "only one delta before abort");
    });
});
