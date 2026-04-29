/**
 * Tests for: generated Zod schemas used in PingPongRuntimeService scaffold events
 * Source: src/international-space-bar-server/openresponses/ping-pong-runtime.service.ts
 * Ticket: isb-0056
 *
 * Purpose: Smoke-tests that every generated event/resource schema accepts the exact fixture
 *          values constructed by the ping-pong scaffold, and that wrong type literals are rejected.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZodError, z } from "zod";

import { responseCompletedStreamingEventSchema } from "./generated/zod/responseCompletedStreamingEventSchema.js";
import { responseCreatedStreamingEventSchema } from "./generated/zod/responseCreatedStreamingEventSchema.js";
import { responseOutputItemAddedStreamingEventSchema } from "./generated/zod/responseOutputItemAddedStreamingEventSchema.js";
import { responseOutputTextDeltaStreamingEventSchema } from "./generated/zod/responseOutputTextDeltaStreamingEventSchema.js";
import { responseResourceSchema } from "./generated/zod/responseResourceSchema.js";

// ── Shared fixture constants ──────────────────────────────────────────────────
// Fixed IDs and timestamps used across tests to ensure deterministic, repeatable assertions.
const RESP_ID = "resp_smoke-test-id";
const MSG_ID = "msg_smoke-test-id";
const CREATED_AT = 1700000000;
const COMPLETED_AT = 1700000001;
const MODEL = "isb-ping";

// ── Base resource fixture (in_progress) ───────────────────────────────────────
// Mirrors the `inProgressResponse` fixture built inside PingPongRuntimeService.stream().
// Values are copied verbatim from the scaffold to guarantee round-trip correctness.
const inProgressResponseFixture = {
    id: RESP_ID,
    object: "response",
    created_at: CREATED_AT,
    completed_at: null,
    status: "in_progress",
    model: MODEL,
    previous_response_id: null,
    instructions: null,
    output: [],
    error: null,
    tools: [],
    tool_choice: "auto",
    truncation: "disabled",
    parallel_tool_calls: true,
    text: { format: { type: "text" } },
    top_p: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
    top_logprobs: 0,
    temperature: 1,
    reasoning: null,
    usage: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
    },
    max_output_tokens: null,
    max_tool_calls: null,
    store: true,
    background: false,
    service_tier: "default",
    metadata: {},
    safety_identifier: null,
    prompt_cache_key: null,
    incomplete_details: null,
};

// ── Local ReasoningItemShape ───────────────────────────────────────────────────
// Replicates the private schema defined in PingPongRuntimeService used to validate
// reasoning item payloads before they are embedded in output_item events.
// Copied verbatim from the scaffold (isb-0054 introduced this shape).
const LocalReasoningItemShape = z.object({
    id: z.string(),
    type: z.literal("reasoning"),
    summary: z.array(z.unknown()),
    content: z.array(z.unknown()).optional(),
});

/**
 * Smoke tests for generated Zod schemas — ping-pong scaffold round-trips
 * Verifies that every schema called via .parse() in the scaffold accepts the
 * exact fixture values it constructs at runtime.
 */
void describe("ping-pong scaffold — generated schema smoke tests", () => {
    /**
     * WHAT: responseResourceSchema parses the invoke() return shape (status: "completed").
     * WHY: AC #1 — responseResourceSchema.parse() is called on the invoke() return value;
     *      this test ensures the schema accepts the exact field set the scaffold builds,
     *      including a message output item with text "pong".
     * STEPS:
     *   Arrange — build the completed ResponseResource fixture (mirrors invoke() return verbatim)
     *   Act     — call responseResourceSchema.parse()
     *   Assert  — result has status "completed" and the expected id; no ZodError thrown
     */
    void it("responseResourceSchema — invoke() return shape (status: completed) passes parse", () => {
        // --- Arrange ---
        const fixture = {
            id: RESP_ID,
            object: "response",
            created_at: CREATED_AT,
            completed_at: COMPLETED_AT,
            status: "completed",
            model: MODEL,
            previous_response_id: null,
            instructions: null,
            output: [
                {
                    id: MSG_ID,
                    type: "message",
                    status: "completed",
                    role: "assistant",
                    content: [{ type: "output_text", text: "pong", annotations: [] }],
                },
            ],
            error: null,
            tools: [],
            tool_choice: "auto",
            truncation: "disabled",
            parallel_tool_calls: true,
            text: { format: { type: "text" } },
            top_p: 1,
            presence_penalty: 0,
            frequency_penalty: 0,
            top_logprobs: 0,
            temperature: 1,
            reasoning: null,
            usage: {
                input_tokens: 0,
                output_tokens: 1,
                total_tokens: 1,
                input_tokens_details: { cached_tokens: 0 },
                output_tokens_details: { reasoning_tokens: 0 },
            },
            max_output_tokens: null,
            max_tool_calls: null,
            store: true,
            background: false,
            service_tier: "default",
            metadata: {},
            safety_identifier: null,
            prompt_cache_key: null,
            incomplete_details: null,
        };

        // --- Act ---
        const result = responseResourceSchema.parse(fixture);

        // --- Assert ---
        // Confirms schema accepted the completed ResponseResource without throwing
        assert.equal(result.status, "completed");
        assert.equal(result.id, RESP_ID);
    });

    /**
     * WHAT: responseResourceSchema parses the inProgressResponse shape
     *       (status: "in_progress", completed_at: null).
     * WHY: AC #2 — responseResourceSchema.parse() is called on inProgressResponse before its
     *      first use in stream(); this test proves null completed_at + empty output[] is schema-valid.
     * STEPS:
     *   Arrange — use the shared inProgressResponseFixture (defined at module scope)
     *   Act     — call responseResourceSchema.parse()
     *   Assert  — result has status "in_progress" and completed_at null
     */
    void it("responseResourceSchema — inProgressResponse shape (status: in_progress, completed_at: null) passes parse", () => {
        // --- Act ---
        const result = responseResourceSchema.parse(inProgressResponseFixture);

        // --- Assert ---
        // Confirms null completed_at and in_progress status are accepted by the schema
        assert.equal(result.status, "in_progress");
        assert.equal(result.completed_at, null);
    });

    /**
     * WHAT: responseCreatedStreamingEventSchema parses a response.created event fixture.
     * WHY: AC #3 — validates the first streaming event emitted by stream(): the response.created
     *      event that wraps the inProgressResponse. Ensures the envelope + embedded response
     *      satisfy the schema together.
     * STEPS:
     *   Arrange — build a response.created event with sequence_number 0 and the in-progress response
     *   Act     — call responseCreatedStreamingEventSchema.parse()
     *   Assert  — parsed event has correct type and sequence_number
     */
    void it("responseCreatedStreamingEventSchema — response.created event fixture passes parse", () => {
        // --- Arrange ---
        const fixture = {
            type: "response.created",
            sequence_number: 0,
            response: inProgressResponseFixture,
        };

        // --- Act ---
        const result = responseCreatedStreamingEventSchema.parse(fixture);

        // --- Assert ---
        // Confirms the event envelope and embedded response both satisfy the schema
        assert.equal(result.type, "response.created");
        assert.equal(result.sequence_number, 0);
    });

    /**
     * WHAT: responseOutputItemAddedStreamingEventSchema parses with a reasoning item payload;
     *       LocalReasoningItemShape independently also parses the same item.
     * WHY: AC #4 — mirrors the double-.parse() pattern in streamReasoningBlock() where
     *      ReasoningItemShape.parse() is called first, then the whole event is parsed.
     *      Both the inner item shape and the outer envelope must be schema-valid.
     * STEPS:
     *   Arrange — build a reasoning item and the output_item.added envelope around it
     *   Act     — parse item with LocalReasoningItemShape (inner); parse envelope with outer schema
     *   Assert  — both succeed without throwing; parsed values have expected discriminants
     */
    void it("responseOutputItemAddedStreamingEventSchema — outer envelope + LocalReasoningItemShape item both pass parse", () => {
        // --- Arrange ---
        const rawItem = {
            id: "rs__smoke-test-reasoning-id",
            type: "reasoning",
            summary: [],
            content: [],
        };
        const envelopeFixture = {
            type: "response.output_item.added",
            sequence_number: 1,
            output_index: 0,
            item: rawItem,
        };

        // --- Act ---
        // Inner: validates the item payload shape (mirrors ReasoningItemShape.parse() in the service)
        const parsedItem = LocalReasoningItemShape.parse(rawItem);
        // Outer: validates the full streaming event envelope including the item
        const parsedEnvelope = responseOutputItemAddedStreamingEventSchema.parse(envelopeFixture);

        // --- Assert ---
        // Both schemas parsed without throwing — structural integrity confirmed
        assert.equal(parsedItem.type, "reasoning");
        assert.equal(parsedEnvelope.type, "response.output_item.added");
        assert.equal(parsedEnvelope.output_index, 0);
    });

    /**
     * WHAT: responseOutputTextDeltaStreamingEventSchema parses a delta event fixture.
     * WHY: AC #5 — validates the output_text.delta event emitted per-chunk inside
     *      streamMessageBlock(); ensures all required fields (item_id, output_index,
     *      content_index, delta) satisfy the schema.
     * STEPS:
     *   Arrange — build a delta event fixture with realistic field values
     *   Act     — call responseOutputTextDeltaStreamingEventSchema.parse()
     *   Assert  — parsed event has correct type and delta text
     */
    void it("responseOutputTextDeltaStreamingEventSchema — delta event fixture passes parse", () => {
        // --- Arrange ---
        const fixture = {
            type: "response.output_text.delta",
            sequence_number: 5,
            item_id: "msg_smoke-test-msg-id",
            output_index: 1,
            content_index: 0,
            delta: "pong",
        };

        // --- Act ---
        const result = responseOutputTextDeltaStreamingEventSchema.parse(fixture);

        // --- Assert ---
        // Confirms all required delta fields are accepted by the schema
        assert.equal(result.type, "response.output_text.delta");
        assert.equal(result.delta, "pong");
    });

    /**
     * WHAT: responseCompletedStreamingEventSchema parses a response.completed event fixture.
     * WHY: AC #6 — validates the final event emitted by stream(); specifically tests that
     *      status "completed" and a numeric completed_at (spread from the inProgressResponse)
     *      are accepted by the schema.
     * STEPS:
     *   Arrange — build a response.completed event spreading inProgressResponseFixture with overrides
     *   Act     — call responseCompletedStreamingEventSchema.parse()
     *   Assert  — parsed event type is "response.completed"
     */
    void it("responseCompletedStreamingEventSchema — response.completed event fixture passes parse", () => {
        // --- Arrange ---
        const fixture = {
            type: "response.completed",
            sequence_number: 19,
            response: {
                ...inProgressResponseFixture,
                status: "completed",
                completed_at: COMPLETED_AT,
            },
        };

        // --- Act ---
        const result = responseCompletedStreamingEventSchema.parse(fixture);

        // --- Assert ---
        // Confirms completed event with status override and numeric completed_at is schema-valid
        assert.equal(result.type, "response.completed");
        assert.equal(result.sequence_number, 19);
    });

    /**
     * WHAT: Passing an object with the wrong type literal causes
     *       responseCreatedStreamingEventSchema.parse() to throw a ZodError.
     * WHY: AC #7 (negative) — validates that the type literal guard is enforced at runtime,
     *      not just at TypeScript compile-time. If this test fails, the enum constraint
     *      ["response.created"] is not being enforced by the schema.
     * STEPS:
     *   Arrange — build a fixture with type "response.WRONG" (invalid literal for this schema)
     *   Act     — call .parse() inside assert.throws()
     *   Assert  — throws a ZodError instance (not a generic Error or silent pass)
     */
    void it("responseCreatedStreamingEventSchema — wrong type literal causes ZodError", () => {
        // --- Act + Assert ---
        // The type enum ["response.created"] rejects "response.WRONG" — must throw ZodError
        assert.throws(
            () =>
                responseCreatedStreamingEventSchema.parse({
                    type: "response.WRONG",
                    sequence_number: 0,
                    response: {},
                }),
            ZodError,
        );
    });
});
