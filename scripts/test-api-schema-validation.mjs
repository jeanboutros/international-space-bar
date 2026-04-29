#!/usr/bin/env node
/**
 * API Test: POST /v1/responses — schema validation smoke checks
 * Ticket: isb-0051
 *
 * Prerequisites:
 *   - Server running on http://127.0.0.1:3000
 *   - ISB_OPENRESPONSES_API_KEY set (default: "local-dev-key")
 *
 * What this tests (AC-required cases):
 *   C-1: valid request (model: "isb-ping", input: "ping") → HTTP 200
 *   C-2: empty model (model: "") → HTTP 400 or 422 (non-2xx, validation reject)
 *   C-3: null model (model: null) → HTTP 400 or 422 (non-2xx, validation reject)
 *   C-4: array input (input: ItemParam[]) → HTTP 200
 *
 * Additional coverage (not AC-required but useful regression canaries):
 *   C-5: unknown field present → HTTP 200 (passthrough — extra fields allowed)
 *   C-6: stream: true → HTTP 200, Content-Type: text/event-stream (SSE path)
 *
 * Run:
 *   ISB_OPENRESPONSES_API_KEY=<key> node scripts/test-api-schema-validation.mjs
 */

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const API_KEY = process.env.ISB_OPENRESPONSES_API_KEY ?? "local-dev-key";

/**
 * Helper: make an authenticated POST request to the API.
 * @param {string} path — API path (e.g. "/v1/responses")
 * @param {object} body — request body (will be JSON-serialised)
 * @param {RequestInit} [extra] — additional fetch options merged last
 * @returns {Promise<Response>}
 */
async function apiRequest(path, body, extra = {}) {
    return fetch(`${BASE_URL}${path}`, {
        method: "POST",
        ...extra,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
            ...extra.headers,
        },
        body: JSON.stringify(body),
    });
}

/**
 * Helper: assert a condition, print result, throw on failure.
 * @param {boolean} condition
 * @param {string} label — what was being checked
 */
function assert(condition, label) {
    if (condition) {
        console.log(`  ✓ ${label}`);
    } else {
        console.error(`  ✗ ${label}`);
        throw new Error(`Assertion failed: ${label}`);
    }
}

// ── C-1: valid request baseline → HTTP 200 ───────────────────────────────────
// Sends the minimal valid body (model + input string). This is the baseline:
// every valid request must return 200 and a completed response. If this fails,
// the server or API-key configuration is broken, not the validation logic.
async function testValidRequestBaseline() {
    console.log('\nTest C-1: valid request (model: "isb-ping", input: "ping") → HTTP 200');

    // Arrange — minimal valid body
    const body = { model: "isb-ping", input: "ping" };

    // Act
    const res = await apiRequest("/v1/responses", body);

    // Assert — baseline valid request must succeed
    assert(res.status === 200, `status is 200 (got ${res.status})`);

    const data = await res.json();
    assert(data.status === "completed", `response status is "completed" (got "${data.status}")`);
}

// ── C-2: empty model → HTTP 400 or 422 (non-2xx) ─────────────────────────────
// Sends a body where model is an empty string. The server's ZodValidationPipe
// runs CreateResponseSchema which has z.string().min(1), rejecting "" with a
// client error. Either 400 or 422 proves the boundary is enforced.
async function testEmptyModelRejected() {
    console.log('\nTest C-2: model: "" → HTTP 400 or 422 (non-2xx)');

    // Arrange — empty string model violates min(1) constraint
    const body = { model: "", input: "hi" };

    // Act
    const res = await apiRequest("/v1/responses", body);

    // Assert — empty model must be rejected with a 4xx error
    assert(res.status >= 400 && res.status < 500, `status is 4xx (got ${res.status})`);

    const data = await res.json();
    assert(
        typeof data.error === "object" && data.error !== null,
        "response body has an error object",
    );
}

// ── C-3: null model → HTTP 400 or 422 (non-2xx) ──────────────────────────────
// Sends a body where model is null. The schema expects z.string(), so null
// must be rejected at the validation boundary before reaching the handler.
// Either 400 or 422 is acceptable — both prove the boundary rejects null.
async function testNullModelRejected() {
    console.log("\nTest C-3: model: null → HTTP 400 or 422 (non-2xx)");

    // Arrange — null is not a valid string value for model
    const body = { model: null, input: "hi" };

    // Act
    const res = await apiRequest("/v1/responses", body);

    // Assert — null model must be rejected with a 4xx error
    assert(res.status >= 400 && res.status < 500, `status is 4xx (got ${res.status})`);

    const data = await res.json();
    assert(
        typeof data.error === "object" && data.error !== null,
        "response body has an error object",
    );
}

// ── C-4: input as ItemParam array → HTTP 200 ─────────────────────────────────
// Sends a valid body where input is an ItemParam array (the structured form).
// The schema accepts both string and array forms via a union. This proves the
// array union branch is correctly handled without triggering a validation error.
async function testArrayInputAccepted() {
    console.log("\nTest C-4: input as ItemParam array → HTTP 200");

    // Arrange — valid body with input as a user-message ItemParam array
    const body = {
        model: "isb-ping",
        input: [
            {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: "hi" }],
            },
        ],
    };

    // Act
    const res = await apiRequest("/v1/responses", body);

    // Assert — array input form must be accepted; runtime returns completed response
    assert(res.status === 200, `status is 200 (got ${res.status})`);

    const data = await res.json();
    assert(data.status === "completed", `response status is "completed" (got "${data.status}")`);
}

// ── C-5: unknown field → HTTP 200 (passthrough) ───────────────────────────────
// Additional coverage (not AC-required). Sends a valid body with an extra field
// not declared in the schema. The .passthrough() call on CreateResponseSchema
// must allow this through — important for forwards-compatibility with clients
// that send vendor extensions. HTTP 200 proves the field was not rejected.
async function testUnknownFieldAccepted() {
    console.log("\nTest C-5: unknown field → HTTP 200 (passthrough)");

    // Arrange — valid body plus an extra field not in the schema
    const body = { model: "isb-ping", input: "hi", unknownField: true };

    // Act
    const res = await apiRequest("/v1/responses", body);

    // Assert — .passthrough() allows unknown fields; no 400 should be returned
    assert(res.status === 200, `status is 200 (got ${res.status})`);

    const data = await res.json();
    assert(data.status === "completed", `response status is "completed" (got "${data.status}")`);
}

// ── C-6: stream: true → HTTP 200, Content-Type: text/event-stream ─────────────
// Additional coverage (not AC-required). Sends a valid body with stream: true.
// The controller checks body.stream and switches to the SSE path, setting
// Content-Type: text/event-stream. Body is cancelled after headers to avoid
// waiting for the full stream — we only need to verify the routing decision.
async function testStreamAccepted() {
    console.log("\nTest C-6: stream: true → HTTP 200, Content-Type: text/event-stream");

    // Arrange — valid body requesting the SSE streaming path
    const body = { model: "isb-ping", input: "hi", stream: true };

    // Act — fetch without consuming the body (headers arrive before stream data)
    const res = await apiRequest("/v1/responses", body);

    // Assert status before touching the body
    assert(res.status === 200, `status is 200 (got ${res.status})`);

    // Content-Type must be text/event-stream (set by the controller before writing frames)
    const contentType = res.headers.get("content-type") ?? "";
    assert(
        contentType.includes("text/event-stream"),
        `Content-Type includes text/event-stream (got "${contentType}")`,
    );

    // Release the SSE connection — we have verified what we need (headers only).
    // This avoids waiting for the full Ollama stream to complete.
    await res.body?.cancel().catch(() => {
        // Ignore: body may already be partially consumed or the connection closed.
    });
}

// ── Runner ────────────────────────────────────────────────────────────────────
/** @type {{ id: string; label: string; fn: () => Promise<void> }[]} */
const CASES = [
    { id: "C-1", label: "valid request baseline → HTTP 200", fn: testValidRequestBaseline },
    { id: "C-2", label: 'empty model → HTTP 400/422', fn: testEmptyModelRejected },
    { id: "C-3", label: "null model → HTTP 400/422", fn: testNullModelRejected },
    { id: "C-4", label: "array input → HTTP 200", fn: testArrayInputAccepted },
    { id: "C-5", label: "unknown field passthrough → HTTP 200", fn: testUnknownFieldAccepted },
    { id: "C-6", label: "stream: true → HTTP 200, SSE", fn: testStreamAccepted },
];

/** @type {Map<string, string>} */
const failureMap = new Map();

for (const { id, fn } of CASES) {
    try {
        await fn();
    } catch (err) {
        failureMap.set(id, err.message);
    }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n── Summary ──────────────────────────────────────────────────────");
for (const { id, label } of CASES) {
    const err = failureMap.get(id);
    console.log(`  ${err ? "✗" : "✓"} ${id}: ${label}${err ? ` — ${err}` : ""}`);
}
const passed = CASES.length - failureMap.size;
console.log(`\n  ${passed} passed, ${failureMap.size} failed`);
console.log("─────────────────────────────────────────────────────────────────\n");

process.exit(failureMap.size > 0 ? 1 : 0);
