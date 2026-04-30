/**
 * Tests for: server-layer constants
 * Source: src/international-space-bar-server/constants.ts
 * Ticket: isb-0064
 *
 * Purpose: Verifies that every exported constant has the correct value and that
 * derived constants maintain their derivation contract relative to their sources.
 */
import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    API_KEY_ENV_VAR,
    BEARER_PREFIX,
    DEFAULT_HOST,
    DEFAULT_PORT,
    RESPONSES_ROUTE,
    RESPONSES_WS_PATH,
} from "./constants.js";

/**
 * constants.ts — exported value contract
 * Each constant is asserted against a literal so that silent value changes
 * (e.g. a typo during a rename) are caught immediately by the test suite.
 * T-7 and T-8 additionally check structural relationships between constants.
 */
void describe("server constants", () => {
    /**
     * WHAT: DEFAULT_PORT equals 3000.
     * WHY: T-9 — the port literal drives config schema defaults and must not
     *      silently change; callers depend on this value being 3000.
     * STEPS:
     *   Arrange — import DEFAULT_PORT from constants.ts
     *   Act — (read the exported value)
     *   Assert — strictEqual to literal 3000
     */
    void it("DEFAULT_PORT is 3000 (T-9)", () => {
        // --- Assert ---
        assert.equal(DEFAULT_PORT, 3000);
    });

    /**
     * WHAT: DEFAULT_HOST equals "127.0.0.1".
     * WHY: T-10 — the loopback address is a security boundary; any change to the
     *      default host (e.g. "0.0.0.0") would expose the server externally.
     * STEPS:
     *   Arrange — import DEFAULT_HOST from constants.ts
     *   Act — (read the exported value)
     *   Assert — strictEqual to literal "127.0.0.1"
     */
    void it('DEFAULT_HOST is "127.0.0.1" (T-10)', () => {
        // --- Assert ---
        assert.equal(DEFAULT_HOST, "127.0.0.1");
    });

    /**
     * WHAT: BEARER_PREFIX equals "Bearer " (with trailing space).
     * WHY: T-11 — bearer guards rely on slicing at offset 7; the trailing space
     *      is load-bearing. A missing space would break token extraction silently.
     * STEPS:
     *   Arrange — import BEARER_PREFIX from constants.ts
     *   Act — (read the exported value)
     *   Assert — strictEqual to literal "Bearer " (7 chars, space included)
     */
    void it('BEARER_PREFIX is "Bearer " with trailing space (T-11)', () => {
        // --- Assert ---
        // Literal includes the required trailing space — intentional
        assert.equal(BEARER_PREFIX, "Bearer ");
    });

    /**
     * WHAT: BEARER_PREFIX.length equals 7.
     * WHY: T-7 — the slice offset used by bearer-auth.guard.ts to extract the
     *      raw token is `BEARER_PREFIX.length`; any length change silently breaks
     *      token parsing. This test pins the invariant.
     * STEPS:
     *   Arrange — import BEARER_PREFIX from constants.ts
     *   Act — read BEARER_PREFIX.length
     *   Assert — length equals 7 (structural assertion on imported value)
     */
    void it("BEARER_PREFIX.length is 7 — slice offset invariant (T-7)", () => {
        // --- Assert ---
        // "Bearer " = 6 chars + 1 trailing space = 7
        assert.equal(BEARER_PREFIX.length, 7);
    });

    /**
     * WHAT: API_KEY_ENV_VAR equals "ISB_OPENRESPONSES_API_KEY".
     * WHY: T-12 — the bearer guard reads process.env[API_KEY_ENV_VAR]; if the
     *      env-var name drifts, the guard would always see undefined and reject
     *      every request.
     * STEPS:
     *   Arrange — import API_KEY_ENV_VAR from constants.ts
     *   Act — (read the exported value)
     *   Assert — strictEqual to literal "ISB_OPENRESPONSES_API_KEY"
     */
    void it('API_KEY_ENV_VAR is "ISB_OPENRESPONSES_API_KEY" (T-12)', () => {
        // --- Assert ---
        assert.equal(API_KEY_ENV_VAR, "ISB_OPENRESPONSES_API_KEY");
    });

    /**
     * WHAT: RESPONSES_ROUTE equals "v1/responses" (no leading slash).
     * WHY: T-13 — NestJS @Controller() paths must not start with "/"; a leading
     *      slash causes a double-slash in the resolved route (/v1/responses →
     *      //v1/responses) and breaks routing silently.
     * STEPS:
     *   Arrange — import RESPONSES_ROUTE from constants.ts
     *   Act — (read the exported value)
     *   Assert — strictEqual to literal "v1/responses"
     */
    void it('RESPONSES_ROUTE is "v1/responses" with no leading slash (T-13)', () => {
        // --- Assert ---
        assert.equal(RESPONSES_ROUTE, "v1/responses");
        // Confirm no leading slash — NestJS controller convention
        assert.equal(RESPONSES_ROUTE.startsWith("/"), false);
    });

    /**
     * WHAT: RESPONSES_WS_PATH equals "/v1/responses" (with leading slash).
     * WHY: T-14 — the ws library requires a leading slash for path matching;
     *      omitting it causes the WebSocket gateway to never match requests.
     * STEPS:
     *   Arrange — import RESPONSES_WS_PATH from constants.ts
     *   Act — (read the exported value)
     *   Assert — strictEqual to literal "/v1/responses"
     */
    void it('RESPONSES_WS_PATH is "/v1/responses" with leading slash (T-14)', () => {
        // --- Assert ---
        assert.equal(RESPONSES_WS_PATH, "/v1/responses");
        // Confirm leading slash — ws library path convention
        assert.equal(RESPONSES_WS_PATH.startsWith("/"), true);
    });

    /**
     * WHAT: RESPONSES_WS_PATH equals "/" + RESPONSES_ROUTE.
     * WHY: T-8 — RESPONSES_WS_PATH is derived from RESPONSES_ROUTE; this
     *      structural contract ensures the two constants cannot independently
     *      diverge. If RESPONSES_ROUTE is updated, RESPONSES_WS_PATH must
     *      follow automatically.
     * STEPS:
     *   Arrange — import both constants from constants.ts
     *   Act — compute the expected derivation "/" + RESPONSES_ROUTE
     *   Assert — RESPONSES_WS_PATH equals the derived value
     */
    void it("RESPONSES_WS_PATH equals '/' + RESPONSES_ROUTE — derivation contract (T-8)", () => {
        // --- Assert ---
        // Structural assertion: uses imported values, not literals, so that if
        // RESPONSES_ROUTE changes, this test still validates the relationship.
        assert.equal(RESPONSES_WS_PATH, `/${RESPONSES_ROUTE}`);
    });
});
