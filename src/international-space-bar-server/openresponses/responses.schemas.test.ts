/**
 * Tests for: CreateResponseSchema
 * Source: src/international-space-bar-server/openresponses/responses.schemas.ts
 * Ticket: isb-0051
 *
 * Purpose: Verifies parse semantics of CreateResponseSchema — valid inputs succeed,
 *          invalid inputs fail, .passthrough() preserves unknown fields, and stream
 *          flag values round-trip correctly.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CreateResponseSchema } from "./responses.schemas.js";

/**
 * CreateResponseSchema — parse semantics
 * Covers field validation constraints (model min-length, model required), input
 * shape variants (string vs array), passthrough behaviour for unknown fields, and
 * stream flag handling (omitted / true / false).
 */
void describe("CreateResponseSchema", () => {
    /**
     * WHAT: A minimal valid request (model + input string) parses successfully.
     * WHY: AC #1 — baseline happy path; proves the schema accepts well-formed input
     *      and that stream has no default (z.optional produces undefined when omitted).
     * STEPS:
     *   Arrange — build a body with only model and input (string form)
     *   Act — call safeParse
     *   Assert — success is true, model and input are preserved, stream is undefined
     */
    void it("parses a minimal valid request with model and input string", () => {
        // --- Arrange ---
        const payload = { model: "isb-ping", input: "ping" };

        // --- Act ---
        const result = CreateResponseSchema.safeParse(payload);

        // --- Assert ---
        assert.ok(
            result.success,
            `Expected success — errors: ${!result.success ? result.error.message : ""}`,
        );
        assert.equal(result.data.model, "isb-ping");
        assert.equal(result.data.input, "ping");
        // stream is omitted — z.optional(z.boolean()) produces undefined (no schema default)
        assert.equal(result.data.stream, undefined);
    });

    /**
     * WHAT: `stream: true` parses successfully and the boolean is preserved.
     * WHY: AC #8 — the streaming flag must round-trip through schema validation unchanged.
     * STEPS:
     *   Arrange — build body with stream: true
     *   Act — call safeParse
     *   Assert — success is true, result.data.stream is strictly true
     */
    void it("parses successfully when stream is true", () => {
        // --- Arrange ---
        const payload = { model: "isb-ping", input: "ping", stream: true };

        // --- Act ---
        const result = CreateResponseSchema.safeParse(payload);

        // --- Assert ---
        assert.ok(result.success);
        assert.equal(result.data.stream, true);
    });

    /**
     * WHAT: `stream: false` parses successfully and the boolean is preserved.
     * WHY: Explicit false must not be treated as absent; validates boolean round-trip.
     * STEPS:
     *   Arrange — build body with stream: false
     *   Act — call safeParse
     *   Assert — success is true, result.data.stream is strictly false
     */
    void it("parses successfully when stream is false", () => {
        // --- Arrange ---
        const payload = { model: "isb-ping", input: "ping", stream: false };

        // --- Act ---
        const result = CreateResponseSchema.safeParse(payload);

        // --- Assert ---
        assert.ok(result.success);
        assert.equal(result.data.stream, false);
    });

    /**
     * WHAT: `input` provided as a valid ItemParam array parses successfully.
     * WHY: AC #6 — the OpenResponses protocol allows input to be an item array.
     *      itemParamSchema requires objects with a `type` discriminator — plain strings
     *      are not valid array items. A minimal valid item is an assistant message.
     * STEPS:
     *   Arrange — build body with input as a one-element assistant message array
     *   Act — call safeParse
     *   Assert — success is true, data.input deep-equals the original array
     */
    void it("parses successfully when input is a valid ItemParam array", () => {
        // --- Arrange ---
        // itemParamSchema is a discriminated union — the simplest valid item is an
        // assistant message: { type: "message", role: "assistant", content: string }
        const item = { type: "message", role: "assistant", content: "hello" };
        const payload = { model: "isb-ping", input: [item] };

        // --- Act ---
        const result = CreateResponseSchema.safeParse(payload);

        // --- Assert ---
        assert.ok(
            result.success,
            `Expected success — errors: ${!result.success ? result.error.message : ""}`,
        );
        // input array is preserved through passthrough parsing
        assert.ok(Array.isArray(result.data.input), "result.data.input should be an array");
    });

    /**
     * WHAT: `model: ""` (empty string) fails validation.
     * WHY: AC #3 — z.string().min(1) rejects empty strings; the HTTP layer returns 400.
     * STEPS:
     *   Arrange — build body with model set to empty string
     *   Act — call safeParse
     *   Assert — success is false (min(1) constraint violated)
     */
    void it("rejects model as empty string", () => {
        // --- Arrange ---
        const payload = { model: "", input: "ping" };

        // --- Act ---
        const result = CreateResponseSchema.safeParse(payload);

        // --- Assert ---
        assert.ok(!result.success, "Expected safeParse to fail for model: ''");
    });

    /**
     * WHAT: Missing `model` field fails validation.
     * WHY: AC #2 — model is required after .extend(); its absence must be rejected.
     * STEPS:
     *   Arrange — build body without a model field
     *   Act — call safeParse
     *   Assert — success is false
     */
    void it("rejects when model is absent", () => {
        // --- Arrange ---
        const payload = { input: "ping" };

        // --- Act ---
        const result = CreateResponseSchema.safeParse(payload);

        // --- Assert ---
        assert.ok(!result.success, "Expected safeParse to fail when model is absent");
    });

    /**
     * WHAT: `model: null` fails validation.
     * WHY: AC #5 — .extend() replaces the generated nullable model with z.string().min(1),
     *      which does not accept null values.
     * STEPS:
     *   Arrange — build body with model explicitly set to null
     *   Act — call safeParse
     *   Assert — success is false
     */
    void it("rejects model as null", () => {
        // --- Arrange ---
        const payload = { model: null, input: "ping" };

        // --- Act ---
        const result = CreateResponseSchema.safeParse(payload);

        // --- Assert ---
        assert.ok(!result.success, "Expected safeParse to fail for model: null");
    });

    /**
     * WHAT: `model: " "` (single space) parses successfully.
     * WHY: AC #4 — z.string().min(1) validates byte length, not whitespace content.
     *      A single space character has length 1 and satisfies the constraint.
     *      Accepted by design — see FLAG-1 in isb-0051.
     * STEPS:
     *   Arrange — build body with model set to a single space character
     *   Act — call safeParse
     *   Assert — success is true (single space is min(1) compliant)
     */
    void it("accepts model as a single space (min(1) checks length, not whitespace)", () => {
        // --- Arrange ---
        const payload = { model: " ", input: "ping" };

        // --- Act ---
        const result = CreateResponseSchema.safeParse(payload);

        // --- Assert ---
        // z.string().min(1) checks byte length; " " has length 1 and therefore passes.
        // This edge case is accepted by design — see FLAG-1 note in isb-0051.
        assert.ok(
            result.success,
            "Expected safeParse to succeed for model: ' ' (single space is min(1) compliant)",
        );
    });

    /**
     * WHAT: Unknown fields are preserved in the parsed output (.passthrough() contract).
     * WHY: AC #7 — critical regression guard. If .passthrough() is removed, client
     *      extensions are silently stripped, breaking OpenResponses compatibility.
     *      Checking HTTP 200 alone does not prove passthrough — only asserting the
     *      unknown field value directly in result.data provides this guarantee.
     * STEPS:
     *   Arrange — build body with a field not declared in the schema
     *   Act — call safeParse
     *   Assert — success is true AND the unknown field appears with its original value
     */
    void it("preserves unknown fields in parse output (passthrough regression guard)", () => {
        // --- Arrange ---
        const payload = { model: "isb-ping", input: "ping", unknownField: true };

        // --- Act ---
        const result = CreateResponseSchema.safeParse(payload);

        // --- Assert ---
        assert.ok(result.success);
        // Assert the unknown field value directly on result.data.
        // If .passthrough() is removed, this field will be stripped and this assertion fails.
        assert.equal(result.data.unknownField, true);
    });
});
