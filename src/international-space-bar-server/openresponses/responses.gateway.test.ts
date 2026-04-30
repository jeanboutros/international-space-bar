/**
 * Tests for: ResponsesGateway — DI injection and connection lifecycle logging
 * Source: src/international-space-bar-server/openresponses/responses.gateway.ts
 * Ticket: isb-0057
 *
 * Purpose: Verifies that ResponsesGateway is constructable directly with
 * mocked AGENT_RUNTIME_PORT and LOGGER dependencies (no NestFactory), and
 * that connection lifecycle methods emit the correct ILogger.info() calls.
 */
import "reflect-metadata";
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { afterEach, describe, it } from "node:test";
import type WebSocket from "ws";
import type { ILogger } from "../common/interfaces/index.js";
import type { AgentRuntimePort } from "./agent-runtime.port.js";
import { ResponsesGateway } from "./responses.gateway.js";

// ── Shared test helpers ────────────────────────────────────────────────────

/**
 * Builds a minimal ILogger mock that tracks all .info() call messages.
 * The mock intentionally has NO .log() method — ILogger does not define one,
 * and TypeScript would catch any accidental .log() call at compile time.
 */
function makeMockLogger(): { logger: ILogger; infoCalls: string[] } {
    const infoCalls: string[] = [];
    const logger: ILogger = {
        info: (msgOrCtx: string | Record<string, unknown>, msg?: string): void => {
            infoCalls.push(typeof msgOrCtx === "string" ? msgOrCtx : (msg ?? ""));
        },
        debug: (): void => {},
        warn: (): void => {},
        error: (): void => {},
        fatal: (): void => {},
        trace: (): void => {},
        child: function (): ILogger {
            return this;
        },
    };
    return { logger, infoCalls };
}

/**
 * Builds a minimal AgentRuntimePort mock. The gateway tests don't exercise
 * invoke() or stream() — only construction and lifecycle hooks — so the
 * methods are no-op stubs.
 */
function makeMockRuntime(): AgentRuntimePort {
    return {
        invoke: (): never => {
            throw new Error("not implemented in this test");
        },
        stream: (): never => {
            throw new Error("not implemented in this test");
        },
    };
}

/**
 * Builds a minimal WebSocket client mock that tracks .close() and .send() calls.
 * Cast to the WsClient type via `unknown` to avoid importing the full `ws` module.
 */
function makeMockClient(): {
    client: InstanceType<typeof WebSocket>;
    closeCalled: boolean;
    sendCalled: boolean;
} {
    let closeCalled = false;
    let sendCalled = false;
    const client = {
        close: (): void => {
            closeCalled = true;
        },
        send: (_data: unknown): void => {
            sendCalled = true;
        },
        // Minimal readyState so ws internals don't throw
        readyState: 1, // WebSocket.OPEN
    } as unknown as InstanceType<typeof WebSocket>;
    return {
        client,
        get closeCalled() {
            return closeCalled;
        },
        get sendCalled() {
            return sendCalled;
        },
    };
}

/**
 * Builds a minimal IncomingMessage mock with a controllable Authorization header.
 */
function makeMockRequest(authorization?: string): IncomingMessage {
    return {
        headers: {
            ...(authorization !== undefined ? { authorization } : {}),
        },
    } as unknown as IncomingMessage;
}

// ── Tests ──────────────────────────────────────────────────────────────────

/**
 * ResponsesGateway — DI injection and connection lifecycle logging.
 * Constructs the gateway directly with plain mock objects; no NestJS bootstrap.
 */
void describe("ResponsesGateway", () => {
    // Store the original env value so each test restores it cleanly.
    let savedApiKey: string | undefined;

    afterEach(() => {
        if (savedApiKey === undefined) {
            delete process.env.ISB_OPENRESPONSES_API_KEY;
        } else {
            process.env.ISB_OPENRESPONSES_API_KEY = savedApiKey;
        }
    });

    // ── T-10: constructability ─────────────────────────────────────────────

    /**
     * WHAT: ResponsesGateway is constructable when provided mock AGENT_RUNTIME_PORT
     *       and LOGGER arguments directly — no NestFactory or DI container needed.
     * WHY: T-10 — proves DI injection works without full NestJS bootstrap; any
     *      constructor signature change (e.g. missing parameter) would break this.
     * STEPS:
     *   Arrange — create mock runtime and logger plain objects
     *   Act — call `new ResponsesGateway(mockRuntime, mockLogger)` directly
     *   Assert — the returned instance is a ResponsesGateway
     */
    void it("is constructable with mocked AGENT_RUNTIME_PORT and LOGGER (T-10)", () => {
        // --- Arrange ---
        const { logger } = makeMockLogger();
        const runtime = makeMockRuntime();

        // --- Act ---
        const gateway = new ResponsesGateway(runtime, logger);

        // --- Assert ---
        // If this throws, the constructor signature no longer matches the two-arg form
        assert.ok(
            gateway instanceof ResponsesGateway,
            "should produce a ResponsesGateway instance",
        );
    });

    // ── T-11: successful connection logs ───────────────────────────────────

    /**
     * WHAT: handleConnection calls logger.info("WebSocket client connected")
     *       when the Authorization header contains a valid bearer token.
     * WHY: T-11 — verifies that the ILogger injection replaces the old
     *      `this.logger.log()` call with `this.logger.info()` after isb-0057;
     *      without this check, silent regressions back to .log() would go unnoticed.
     * STEPS:
     *   Arrange — set ISB_OPENRESPONSES_API_KEY, build gateway with tracked logger,
     *             build mock client + request with matching Bearer token
     *   Act — call gateway.handleConnection(client, request)
     *   Assert — infoCalls contains exactly "WebSocket client connected"
     */
    void it("handleConnection logs info when auth passes (T-11)", () => {
        // --- Arrange ---
        savedApiKey = process.env.ISB_OPENRESPONSES_API_KEY;
        process.env.ISB_OPENRESPONSES_API_KEY = "test-secret-key";

        const { logger, infoCalls } = makeMockLogger();
        const runtime = makeMockRuntime();
        const gateway = new ResponsesGateway(runtime, logger);

        const { client } = makeMockClient();
        const request = makeMockRequest("Bearer test-secret-key");

        // --- Act ---
        gateway.handleConnection(client, request);

        // --- Assert ---
        // The info call must have fired exactly once with the canonical message
        assert.equal(infoCalls.length, 1, "logger.info should be called exactly once");
        assert.equal(
            infoCalls[0],
            "WebSocket client connected",
            "logger.info must be called with the connection message",
        );
    });

    // ── T-12: disconnection logs ───────────────────────────────────────────

    /**
     * WHAT: handleDisconnect calls logger.info("WebSocket client disconnected").
     * WHY: T-12 — symmetrical coverage for the disconnect lifecycle hook;
     *      confirms the .log() → .info() rename applied at this call site too.
     * STEPS:
     *   Arrange — build gateway with tracked logger, build mock client,
     *             register the client with the gateway by calling handleConnection first
     *   Act — call gateway.handleDisconnect(client)
     *   Assert — infoCalls contains "WebSocket client disconnected"
     */
    void it("handleDisconnect logs info when a client disconnects (T-12)", () => {
        // --- Arrange ---
        savedApiKey = process.env.ISB_OPENRESPONSES_API_KEY;
        process.env.ISB_OPENRESPONSES_API_KEY = "test-secret-key";

        const { logger, infoCalls } = makeMockLogger();
        const runtime = makeMockRuntime();
        const gateway = new ResponsesGateway(runtime, logger);

        const { client } = makeMockClient();
        const request = makeMockRequest("Bearer test-secret-key");

        // Register the client first so the connection WeakMap entry exists
        gateway.handleConnection(client, request);
        // Clear calls accumulated by handleConnection so only disconnect is checked
        infoCalls.length = 0;

        // --- Act ---
        gateway.handleDisconnect(client);

        // --- Assert ---
        assert.equal(
            infoCalls.length,
            1,
            "logger.info should be called exactly once on disconnect",
        );
        assert.equal(
            infoCalls[0],
            "WebSocket client disconnected",
            "logger.info must be called with the disconnection message",
        );
    });

    // ── T-13: unauthorized connection does not log ────────────────────────

    /**
     * WHAT: handleConnection does NOT call logger.info when auth fails;
     *       instead it calls client.close() to terminate the connection.
     * WHY: T-13 — information about an accepted connection must NOT be
     *      logged when the request is rejected (avoid noisy false-positive logs);
     *      also verifies the early-return path before the info call.
     * STEPS:
     *   Arrange — build gateway with tracked logger; build mock client with
     *             NO Authorization header (intentionally invalid)
     *   Act — call gateway.handleConnection(client, request)
     *   Assert — infoCalls is empty (no connection message was logged)
     *            and client.close() was called
     */
    void it("handleConnection does NOT call logger.info when auth fails, but does call client.close() (T-13)", () => {
        // --- Arrange ---
        savedApiKey = process.env.ISB_OPENRESPONSES_API_KEY;
        // ISB_OPENRESPONSES_API_KEY is set so validateAuth can proceed, but
        // the request header is intentionally absent — auth will fail
        process.env.ISB_OPENRESPONSES_API_KEY = "test-secret-key";

        const { logger, infoCalls } = makeMockLogger();
        const runtime = makeMockRuntime();
        const gateway = new ResponsesGateway(runtime, logger);

        const mockClient = makeMockClient();
        // No Authorization header — triggers the unauthorized path
        const request = makeMockRequest(/* no authorization */);

        // --- Act ---
        gateway.handleConnection(mockClient.client, request);

        // --- Assert ---
        // The connection info message must NOT be logged when auth fails
        assert.equal(
            infoCalls.length,
            0,
            "logger.info must NOT be called when authorization fails",
        );

        // The client must have been closed to terminate the connection
        assert.equal(mockClient.closeCalled, true, "client.close() must be called on auth failure");
    });
});
